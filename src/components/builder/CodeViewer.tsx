import { useApp } from "@/context/AppContext";
import { Code, Copy, Check } from "lucide-react";
import { useState } from "react";

export function CodeViewer() {
  const { activeFile } = useApp();
  const [copied, setCopied] = useState(false);

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Code className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Select a file to view its code</p>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
        <div className="flex items-center gap-2 text-sm">
          <Code className="w-4 h-4 text-primary" />
          <span className="text-foreground font-medium">{activeFile.name}</span>
          <span className="text-muted-foreground text-xs">({activeFile.language})</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 scrollbar-thin">
        <pre className="text-sm font-mono leading-relaxed">
          <code>
            {activeFile.content.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="inline-block w-10 text-right pr-4 text-muted-foreground/50 select-none text-xs">
                  {i + 1}
                </span>
                <span className="text-secondary-foreground">{line || " "}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
