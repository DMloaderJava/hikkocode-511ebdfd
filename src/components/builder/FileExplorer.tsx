import { Folder, ChevronRight } from "lucide-react";
import { useApp, GeneratedFile } from "@/context/AppContext";

const langIcons: Record<string, string> = {
  html: "🌐",
  css: "🎨",
  javascript: "⚡",
  js: "⚡",
  typescript: "💠",
  ts: "💠",
  tsx: "💠",
  jsx: "⚛️",
  json: "📦",
  markdown: "📝",
  md: "📝",
  toml: "⚙️",
  yaml: "⚙️",
  yml: "⚙️",
  ini: "⚙️",
  bash: "🖥️",
  sh: "🖥️",
  text: "📄",
  txt: "📄",
  svg: "🖼️",
  xml: "📋",
};

function getIcon(file: GeneratedFile): string {
  // Check by language
  if (langIcons[file.language]) return langIcons[file.language];
  // Check by extension
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (langIcons[ext]) return langIcons[ext];
  // Special filenames
  if (file.name === "package.json" || file.name === "app.json") return "📦";
  if (file.name === "tsconfig.json") return "💠";
  if (file.name.endsWith(".config.ts") || file.name.endsWith(".config.js")) return "⚙️";
  if (file.name === ".env" || file.name.startsWith(".env.")) return "🔐";
  if (file.name === "README.md") return "📖";
  return "📄";
}

export function FileExplorer() {
  const { activeProject, activeFile, setActiveFile } = useApp();

  if (!activeProject || activeProject.files.length === 0) {
    return (
      <div className="p-4 text-muted-foreground text-xs text-center">
        <Folder className="w-6 h-6 mx-auto mb-2 opacity-20" />
        <p>No files yet</p>
      </div>
    );
  }

  const dirs: Record<string, GeneratedFile[]> = {};
  activeProject.files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    if (!dirs[dir]) dirs[dir] = [];
    dirs[dir].push(file);
  });

  // Sort dirs: root first, then alphabetical
  const sortedDirs = Object.entries(dirs).sort(([a], [b]) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="p-1.5">
      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Explorer
      </div>
      {sortedDirs.map(([dir, files]) => (
        <div key={dir} className="mb-0.5">
          {dir !== "/" && (
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground">
              <ChevronRight className="w-2.5 h-2.5" />
              <Folder className="w-2.5 h-2.5" />
              <span>{dir}</span>
            </div>
          )}
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => setActiveFile(file)}
              className={`w-full flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
                activeFile?.path === file.path
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="text-[10px]">{getIcon(file)}</span>
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
