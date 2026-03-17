import { useState, forwardRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Circle,
  ChevronRight,
  FileText,
  Brain,
  BookOpen,
  ListChecks,
  Pencil,
  ShieldCheck,
  Clock,
  ChevronDown,
  Zap,
  Search,
  Settings,
  Code,
  Palette,
  Sparkles,
  Target,
  FilePlus,
  FileEdit,
  Eye,
  GitCompare,
  Plus,
  Minus,
  SkipForward,
} from "lucide-react";
import type { FileDiff, DiffLine } from "@/lib/diff";

export interface TaskStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
  type?: "think" | "read" | "plan" | "edit" | "verify" | "analyze" | "create_file" | "add_styles" | "add_logic" | "add_component" | "configure" | "default";
  detail?: string;
  duration?: number;
}

interface TaskCardProps {
  title: string;
  steps: TaskStep[];
  toolCount?: number;
  timestamp?: string;
  filesChanged?: string[];
  thinkingTime?: number;
  fileProgress?: { done: number; total: number };
  onSkipFile?: (path: string) => void;
  plan?: {
    analysis: string;
    approach: string;
    technologies?: string[];
    files_to_read?: string[];
    files_to_edit?: string[];
    new_files?: string[];
    planSteps?: string[];
  };
  diffs?: FileDiff[];
  diffSummaryText?: string;
  onPreviewClick?: () => void;
}

const stepIcons: Record<string, typeof Brain> = {
  think: Brain,
  analyze: Search,
  read: BookOpen,
  plan: ListChecks,
  edit: Pencil,
  create_file: FileText,
  add_styles: Palette,
  add_logic: Zap,
  add_component: Code,
  configure: Settings,
  verify: ShieldCheck,
  default: Circle,
};

