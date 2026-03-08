import { useState, FormEvent, useRef, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  Bot,
  Loader2,
  Image,
  Lightbulb,
  LayoutGrid,
  Square,
  StopCircle,
} from "lucide-react";
import { useApp, ChatMessage, GeneratedFile, GenerationTask, TaskStep } from "@/context/AppContext";
import { buildSmartContext, buildFullContext, createSandbox, commitSandbox } from "@/lib/fileTools";
import { diffFiles, diffSummary, type FileDiff } from "@/lib/diff";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { TaskCard } from "./TaskCard";

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

function extractFiles(text: string): GeneratedFile[] | null {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed?.files && Array.isArray(parsed.files) && parsed.files.length > 0) {
        return parsed.files;
      }
    } catch { /* ignore */ }
  }
  const rawMatch = text.match(/\{\s*"files"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      if (parsed?.files?.length > 0) return parsed.files;
    } catch { /* ignore */ }
  }
  return null;
}

function stripFilesJson(text: string): string {
  return text
    .replace(/```json\s*\{[\s\S]*?"files"[\s\S]*?```/g, "")
    .replace(/\{\s*"files"\s*:\s*\[[\s\S]*\]\s*\}/g, "")
    .trim();
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const location = useLocation();
  const initialPromptHandled = useRef(false);

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

  const submitPrompt = async (prompt: string) => {
    if (!prompt.trim() || isGenerating || !activeProject) return;

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

    // Start with minimal task - will be replaced by plan
    let currentTask: GenerationTask = {
      id: crypto.randomUUID(),
      title: taskTitle,
      steps: [
        { id: "analyze", label: "Analyzing request", status: "in_progress", type: "think", detail: "Understanding what you need..." },
        { id: "plan-loading", label: "Creating action plan", status: "pending", type: "plan" },
      ],
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

    const abortableSleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (controller.signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });

    try {
      // === PHASE 1: AI PLANNING ===
      setLoadingMessage("🧠 Agent is thinking...");
      let plan: AgentPlan | null = null;

      try {
        const planResp = await fetch(PLAN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            existingFiles: activeProject.files.map(f => ({
              path: f.path,
              language: f.language,
              content: f.content,
            })),
          }),
          signal: controller.signal,
        });

        if (planResp.ok) {
          plan = await planResp.json();
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        console.warn("Plan failed, using fallback:", e);
      }

      // === PHASE 2: Build task steps from plan ===
      const planStepTime = Date.now() - startTime;

      if (plan && plan.plan && plan.plan.length > 0) {
        const agentSteps = planToSteps(plan);
        agentSteps[0].duration = planStepTime;
        if (agentSteps.length > 1) agentSteps[1].duration = planStepTime;

        currentTask = {
          ...currentTask,
          title: taskTitle,
          steps: agentSteps,
          plan: {
            analysis: plan.analysis,
            approach: plan.approach,
            technologies: plan.technologies,
            files_to_read: plan.files_to_read,
            files_to_edit: plan.files_to_edit,
            new_files: plan.new_files,
            planSteps: plan.plan,
          },
        } as GenerationTask;
      } else {
        // Fallback steps
        const fbSteps = fallbackSteps(prompt, activeProject.files.length > 0);
        fbSteps[0].status = "done";
        fbSteps[0].duration = planStepTime;
        currentTask = { ...currentTask, steps: fbSteps };
      }

      updateLastAssistantTask(activeProject.id, currentTask);
      setLoadingMessage("📋 Plan ready, executing...");
      await abortableSleep(300);

      // === PHASE 3: EXECUTE — Call chat API ===
      // Find first non-done step and activate it
      const firstPendingIdx = currentTask.steps.findIndex(s => s.status === "pending");
      if (firstPendingIdx >= 0) {
        currentTask = advanceTaskStep(currentTask, firstPendingIdx);
        updateLastAssistantTask(activeProject.id, currentTask);
      }
      setLoadingMessage("✏️ Agent is writing code...");

      const history = [
        ...buildConversationHistory(),
        { role: "user" as const, content: prompt.trim() },
      ];

      // Build smart context: use plan data to prioritize relevant files
      if (activeProject.files.length > 0) {
        let filesContext: string;
        if (plan && (plan.files_to_read.length > 0 || plan.files_to_edit.length > 0)) {
          // Smart context: full content for files agent needs, summaries for rest
          filesContext = buildSmartContext(
            activeProject.files,
            plan.files_to_read,
            plan.files_to_edit
          );
        } else {
          // No plan data — send everything
          filesContext = buildFullContext(activeProject.files);
        }
        history[history.length - 1] = {
          role: "user",
          content: `Current project files:\n\n${filesContext}\n\nUser request: ${prompt.trim()}`,
        };
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errorMsg = errData.error || `Error ${resp.status}`;
        updateLastAssistantMessage(activeProject.id, `⚠️ ${errorMsg}`);
        currentTask = completeAllSteps(currentTask, []);
        updateLastAssistantTask(activeProject.id, currentTask);
        setIsGenerating(false);
        setLoadingMessage("");
        return;
      }

      if (!resp.body) throw new Error("No response body");

      // === PHASE 4: Stream response and advance steps ===
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let textBuffer = "";

      // Calculate step advancement thresholds
      const pendingSteps = currentTask.steps.filter(s => s.status !== "done");
      const stepThresholds = pendingSteps.map((_, i) => (i + 1) * 300);
      let advancedCount = 0;

      const stepMessages: Record<string, string> = {
        create_file: "📄 Creating file...",
        add_styles: "🎨 Styling...",
        add_logic: "⚡ Adding logic...",
        add_component: "🧩 Building component...",
        configure: "⚙️ Configuring...",
        verify: "✅ Verifying...",
        edit: "✏️ Editing...",
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content && content.length > 0) {
              fullText += content;
              const displayText = stripFilesJson(fullText) || "Working...";

              // Advance through steps based on content thresholds
              if (advancedCount < stepThresholds.length - 1 && fullText.length > stepThresholds[advancedCount]) {
                const pendingIdx = currentTask.steps.findIndex(
                  (s, i) => s.status === "pending" || (s.status === "in_progress" && i > 0)
                );
                if (pendingIdx > 0) {
                  // Complete current in-progress step
                  const inProgressIdx = currentTask.steps.findIndex(s => s.status === "in_progress");
                  if (inProgressIdx >= 0) {
                    currentTask.steps[inProgressIdx].status = "done";
                    currentTask.steps[inProgressIdx].duration = Date.now() - startTime;
                  }
                  // Find next pending step
                  const nextPending = currentTask.steps.findIndex(s => s.status === "pending");
                  if (nextPending >= 0) {
                    currentTask = advanceTaskStep(currentTask, nextPending);
                    const stepType = currentTask.steps[nextPending].type || "edit";
                    setLoadingMessage(stepMessages[stepType] || "✏️ Agent working...");
                  }
                  updateLastAssistantTask(activeProject.id, currentTask);
                }
                advancedCount++;
              }

              updateLastAssistantMessage(activeProject.id, displayText);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final buffer flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content && content.length > 0) fullText += content;
          } catch { /* ignore */ }
        }
      }

      // Extract files and apply via sandbox
      const files = extractFiles(fullText);
      const fileNames = files ? files.map(f => f.path) : [];
      let fileDiffs: FileDiff[] = [];

      if (files && files.length > 0) {
        // Create sandbox from current files, compute diff, then commit
        const oldFiles = activeProject.files;
        const sandbox = createSandbox(oldFiles);
        const newFiles = commitSandbox({ ...sandbox, working: files });

        // Compute diff between old and new
        fileDiffs = diffFiles(
          oldFiles.map(f => ({ path: f.path, content: f.content })),
          newFiles.map(f => ({ path: f.path, content: f.content }))
        );

        // Apply to project
        setFiles(activeProject.id, newFiles, prompt.trim());

        // Update steps with actual file names
        const editableSteps = currentTask.steps.filter(s => 
          s.type && ["create_file", "edit", "add_styles", "add_logic", "add_component"].includes(s.type)
        );
        files.forEach((f, i) => {
          if (i < editableSteps.length) {
            const idx = currentTask.steps.findIndex(s => s.id === editableSteps[i].id);
            if (idx >= 0) {
              currentTask.steps[idx].label = `${f.name}`;
              currentTask.steps[idx].detail = f.path;
            }
          }
        });

        if (files.length > editableSteps.length) {
          for (let i = editableSteps.length; i < files.length; i++) {
            currentTask.steps.push({
              id: `extra-${i}`,
              label: `${files[i].name}`,
              status: "done",
              type: "create_file",
              detail: files[i].path,
            });
          }
        }
      }

      const totalTime = Date.now() - startTime;
      currentTask = completeAllSteps(currentTask, fileNames);
      currentTask.thinkingTime = totalTime;
      // Attach diffs to task for display
      if (fileDiffs.length > 0) {
        (currentTask as any).diffs = fileDiffs;
        (currentTask as any).diffSummary = diffSummary(fileDiffs);
      }
      updateLastAssistantTask(activeProject.id, currentTask);

      // Final display
      const cleanText = stripFilesJson(fullText).trim();
      let finalDisplay = cleanText;
      if (files && files.length > 0) {
        const fileList = files.map((f) => `\`${f.path}\``).join(", ");
        const diffInfo = fileDiffs.length > 0 ? `\n\n📊 **Changes:** ${diffSummary(fileDiffs)}` : "";
        finalDisplay = `${cleanText || "Done!"}\n\n📁 **Generated files:** ${fileList}${diffInfo}`;
      }

      const finalContent = finalDisplay || fullText || "Done!";
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
      currentTask = completeAllSteps(currentTask, []);
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
                          plan={(msg.task as any).plan}
                          diffs={(msg.task as any).diffs}
                          diffSummaryText={(msg.task as any).diffSummary}
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
                  onClick={() => {
                    const suggestions = [
                      "Add a dark mode toggle",
                      "Make it responsive for mobile",
                      "Add form validation",
                      "Improve the loading states",
                      "Add animations and transitions",
                    ];
                    setInput(suggestions[Math.floor(Math.random() * suggestions.length)]);
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Suggestions"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                </button>
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
    </div>
  );
}
