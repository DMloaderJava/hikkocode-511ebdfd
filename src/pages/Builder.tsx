import { ProjectSidebar } from "@/components/builder/ProjectSidebar";
import { ChatPanel } from "@/components/builder/ChatPanel";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { CodeViewer } from "@/components/builder/CodeViewer";
import { LivePreview } from "@/components/builder/LivePreview";
import { PublishDialog } from "@/components/builder/PublishDialog";
import { useApp } from "@/context/AppContext";
import { useState } from "react";
import {
  Eye,
  Code,
  Terminal,
  GitBranch,
  MoreHorizontal,
  Share2,
  ChevronDown,
  PanelLeft,
  Globe,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Slash,
} from "lucide-react";

type RightView = "preview" | "code";

export default function Builder() {
  const { activeFile, activeProject, setActiveFile, isGenerating } = useApp();
  const [rightView, setRightView] = useState<RightView>("preview");
  const [showSidebar, setShowSidebar] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [showPublish, setShowPublish] = useState(false);

  const effectiveView = activeFile ? "code" : rightView;

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Collapsible project sidebar */}
      {showSidebar && <ProjectSidebar onCollapse={() => setShowSidebar(false)} />}

      {/* Main layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ===== TOP BAR ===== */}
        <div className="h-11 flex items-center border-b border-border bg-card px-2 gap-1">
          {/* Left section: sidebar toggle + project name */}
          <div className="flex items-center gap-1 min-w-0 mr-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            {/* Separator */}
            <div className="w-px h-5 bg-border mx-0.5" />
            <button className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-secondary transition-colors">
              <div className="w-5 h-5 rounded gradient-lovable flex-shrink-0" />
              <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                {activeProject?.name || "Laughable"}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </button>
          </div>

          {/* Center: View tabs — icon-based like Lovable */}
          <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => {
                setRightView("preview");
                setActiveFile(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                effectiveView === "preview"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              onClick={() => {
                setRightView("code");
              }}
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
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              title="Terminal"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              title="Version History"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              title="More"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center-right: Device toggles + URL path + refresh/expand */}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {/* Device toggles */}
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

            {/* URL path input */}
            <div className="flex items-center bg-secondary/60 rounded-md px-2 py-1 gap-1 min-w-[80px]">
              <Slash className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/60 select-none">/</span>
            </div>

            {/* Refresh */}
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {/* Open external */}
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Share, Upgrade, Publish */}
          <div className="flex items-center gap-1.5 ml-2">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent text-accent text-xs font-medium hover:bg-accent/10 transition-colors">
              Upgrade
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
          {/* Left: Chat panel */}
          <div className="w-[420px] min-w-[340px] flex flex-col border-r border-border bg-card">
            <ChatPanel />
          </div>

          {/* Draggable divider placeholder */}
          <div className="w-px bg-border hover:bg-accent/40 cursor-col-resize transition-colors" />

          {/* Right: Preview / Code */}
          <div className="flex-1 flex min-w-0">
            {effectiveView === "code" && (
              <div className="w-52 border-r border-border overflow-y-auto scrollbar-thin bg-card">
                <FileExplorer />
              </div>
            )}
            <div className="flex-1 min-w-0 bg-secondary/20">
              {effectiveView === "preview" && <LivePreview device={device} />}
              {effectiveView === "code" && <CodeViewer />}
            </div>
          </div>
        </div>
      </div>

      {/* Publish Dialog */}
      <PublishDialog open={showPublish} onClose={() => setShowPublish(false)} />
    </div>
  );
}