const stepColors: Record<string, string> = {
  think: "text-violet-400",
  analyze: "text-violet-400",
  read: "text-blue-400",
  plan: "text-amber-400",
  edit: "text-emerald-400",
  create_file: "text-emerald-400",
  add_styles: "text-pink-400",
  add_logic: "text-yellow-400",
  add_component: "text-cyan-400",
  configure: "text-orange-400",
  verify: "text-cyan-400",
  default: "text-muted-foreground",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard({
  title,
  steps,
  toolCount,
  timestamp,
  filesChanged,
  thinkingTime,
  fileProgress,
  onSkipFile,
  plan,
  diffs,
  diffSummaryText,
  onPreviewClick,
}, ref) {
  const [expanded, setExpanded] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [expandedDiffFile, setExpandedDiffFile] = useState<string | null>(null);

  const doneCount = steps.filter((s) => s.status === "done").length;
  const isComplete = doneCount === steps.length && steps.length > 0;
  const isWorking = steps.some((s) => s.status === "in_progress");
  const currentStep = steps.find((s) => s.status === "in_progress");

  useEffect(() => {
    if (isWorking && !expanded) setExpanded(true);
  }, [isWorking]);

  const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;

  const hasFileInfo = plan && (
    (plan.files_to_read && plan.files_to_read.length > 0) ||
    (plan.files_to_edit && plan.files_to_edit.length > 0) ||
    (plan.new_files && plan.new_files.length > 0)
  );

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
    >
      {/* File progress bar */}
      {isWorking && fileProgress && fileProgress.total > 0 && (
        <div className="px-4 pt-2 pb-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Generating files</span>
            <span className="font-mono">{fileProgress.done}/{fileProgress.total} — {Math.round((fileProgress.done / fileProgress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(fileProgress.done / fileProgress.total) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      )}
      {/* Step progress bar (fallback when no fileProgress) */}
      {isWorking && (!fileProgress || fileProgress.total === 0) && (
        <div className="h-0.5 bg-secondary">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
      >
        {isComplete ? (
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-emerald-500" />
          </div>
        ) : isWorking ? (
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            {isWorking && <Sparkles className="w-3 h-3 text-amber-400 flex-shrink-0" />}
            <h3 className="text-sm font-semibold text-foreground truncate">
              {isComplete ? "✨ Agent finished" : isWorking ? (currentStep?.label || "Agent working...") : title}
            </h3>
            {thinkingTime && isComplete && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                <Clock className="w-2.5 h-2.5" />
                {formatDuration(thinkingTime)}
              </span>
            )}
          </div>

          {currentStep?.detail && isWorking && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{currentStep.detail}</p>
          )}
          {isComplete && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {filesChanged && filesChanged.length > 0
                ? `${filesChanged.length} file${filesChanged.length > 1 ? "s" : ""} changed · ${steps.length} steps`
                : `${steps.length} steps completed`}
            </p>
          )}
          {isWorking && (
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Step {doneCount + 1} of {steps.length}
            </p>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Agent Plan section */}
            {plan && (
              <div className="border-t border-border">
                <button
                  onClick={(e) => { e.stopPropagation(); setPlanExpanded(!planExpanded); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-secondary/30 transition-colors"
                >
                  <Target className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400 font-medium">Agent Plan</span>
                  {plan.planSteps && (
                    <span className="text-[10px] text-muted-foreground">{plan.planSteps.length} steps</span>
                  )}
                  <ChevronRight className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${planExpanded ? "rotate-90" : ""}`} />
                </button>
                <AnimatePresence>
                  {planExpanded && (
                    <motion.div
                      key="plan"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 space-y-3">
                        {/* Analysis */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Analysis</p>
                          <p className="text-xs text-foreground/80 leading-relaxed">{plan.analysis}</p>
                        </div>

                        {/* Approach */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Approach</p>
                          <p className="text-xs text-foreground/80 leading-relaxed">{plan.approach}</p>
                        </div>

                        {/* File operations */}
                        {hasFileInfo && (
                          <div className="space-y-2">
                            {plan.files_to_read && plan.files_to_read.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-blue-400/80 mb-1 flex items-center gap-1">
                                  <Eye className="w-2.5 h-2.5" /> Files to read
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {plan.files_to_read.map((f, i) => (
                                    <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 font-mono">{f}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {plan.files_to_edit && plan.files_to_edit.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1 flex items-center gap-1">
                                  <FileEdit className="w-2.5 h-2.5" /> Files to edit
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {plan.files_to_edit.map((f, i) => (
                                    <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 font-mono">{f}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {plan.new_files && plan.new_files.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1 flex items-center gap-1">
                                  <FilePlus className="w-2.5 h-2.5" /> New files
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {plan.new_files.map((f, i) => (
                                    <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 font-mono">{f}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Plan steps */}
                        {plan.planSteps && plan.planSteps.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Execution plan</p>
                            <ol className="space-y-1">
                              {plan.planSteps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                                  <span className="text-[10px] text-muted-foreground/50 mt-0.5 w-3 text-right flex-shrink-0">{i + 1}.</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Technologies */}
                        {plan.technologies && plan.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {plan.technologies.map((tech, i) => (
                              <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Execution steps */}
            <div className="px-4 pb-3 space-y-1 border-t border-border pt-2">
              {steps.map((step, idx) => {
                const IconComponent = stepIcons[step.type || "default"] || Circle;
                const colorClass = step.status === "done"
                  ? "text-foreground/70"
                  : step.status === "in_progress"
                  ? stepColors[step.type || "default"]
                  : "text-muted-foreground/30";

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`flex items-start gap-2.5 py-0.5 ${
                      step.status === "in_progress" ? "bg-secondary/20 -mx-2 px-2 rounded-lg" : ""
                    }`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {step.status === "done" ? (
                        <div className="w-4 h-4 rounded-full bg-foreground/80 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-background" />
                        </div>
                      ) : step.status === "in_progress" ? (
                        <Loader2 className={`w-4 h-4 animate-spin ${colorClass}`} />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/20" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <IconComponent className={`w-3 h-3 flex-shrink-0 ${colorClass}`} />
                        <span className={`text-xs ${
                          step.status === "done" ? "text-foreground/70"
                            : step.status === "in_progress" ? "text-foreground font-medium"
                            : "text-muted-foreground/50"
                        }`}>
                          {step.label}
                        </span>
                        {step.duration && step.status === "done" && (
                          <span className="text-[10px] text-muted-foreground/50">
                            {formatDuration(step.duration)}
                          </span>
                        )}
                      </div>
                      {step.detail && (
                        <p className={`text-[11px] mt-0.5 ml-5 font-mono ${
                          step.status === "in_progress" ? "text-muted-foreground" : "text-muted-foreground/50"
                        }`}>
                          {step.detail}
                        </p>
                      )}
                    </div>
                    {/* Skip button for pending file steps */}
                    {step.status === "pending" && (step.type === "edit" || step.type === "create_file") && onSkipFile && step.detail && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSkipFile(step.detail!);
                        }}
                        className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title={`Skip ${step.detail}`}
                      >
                        <SkipForward className="w-3 h-3" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Files changed */}
            {filesChanged && filesChanged.length > 0 && (
              <div className="border-t border-border">
                <button
                  onClick={(e) => { e.stopPropagation(); setFilesExpanded(!filesExpanded); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  <span>{filesChanged.length} file{filesChanged.length > 1 ? "s" : ""} changed</span>
                  <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${filesExpanded ? "rotate-90" : ""}`} />
                </button>
                <AnimatePresence>
                  {filesExpanded && (
                    <motion.div
                      key="files"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-2 space-y-1">
                        {filesChanged.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Pencil className="w-2.5 h-2.5 text-emerald-400/60" />
                            <span className="font-mono text-[11px]">{file}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Diff viewer */}
            {diffs && diffs.length > 0 && (
              <div className="border-t border-border">
                <button
                  onClick={(e) => { e.stopPropagation(); setDiffExpanded(!diffExpanded); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                >
                  <GitCompare className="w-3 h-3" />
                  <span>{diffSummaryText || `${diffs.length} file${diffs.length > 1 ? "s" : ""} changed`}</span>
                  <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${diffExpanded ? "rotate-90" : ""}`} />
                </button>
                <AnimatePresence>
                  {diffExpanded && (
                    <motion.div
                      key="diffs"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2">
                        {diffs.map((diff, i) => {
                          const isFileExpanded = expandedDiffFile === diff.path;
                          const statusColor = diff.status === "added"
                            ? "text-emerald-400"
                            : diff.status === "deleted"
                            ? "text-red-400"
                            : "text-amber-400";
                          const StatusIcon = diff.status === "added" ? FilePlus : diff.status === "deleted" ? Minus : FileEdit;

                          // Show only changed lines (max 20 for preview)
                          const changedLines = diff.hunks.filter(h => h.type !== "unchanged");
                          const previewLines = changedLines.slice(0, 20);

                          return (
                            <div key={i} className="rounded-lg border border-border overflow-hidden bg-secondary/20">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedDiffFile(isFileExpanded ? null : diff.path);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary/40 transition-colors"
                              >
                                <StatusIcon className={`w-3 h-3 ${statusColor}`} />
                                <span className="font-mono text-[11px] text-foreground/80 flex-1 text-left truncate">{diff.path}</span>
                                <span className="text-[10px] text-emerald-400">+{diff.additions}</span>
                                <span className="text-[10px] text-red-400">-{diff.deletions}</span>
                                <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isFileExpanded ? "rotate-90" : ""}`} />
                              </button>
                              <AnimatePresence>
                                {isFileExpanded && (
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: "auto" }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="border-t border-border font-mono text-[11px] leading-5 max-h-[200px] overflow-y-auto scrollbar-thin">
                                      {previewLines.map((line, li) => (
                                        <div
                                          key={li}
                                          className={`px-3 py-0 whitespace-pre ${
                                            line.type === "added"
                                              ? "bg-emerald-500/10 text-emerald-300"
                                              : line.type === "removed"
                                              ? "bg-red-500/10 text-red-300"
                                              : "text-muted-foreground/60"
                                          }`}
                                        >
                                          <span className="inline-block w-4 text-right mr-2 text-muted-foreground/30 select-none">
                                            {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                                          </span>
                                          {line.content}
                                        </div>
                                      ))}
                                      {changedLines.length > 20 && (
                                        <div className="px-3 py-1 text-muted-foreground/40 text-center">
                                          ... {changedLines.length - 20} more changes
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
