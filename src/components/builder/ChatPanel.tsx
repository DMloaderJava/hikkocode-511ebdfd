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
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { TaskCard } from "./TaskCard";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

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

function generateInitialSteps(prompt: string, hasExistingFiles: boolean): TaskStep[] {
  const lower = prompt.toLowerCase();
  const steps: TaskStep[] = [];

  // Step 1: Thinking
  steps.push({
    id: "think",
    label: "Thinking",
    status: "pending",
    type: "think",
    detail: "Analyzing your request...",
  });

  // Step 2: Read existing files (if project has files)
  if (hasExistingFiles) {
    steps.push({
      id: "read",
      label: "Reading project files",
      status: "pending",
      type: "read",
      detail: "Understanding current codebase",
    });
  }

  // Step 3: Plan
  steps.push({
    id: "plan",
    label: "Creating action plan",
    status: "pending",
    type: "plan",
    detail: "Determining what to build",
  });

  // Step 4+: Dynamic edit steps based on prompt
  if (lower.includes("fix") || lower.includes("bug") || lower.includes("error")) {
    steps.push({
      id: "edit-fix",
      label: "Applying fix",
      status: "pending",
      type: "edit",
    });
    steps.push({
      id: "verify",
      label: "Verifying solution",
      status: "pending",
      type: "verify",
    });
  } else {
    steps.push({
      id: "edit-html",
      label: "Writing index.html",
      status: "pending",
      type: "edit",
      detail: "/index.html",
    });
    steps.push({
      id: "edit-css",
      label: "Writing styles.css",
      status: "pending",
      type: "edit",
      detail: "/styles.css",
    });
    steps.push({
      id: "edit-js",
      label: "Writing app.js",
      status: "pending",
      type: "edit",
      detail: "/app.js",
    });
  }

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
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
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
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
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
    setLoadingMessage("Thinking...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Create task card with smart steps
    const taskTitle = generateTaskTitle(prompt);
    const hasFiles = activeProject.files.length > 0;
    const taskSteps = generateInitialSteps(prompt, hasFiles);
    const startTime = Date.now();
    let currentTask: GenerationTask = {
      id: crypto.randomUUID(),
      title: taskTitle,
      steps: taskSteps,
      filesChanged: [],
      toolCount: 0,
      timestamp: new Date(),
    };

    // Show task card immediately with first step active
    currentTask = advanceTaskStep(currentTask, 0);
    const assistantMsgId = crypto.randomUUID();
    addMessage(activeProject.id, {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      task: currentTask,
    });

    const history = [
      ...buildConversationHistory(),
      { role: "user" as const, content: prompt.trim() },
    ];

    if (activeProject.files.length > 0) {
      const filesContext = activeProject.files
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n");
      history[history.length - 1] = {
        role: "user",
        content: `Current project files:\n\n${filesContext}\n\nUser request: ${prompt.trim()}`,
      };
    }

    try {
      // === PHASE 1: Thinking ===
      const thinkStepIdx = currentTask.steps.findIndex(s => s.id === "think");
      if (thinkStepIdx >= 0) {
        currentTask = advanceTaskStep(currentTask, thinkStepIdx);
        currentTask.steps[thinkStepIdx].detail = "Analyzing your request...";
        updateLastAssistantTask(activeProject.id, currentTask);
      }
      await new Promise(r => setTimeout(r, 600));

      // === PHASE 2: Reading files (if applicable) ===
      const readStepIdx = currentTask.steps.findIndex(s => s.id === "read");
      if (readStepIdx >= 0) {
        if (thinkStepIdx >= 0) {
          currentTask.steps[thinkStepIdx].status = "done";
          currentTask.steps[thinkStepIdx].duration = Date.now() - startTime;
        }
        currentTask = advanceTaskStep(currentTask, readStepIdx);
        const fileNames = activeProject.files.map(f => f.name).join(", ");
        currentTask.steps[readStepIdx].detail = fileNames;
        updateLastAssistantTask(activeProject.id, currentTask);
        setLoadingMessage("📖 Reading project files...");
        await new Promise(r => setTimeout(r, 400));
      }

      // === PHASE 3: Planning ===
      const planStepIdx = currentTask.steps.findIndex(s => s.id === "plan");
      if (planStepIdx >= 0) {
        // Complete previous steps
        for (let i = 0; i < planStepIdx; i++) {
          currentTask.steps[i].status = "done";
          if (!currentTask.steps[i].duration) currentTask.steps[i].duration = Date.now() - startTime;
        }
        currentTask = advanceTaskStep(currentTask, planStepIdx);
        currentTask.steps[planStepIdx].detail = "Determining approach...";
        updateLastAssistantTask(activeProject.id, currentTask);
        setLoadingMessage("📋 Creating action plan...");
        await new Promise(r => setTimeout(r, 500));
      }

      // === Make the actual API call ===
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

      // Complete planning, start editing
      if (planStepIdx >= 0) {
        currentTask.steps[planStepIdx].status = "done";
        currentTask.steps[planStepIdx].duration = Date.now() - startTime;
        currentTask.steps[planStepIdx].detail = "Plan ready";
      }

      // Find first edit step
      const editSteps = currentTask.steps.filter(s => s.type === "edit");
      let currentEditIdx = 0;
      if (editSteps.length > 0) {
        const firstEditGlobalIdx = currentTask.steps.findIndex(s => s.id === editSteps[0].id);
        currentTask = advanceTaskStep(currentTask, firstEditGlobalIdx);
        updateLastAssistantTask(activeProject.id, currentTask);
        setLoadingMessage("✏️ Writing code...");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let textBuffer = "";
      let hasStartedContent = false;
      let charThresholds = [100, 400, 800]; // advance edit steps at these thresholds
      let thresholdIdx = 0;

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
            const delta = parsed.choices?.[0]?.delta;
            const content = delta?.content as string | undefined;
            if (content && content.length > 0) {
              fullText += content;
              const displayText = stripFilesJson(fullText) || "Writing code...";

              if (!hasStartedContent) {
                hasStartedContent = true;
              }

              // Progress through edit steps based on content length
              if (
                thresholdIdx < charThresholds.length &&
                fullText.length > charThresholds[thresholdIdx] &&
                currentEditIdx < editSteps.length - 1
              ) {
                // Complete current edit step, advance to next
                const curStepGlobal = currentTask.steps.findIndex(s => s.id === editSteps[currentEditIdx].id);
                if (curStepGlobal >= 0) {
                  currentTask.steps[curStepGlobal].status = "done";
                  currentTask.steps[curStepGlobal].duration = Date.now() - startTime;
                }
                currentEditIdx++;
                const nextStepGlobal = currentTask.steps.findIndex(s => s.id === editSteps[currentEditIdx].id);
                if (nextStepGlobal >= 0) {
                  currentTask = advanceTaskStep(currentTask, nextStepGlobal);
                  // Update detail with detected file being written
                  if (fullText.includes("styles.css") || fullText.includes('"language": "css"')) {
                    currentTask.steps[nextStepGlobal].detail = "/styles.css";
                    setLoadingMessage("🎨 Writing styles...");
                  } else if (fullText.includes("app.js") || fullText.includes('"language": "javascript"')) {
                    currentTask.steps[nextStepGlobal].detail = "/app.js";
                    setLoadingMessage("⚡ Writing JavaScript...");
                  }
                }
                updateLastAssistantTask(activeProject.id, currentTask);
                thresholdIdx++;
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

      // Extract files if present
      const files = extractFiles(fullText);
      const fileNames = files ? files.map(f => f.path) : [];
      if (files && files.length > 0) {
        setFiles(activeProject.id, files, prompt.trim());

        // Update edit steps with actual file names
        const editStepsList = currentTask.steps.filter(s => s.type === "edit");
        files.forEach((f, i) => {
          if (i < editStepsList.length) {
            const idx = currentTask.steps.findIndex(s => s.id === editStepsList[i].id);
            if (idx >= 0) {
              currentTask.steps[idx].label = `Edited ${f.name}`;
              currentTask.steps[idx].detail = f.path;
            }
          }
        });

        // If more files than edit steps, add extra steps
        if (files.length > editStepsList.length) {
          for (let i = editStepsList.length; i < files.length; i++) {
            currentTask.steps.push({
              id: `edit-extra-${i}`,
              label: `Edited ${files[i].name}`,
              status: "done",
              type: "edit",
              detail: files[i].path,
            });
          }
        }
      }

      const totalTime = Date.now() - startTime;

      // Complete all task steps
      currentTask = completeAllSteps(currentTask, fileNames);
      currentTask.thinkingTime = totalTime;
      updateLastAssistantTask(activeProject.id, currentTask);

      // Final display
      const cleanText = stripFilesJson(fullText).trim();
      let finalDisplay = cleanText;
      if (files && files.length > 0) {
        const fileList = files.map((f) => `\`${f.path}\``).join(", ");
        finalDisplay = `${cleanText || "Done!"}\n\n📁 **Generated files:** ${fileList}`;
      }

      const finalContent = finalDisplay || fullText || "Done!";
      updateLastAssistantMessage(activeProject.id, finalContent);
      persistAssistantMessage(activeProject.id, assistantMsgId, finalContent);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const stopMsg = "⏹️ Generation stopped by user.";
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
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {activeProject.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-8 h-8 rounded-lg gradient-lovable mb-3 opacity-40" />
            <p className="text-sm text-foreground font-medium mb-1">Start building</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Describe the app you want to create and hikkocode will build it for you
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
                      {/* Task card */}
                      {msg.task && (
                        <TaskCard
                          title={msg.task.title}
                          steps={msg.task.steps}
                          toolCount={msg.task.toolCount}
                          filesChanged={msg.task.filesChanged}
                          thinkingTime={msg.task.thinkingTime}
                          timestamp={msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        />
                      )}
                      {/* Text content */}
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

      {/* Bottom input area */}
      <div className="p-3 border-t border-border">
        <form onSubmit={handleSubmit}>
          <div className="bg-secondary/60 border border-border rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-ring/30 transition-shadow">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask hikkocode..."
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
                  onClick={() => {
                    setInput((prev) => prev + "\nPlease provide a visual/UI-focused update. ");
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Square className="w-3 h-3" />
                  Visual edits
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    toast.info("Image attachments coming soon!");
                  }}
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
                    const random = suggestions[Math.floor(Math.random() * suggestions.length)];
                    setInput(random);
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
                    const random = templates[Math.floor(Math.random() * templates.length)];
                    setInput(random);
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
                    title="Stop generation"
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
