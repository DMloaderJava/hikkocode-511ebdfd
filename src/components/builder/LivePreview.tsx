import { useApp } from "@/context/AppContext";
import { Monitor } from "lucide-react";
import { useMemo } from "react";

interface LivePreviewProps {
  device?: "desktop" | "tablet" | "mobile";
  refreshKey?: number;
}

export function LivePreview({ device = "desktop", refreshKey = 0 }: LivePreviewProps) {
  const { activeProject } = useApp();

  const files = activeProject?.files ?? [];

  const previewHtml = useMemo(() => {
    if (files.length === 0) return null;

    const htmlFile = files.find((f) => f.language === "html");
    const cssFiles = files.filter((f) => f.language === "css");
    const jsFiles = files.filter((f) => f.language === "javascript" || f.language === "typescript");

    if (!htmlFile) return null;

    let html = htmlFile.content;

    // Build a set of local file names to remove their tags (but keep CDN scripts)
    const localJsNames = jsFiles.map((f) => {
      const name = f.path.replace(/^\//, "");
      return name;
    });
    const localCssNames = cssFiles.map((f) => {
      const name = f.path.replace(/^\//, "");
      return name;
    });

    // Replace only LOCAL link tags (not CDN ones)
    for (const cssName of localCssNames) {
      const escapedName = cssName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`<link[^>]*href=["'](?:\\.?\\/?)${escapedName}["'][^>]*\\/?>`, "gi");
      html = html.replace(regex, "");
    }

    // Inject all CSS before </head>
    if (cssFiles.length > 0) {
      const allCss = cssFiles.map((f) => f.content).join("\n");
      if (html.includes("</head>")) {
        html = html.replace("</head>", `<style>${allCss}</style>\n</head>`);
      } else {
        html = `<style>${allCss}</style>\n` + html;
      }
    }

    // Replace only LOCAL script tags (not CDN ones like https://cdnjs...)
    for (const jsName of localJsNames) {
      const escapedName = jsName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`<script[^>]*src=["'](?:\\.?\\/?)${escapedName}["'][^>]*><\\/script>`, "gi");
      html = html.replace(regex, "");
    }

    // Inject all JS before </body>
    if (jsFiles.length > 0) {
      const allJs = jsFiles.map((f) => f.content).join("\n;\n");
      if (html.includes("</body>")) {
        html = html.replace("</body>", `<script>${allJs}<\/script>\n</body>`);
      } else {
        html += `\n<script>${allJs}<\/script>`;
      }
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
              key={`${refreshKey}-${files.length}-${files.map(f => f.path).join(",")}`}
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="App Preview"
              sandbox="allow-scripts allow-modals allow-same-origin allow-popups allow-forms"
            />
          )}
        </div>
      </div>
    </div>
  );
}
