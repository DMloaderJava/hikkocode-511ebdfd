import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Circle,
  Bookmark,
  ChevronRight,
  Eye,
  FileText,
} from "lucide-react";

export interface TaskStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
}

interface TaskCardProps {
  title: string;
  steps: TaskStep[];
  toolCount?: number;
  timestamp?: string;
  filesChanged?: string[];
  onPreviewClick?: () => void;
}

export function TaskCard({
  title,
  steps,
  toolCount,
  timestamp,
  filesChanged,
  onPreviewClick,
}: TaskCardProps) {
  const [activeTab, setActiveTab] = useState<"details" | "preview">("preview");
  const [expanded, setExpanded] = useState(false);

  const doneCount = steps.filter((s) => s.status === "done").length;
  const isComplete = doneCount === steps.length && steps.length > 0;
  const isWorking = steps.some((s) => s.status === "in_progress");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-snug">
            {title}
          </h3>
          <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0">
            <Bookmark className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Steps checklist */}
      <div className="px-4 pb-2 space-y-1.5">
        {steps.map((step) => (
          <motion.div
            key={step.id}
            className="flex items-center gap-2.5"
            initial={false}
            animate={{ opacity: 1 }}
          >
            {step.status === "done" ? (
              <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                <Check className="w-2.5 h-2.5 text-background" />
              </div>
            ) : step.status === "in_progress" ? (
              <Loader2 className="w-4 h-4 text-accent animate-spin flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
            )}
            <span
              className={`text-xs leading-relaxed ${
                step.status === "done"
                  ? "text-foreground"
                  : step.status === "in_progress"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Tool count badge */}
      {toolCount && toolCount > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mx-4 mb-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <span>{toolCount} tool{toolCount > 1 ? "s" : ""} used</span>
          <ChevronRight
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
      )}

      {/* Expanded files list */}
      <AnimatePresence>
        {expanded && filesChanged && filesChanged.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2 space-y-1">
              {filesChanged.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <FileText className="w-3 h-3" />
                  <span className="font-mono">{file}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom tabs */}
      <div className="flex border-t border-border">
        <button
          onClick={() => setActiveTab("details")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "details"
              ? "text-foreground bg-secondary/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-3 h-3" />
          Details
        </button>
        <div className="w-px bg-border" />
        <button
          onClick={() => {
            setActiveTab("preview");
            onPreviewClick?.();
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "preview"
              ? "text-foreground bg-secondary/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="w-3 h-3" />
          Preview
        </button>
      </div>
    </motion.div>
  );
}
