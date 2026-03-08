/**
 * Autonomous Agent Controller
 * Implements the full cycle: plan → read → generate → apply → verify → PR
 */

import { GeneratedFile } from "@/context/AppContext";
import { createSandbox, commitSandbox, buildSmartContext, buildFullContext } from "./fileTools";
import { diffFiles, diffSummary, type FileDiff } from "./diff";

const PLAN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan`;
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export interface AgentPlan {
  analysis: string;
  approach: string;
  files_to_read: string[];
  files_to_edit: string[];
  new_files: string[];
  plan: string[];
  technologies?: string[];
  alternatives?: string[];
}

export type AgentPhase = 
  | "idle"
  | "planning"
  | "reading"
  | "generating"
  | "applying"
  | "verifying"
  | "creating_pr"
  | "done"
  | "error";

export interface AgentStep {
  phase: AgentPhase;
  label: string;
  detail?: string;
}

export interface AgentResult {
  success: boolean;
  plan: AgentPlan | null;
  files: GeneratedFile[];
  diffs: FileDiff[];
  diffSummaryText: string;
  error?: string;
  phases: AgentStep[];
}

interface AgentCallbacks {
  onPhase: (step: AgentStep) => void;
  onStreamDelta?: (text: string) => void;
  signal?: AbortSignal;
}

function extractFilesFromText(text: string): GeneratedFile[] | null {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed?.files && Array.isArray(parsed.files) && parsed.files.length > 0) return parsed.files;
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

/**
 * Run the full autonomous agent cycle.
 */
export async function runAutonomousAgent(
  prompt: string,
  existingFiles: GeneratedFile[],
  callbacks: AgentCallbacks,
): Promise<AgentResult> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
  const phases: AgentStep[] = [];

  const emit = (phase: AgentPhase, label: string, detail?: string) => {
    const step = { phase, label, detail };
    phases.push(step);
    callbacks.onPhase(step);
  };

  try {
    // === PHASE 1: PLAN ===
    emit("planning", "Analyzing task and creating plan...");

    let plan: AgentPlan | null = null;
    try {
      const planResp = await fetch(PLAN_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          existingFiles: existingFiles.map(f => ({
            path: f.path,
            language: f.language,
            content: f.content,
          })),
        }),
        signal: callbacks.signal,
      });
      if (planResp.ok) plan = await planResp.json();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      console.warn("Plan failed:", e);
    }

    if (plan) {
      emit("planning", "Plan created", `${plan.plan.length} steps, ${plan.files_to_edit.length} edits, ${plan.new_files.length} new`);
    } else {
      emit("planning", "Using fallback plan");
    }

    // === PHASE 2: READ FILES ===
    emit("reading", "Reading project files...");

    let context: string;
    if (plan && (plan.files_to_read.length > 0 || plan.files_to_edit.length > 0)) {
      context = buildSmartContext(existingFiles, plan.files_to_read, plan.files_to_edit);
      emit("reading", "Read targeted files", `${plan.files_to_read.length + plan.files_to_edit.length} files analyzed`);
    } else {
      context = buildFullContext(existingFiles);
      emit("reading", "Read all project files", `${existingFiles.length} files`);
    }

    // === PHASE 3: GENERATE CHANGES (with iterative refinement) ===
    emit("generating", "AI is writing code (iteration 1)...");

    const MAX_ITERATIONS = 3;
    let bestFiles: GeneratedFile[] | null = null;
    let fullText = "";

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const isFirstIteration = iteration === 1;
      const temperature = isFirstIteration ? 0.3 : 0.5; // low for code, slightly higher for refinement

      const iterMessages = isFirstIteration
        ? [
            {
              role: "user" as const,
              content: context
                ? `Current project files:\n\n${context}\n\nUser request: ${prompt}`
                : prompt,
            },
          ]
        : [
            {
              role: "user" as const,
              content: context
                ? `Current project files:\n\n${context}\n\nUser request: ${prompt}`
                : prompt,
            },
            {
              role: "assistant" as const,
              content: fullText,
            },
            {
              role: "user" as const,
              content: `Оцени своё решение выше. Найди слабые места, баги, проблемы с производительностью или UX. Предложи улучшения и верни ПОЛНОСТЬЮ улучшенную версию файлов в том же JSON формате. Попробуй нестандартный подход если это улучшит результат.`,
            },
          ];

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: iterMessages, temperature }),
        signal: callbacks.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `AI error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      // Stream response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      fullText = "";
      let textBuffer = "";

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
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              callbacks.onStreamDelta?.(fullText);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw || raw.startsWith(":") || raw.trim() === "") continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullText += content;
          } catch { /* ignore */ }
        }
      }

      // Try extracting files from this iteration
      const iterFiles = extractFilesFromText(fullText);
      if (iterFiles && iterFiles.length > 0) {
        bestFiles = iterFiles;
      }

      if (iteration < MAX_ITERATIONS && bestFiles) {
        emit("generating", `Refining code (iteration ${iteration + 1}/${MAX_ITERATIONS})...`);
      } else if (!bestFiles) {
        // No files extracted, no point iterating further
        break;
      } else {
        break; // Got good result, stop iterating
      }
    }

    emit("generating", "Code generation complete");

    // === PHASE 4: APPLY CHANGES (SANDBOX) ===
    emit("applying", "Applying changes in sandbox...");

    if (!bestFiles || bestFiles.length === 0) {
      emit("error", "No files generated");
      return { success: false, plan, files: existingFiles, diffs: [], diffSummaryText: "", error: "No files generated", phases };
    }

    const sandbox = createSandbox(existingFiles);
    const finalFiles = commitSandbox({ ...sandbox, working: bestFiles });

    emit("applying", "Changes applied", `${bestFiles.length} files`);

    // === PHASE 5: VERIFY (DIFF) ===
    emit("verifying", "Computing diff...");

    const diffs = diffFiles(
      existingFiles.map(f => ({ path: f.path, content: f.content })),
      finalFiles.map(f => ({ path: f.path, content: f.content }))
    );
    const summary = diffSummary(diffs);

    emit("verifying", "Verification complete", summary);
    emit("done", "Agent finished successfully");

    return {
      success: true,
      plan,
      files: finalFiles,
      diffs,
      diffSummaryText: summary,
      phases,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      emit("error", "Agent stopped by user");
      return { success: false, plan: null, files: existingFiles, diffs: [], diffSummaryText: "", error: "Aborted", phases };
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    emit("error", msg);
    return { success: false, plan: null, files: existingFiles, diffs: [], diffSummaryText: "", error: msg, phases };
  }
}
