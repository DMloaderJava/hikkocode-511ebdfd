import { motion } from "framer-motion";
import { ArrowUp, Plus, MessageCircle, Lightbulb, FolderOpen, Star, Clock, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, FormEvent } from "react";
import { useApp } from "@/context/AppContext";

function ProjectCard({ project, onClick }: { project: any; onClick: () => void }) {
  const timeAgo = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group text-left rounded-xl border border-border bg-card overflow-hidden hover:shadow-lovable-md hover:border-foreground/10 transition-all duration-200"
    >
      {/* Preview area */}
      <div className="aspect-[16/10] bg-secondary/40 flex items-center justify-center relative overflow-hidden">
        <div className="text-center p-4">
          <p className="text-xs text-muted-foreground/60 font-medium">
            {project.files.length > 0 ? `${project.files.length} files · v${project.version}` : "Welcome to Your Blank App"}
          </p>
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium">
            Open
          </span>
        </div>
      </div>
      {/* Info */}
      <div className="p-3 flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg gradient-lovable flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Edited {timeAgo(project.createdAt)}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user, projects, createProject, setActiveProject } = useApp();
  const [prompt, setPrompt] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (!user) {
      navigate("/auth");
      return;
    }

    const project = await createProject(prompt.trim().slice(0, 40), prompt.trim());
    navigate("/builder", { state: { initialPrompt: prompt.trim() } });
  };

  const handleOpenProject = (project: any) => {
    setActiveProject(project);
    navigate("/builder");
  };

  const suggestions = [
    "Build a task management app",
    "Create a portfolio website",
    "Make a weather dashboard",
    "Design a recipe sharing app",
  ];

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-lovable" />
          <span className="font-semibold text-lg text-foreground">hikkocode</span>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <button
              onClick={() => navigate("/builder")}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Open Builder
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate("/auth")}
                className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/auth")}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Get started
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-4 pt-16 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h1 className="text-4xl md:text-5xl font-semibold mb-3 text-foreground leading-tight">
            Build something<br />
            <span className="gradient-lovable-text">hikkocode</span>
          </h1>
          <p className="text-muted-foreground text-base mb-10">
            Create apps and websites by chatting with AI
          </p>
        </motion.div>

        {/* Prompt Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-full max-w-xl mx-auto"
        >
          <form
            onSubmit={handleSubmit}
            className="bg-card rounded-2xl shadow-lovable-md border border-border p-4"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask hikkocode to build your app..."
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none min-h-[80px] mb-3"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Lightbulb className="w-4 h-4" />
                </button>
              </div>
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="px-3 py-1.5 rounded-full text-xs text-muted-foreground bg-card border border-border hover:border-foreground/20 hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Projects Grid */}
      {user && projects.length > 0 && (
        <div className="px-6 pb-16 max-w-6xl mx-auto w-full">
          <div className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Мои проекты</h2>
              <button
                onClick={() => navigate("/builder")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Открыть Builder
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <ProjectCard
                    project={project}
                    onClick={() => handleOpenProject(project)}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="py-6 text-center text-xs text-muted-foreground">
        🤖 hikkocode — Build apps with AI
      </footer>
    </div>
  );
}
