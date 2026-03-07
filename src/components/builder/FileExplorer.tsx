import { FileCode, Folder, ChevronRight } from "lucide-react";
import { useApp, GeneratedFile } from "@/context/AppContext";
import { motion } from "framer-motion";

const langIcons: Record<string, string> = {
  html: "🌐",
  css: "🎨",
  javascript: "⚡",
  json: "📦",
  markdown: "📝",
};

export function FileExplorer() {
  const { activeProject, activeFile, setActiveFile } = useApp();

  if (!activeProject || activeProject.files.length === 0) {
    return (
      <div className="p-4 text-muted-foreground text-sm text-center">
        <Folder className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No files yet. Start chatting to generate your project!</p>
      </div>
    );
  }

  // Group files by directory
  const dirs: Record<string, GeneratedFile[]> = {};
  activeProject.files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    if (!dirs[dir]) dirs[dir] = [];
    dirs[dir].push(file);
  });

  return (
    <div className="p-2">
      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Explorer
      </div>
      {Object.entries(dirs).map(([dir, files]) => (
        <div key={dir} className="mb-1">
          {dir !== "/" && (
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
              <ChevronRight className="w-3 h-3" />
              <Folder className="w-3 h-3" />
              <span>{dir}</span>
            </div>
          )}
          {files.map((file) => (
            <motion.button
              key={file.path}
              whileHover={{ x: 2 }}
              onClick={() => setActiveFile(file)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
                activeFile?.path === file.path
                  ? "bg-primary/10 text-primary"
                  : "text-secondary-foreground hover:bg-secondary"
              }`}
            >
              <span>{langIcons[file.language] || "📄"}</span>
              <FileCode className="w-3 h-3 opacity-50" />
              <span className="truncate">{file.name}</span>
            </motion.button>
          ))}
        </div>
      ))}
    </div>
  );
}
