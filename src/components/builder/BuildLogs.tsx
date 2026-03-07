import { useApp } from "@/context/AppContext";
import { Terminal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BuildLogs() {
  const { isGenerating, loadingMessage, activeProject } = useApp();

  const logs = [
    ...(activeProject?.messages.filter(m => m.role === "user").map((m, i) => ({
      id: `prompt-${i}`,
      text: `[prompt] "${m.content.slice(0, 60)}${m.content.length > 60 ? "..." : ""}"`,
      type: "info" as const,
    })) || []),
    ...(activeProject?.files.length
      ? [{ id: "gen", text: `[build] Generated ${activeProject.files.length} files (v${activeProject.version})`, type: "success" as const }]
      : []),
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-secondary/50">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Build Logs</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 scrollbar-thin">
        <AnimatePresence mode="popLayout">
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`${log.type === "success" ? "text-primary" : "text-muted-foreground"}`}
            >
              {log.text}
            </motion.div>
          ))}
          {isGenerating && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-accent animate-pulse-neon"
            >
              {loadingMessage}
            </motion.div>
          )}
        </AnimatePresence>
        {logs.length === 0 && !isGenerating && (
          <div className="text-muted-foreground/50">Waiting for build...</div>
        )}
      </div>
    </div>
  );
}
