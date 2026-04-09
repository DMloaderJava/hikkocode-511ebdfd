/**
 * Agent Tool Loop — client-side multi-turn tool-calling controller.
 * Handles the loop: send messages → receive tool calls → resolve tools → continue.
 */

import { GeneratedFile } from "@/context/AppContext";

export type AgentMode = "hikkocode" | "openclaw";

const AGENT_URLS: Record<AgentMode, string> = {
  hikkocode: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-v2`,
  openclaw: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-openclaw`,
};

// ─── Types ───

export type AgentStepType = "thinking" | "reading" | "understanding" | "editing" | "creating" | "deleting" | "listing" | "done" | "error";

export interface AgentStep {
  id: string;
  type: AgentStepType;
  label: string;
  detail?: string;
  content?: string;
  status: "pending" | "in_progress" | "done";
  duration?: number;
  filePath?: string;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentCallbacks {
  onStep: (step: AgentStep) => void;
  onStepUpdate: (stepId: string, update: Partial<AgentStep>) => void;
  onThinkingStream: (text: string) => void;
  onFileChanged: (path: string, file: GeneratedFile) => void;
  onFileDeleted: (path: string) => void;
  onComplete: (summary: string) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

// ─── File index for context ───

interface FileIndex {
  path: string;
  language: string;
  size: number;
}

function buildFileIndex(files: GeneratedFile[]): FileIndex[] {
  return files.map(f => ({
    path: f.path,
    language: f.language,
    size: f.content.length,
  }));
}

// ─── SSE Stream Parser ───

interface StreamResult {
  textContent: string;
  toolCalls: ToolCall[];
}

async function streamResponse(
  resp: Response,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let fullText = "";
  const toolCalls: ToolCall[] = [];
  // Track tool calls by index for streaming assembly
  const partialToolCalls = new Map<number, { id: string; name: string; args: string }>();
  // Track already-finalized tool call IDs to avoid duplicates
  const finalizedIds = new Set<string>();

  const processLine = (line: string) => {
    if (line.startsWith(":") || line.trim() === "") return;
    if (!line.startsWith("data: ")) return;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") return;

    try {
      const parsed = JSON.parse(jsonStr);
      const choice = parsed.choices?.[0];
      if (!choice) return;
      const delta = choice.delta;
      if (!delta) return;

      // Text content
      if (delta.content) {
        fullText += delta.content;
        onDelta(fullText);
      }

      // Tool calls — handle both streaming chunks and complete tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;

          if (tc.id && tc.function?.name) {
            // Complete tool call (from Lovable AI Gateway) or new partial start
            if (tc.function.arguments && tc.function.arguments.length > 2) {
              // Complete tool call — add directly if not a duplicate
              if (!finalizedIds.has(tc.id)) {
                finalizedIds.add(tc.id);
                toolCalls.push({
                  id: tc.id,
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  },
                });
              }
            } else {
              // Start of a streaming tool call
              partialToolCalls.set(idx, {
                id: tc.id,
                name: tc.function.name,
                args: tc.function.arguments || "",
              });
            }
          } else if (tc.function?.arguments) {
            // Append arguments to existing partial
            const existing = partialToolCalls.get(idx);
            if (existing) existing.args += tc.function.arguments;
          }
        }
      }

      // On finish_reason "tool_calls", finalize any remaining partials
      if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
        for (const [, ptc] of partialToolCalls) {
          if (!finalizedIds.has(ptc.id) && ptc.name) {
            finalizedIds.add(ptc.id);
            toolCalls.push({
              id: ptc.id,
              function: { name: ptc.name, arguments: ptc.args || "{}" },
            });
          }
        }
        partialToolCalls.clear();
      }
    } catch {
      // Skip unparseable lines
    }
  };

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      processLine(line);
    }
  }

  // Process remaining buffer
  if (textBuffer.trim()) {
    for (const line of textBuffer.split("\n")) {
      processLine(line.endsWith("\r") ? line.slice(0, -1) : line);
    }
  }

  // Finalize any remaining partials
  for (const [, ptc] of partialToolCalls) {
    if (!finalizedIds.has(ptc.id) && ptc.name) {
      finalizedIds.add(ptc.id);
      toolCalls.push({
        id: ptc.id,
        function: { name: ptc.name, arguments: ptc.args || "{}" },
      });
    }
  }

  return { textContent: fullText, toolCalls };
}

// ─── Tool Execution ───

