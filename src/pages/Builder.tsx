import { ProjectSidebar } from "@/components/builder/ProjectSidebar";
import { ChatPanel } from "@/components/builder/ChatPanel";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { CodeViewer } from "@/components/builder/CodeViewer";
import { LivePreview } from "@/components/builder/LivePreview";
import { BuildLogs } from "@/components/builder/BuildLogs";
import { useApp } from "@/context/AppContext";
import { useState } from "react";

type RightPanel = "preview" | "code";

export default function Builder() {
  const { activeFile } = useApp();
  const [rightPanel, setRightPanel] = useState<RightPanel>("preview");

  // Auto-switch to code when a file is selected
  const effectivePanel = activeFile ? "code" : rightPanel;

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Left: Project Sidebar */}
      <ProjectSidebar />

      {/* Center: Chat + File Explorer */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-1 min-h-0">
          {/* File explorer */}
          <div className="w-52 border-r border-border overflow-y-auto scrollbar-thin bg-card/50">
            <FileExplorer />
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border">
            <ChatPanel />
          </div>
        </div>

        {/* Bottom: Build Logs */}
        <div className="h-36 border-t border-border">
          <BuildLogs />
        </div>
      </div>

      {/* Right: Preview or Code */}
      <div className="w-[45%] flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center border-b border-border bg-card/50">
          <button
            onClick={() => { setRightPanel("preview"); }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              effectivePanel === "preview"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setRightPanel("code")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              effectivePanel === "code"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Code
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {effectivePanel === "preview" ? <LivePreview /> : <CodeViewer />}
        </div>
      </div>
    </div>
  );
}
