import { useApp } from "@/context/AppContext";
import { Monitor, AlertTriangle, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

interface LivePreviewProps {
  device?: "desktop" | "tablet" | "mobile";
  refreshKey?: number;
}

export interface PreviewIssue {
  id: string;
  type: "error" | "warning";
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack?: string;
  timestamp: number;
}

// Module-level event bus so other components (ChatPanel) can subscribe
type IssuesListener = (issues: PreviewIssue[]) => void;
const issuesListeners = new Set<IssuesListener>();
let currentIssues: PreviewIssue[] = [];

export function getPreviewIssues() {
  return currentIssues;
}
export function subscribePreviewIssues(fn: IssuesListener) {
  issuesListeners.add(fn);
  fn(currentIssues);
  return () => issuesListeners.delete(fn);
}
function setIssues(next: PreviewIssue[]) {
  currentIssues = next;
  issuesListeners.forEach((l) => l(currentIssues));
}
export function clearPreviewIssues() {
  setIssues([]);
}

export function LivePreview({ device = "desktop", refreshKey = 0 }: LivePreviewProps) {
  const { activeProject } = useApp();
  const [issues, setLocalIssues] = useState<PreviewIssue[]>([]);
  const [showIssues, setShowIssues] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const files = activeProject?.files ?? [];

  const previewHtml = useMemo(() => {
    if (files.length === 0) return null;

    const htmlFile = files.find((f) => f.language === "html");
    const cssFiles = files.filter((f) => f.language === "css");
    const jsFiles = files.filter(
      (f) => f.language === "javascript" || f.language === "typescript"
    );

    // Runtime error capture script — posts errors to parent
    const errorCapture = `
<script>
(function(){
  function send(payload){
    try { parent.postMessage({ __hikko_preview: true, ...payload }, "*"); } catch(e){}
  }
  window.addEventListener("error", function(e){
    send({ type: "error", message: e.message || String(e.error), source: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack });
  });
  window.addEventListener("unhandledrejection", function(e){
    var msg = (e.reason && (e.reason.message || e.reason.toString())) || "Unhandled promise rejection";
    send({ type: "error", message: msg, stack: e.reason && e.reason.stack });
  });
  var origErr = console.error;
  console.error = function(){
    try { send({ type: "error", message: Array.prototype.slice.call(arguments).map(String).join(" ") }); } catch(_){}
    return origErr.apply(console, arguments);
  };
  var origWarn = console.warn;
  console.warn = function(){
    try { send({ type: "warning", message: Array.prototype.slice.call(arguments).map(String).join(" ") }); } catch(_){}
    return origWarn.apply(console, arguments);
  };
})();
<\/script>`;

    if (!htmlFile) {
      if (cssFiles.length === 0 && jsFiles.length === 0) return null;
      const css = cssFiles.map((f) => f.content).join("\n");
      const js = jsFiles.map((f) => f.content).join("\n;\n");
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${errorCapture}<style>${css}</style></head><body><script>${js}<\/script></body></html>`;
    }

    let html = htmlFile.content;
    const localJsNames = jsFiles.map((f) => f.path.replace(/^\//, ""));
    const localCssNames = cssFiles.map((f) => f.path.replace(/^\//, ""));

    for (const cssName of localCssNames) {
      const escaped = cssName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `<link[^>]*href=["'](?:\\.?\\/?)${escaped}["'][^>]*\\/?>`,
        "gi"
      );
      html = html.replace(regex, "");
    }

    if (cssFiles.length > 0) {
      const allCss = cssFiles.map((f) => f.content).join("\n");
      if (html.includes("</head>")) {
        html = html.replace("</head>", `<style>${allCss}</style>\n</head>`);
      } else {
        html = `<style>${allCss}</style>\n` + html;
      }
    }

    for (const jsName of localJsNames) {
      const escaped = jsName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `<script[^>]*src=["'](?:\\.?\\/?)${escaped}["'][^>]*><\\/script>`,
        "gi"
      );
      html = html.replace(regex, "");
    }

    if (jsFiles.length > 0) {
      const allJs = jsFiles.map((f) => f.content).join("\n;\n");
      if (html.includes("</body>")) {
        html = html.replace("</body>", `<script>${allJs}<\/script>\n</body>`);
      } else {
        html += `\n<script>${allJs}<\/script>`;
      }
    }

    // Inject error capture as early as possible
    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${errorCapture}`);
    } else if (html.includes("</head>")) {
      html = html.replace("</head>", `${errorCapture}</head>`);
    } else {
      html = errorCapture + html;
    }

    return html;
  }, [files]);

  // Listen for runtime issues from iframe
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || !d.__hikko_preview) return;
      const next: PreviewIssue = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: d.type === "warning" ? "warning" : "error",
        message: String(d.message || "Unknown issue"),
        source: d.source,
        line: d.line,
        col: d.col,
        stack: d.stack,
        timestamp: Date.now(),
      };
      // Dedupe identical messages within 500ms
      const recent = currentIssues.find(
        (i) => i.message === next.message && Date.now() - i.timestamp < 500
      );
      if (recent) return;
      const updated = [...currentIssues, next].slice(-30);
      setIssues(updated);
      setLocalIssues(updated);
    }
    window.addEventListener("message", onMessage);
    const unsub = subscribePreviewIssues(setLocalIssues);
    return () => {
      window.removeEventListener("message", onMessage);
      unsub();
    };
  }, []);

  // Reset issues when files or refresh change
  useEffect(() => {
    clearPreviewIssues();
    setLocalIssues([]);
  }, [refreshKey, files.length]);

  const triggerFix = useCallback(() => {
    if (issues.length === 0) return;
    const summary = issues
      .slice(-5)
      .map(
        (i) =>
          `[${i.type.toUpperCase()}] ${i.message}${
            i.source ? ` (${i.source}${i.line ? `:${i.line}` : ""})` : ""
          }`
      )
      .join("\n");
    const event = new CustomEvent("hikko:fix-issues", {
      detail: { issues, summary },
    });
    window.dispatchEvent(event);
  }, [issues]);

  const deviceWidth =
    device === "mobile" ? "375px" : device === "tablet" ? "768px" : "100%";

  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-foreground/60">Preview</p>
          <p className="text-xs mt-1 text-muted-foreground">
            Your app will appear here after generation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-start justify-center bg-secondary/20 overflow-auto relative">
        <div
          className="h-full bg-white transition-all duration-300"
          style={{ width: deviceWidth, maxWidth: "100%" }}
        >
          {previewHtml && (
            <iframe
              ref={iframeRef}
              key={`${refreshKey}-${files.length}-${files.map((f) => f.path).join(",")}`}
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="App Preview"
              sandbox="allow-scripts allow-modals allow-same-origin allow-popups allow-forms"
            />
          )}
        </div>
      </div>

      {/* Issues panel */}
      {issues.length > 0 && (
        <div className="border-t border-border bg-card text-foreground">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={() => setShowIssues((s) => !s)}
              className="flex items-center gap-2 text-xs font-medium"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              Issues
              <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">
                {issues.length}
              </span>
            </button>
            <button
              onClick={triggerFix}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Wand2 className="w-3 h-3" />
              Fix problem
            </button>
          </div>
          {showIssues && (
            <div className="max-h-40 overflow-y-auto scrollbar-thin border-t border-border">
              {issues.slice(-10).map((i) => (
                <div
                  key={i.id}
                  className="px-3 py-1.5 text-[11px] border-b border-border/60 last:border-0 flex gap-2"
                >
                  <span
                    className={
                      i.type === "error"
                        ? "text-destructive font-medium"
                        : "text-amber-500 font-medium"
                    }
                  >
                    {i.type === "error" ? "ERR" : "WARN"}
                  </span>
                  <span className="text-foreground/80 break-all">
                    {i.message}
                    {i.source && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {i.source}
                        {i.line ? `:${i.line}` : ""}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