function resolveToolCall(
  tc: ToolCall,
  files: Map<string, GeneratedFile>,
  callbacks: AgentCallbacks,
): { result: string; stepType: AgentStepType; label: string } {
  const name = tc.function.name;
  let args: any = {};
  try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

  const normPath = (p: string) => {
    if (!p) return "/";
    return p.startsWith("/") ? p : `/${p}`;
  };

  const langMap: Record<string, string> = {
    html: "html", htm: "html", css: "css", js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
    yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", sh: "bash", svg: "xml",
  };

  switch (name) {
    case "list_files": {
      const fileList = Array.from(files.values()).map(f => ({
        path: f.path,
        language: f.language,
        size: f.content.length,
      }));
      return {
        result: JSON.stringify(fileList, null, 2),
        stepType: "listing",
        label: `Listed ${fileList.length} files`,
      };
    }

    case "read_file": {
      const path = normPath(args.path);
      const file = files.get(path);
      if (file) {
        return { result: file.content, stepType: "reading", label: `Read ${path.split("/").pop()}` };
      }
      return { result: `Error: File not found: ${path}`, stepType: "reading", label: `File not found: ${path.split("/").pop()}` };
    }

    case "edit_file": {
      const path = normPath(args.path);
      const content = args.content || "";
      const desc = args.description || "Updated file";
      const fileName = path.split("/").pop() || path;
      const ext = fileName.split(".").pop()?.toLowerCase() || "text";

      const file: GeneratedFile = { name: fileName, path, content, language: langMap[ext] || "text" };
      files.set(path, file);
      callbacks.onFileChanged(path, file);
      return { result: `Successfully edited ${path}: ${desc}`, stepType: "editing", label: `Edited ${fileName}` };
    }

    case "create_file": {
      const path = normPath(args.path);
      const content = args.content || "";
      const fileName = path.split("/").pop() || path;
      const ext = fileName.split(".").pop()?.toLowerCase() || "text";

      const file: GeneratedFile = {
        name: fileName, path, content,
        language: args.language || langMap[ext] || "text",
      };
      files.set(path, file);
      callbacks.onFileChanged(path, file);
      return { result: `Successfully created ${path}`, stepType: "creating", label: `Created ${fileName}` };
    }

    case "delete_file": {
      const path = normPath(args.path);
      files.delete(path);
      callbacks.onFileDeleted(path);
      return { result: `Successfully deleted ${path}`, stepType: "deleting", label: `Deleted ${path.split("/").pop()}` };
    }

    default:
      return { result: `Unknown tool: ${name}`, stepType: "error", label: `Unknown: ${name}` };
  }
}

// ─── Main Agent Loop ───

const MAX_TURNS = 20;

export async function runAgentLoop(
  prompt: string,
  existingFiles: GeneratedFile[],
  callbacks: AgentCallbacks,
  customApiKey?: string,
  agentMode: AgentMode = "hikkocode",
): Promise<GeneratedFile[]> {
  const AGENT_URL = AGENT_URLS[agentMode];
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  // Working copy of files
  const files = new Map<string, GeneratedFile>();
  for (const f of existingFiles) {
    const path = f.path.startsWith("/") ? f.path : `/${f.path}`;
    files.set(path, { ...f, path });
  }

  // Build initial context
  const fileIndex = buildFileIndex(existingFiles);
  const contextMsg = fileIndex.length > 0
    ? `Project has ${fileIndex.length} files:\n${fileIndex.map(f => `- ${f.path} (${f.language}, ${f.size} bytes)`).join("\n")}\n\nUser request: ${prompt}`
    : prompt;

  const messages: any[] = [{ role: "user", content: contextMsg }];

  let stepCounter = 0;
  const makeStepId = () => `step-${++stepCounter}`;

  // Initial thinking step
  let currentThinkingStepId = makeStepId();
  callbacks.onStep({
    id: currentThinkingStepId,
    type: "thinking",
    label: "Thinking...",
    status: "in_progress",
  });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const startTime = Date.now();

    const resp = await fetch(AGENT_V2_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        temperature: turn === 0 ? 0.3 : 0.2,
        customApiKey,
      }),
      signal: callbacks.signal,
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Agent error ${resp.status}`);
    }

    const { textContent, toolCalls } = await streamResponse(
      resp,
      (text) => callbacks.onThinkingStream(text),
      callbacks.signal,
    );

    const elapsed = Date.now() - startTime;

    // Update thinking step
    if (textContent.trim()) {
      callbacks.onStepUpdate(currentThinkingStepId, {
        status: "done",
        content: textContent,
        duration: elapsed,
        label: turn === 0 ? "Analyzed request" : "Reasoning",
      });
    }

    // No tool calls = agent is done
    if (toolCalls.length === 0) {
      callbacks.onComplete(textContent);
      break;
    }

    // Add assistant message with tool calls
    messages.push({
      role: "assistant",
      content: textContent || null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: tc.function,
      })),
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      const tcStepId = makeStepId();
      let parsedArgs: any = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch { /* empty */ }

      const { result, stepType, label } = resolveToolCall(tc, files, callbacks);

      callbacks.onStep({
        id: tcStepId,
        type: stepType,
        label,
        status: "done",
        detail: parsedArgs.path || undefined,
        filePath: ["edit_file", "create_file", "delete_file"].includes(tc.function.name)
          ? (parsedArgs.path || "")
          : undefined,
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: result,
      });
    }

    // Summary of what happened this turn
    const editCount = toolCalls.filter(tc => ["edit_file", "create_file"].includes(tc.function.name)).length;
    const readCount = toolCalls.filter(tc => tc.function.name === "read_file").length;

    let nextLabel = "Processing...";
    if (editCount > 0) nextLabel = "Verifying changes...";
    else if (readCount > 0) nextLabel = "Analyzing files...";

    // Create new thinking step for next turn
    currentThinkingStepId = makeStepId();
    callbacks.onStep({
      id: currentThinkingStepId,
      type: editCount > 0 ? "understanding" : "thinking",
      label: nextLabel,
      status: "in_progress",
    });
  }

  return Array.from(files.values());
}
