import { useApp } from "@/context/AppContext";
import { Plus, FolderOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

export function ProjectSidebar() {
  const { projects, activeProject, setActiveProject, createProject } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProject(newName.trim(), "");
    setNewName("");
    setShowNew(false);
  };

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-bold text-lg gradient-text">Laughable</span>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showNew && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="p-3 border-b border-border"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name..."
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 mb-2"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <button
            onClick={handleCreate}
            className="w-full px-3 py-1.5 rounded-md bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
          >
            Create
          </button>
        </motion.div>
      )}

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Projects
        </div>
        {projects.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            No projects yet
          </div>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setActiveProject(project)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                activeProject?.id === project.id
                  ? "bg-primary/10 text-primary"
                  : "text-secondary-foreground hover:bg-secondary"
              }`}
            >
              <FolderOpen className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{project.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">v{project.version}</span>
            </button>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">
          🤖 Powered by Laughable AI
        </p>
      </div>
    </div>
  );
}
