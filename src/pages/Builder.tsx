import { ProjectSidebar } from "@/components/builder/ProjectSidebar";
import { ChatPanel } from "@/components/builder/ChatPanel";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { CodeViewer } from "@/components/builder/CodeViewer";
import { LivePreview } from "@/components/builder/LivePreview";
import { PublishDialog } from "@/components/builder/PublishDialog";
import { BuildLogs } from "@/components/builder/BuildLogs";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { GitHubDialog } from "@/components/builder/GitHubDialog";
import { AgentTasksPanel } from "@/components/builder/AgentTasksPanel";
import { useApp } from "@/context/AppContext";
import { useState, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  Eye,
  Code,
  Terminal,
  GitBranch,
  Share2,
  ChevronDown,
  PanelLeft,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Slash,
  Github,
  Bot,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RightView = "preview" | "code" | "terminal" | "history" | "agent";

export default function Builder() {
  const { activeFile, activeProject, setActiveFile, isGenerating, projects, setActiveProject } = useApp();
  const [rightView, setRightView] = useState<RightView>("preview");
  const [showSidebar, setShowSidebar] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [showPublish, setShowPublish] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const isMobile = useIsMobile();

  const effectiveView = activeFile ? "code" : rightView;

  const handleRefresh = useCallback(() => {
    setPreviewKey((k) => k + 1);
    toast.success("Preview refreshed");
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (!activeProject || activeProject.files.length === 0) {
      toast.error("No files to preview");
      return;
    }
    const htmlFile = activeProject.files.find((f) => f.language === "html");
    if (htmlFile) {
      const blob = new Blob([htmlFile.content], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } else {
      toast.error("No HTML file found");
    }
  }, [activeProject]);

  const handleShare = useCallback(async () => {
    const projectName = activeProject?.name || "hikkocode project";
    const shareData = {
      title: projectName,
      text: `Check out "${projectName}" — built with hikkocode`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  }, [activeProject]);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar: overlay on mobile, inline on desktop */}
      {showSidebar && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowSidebar(false)}
            />
          )}
          <div className={isMobile ? "fixed inset-y-0 left-0 z-50" : ""}>
            <ProjectSidebar onCollapse={() => setShowSidebar(false)} />
          </div>
        </>
      )}

      {/* Main layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ===== TOP BAR ===== */}
        <div className="h-11 flex items-center border-b border-border bg-card px-2 gap-1">
          {/* Left section */}
          <div className="flex items-center gap-1 min-w-0 mr-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-0.5 hidden sm:block" />

            {/* Project switcher dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden sm:flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-secondary transition-colors">
                  <div className="w-5 h-5 rounded gradient-lovable flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                    {activeProject?.name || "hikkocode"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => setActiveProject(project)}
                    className={activeProject?.id === project.id ? "bg-secondary" : ""}
                  >
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))}
                {projects.length === 0 && (
                  <DropdownMenuItem disabled>No projects</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Center: View tabs */}
          <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => { setRightView("preview"); setActiveFile(null); }}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                effectiveView === "preview"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={() => setRightView("code")}
              className={`p-1.5 rounded-md transition-all ${
                effectiveView === "code"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setRightView("terminal"); setActiveFile(null); }}
              className={`p-1.5 rounded-md transition-all hidden sm:block ${
                effectiveView === "terminal"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Build Logs"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setRightView("history"); setActiveFile(null); }}
              className={`p-1.5 rounded-md transition-all hidden sm:block ${
                effectiveView === "history"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Version History"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setRightView("agent"); setActiveFile(null); }}
              className={`p-1.5 rounded-md transition-all hidden sm:block ${
                effectiveView === "agent"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Agent Tasks"
            >
              <Bot className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center-right: Device toggles + URL */}
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-1.5">
            <div className="flex items-center gap-0">
              {([
                { id: "desktop" as const, icon: Monitor },
                { id: "tablet" as const, icon: Tablet },
                { id: "mobile" as const, icon: Smartphone },
              ]).map(d => (
                <button
                  key={d.id}
                  onClick={() => setDevice(d.id)}
                  className={`p-1.5 rounded-md transition-colors ${
                    device === d.id
                      ? "text-foreground"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                >
                  <d.icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
            <div className="flex items-center bg-secondary/60 rounded-md px-2 py-1 gap-1 min-w-[80px]">
              <Slash className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/60 select-none">/</span>
            </div>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Refresh preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleOpenExternal}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: GitHub, Share, Publish */}
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => setShowGitHub(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="GitHub"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">GitHub</span>
            </button>
            <button
              onClick={handleShare}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Share</span>
            </button>
            <button
              onClick={() => setShowPublish(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Publish
            </button>
          </div>
        </div>

        {/* ===== CONTENT AREA ===== */}
        <div className="flex-1 flex min-h-0">
          {/* Mobile: show chat or preview, not both */}
          {isMobile ? (
            <div className="flex-1 flex flex-col min-w-0">
              {effectiveView === "preview" ? (
                <div className="flex-1 min-w-0 bg-secondary/20">
                  <LivePreview device={device} refreshKey={previewKey} />
                </div>
              ) : effectiveView === "code" ? (
                <div className="flex-1 flex min-w-0">
                  <div className="w-44 border-r border-border overflow-y-auto scrollbar-thin bg-card">
                    <FileExplorer />
                  </div>
                  <div className="flex-1 min-w-0 bg-secondary/20">
                    <CodeViewer />
                  </div>
                </div>
              ) : effectiveView === "terminal" ? (
                <div className="flex-1 min-w-0 bg-secondary/20">
                  <BuildLogs />
                </div>
              ) : effectiveView === "history" ? (
                <div className="flex-1 min-w-0 bg-secondary/20">
                  <VersionHistory />
                </div>
              ) : (
                <ChatPanel />
              )}
            </div>
          ) : (
            <>
              {/* Left: Chat panel */}
              <div className="w-[420px] min-w-[340px] flex flex-col border-r border-border bg-card">
                <ChatPanel />
              </div>
              <div className="w-px bg-border hover:bg-accent/40 cursor-col-resize transition-colors" />
              {/* Right: Preview / Code / Terminal / History */}
              <div className="flex-1 flex min-w-0">
                {effectiveView === "code" && (
                  <div className="w-52 border-r border-border overflow-y-auto scrollbar-thin bg-card">
                    <FileExplorer />
                  </div>
                )}
                <div className="flex-1 min-w-0 bg-secondary/20">
                  {effectiveView === "preview" && <LivePreview device={device} refreshKey={previewKey} />}
                  {effectiveView === "code" && <CodeViewer />}
                  {effectiveView === "terminal" && <BuildLogs />}
                  {effectiveView === "history" && <VersionHistory />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <PublishDialog open={showPublish} onClose={() => setShowPublish(false)} />
      <GitHubDialog open={showGitHub} onClose={() => setShowGitHub(false)} />
    </div>
  );
}