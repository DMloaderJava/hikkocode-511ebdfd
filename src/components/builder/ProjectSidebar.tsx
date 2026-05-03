import { useApp } from "@/context/AppContext";
import { Plus, FolderOpen, Home, PanelLeftClose, LogOut, Moon, Sun, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ProjectSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const { projects, activeProject, setActiveProject, createProject, loadProjects } = useApp();
  const user = { email: "guest@hikkocode.local" } as { email?: string };
  const signOut = async () => {};
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

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

  const handleRename = async (projectId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    await supabase
      .from("projects")
      .update({ name: renameValue.trim() })
      .eq("id", projectId);
    setRenamingId(null);
    await loadProjects();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // Delete related data first, then project
    await Promise.all([
      supabase.from("chat_messages").delete().eq("project_id", deleteTarget.id),
      supabase.from("project_files").delete().eq("project_id", deleteTarget.id),
      supabase.from("version_snapshots").delete().eq("project_id", deleteTarget.id),
    ]);
    await supabase.from("projects").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    await loadProjects();
  };

  return (
    <>
      <div className="w-56 bg-card border-r border-border flex flex-col h-full flex-shrink-0">
        {/* Header */}
        <div className="h-11 flex items-center justify-between px-3 border-b border-border">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-5 h-5 rounded gradient-lovable" />
            <span className="text-sm font-semibold text-foreground">hikkocode</span>
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

        <AnimatePresence>
          {showNew && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-2 pb-2 overflow-hidden"
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
        </AnimatePresence>

        <div className="px-3"><div className="border-b border-border" /></div>

        {/* Navigation */}
        <div className="px-2 py-2">
          <button
            onClick={() => navigate("/builder")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Projects
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
              <div
                key={project.id}
                className={`group flex items-center gap-1 rounded-lg mb-0.5 transition-colors ${
                  activeProject?.id === project.id
                    ? "bg-secondary"
                    : "hover:bg-secondary/60"
                }`}
              >
                {renamingId === project.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(project.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(project.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="flex-1 bg-secondary border border-ring rounded px-2 py-1 text-xs text-foreground outline-none mx-1"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setActiveProject(project)}
                    className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 text-xs min-w-0 ${
                      activeProject?.id === project.id
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    <span className="truncate">{project.name}</span>
                  </button>
                )}

                {renamingId !== project.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">
                        <MoreHorizontal className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => {
                        setRenamingId(project.id);
                        setRenameValue(project.name);
                      }}>
                        <Pencil className="w-3.5 h-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer with user info */}
        <div className="p-2 border-t border-border">
          <button
            onClick={() => setIsDark(!isDark)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
