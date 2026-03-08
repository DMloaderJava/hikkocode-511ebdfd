/**
 * Agent file tools — readFile, writeFile, listFiles + sandbox
 * These work on in-memory GeneratedFile[] arrays (the project's virtual filesystem).
 */

import { GeneratedFile } from "@/context/AppContext";

/** Read a single file's content by path */
export function readFile(files: GeneratedFile[], path: string): string | null {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const file = files.find(f => f.path === normalized || f.path === path);
  return file?.content ?? null;
}

/** List all file paths, optionally filtered by directory prefix */
export function listFiles(files: GeneratedFile[], directory?: string): string[] {
  if (!directory) return files.map(f => f.path);
  const dir = directory.endsWith("/") ? directory : `${directory}/`;
  return files.filter(f => f.path.startsWith(dir) || f.path.startsWith(`/${dir}`)).map(f => f.path);
}

/** Write/update a file. Returns a new files array (immutable). */
export function writeFile(
  files: GeneratedFile[],
  path: string,
  content: string,
  language?: string
): GeneratedFile[] {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const name = normalized.split("/").pop() || normalized;
  const lang = language || inferLanguage(name);
  const existing = files.findIndex(f => f.path === normalized || f.path === path);

  if (existing >= 0) {
    return files.map((f, i) => (i === existing ? { ...f, content, language: lang } : f));
  }

  return [...files, { name, path: normalized, content, language: lang }];
}

/** Delete a file. Returns a new files array. */
export function deleteFile(files: GeneratedFile[], path: string): GeneratedFile[] {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return files.filter(f => f.path !== normalized && f.path !== path);
}

// ========== SANDBOX ==========

export interface Sandbox {
  /** Original files (read-only snapshot) */
  original: GeneratedFile[];
  /** Working copy that the agent modifies */
  working: GeneratedFile[];
}

/** Create a sandbox — deep clone of the project files */
export function createSandbox(files: GeneratedFile[]): Sandbox {
  const clone = files.map(f => ({ ...f }));
  return {
    original: files.map(f => ({ ...f })),
    working: clone,
  };
}

/** Apply a write to the sandbox's working copy */
export function sandboxWrite(sandbox: Sandbox, path: string, content: string, language?: string): Sandbox {
  return {
    ...sandbox,
    working: writeFile(sandbox.working, path, content, language),
  };
}

/** Apply a delete to the sandbox's working copy */
export function sandboxDelete(sandbox: Sandbox, path: string): Sandbox {
  return {
    ...sandbox,
    working: deleteFile(sandbox.working, path),
  };
}

/** Commit sandbox: return the working files (caller applies them to real project) */
export function commitSandbox(sandbox: Sandbox): GeneratedFile[] {
  return sandbox.working;
}

/** Discard sandbox changes: return original files */
export function discardSandbox(sandbox: Sandbox): GeneratedFile[] {
  return sandbox.original;
}

// ========== CONTEXT BUILDERS ==========

/** Build a context string for the AI from specific file paths */
export function buildFileContext(files: GeneratedFile[], paths: string[]): string {
  const sections: string[] = [];
  for (const p of paths) {
    const content = readFile(files, p);
    if (content !== null) {
      sections.push(`--- ${p} ---\n${content}`);
    }
  }
  return sections.join("\n\n");
}

/** Build full project context for the AI */
export function buildFullContext(files: GeneratedFile[]): string {
  if (files.length === 0) return "";
  return files.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
}

/** Build smart context: full content for priority files, summaries for rest */
export function buildSmartContext(
  files: GeneratedFile[],
  filesToRead: string[],
  filesToEdit: string[]
): string {
  const priorityPaths = new Set([...filesToRead, ...filesToEdit]);
  const sections: string[] = [];

  for (const p of priorityPaths) {
    const content = readFile(files, p);
    if (content !== null) {
      sections.push(`--- ${p} (FULL) ---\n${content}`);
    }
  }

  const otherFiles = files.filter(f => !priorityPaths.has(f.path));
  if (otherFiles.length > 0) {
    const listing = otherFiles.map(f => `  - ${f.path} (${f.language}, ${f.content.length} chars)`).join("\n");
    sections.push(`--- Other project files ---\n${listing}`);
  }

  return sections.join("\n\n");
}

function inferLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: "html", htm: "html",
    css: "css",
    js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript",
    json: "json",
    md: "markdown",
    yaml: "yaml", yml: "yaml",
    toml: "toml",
    xml: "xml",
    sh: "bash", bash: "bash",
    svg: "xml",
  };
  return map[ext || ""] || "text";
}
