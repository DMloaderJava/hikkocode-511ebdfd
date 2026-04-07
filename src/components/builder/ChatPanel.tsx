import { useState, FormEvent, useRef, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  Bot,
  Loader2,
  Image,
  Key,
  LayoutGrid,
  Square,
  StopCircle,
} from "lucide-react";
import { useApp, ChatMessage, GeneratedFile, GenerationTask, TaskStep } from "@/context/AppContext";
import { buildSmartContext, buildFullContext } from "@/lib/fileTools";
import { diffFiles, diffSummary, type FileDiff } from "@/lib/diff";
import { buildFileTasks, executePerFile } from "@/lib/perFileAgent";
import { runAgentLoop, type AgentStep as AgentToolStep } from "@/lib/agentToolLoop";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { TaskCard } from "./TaskCard";
import { ApiKeyDialog, getStoredApiKey } from "@/components/ApiKeyDialog";
import { ClarificationDialog, useClarification, type ClarificationRequest } from "./ClarificationDialog";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const PLAN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan`;

interface AgentPlan {
  analysis: string;
  approach: string;
  files_to_read: string[];
  files_to_edit: string[];
  new_files: string[];
  plan: string[];
  technologies?: string[];
}

// File extraction no longer needed — agent writes files directly

function generateTaskTitle(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("todo")) return "Build todo application";
  if (lower.includes("landing")) return "Create landing page";
  if (lower.includes("auth") || lower.includes("login")) return "Implement authentication";
  if (lower.includes("dashboard")) return "Build dashboard";
  if (lower.includes("form")) return "Create form component";
  if (lower.includes("chat")) return "Build chat interface";
  if (lower.includes("fix") || lower.includes("bug")) return "Fix reported issues";
  if (lower.includes("add") || lower.includes("create")) return "Implement new feature";
  if (lower.includes("style") || lower.includes("design") || lower.includes("ui")) return "Update UI design";
  if (lower.includes("change") || lower.includes("update") || lower.includes("modify")) return "Apply modifications";
  const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
  return words.length > 40 ? words.slice(0, 40) + "…" : words;
}

function planToSteps(plan: AgentPlan): TaskStep[] {
  const steps: TaskStep[] = [
    { id: "analyze", label: "Analyzed request", status: "done", type: "think", detail: plan.analysis },
  ];

  // Add read steps for files_to_read
  if (plan.files_to_read.length > 0) {
    plan.files_to_read.forEach((file, i) => {
      steps.push({
        id: `read-${i}`,
        label: `Read ${file.split("/").pop()}`,
        status: "done",
        type: "read",
        detail: file,
      });
    });
  }

  // Plan step
  steps.push({
    id: "plan",
    label: "Action plan created",
    status: "done",
    type: "plan",
    detail: `${plan.plan.length} steps · ${plan.files_to_edit.length} edit · ${plan.new_files.length} new`,
  });

  // Edit steps for existing files
  plan.files_to_edit.forEach((file, i) => {
    steps.push({
      id: `edit-${i}`,
      label: `Edit ${file.split("/").pop()}`,
      status: "pending",
      type: "edit",
      detail: file,
    });
  });

  // Create steps for new files
  plan.new_files.forEach((file, i) => {
    steps.push({
      id: `create-${i}`,
      label: `Create ${file.split("/").pop()}`,
      status: "pending",
      type: "create_file",
      detail: file,
    });
  });

  // Verify step
  steps.push({
    id: "verify",
    label: "Verify output",
    status: "pending",
    type: "verify",
  });

  return steps;
}

function fallbackSteps(prompt: string, hasFiles: boolean): TaskStep[] {
  const steps: TaskStep[] = [
    { id: "think", label: "Analyzing request", status: "pending", type: "think", detail: "Understanding what to build..." },
  ];
  if (hasFiles) {
    steps.push({ id: "read", label: "Reading project files", status: "pending", type: "read", detail: "Understanding current codebase" });
  }
  steps.push(
    { id: "plan", label: "Creating action plan", status: "pending", type: "plan", detail: "Determining approach" },
    { id: "edit-html", label: "Create index.html", status: "pending", type: "create_file", detail: "/index.html" },
    { id: "edit-css", label: "Create styles.css", status: "pending", type: "create_file", detail: "/styles.css" },
    { id: "edit-js", label: "Create app.js", status: "pending", type: "create_file", detail: "/app.js" },
    { id: "verify", label: "Verify output", status: "pending", type: "verify" },
  );
  return steps;
}

export function ChatPanel() {
  const {
    activeProject,
    addMessage,
    setFiles,
    isGenerating,
    setIsGenerating,
    setLoadingMessage,
    loadingMessage,
    updateLastAssistantMessage,
    updateLastAssistantTask,
    persistAssistantMessage,
  } = useApp();
  const [input, setInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skippedFilesRef = useRef<Set<string>>(new Set());
  const location = useLocation();
  const initialPromptHandled = useRef(false);
  const clarification = useClarification();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeProject?.messages, isGenerating, loadingMessage]);

  useEffect(() => {
    if (
      location.state?.initialPrompt &&
      activeProject &&
      !initialPromptHandled.current &&
      activeProject.messages.length === 0
    ) {
      initialPromptHandled.current = true;
      submitPrompt(location.state.initialPrompt);
    }
  }, [activeProject, location.state]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  if (!activeProject) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-10 h-10 rounded-xl gradient-lovable mx-auto mb-4 opacity-50" />
            <p className="text-sm font-medium text-foreground mb-1">Welcome to hikkocode</p>
            <p className="text-xs text-muted-foreground">
              Create a new project or select one from the sidebar to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  const buildConversationHistory = () => {
    return activeProject.messages
      .filter((m) => m.content && m.content.length > 0)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  };

  const advanceTaskStep = (task: GenerationTask, stepIndex: number): GenerationTask => {
    const steps = task.steps.map((s, i) => {
      if (i < stepIndex) return { ...s, status: "done" as const };
      if (i === stepIndex) return { ...s, status: "in_progress" as const };
      return s;
    });
    return { ...task, steps };
  };

  const completeAllSteps = (task: GenerationTask, filesChanged: string[]): GenerationTask => {
    return {
      ...task,
      steps: task.steps.map(s => ({ ...s, status: "done" as const })),
      filesChanged,
      toolCount: filesChanged.length,
    };
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const submitPrompt = async (initialPrompt: string) => {
    if (!initialPrompt.trim() || isGenerating || !activeProject) return;
    const prompt = initialPrompt;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt.trim(),
      timestamp: new Date(),
    };

    addMessage(activeProject.id, userMsg);
    setIsGenerating(true);
    setLoadingMessage("🤖 Agent starting...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const taskTitle = generateTaskTitle(prompt);
    const startTime = Date.now();
    const assistantMsgId = crypto.randomUUID();

    // Initialize task with thinking step
    let currentSteps: TaskStep[] = [];
    let currentTask: GenerationTask = {
      id: crypto.randomUUID(),
      title: taskTitle,
      steps: currentSteps,
      filesChanged: [],
      toolCount: 0,
      timestamp: new Date(),
    };

    addMessage(activeProject.id, {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      task: currentTask,
    });

    const changedFiles: string[] = [];
    const oldFiles = [...activeProject.files];

    try {
      // Run the new agent loop with tool-calling
      const resultFiles = await runAgentLoop(
        prompt.trim(),
        activeProject.files,
        {
          onStep: (step: AgentToolStep) => {
            // Map AgentToolStep to TaskStep
            const typeMap: Record<string, TaskStep["type"]> = {
              thinking: "think",
              reading: "read",
              understanding: "analyze",
              editing: "edit",
              creating: "create_file",
              deleting: "edit",
              listing: "read",
              done: "verify",
              error: "default",
            };
            const newStep: TaskStep = {
              id: step.id,
              label: step.label,
              status: step.status,
              type: typeMap[step.type] || "default",
              detail: step.detail || step.filePath,
              duration: step.duration,
              content: step.content,
            };
            currentSteps = [...currentSteps, newStep];
            currentTask = { ...currentTask, steps: currentSteps };
            updateLastAssistantTask(activeProject.id, currentTask);

            // Update loading message
            const iconMap: Record<string, string> = {
              thinking: "🧠", reading: "📖", understanding: "💡",
              editing: "✏️", creating: "📄", deleting: "🗑️", listing: "📁",
            };
            setLoadingMessage(`${iconMap[step.type] || "⚙️"} ${step.label}`);
          },
          onStepUpdate: (stepId: string, update: Partial<AgentToolStep>) => {
            currentSteps = currentSteps.map(s =>
              s.id === stepId ? { ...s, ...update, status: update.status || s.status } as TaskStep : s
            );
            currentTask = { ...currentTask, steps: currentSteps };
            updateLastAssistantTask(activeProject.id, currentTask);
          },
          onThinkingStream: (text: string) => {
            // Show streaming thinking in message content
            updateLastAssistantMessage(activeProject.id, text);
          },
          onFileChanged: (path: string, file: GeneratedFile) => {
            if (!changedFiles.includes(path)) changedFiles.push(path);
            currentTask = {
              ...currentTask,
              filesChanged: [...changedFiles],
              toolCount: changedFiles.length,
            };
            updateLastAssistantTask(activeProject.id, currentTask);

            // Apply file immediately
            const currentFiles = activeProject.files;
            const existingIdx = currentFiles.findIndex(f => f.path === path);
            let newFiles: GeneratedFile[];
            if (existingIdx >= 0) {
              newFiles = currentFiles.map((f, i) => i === existingIdx ? file : f);
            } else {
              newFiles = [...currentFiles, file];
            }
            setFiles(activeProject.id, newFiles, `${prompt.trim()} [${path}]`);
          },
          onFileDeleted: (path: string) => {
            if (!changedFiles.includes(path)) changedFiles.push(path);
            const currentFiles = activeProject.files.filter(f => f.path !== path);
            setFiles(activeProject.id, currentFiles, `${prompt.trim()} [deleted ${path}]`);
          },
          onComplete: (summary: string) => {
            // Add final verify step
            const verifyStep: TaskStep = {
              id: `verify-${Date.now()}`,
              label: "Agent finished",
              status: "done",
              type: "verify",
            };
            currentSteps = [...currentSteps, verifyStep];
          },
          onError: (error: string) => {
            toast.error(error);
          },
          signal: controller.signal,
        },
        getStoredApiKey() || undefined,
      );

      // Compute final diff
      const fileDiffs = diffFiles(
        oldFiles.map(f => ({ path: f.path, content: f.content })),
        resultFiles.map(f => ({ path: f.path, content: f.content })),
      );

      const totalTime = Date.now() - startTime;
      currentTask = {
        ...currentTask,
        steps: currentSteps.map(s => ({ ...s, status: "done" as const })),
        filesChanged: changedFiles,
        toolCount: changedFiles.length,
        thinkingTime: totalTime,
        diffs: fileDiffs.length > 0 ? fileDiffs : undefined,
        diffSummary: fileDiffs.length > 0 ? diffSummary(fileDiffs) : undefined,
      };
      updateLastAssistantTask(activeProject.id, currentTask);

      // Final message
      const fileList = changedFiles.map(f => `\`${f}\``).join(", ");
      const diffInfo = fileDiffs.length > 0 ? `\n\n📊 **Changes:** ${diffSummary(fileDiffs)}` : "";
      const finalContent = changedFiles.length > 0
        ? `✨ Done! Applied ${changedFiles.length} files: ${fileList}${diffInfo}`
        : "✅ Analysis complete.";
      updateLastAssistantMessage(activeProject.id, finalContent);
      persistAssistantMessage(activeProject.id, assistantMsgId, finalContent);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const stopMsg = "⏹️ Agent stopped by user.";
        updateLastAssistantMessage(activeProject.id, stopMsg);
        persistAssistantMessage(activeProject.id, assistantMsgId, stopMsg);
      } else {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        const errMsg = `⚠️ Something went wrong: ${errorMessage}`;
        updateLastAssistantMessage(activeProject.id, errMsg);
        persistAssistantMessage(activeProject.id, assistantMsgId, errMsg);
      }
      currentTask = {
        ...currentTask,
        steps: currentSteps.map(s => ({ ...s, status: "done" as const })),
      };
      updateLastAssistantTask(activeProject.id, currentTask);
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setLoadingMessage("");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    const prompt = input.trim();
    setInput("");
    submitPrompt(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {activeProject.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-8 h-8 rounded-lg gradient-lovable mb-3 opacity-40" />
            <p className="text-sm text-foreground font-medium mb-1">Start building</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Describe the app you want to create and the AI agent will plan and build it for you
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <AnimatePresence>
              {activeProject.messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {msg.role === "user" ? (
                    <div className="flex gap-2.5">
                      <div className="bg-secondary rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm text-foreground leading-relaxed max-w-[90%]">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {msg.task && (
                        <TaskCard
                          title={msg.task.title}
                          steps={msg.task.steps}
                          toolCount={msg.task.toolCount}
                          filesChanged={msg.task.filesChanged}
                          thinkingTime={msg.task.thinkingTime}
                          fileProgress={msg.task.fileProgress}
                          onSkipFile={isGenerating ? (path) => {
                            skippedFilesRef.current?.add(path);
                          } : undefined}
                          plan={msg.task.plan}
                          diffs={msg.task.diffs}
                          diffSummaryText={msg.task.diffSummary}
                          timestamp={msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        />
                      )}
                      {msg.content && (
                        <div className="flex gap-2.5">
                          <div className="w-6 h-6 rounded-md gradient-lovable flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-3 h-3 text-white" />
                          </div>
                          <div className="max-w-[88%] text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert prose-stone dark:prose-stone [&>*:first-child]:mt-0 [&_pre]:bg-secondary [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-xs [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_p]:text-foreground [&_strong]:text-foreground [&_li]:text-foreground [&_a]:text-primary">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isGenerating && loadingMessage && !activeProject.messages.some(
              (m, i) => m.role === "assistant" && i === activeProject.messages.length - 1
            ) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-2.5 items-start"
              >
                <div className="w-6 h-6 rounded-md gradient-lovable flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Loader2 className="w-3 h-3 text-white animate-spin" />
                </div>
                <div className="text-sm text-muted-foreground italic">
                  {loadingMessage}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <form onSubmit={handleSubmit}>
          <div className="bg-secondary/60 border border-border rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-ring/30 transition-shadow">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI agent..."
              className="w-full bg-transparent px-3.5 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[40px] max-h-[200px]"
              disabled={isGenerating}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setInput((prev) => prev + "\nPlease provide a visual/UI-focused update. ")}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Square className="w-3 h-3" />
                  Visual edits
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toast.info("Image attachments coming soon!")}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Attach image"
                >
                  <Image className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowApiKey(true)}
                  className={`p-1.5 rounded-md transition-colors ${getStoredApiKey() ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground'} hover:bg-secondary`}
                  title="API Key"
                >
                  <Key className="w-3.5 h-3.5" />
                </button>
                <ApiKeyDialog open={showApiKey} onClose={() => setShowApiKey(false)} />
                <button
                  type="button"
                  onClick={() => {
                    const templates = [
                      "Build a landing page with hero section, features grid, and footer",
                      "Create a todo app with add, complete, and delete functionality",
                      "Make a dashboard with sidebar, stats cards, and a chart",
                      "Build a login/signup form with validation",
                    ];
                    setInput(templates[Math.floor(Math.random() * templates.length)]);
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Templates"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center ml-1 hover:opacity-80 transition-opacity"
                    title="Stop agent"
                  >
                    <StopCircle className="w-3.5 h-3.5 text-destructive-foreground" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center ml-1 disabled:opacity-30 transition-opacity"
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-background" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      <ClarificationDialog
        request={clarification.request}
        onSubmit={clarification.handleSubmit}
        onCancel={clarification.handleCancel}
      />
    </div>
  );
}
