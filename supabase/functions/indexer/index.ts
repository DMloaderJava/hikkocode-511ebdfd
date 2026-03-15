import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GITHUB_API = "https://api.github.com";

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    html: "html", css: "css", json: "json", md: "markdown",
    yaml: "yaml", yml: "yaml", toml: "toml", py: "python",
    rs: "rust", go: "go", java: "java", rb: "ruby",
    sh: "bash", sql: "sql", xml: "xml", svg: "xml",
  };
  return map[ext] || "text";
}

/** Extract symbols (exports, imports) from source code */
function extractSymbols(content: string, language: string): { symbols: string[]; dependencies: string[] } {
  const symbols: string[] = [];
  const dependencies: string[] = [];

  if (["typescript", "javascript"].includes(language)) {
    // Exports
    const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g);
    for (const m of exportMatches) symbols.push(m[1]);

    // Imports
    const importMatches = content.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g);
    for (const m of importMatches) dependencies.push(m[1]);
  } else if (language === "python") {
    const defMatches = content.matchAll(/(?:def|class)\s+(\w+)/g);
    for (const m of defMatches) symbols.push(m[1]);

    const importMatches = content.matchAll(/(?:from\s+(\S+)\s+)?import\s+(.+)/g);
    for (const m of importMatches) dependencies.push(m[1] || m[2].split(",")[0].trim());
  }

  return { symbols, dependencies };
}

/** Generate a brief summary of a file */
function summarizeFile(content: string, language: string, path: string): string {
  const lines = content.split("\n").length;
  const { symbols, dependencies } = extractSymbols(content, language);

  let summary = `${lines} lines`;
  if (symbols.length > 0) summary += `, exports: ${symbols.slice(0, 5).join(", ")}`;
  if (dependencies.length > 0) summary += `, imports: ${dependencies.slice(0, 5).join(", ")}`;

  // Try to extract first doc comment
  const docMatch = content.match(/\/\*\*\s*([\s\S]*?)\*\//);
  if (docMatch) {
    const doc = docMatch[1].replace(/\s*\*\s*/g, " ").trim().slice(0, 100);
    if (doc) summary += ` — ${doc}`;
  }

  return summary;
}

/** Simple hash for change detection */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  try {
    const { project_id, repo, branch } = await req.json();

    if (!project_id) {
      return json({ error: "project_id is required" }, 400);
    }

    const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
    let files: Array<{ path: string; content: string; size: number }> = [];

    if (repo && GITHUB_PAT) {
      // Read from GitHub
      const [owner, repoName] = repo.split("/");
      const ghHeaders = {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      const targetBranch = branch || "main";
      const treeResp = await fetch(
        `${GITHUB_API}/repos/${owner}/${repoName}/git/trees/${targetBranch}?recursive=1`,
        { headers: ghHeaders }
      );
      const treeData = await treeResp.json();
      if (!treeResp.ok) throw new Error(`Failed to read repo: ${JSON.stringify(treeData)}`);

      const textFiles = (treeData.tree || [])
        .filter((f: any) => f.type === "blob" && f.size < 50000)
        .filter((f: any) => {
          const ext = f.path.split(".").pop()?.toLowerCase() || "";
          const textExts = new Set(["ts", "tsx", "js", "jsx", "html", "css", "json", "md", "yaml", "yml", "toml", "py", "rs", "go", "java", "rb", "sh", "sql", "xml", "svg", "txt", "cfg", "ini", "env"]);
          return textExts.has(ext) || f.path.includes(".");
        })
        .slice(0, 200); // Limit to 200 files

      // Fetch file contents in batches
      for (const f of textFiles) {
        try {
          const resp = await fetch(
            `${GITHUB_API}/repos/${owner}/${repoName}/contents/${f.path}?ref=${targetBranch}`,
            { headers: ghHeaders }
          );
          if (resp.ok) {
            const data = await resp.json();
            let content = "";
            if (data.encoding === "base64") {
              content = atob(data.content.replace(/\n/g, ""));
            } else {
              content = data.content || "";
            }
            files.push({ path: f.path, content, size: f.size });
          }
        } catch { /* skip unreadable files */ }
      }
    } else {
      // Read from project_files table
      const { data: projectFiles } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", project_id);

      files = (projectFiles || []).map((f: any) => ({
        path: f.path,
        content: f.content,
        size: f.content?.length || 0,
      }));
    }

    // Build index
    const indexEntries = [];
    for (const file of files) {
      const language = inferLanguage(file.path);
      const { symbols, dependencies } = extractSymbols(file.content, language);
      const summary = summarizeFile(file.content, language, file.path);
      const hash = simpleHash(file.content);

      const entry = {
        project_id,
        file_path: file.path,
        language,
        size_bytes: file.size,
        hash,
        summary,
        symbols,
        dependencies,
        last_indexed_at: new Date().toISOString(),
      };

      indexEntries.push(entry);

      // Upsert into file_index
      await supabase.from("file_index").upsert(entry, { onConflict: "project_id,file_path" });
    }

    return json({
      success: true,
      indexed: indexEntries.length,
      files: indexEntries.map(e => ({
        path: e.file_path,
        language: e.language,
        size: e.size_bytes,
        summary: e.summary,
        symbols: e.symbols,
      })),
    });
  } catch (e) {
    console.error("Indexer error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
