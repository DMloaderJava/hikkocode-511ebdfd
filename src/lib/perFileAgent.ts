/**
 * Per-file agent: generates and applies files one by one.
 * Each file is generated individually via the chat API and applied immediately.
 */

import { GeneratedFile } from "@/context/AppContext";
import { buildSmartContext, buildFullContext } from "./fileTools";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

interface FileTask {
  path: string;
  action: "edit" | "create";
}

interface PerFileCallbacks {
  onFileStart: (path: string, action: "edit" | "create") => void;
  onFileStream: (path: string, partialContent: string) => void;
  onFileDone: (path: string, file: GeneratedFile) => void;
  onError: (path: string, error: string) => void;
  signal?: AbortSignal;
}

function buildSingleFilePrompt(
  userPrompt: string,
  filePath: string,
  action: "edit" | "create",
  planSteps: string[],
  currentFiles: GeneratedFile[],
  approach: string,
): string {
  const fileName = filePath.split("/").pop() || filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() || "text";
  const langMap: Record<string, string> = {
    html: "html", htm: "html", css: "css", js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
    yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", sh: "bash", svg: "xml",
  };
  const language = langMap[ext] || "text";

  const existingContent = currentFiles.find(f => f.path === filePath || f.path === `/${filePath}`)?.content;

  let prompt = `You are working on a specific file. Return ONLY the file content — no explanations, no markdown code fences, no JSON wrapper. Just the raw file content.

## Task
User request: ${userPrompt}

## Approach
${approach}

## Plan
${planSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Current file to ${action}: ${filePath} (${language})
`;

  if (action === "edit" && existingContent) {
    prompt += `\n### Current content of ${filePath}:\n\`\`\`${language}\n${existingContent}\n\`\`\`\n\nModify this file according to the plan. Return the COMPLETE updated file content.`;
  } else {
    prompt += `\nCreate this new file from scratch according to the plan. Return the COMPLETE file content.`;
  }

  // Add context of other project files (brief)
  const otherFiles = currentFiles.filter(f => f.path !== filePath && f.path !== `/${filePath}`);
  if (otherFiles.length > 0) {
    prompt += `\n\n## Other project files for reference:\n`;
    otherFiles.forEach(f => {
      if (f.content.length < 2000) {
        prompt += `\n--- ${f.path} ---\n${f.content}\n`;
      } else {
        prompt += `\n- ${f.path} (${f.language}, ${f.content.length} chars)\n`;
      }
    });
  }

  return prompt;
}

function extractRawContent(text: string): string {
  // If the response is wrapped in a code block, extract it
  const codeBlockMatch = text.match(/^```[\w]*\n([\s\S]*?)\n```$/);
  if (codeBlockMatch) return codeBlockMatch[1];

  // Remove leading/trailing code fences if partial
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline > -1) cleaned = cleaned.slice(firstNewline + 1);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trimEnd();
  }

  return cleaned;
}

function inferLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: "html", htm: "html", css: "css", js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
    yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", sh: "bash", svg: "xml",
  };
  return map[ext || ""] || "text";
}

/**
 * Generate a single file via streaming API call.
 */
async function generateSingleFile(
  userPrompt: string,
  filePath: string,
  action: "edit" | "create",
  planSteps: string[],
  approach: string,
  currentFiles: GeneratedFile[],
  callbacks: PerFileCallbacks,
  customApiKey?: string,
): Promise<GeneratedFile | null> {
  const prompt = buildSingleFilePrompt(userPrompt, filePath, action, planSteps, currentFiles, approach);

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      customApiKey,
      singleFileMode: true,
    }),
    signal: callbacks.signal,
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `API error ${resp.status}`);
  }

  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
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
          callbacks.onFileStream(filePath, fullText);
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

  if (!fullText.trim()) return null;

  const content = extractRawContent(fullText);
  const name = filePath.split("/").pop() || filePath;
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;

  return {
    name,
    path: normalizedPath,
    content,
    language: inferLanguage(name),
  };
}

export interface PerFilePlan {
  approach: string;
  planSteps: string[];
  fileTasks: FileTask[];
}

/**
 * Build file tasks from the agent plan.
 */
export function buildFileTasks(
  plan: { files_to_edit: string[]; new_files: string[]; approach: string; plan: string[] }
): PerFilePlan {
  const fileTasks: FileTask[] = [
    ...plan.files_to_edit.map(path => ({ path, action: "edit" as const })),
    ...plan.new_files.map(path => ({ path, action: "create" as const })),
  ];
  return {
    approach: plan.approach,
    planSteps: plan.plan,
    fileTasks,
  };
}

/**
 * Execute per-file generation: iterate through file tasks, generate each one, apply immediately.
 */
export async function executePerFile(
  userPrompt: string,
  perFilePlan: PerFilePlan,
  currentFiles: GeneratedFile[],
  callbacks: PerFileCallbacks,
  customApiKey?: string,
): Promise<GeneratedFile[]> {
  let workingFiles = [...currentFiles.map(f => ({ ...f }))];

  for (const task of perFilePlan.fileTasks) {
    callbacks.onFileStart(task.path, task.action);

    try {
      const generatedFile = await generateSingleFile(
        userPrompt,
        task.path,
        task.action,
        perFilePlan.planSteps,
        perFilePlan.approach,
        workingFiles,
        callbacks,
        customApiKey,
      );

      if (generatedFile) {
        // Apply to working files immediately
        const existingIdx = workingFiles.findIndex(
          f => f.path === generatedFile.path || f.path === task.path
        );
        if (existingIdx >= 0) {
          workingFiles[existingIdx] = generatedFile;
        } else {
          workingFiles.push(generatedFile);
        }
        callbacks.onFileDone(task.path, generatedFile);
      } else {
        callbacks.onError(task.path, "Empty response");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      callbacks.onError(task.path, e instanceof Error ? e.message : "Unknown error");
    }
  }

  return workingFiles;
}
