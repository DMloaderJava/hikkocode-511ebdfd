import { useApp } from "@/context/AppContext";
import { Plus, FolderOpen, Settings, Home, PanelLeftClose, LogOut, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export function ProjectSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const { projects, activeProject, setActiveProject, createProject, user, signOut } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName.trim(), "");
    setNewName("");
    setShowNew(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="w-56 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-border">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-5 h-5 rounded gradient-lovable" />
          <span className="text-sm font-semibold text-foreground">Laughable</span>
        </button>
        <button
          onClick={onCollapse}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New project */}
      <div className="p-2">
        <button
          onClick={() => setShowNew(!showNew)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </button>
      </div>

      {showNew && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="px-2 pb-2"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name..."
            className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring mb-1.5"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <button
            onClick={handleCreate}
            className="w-full px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            Create
          </button>
        </motion.div>
      )}

      <div className="px-3"><div className="border-b border-border" /></div>

      {/* Navigation */}
      <div className="px-2 py-2">
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
          Home
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin">
        <div className="px-1 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Projects
        </div>
        {projects.length === 0 ? (
          <div className="p-3 text-center text-muted-foreground text-[10px]">
            No projects yet
          </div>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setActiveProject(project)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors mb-0.5 ${
                activeProject?.id === project.id
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
              <span className="truncate">{project.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Footer with user info */}
      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground font-medium truncate">
              {user?.email || "Guest"}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
