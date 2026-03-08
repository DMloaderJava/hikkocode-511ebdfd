import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Globe,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Rocket,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
}

type PublishStage = "idle" | "building" | "deploying" | "done" | "error";

export function PublishDialog({ open, onClose }: PublishDialogProps) {
  const { activeProject } = useApp();
  const [stage, setStage] = useState<PublishStage>("idle");
  const [copied, setCopied] = useState(false);

  const projectSlug = activeProject?.name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "my-app";

  const publishedUrl = `https://${projectSlug}.laughable.app`;

  const handlePublish = async () => {
    setStage("building");

    // Simulate build step
    await new Promise((r) => setTimeout(r, 1500));
    setStage("deploying");

    // Simulate deploy step
    await new Promise((r) => setTimeout(r, 2000));
    setStage("done");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(publishedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setStage("idle");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-card border border-border rounded-2xl shadow-lovable-lg w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-lovable flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Publish</h2>
              <p className="text-xs text-muted-foreground">
                Deploy your app to the web
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5">
          {stage === "idle" && (
            <div className="space-y-4">
              {/* Project info */}
              <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Project
                  </label>
                  <p className="text-sm font-medium text-foreground">
                    {activeProject?.name || "Untitled"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    URL
                  </label>
                  <div className="flex items-center gap-2 bg-card rounded-lg border border-border px-3 py-2">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-foreground font-mono truncate">
                      {publishedUrl}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Files
                  </label>
                  <p className="text-sm text-foreground">
                    {activeProject?.files.length || 0} files, v
                    {activeProject?.version || 0}
                  </p>
                </div>
              </div>

              <button
                onClick={handlePublish}
                disabled={!activeProject?.files.length}
                className="w-full py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Publish now
              </button>
            </div>
          )}

          {(stage === "building" || stage === "deploying") && (
            <div className="py-6 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
                <p className="text-sm font-medium text-foreground">
                  {stage === "building"
                    ? "Building your app..."
                    : "Deploying to edge network..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stage === "building"
                    ? "Bundling files and optimizing assets"
                    : "Distributing to CDN nodes worldwide"}
                </p>
              </div>

              {/* Progress steps */}
              <div className="space-y-2 px-2">
                {[
                  { label: "Bundle files", done: true },
                  { label: "Optimize assets", done: stage === "deploying" },
                  {
                    label: "Deploy to CDN",
                    done: false,
                    active: stage === "deploying",
                  },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {step.done ? (
                      <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-background" />
                      </div>
                    ) : step.active ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                    )}
                    <span
                      className={`text-xs ${
                        step.done || step.active
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === "done" && (
            <div className="py-4 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Published successfully!
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Your app is now live and accessible worldwide
                </p>
              </div>

              {/* URL card */}
              <div className="flex items-center gap-2 bg-secondary/50 rounded-lg border border-border px-3 py-2.5">
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground font-mono truncate flex-1">
                  {publishedUrl}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
