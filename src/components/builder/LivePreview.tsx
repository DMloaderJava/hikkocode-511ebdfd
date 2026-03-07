import { useApp } from "@/context/AppContext";
import { Eye, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

export function LivePreview() {
  const { activeProject, isGenerating } = useApp();
  const [key, setKey] = useState(0);

  const previewHtml = useMemo(() => {
    if (!activeProject || activeProject.files.length === 0) return null;

    const htmlFile = activeProject.files.find((f) => f.language === "html");
    const cssFile = activeProject.files.find((f) => f.language === "css");
    const jsFile = activeProject.files.find((f) => f.language === "javascript");

    if (!htmlFile) return null;

    let html = htmlFile.content;

    // Inject CSS inline
    if (cssFile) {
      html = html.replace(
        /<link[^>]*href=["']styles\.css["'][^>]*\/?>/i,
        `<style>${cssFile.content}</style>`
      );
    }

    // Inject JS inline
    if (jsFile) {
      html = html.replace(
        /<script[^>]*src=["'](?:app|auth)\.js["'][^>]*><\/script>/i,
        `<script>${jsFile.content}<\/script>`
      );
    }

    return html;
  }, [activeProject]);

  if (!activeProject || activeProject.files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Your app preview will appear here</p>
          <p className="text-xs mt-1 text-muted-foreground/50">Start a conversation to generate code</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="w-4 h-4 text-primary" />
          <span className="text-foreground font-medium">Live Preview</span>
          {isGenerating && (
            <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setKey((k) => k + 1)}
            className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
            title="Open in new tab"
            onClick={() => {
              if (previewHtml) {
                const win = window.open();
                if (win) { win.document.write(previewHtml); win.document.close(); }
              }
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-card">
        {previewHtml && (
          <iframe
            key={key}
            srcDoc={previewHtml}
            className="w-full h-full border-0"
            title="App Preview"
            sandbox="allow-scripts allow-modals"
          />
        )}
      </div>
    </div>
  );
}
