import { useApp } from "@/context/AppContext";
import { Code, Copy, Check, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import hljs from "highlight.js/lib/core";

// Register languages
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import bash from "highlight.js/lib/languages/bash";
import plaintext from "highlight.js/lib/languages/plaintext";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("plaintext", plaintext);

const langMap: Record<string, string> = {
  html: "html",
  css: "css",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  bash: "bash",
  sh: "bash",
  text: "plaintext",
  txt: "plaintext",
};

function getHljsLang(language: string, filename: string): string {
  // Try by language field
  if (langMap[language]) return langMap[language];
  // Try by extension
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (langMap[ext]) return langMap[ext];
  // Guess from filename
  if (filename.endsWith(".tsx") || filename.endsWith(".ts")) return "typescript";
  if (filename.endsWith(".jsx") || filename.endsWith(".js")) return "javascript";
  if (filename.endsWith(".toml")) return "toml";
  if (filename.endsWith(".json") || filename.endsWith(".app.json")) return "json";
  if (filename.endsWith(".html") || filename.endsWith(".htm")) return "html";
  if (filename.endsWith(".css")) return "css";
  if (filename.endsWith(".md")) return "markdown";
  return "plaintext";
}

export function CodeViewer() {
  const { activeFile, setActiveFile } = useApp();
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!activeFile || !codeRef.current) return;
    
    const lang = getHljsLang(activeFile.language, activeFile.name);
    try {
      const result = hljs.highlight(activeFile.content, { language: lang });
      codeRef.current.innerHTML = result.value;
    } catch {
      // Fallback: just escape HTML
      codeRef.current.textContent = activeFile.content;
    }
  }, [activeFile]);

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Code className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium text-foreground/60">Code Viewer</p>
          <p className="text-xs mt-1">Select a file from the explorer</p>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = activeFile.content.split("\n");

  return (
    <div className="flex flex-col h-full">
      {/* File tab bar */}
      <div className="flex items-center border-b border-border bg-card px-1">
        <div className="flex items-center gap-0 overflow-x-auto">
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground bg-secondary/50 border-b-2 border-accent">
            <Code className="w-3 h-3 text-muted-foreground" />
            {activeFile.name}
            <button
              onClick={() => setActiveFile(null)}
              className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto pr-2">
          <span className="text-[10px] text-muted-foreground/50 uppercase">
            {getHljsLang(activeFile.language, activeFile.name)}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Code content with syntax highlighting */}
      <div className="flex-1 overflow-auto scrollbar-thin bg-card">
        <div className="flex text-xs font-mono leading-5 py-3">
          {/* Line numbers */}
          <div className="flex flex-col text-right pr-4 pl-3 select-none flex-shrink-0 text-muted-foreground/30">
            {lines.map((_, i) => (
              <span key={i} className="leading-5">{i + 1}</span>
            ))}
          </div>
          {/* Highlighted code */}
          <pre className="flex-1 min-w-0 overflow-x-auto pr-4">
            <code
              ref={codeRef}
              className="hljs leading-5 whitespace-pre"
            >
              {activeFile.content}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
