
// This file is a local mock of the Supabase client to remove dependency on the real Supabase service.
// It uses localStorage or memory to simulate database behavior.

export type Database = any;

const mockStorage: Record<string, any[]> = {
  projects: JSON.parse(localStorage.getItem("hikkocode_projects") || "[]"),
  chat_messages: [],
  project_files: [],
  version_snapshots: [],
  file_index: [],
};

const createMockBuilder = (table: string) => {
  const builder: any = {
    select: () => builder,
    insert: (data: any) => {
      const rows = Array.isArray(data) ? data : [data];
      mockStorage[table] = [...(mockStorage[table] || []), ...rows];
      return builder;
    },
    update: (data: any) => builder,
    delete: () => builder,
    eq: (column: string, value: any) => builder,
    or: (query: string) => builder,
    single: async () => ({ data: mockStorage[table]?.[0] || null, error: null }),
    order: () => builder,
    limit: (n: number) => builder,
    // Add then to make it awaitable
    then: (resolve: any) => resolve({ data: mockStorage[table] || [], error: null }),
  };
  return builder;
};

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: "mock-token" } }, error: null }),
    getUser: async () => ({ data: { user: { id: "mock-user-id", email: "user@example.com" } }, error: null }),
    signInWithPassword: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
    signUp: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (callback: any) => {
      callback("SIGNED_IN", { user: { id: "mock-user-id" } });
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
  from: (table: string) => createMockBuilder(table),
  functions: {
    invoke: async (name: string, options?: any): Promise<{ data: any; error: any }> => {
      console.log(`Mock function invoke: ${name}`, options);
      // Real GitHub public API for import_repo (no auth needed)
      if (name === "github" && options?.body?.action === "import_repo") {
        return await importPublicRepo(options.body.url);
      }
      return { data: {}, error: null };
    },
  },
  channel: (name: string) => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {},
  }),
  removeChannel: (channel: any) => {},
};

// Detect language by file extension
function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "html", htm: "html", css: "css", scss: "css",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript",
    json: "json", md: "markdown", yaml: "yaml", yml: "yaml",
    toml: "toml", xml: "xml", svg: "xml", sh: "bash",
    py: "python", rb: "ruby", go: "go", rs: "rust",
  };
  return map[ext] || "text";
}

const ALLOWED_EXTENSIONS = new Set([
  "html","htm","css","scss","js","jsx","mjs","cjs","ts","tsx",
  "json","md","yaml","yml","toml","xml","svg","txt",
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"]);
const MAX_FILES = 200;
const MAX_FILE_SIZE = 200 * 1024; // 200KB per file

// Import a public GitHub repo using the public REST API (no auth needed)
async function importPublicRepo(url: string): Promise<{ data: any; error: any }> {
  try {
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.#?]+)/);
    if (!m) return { data: null, error: { message: "Invalid GitHub URL" } };
    const owner = m[1];
    const name = m[2].replace(/\.git$/, "");

    // Fetch repo metadata for default branch
    const repoResp = await fetch(`https://api.github.com/repos/${owner}/${name}`);
    if (!repoResp.ok) {
      return { data: null, error: { message: `Repo not found or private (${repoResp.status})` } };
    }
    const repoData = await repoResp.json();
    const branch = repoData.default_branch || "main";

    // Fetch tree recursively
    const treeResp = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`);
    if (!treeResp.ok) {
      return { data: null, error: { message: `Failed to fetch tree (${treeResp.status})` } };
    }
    const treeData = await treeResp.json();
    const allBlobs: Array<{ path: string; size: number }> = (treeData.tree || []).filter(
      (t: any) => t.type === "blob" &&
        !t.path.split("/").some((seg: string) => SKIP_DIRS.has(seg)) &&
        ALLOWED_EXTENSIONS.has((t.path.split(".").pop() || "").toLowerCase()) &&
        t.size <= MAX_FILE_SIZE
    );

    const totalFiles = allBlobs.length;
    const blobs = allBlobs.slice(0, MAX_FILES);
    const rawBase = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/`;

    const files = await Promise.all(
      blobs.map(async (b) => {
        try {
          const r = await fetch(rawBase + b.path);
          if (!r.ok) return null;
          const content = await r.text();
          return { path: b.path, content, language: detectLanguage(b.path) };
        } catch { return null; }
      })
    );

    const validFiles = files.filter((f): f is NonNullable<typeof f> => !!f);

    return {
      data: {
        repo: { owner, name, branch, html_url: repoData.html_url },
        files: validFiles,
        totalFiles,
        fetchedFiles: validFiles.length,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: { message: err?.message || "Unknown error" } };
  }
}

