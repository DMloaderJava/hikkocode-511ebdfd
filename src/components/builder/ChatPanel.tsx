import { useState, FormEvent, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  Bot,
  Loader2,
  Image,
  Lightbulb,
  LayoutGrid,
  Square,
} from "lucide-react";
import { useApp, ChatMessage, GeneratedFile } from "@/context/AppContext";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

/** Extract files JSON from AI markdown response */
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
  // Try raw JSON
  const rawMatch = text.match(/\{\s*"files"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      if (parsed?.files?.length > 0) return parsed.files;
    } catch { /* ignore */ }
  }
  return null;
}

/** Remove the JSON code block from the message for display */
function stripFilesJson(text: string): string {
  return text
    .replace(/```json\s*\{[\s\S]*?"files"[\s\S]*?```/g, "")
    .replace(/\{\s*"files"\s*:\s*\[[\s\S]*\]\s*\}/g, "")
    .trim();
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
  } = useApp();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
            <p className="text-sm font-medium text-foreground mb-1">Welcome to Laughable</p>
            <p className="text-xs text-muted-foreground">
              Create a new project or select one from the sidebar to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  const buildConversationHistory = () => {
    return activeProject.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
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

    // Build message history including the new user message
    const history = [
      ...buildConversationHistory(),
      { role: "user" as const, content: prompt.trim() },
    ];

    // If there are existing files, add context
    if (activeProject.files.length > 0) {
      const filesContext = activeProject.files
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n");
      // Prepend file context to the latest user message
      history[history.length - 1] = {
        role: "user",
        content: `Current project files:\n\n${filesContext}\n\nUser request: ${prompt.trim()}`,
      };
    }

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errorMsg = errData.error || `Error ${resp.status}`;
        addMessage(activeProject.id, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ ${errorMsg}`,
          timestamp: new Date(),
        });
        setIsGenerating(false);
        setLoadingMessage("");
        return;
      }

      if (!resp.body) throw new Error("No response body");

      // Stream the response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let textBuffer = "";
      let assistantMsgCreated = false;

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
            if (content) {
              fullText += content;

              if (!assistantMsgCreated) {
                assistantMsgCreated = true;
                addMessage(activeProject.id, {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: fullText,
                  timestamp: new Date(),
                });
              } else {
                // Show clean text (strip JSON blocks while streaming)
                const displayText = stripFilesJson(fullText) || "Writing code...";
                updateLastAssistantMessage(activeProject.id, displayText);
              }
            }
          } catch {
            // Incomplete JSON, put back
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) fullText += content;
          } catch { /* ignore */ }
        }
      }

      // Extract files if present
      const files = extractFiles(fullText);
      if (files && files.length > 0) {
        setFiles(activeProject.id, files, prompt.trim());
      }

      // Final display text
      const displayText = stripFilesJson(fullText) || 
        (files ? `Generated ${files.length} files. Check the Preview tab!` : fullText);
      
      if (files && files.length > 0) {
        const fileList = files.map((f) => `\`${f.path}\``).join(", ");
        updateLastAssistantMessage(
          activeProject.id,
          `${displayText}\n\n📁 Generated files: ${fileList}`
        );
      } else if (assistantMsgCreated) {
        updateLastAssistantMessage(activeProject.id, displayText || fullText);
      } else {
        addMessage(activeProject.id, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullText || "I didn't get a response. Please try again.",
          timestamp: new Date(),
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      addMessage(activeProject.id, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ Something went wrong: ${errorMessage}\n\nPlease try again.`,
        timestamp: new Date(),
      });
    } finally {
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
              Describe the app you want to create and Laughable will build it for you
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <AnimatePresence mode="popLayout">
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
                    <div className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-md gradient-lovable flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                      <div className="max-w-[88%] text-sm text-foreground leading-relaxed prose prose-sm prose-stone">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isGenerating && !activeProject.messages.some(m => m.role === "assistant") && (
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
              placeholder="Ask Laughable..."
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
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Square className="w-3 h-3" />
                  Visual edits
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Attach image"
                >
                  <Image className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Suggestions"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Templates"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <div className="w-6 h-6 rounded-full bg-foreground ml-1" />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
