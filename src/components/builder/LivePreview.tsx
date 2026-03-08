import { useApp } from "@/context/AppContext";
import { Monitor } from "lucide-react";
import { useMemo } from "react";

interface LivePreviewProps {
  device?: "desktop" | "tablet" | "mobile";
  refreshKey?: number;
}

export function LivePreview({ device = "desktop", refreshKey = 0 }: LivePreviewProps) {
  const { activeProject, isGenerating } = useApp();

  const files = activeProject?.files ?? [];

  const previewHtml = useMemo(() => {
    if (files.length === 0) return null;

    const htmlFile = files.find((f) => f.language === "html");
    const cssFiles = files.filter((f) => f.language === "css");
    const jsFiles = files.filter((f) => f.language === "javascript" || f.language === "typescript");

    if (!htmlFile) return null;

    let html = htmlFile.content;

    // Inject all CSS
    if (cssFiles.length > 0) {
      const allCss = cssFiles.map((f) => f.content).join("\n");
      // Replace link tags referencing css files
      html = html.replace(/<link[^>]*href=["'][^"']*\.css["'][^>]*\/?>/gi, "");
      html = html.replace("</head>", `<style>${allCss}</style>\n</head>`);
    }

    // Inject all JS
    if (jsFiles.length > 0) {
      const allJs = jsFiles.map((f) => f.content).join("\n;\n");
      // Remove script tags referencing local js files
      html = html.replace(/<script[^>]*src=["'][^"']*\.js["'][^>]*><\/script>/gi, "");
      html = html.replace("</body>", `<script>${allJs}<\/script>\n</body>`);
    }

    return html;
  }, [files]);

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
      <div className="flex-1 flex items-start justify-center bg-secondary/20 overflow-auto">
        <div
          className="h-full bg-white transition-all duration-300"
          style={{ width: deviceWidth, maxWidth: "100%" }}
        >
          {previewHtml && (
            <iframe
              key={`${refreshKey}-${files.length}`}
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="App Preview"
              sandbox="allow-scripts allow-modals"
            />
          )}
        </div>
      </div>
    </div>
  );
}
