import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GITHUB_API = "https://api.github.com";

// =================== HELPERS ===================

function getSupabase(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

async function log(supabase: any, taskId: string, level: string, phase: string, message: string, detail?: any) {
  await supabase.from("task_logs").insert({ task_id: taskId, level, phase, message, detail });
}

async function updateTask(supabase: any, taskId: string, updates: Record<string, any>) {
  await supabase.from("agent_tasks").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", taskId);
}

function getGhHeaders(): Record<string, string> {
  const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not configured");
  return {
    Authorization: `Bearer ${GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// =================== PLANNING ===================

async function planTask(userRequest: string, fileIndex: any[]): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const keys = (Deno.env.get("GEMINI_API_KEYS") || "").split(",").filter(Boolean);

  const fileContext = fileIndex.map((f: any) =>
    `- ${f.file_path} (${f.language}, ${f.size_bytes}b)${f.summary ? `: ${f.summary}` : ""}`
  ).join("\n");

  const planPrompt = `You are a code planning agent. Given a user request and a project structure, create a precise execution plan.

## Project files:
${fileContext || "Empty project"}

## User request:
${userRequest}

Respond with ONLY valid JSON:
{
  "analysis": "Brief analysis of what needs to be done",
  "approach": "High-level approach",
  "plan": [
    {"action": "create_file", "path": "src/LoginPage.tsx", "reason": "New login page component"},
    {"action": "modify_file", "path": "src/App.tsx", "reason": "Add route for login page"}
  ],
  "tests_to_run": ["npm test"],
  "commit_message": "feat: add login page"
}

Actions: create_file, modify_file, delete_file. Be precise about paths.`;

  let result: string | null = null;

  // Try Lovable AI first
  if (LOVABLE_API_KEY) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: planPrompt }],
          temperature: 0.9,
          max_tokens: 4096,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        result = data.choices?.[0]?.message?.content;
      }
    } catch (e) {
      console.error("Lovable AI plan failed:", e);
    }
  }

  // Fallback to Gemini
  if (!result && keys.length > 0) {
    for (const key of keys) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: planPrompt }] }],
              generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
            }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          result = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (result) break;
        }
      } catch { /* next key */ }
    }
  }

  if (!result) throw new Error("Failed to generate plan from any AI provider");

  // Parse JSON from response
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in plan response");
  return JSON.parse(jsonMatch[0]);
}

// =================== FILE GENERATION ===================

async function generateFileContent(
  action: string,
  filePath: string,
  reason: string,
  existingContent: string | null,
  projectContext: string,
  userRequest: string
): Promise<{ content: string; patch?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const keys = (Deno.env.get("GEMINI_API_KEYS") || "").split(",").filter(Boolean);

  let prompt: string;
  if (action === "modify_file" && existingContent) {
    prompt = `Modify the file "${filePath}" according to the task. Return ONLY a JSON object with "content" (full new file content) and "patch" (unified diff).

## Current file content:
\`\`\`
${existingContent}
\`\`\`

## Reason for change: ${reason}
## Overall task: ${userRequest}
## Project context:
${projectContext}

Return ONLY: {"content": "...", "patch": "@@ -1,3 +1,5 @@ ..."}`;
  } else {
    prompt = `Create the file "${filePath}" from scratch. Return ONLY a JSON object with "content" (full file content).

## Purpose: ${reason}
## Overall task: ${userRequest}
## Project context:
${projectContext}

Return ONLY: {"content": "..."}`;
  }

  let result: string | null = null;

  if (LOVABLE_API_KEY) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 32768,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        result = data.choices?.[0]?.message?.content;
      }
    } catch (e) {
      console.error("Lovable AI generate failed:", e);
    }
  }

  if (!result && keys.length > 0) {
    for (const key of keys) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 32768 },
            }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          result = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (result) break;
        }
      } catch { /* next key */ }
    }
  }

  if (!result) throw new Error(`Failed to generate content for ${filePath}`);

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* fallback */ }
  }

  // If JSON parse fails, treat the whole response as content
  return { content: result };
}

// =================== GITHUB OPS ===================

async function readRepoFile(ghHeaders: Record<string, string>, owner: string, repo: string, path: string, branch: string): Promise<string | null> {
  try {
    const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: ghHeaders });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.encoding === "base64") {
      return atob(data.content.replace(/\n/g, ""));
    }
    return data.content;
  } catch { return null; }
}

async function pushFilesToBranch(
  ghHeaders: Record<string, string>,
  owner: string, repo: string, branch: string,
  files: Array<{ path: string; content: string }>,
  message: string
): Promise<string> {
  const refResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers: ghHeaders });
  const refData = await refResp.json();
  if (!refResp.ok) throw new Error(`Failed to get ref: ${JSON.stringify(refData)}`);
  const latestSha = refData.object.sha;

  const commitResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${latestSha}`, { headers: ghHeaders });
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;

  const treeItems = [];
  for (const file of files) {
    const blobResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
      method: "POST", headers: ghHeaders,
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    const blobData = await blobResp.json();
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blobData.sha });
  }

  const treeResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: "POST", headers: ghHeaders,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  const treeData = await treeResp.json();

  const newCommitResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: "POST", headers: ghHeaders,
    body: JSON.stringify({ message, tree: treeData.sha, parents: [latestSha] }),
  });
  const newCommitData = await newCommitResp.json();

  await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH", headers: ghHeaders,
    body: JSON.stringify({ sha: newCommitData.sha }),
  });

  return newCommitData.sha;
}

async function createBranch(ghHeaders: Record<string, string>, owner: string, repo: string, branch: string, baseBranch: string): Promise<string> {
  const refResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, { headers: ghHeaders });
  const refData = await refResp.json();
  if (!refResp.ok) throw new Error(`Base branch not found: ${baseBranch}`);
  const sha = refData.object.sha;

  const createResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    method: "POST", headers: ghHeaders,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!createResp.ok) {
    const err = await createResp.json();
    throw new Error(`Branch creation failed: ${JSON.stringify(err)}`);
  }
  return sha;
}

async function createPR(
  ghHeaders: Record<string, string>,
  owner: string, repo: string,
  head: string, base: string,
  title: string, body: string
): Promise<{ number: number; html_url: string }> {
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: "POST", headers: ghHeaders,
    body: JSON.stringify({ title, body, head, base }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`PR creation failed: ${JSON.stringify(data)}`);
  return { number: data.number, html_url: data.html_url };
}

// =================== MAIN ORCHESTRATOR ===================

async function executeTask(supabase: any, taskId: string, task: any) {
  const ghHeaders = getGhHeaders();
  const [owner, repo] = (task.repo || "").split("/");
  if (!owner || !repo) throw new Error("Invalid repo format. Use 'owner/repo'");

  const baseBranch = task.branch || "main";

  // Step 1: Index project
  await updateTask(supabase, taskId, { status: "planning", started_at: new Date().toISOString() });
  await log(supabase, taskId, "info", "planning", "Reading repository structure...");

  // Read repo tree
  const treeResp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${baseBranch}?recursive=1`,
    { headers: ghHeaders }
  );
  const treeData = await treeResp.json();
  if (!treeResp.ok) throw new Error(`Failed to read repo tree: ${JSON.stringify(treeData)}`);

  const repoFiles = (treeData.tree || [])
    .filter((f: any) => f.type === "blob" && f.size < 100000) // Skip large files
    .map((f: any) => ({ path: f.path, size: f.size }));

  await log(supabase, taskId, "info", "planning", `Found ${repoFiles.length} files in repo`);

  // Index files
  const fileIndex = repoFiles.map((f: any) => ({
    file_path: f.path,
    language: inferLanguage(f.path),
    size_bytes: f.size,
  }));

  // Upsert file index
  for (const fi of fileIndex) {
    await supabase.from("file_index").upsert({
      project_id: task.project_id,
      file_path: fi.file_path,
      language: fi.language,
      size_bytes: fi.size_bytes,
      last_indexed_at: new Date().toISOString(),
    }, { onConflict: "project_id,file_path" });
  }

  // Step 2: Plan
  await log(supabase, taskId, "info", "planning", "Generating execution plan...");
  const plan = await planTask(task.user_request, fileIndex);
  await updateTask(supabase, taskId, { plan, status: "executing" });
  await log(supabase, taskId, "info", "planning", `Plan created: ${plan.plan?.length || 0} steps`, plan);

  // Step 3: Execute plan — generate files
  const generatedFiles: Array<{ path: string; content: string }> = [];
  const patches: any[] = [];
  const filesChanged: string[] = [];

  // Build project context from key files
  const keyFiles = (plan.plan || []).slice(0, 10);
  let projectContext = "";
  for (const step of keyFiles) {
    if (step.action === "modify_file") {
      const content = await readRepoFile(ghHeaders, owner, repo, step.path, baseBranch);
      if (content) {
        projectContext += `\n--- ${step.path} ---\n${content.slice(0, 3000)}\n`;
      }
    }
  }

  for (const step of plan.plan || []) {
    await log(supabase, taskId, "info", "generating", `${step.action}: ${step.path}`, { reason: step.reason });

    try {
      let existingContent: string | null = null;
      if (step.action === "modify_file") {
        existingContent = await readRepoFile(ghHeaders, owner, repo, step.path, baseBranch);
      }

      const result = await generateFileContent(
        step.action, step.path, step.reason,
        existingContent, projectContext, task.user_request
      );

      generatedFiles.push({ path: step.path, content: result.content });
      filesChanged.push(step.path);

      patches.push({
        file_path: step.path,
        action: step.action === "create_file" ? "create" : "modify",
        patch_content: result.patch || null,
        full_content: result.content,
      });

      await supabase.from("applied_patches").insert({
        task_id: taskId,
        file_path: step.path,
        action: step.action === "create_file" ? "create" : "modify",
        patch_content: result.patch || null,
        full_content: result.content,
      });

      await log(supabase, taskId, "info", "generating", `✅ ${step.path} generated (${result.content.length} chars)`);
    } catch (e) {
      await log(supabase, taskId, "error", "generating", `❌ Failed: ${step.path}: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }

  if (generatedFiles.length === 0) {
    throw new Error("No files were generated");
  }

  await updateTask(supabase, taskId, { patches, files_changed: filesChanged });

  // Step 4: Create branch, push, create PR
  await updateTask(supabase, taskId, { status: "building" });
  const featureBranch = `auto/${taskId.slice(0, 8)}`;
  await log(supabase, taskId, "info", "building", `Creating branch: ${featureBranch}`);

  await createBranch(ghHeaders, owner, repo, featureBranch, baseBranch);
  const commitMessage = plan.commit_message || `feat(agent): ${task.user_request.slice(0, 50)}`;
  const commitSha = await pushFilesToBranch(ghHeaders, owner, repo, featureBranch, generatedFiles, commitMessage);

  await log(supabase, taskId, "info", "building", `Pushed ${generatedFiles.length} files, commit: ${commitSha.slice(0, 7)}`);

  // Create PR with template
  const prBody = `## 🤖 Auto-generated by hikkocode agent

### What changed
${filesChanged.map(f => `- \`${f}\``).join("\n")}

### Why
${task.user_request}

### Plan
${(plan.plan || []).map((s: any, i: number) => `${i + 1}. **${s.action}** \`${s.path}\` — ${s.reason}`).join("\n")}

### How to test
${(plan.tests_to_run || ["npm test"]).map((t: string) => `\`\`\`bash\n${t}\n\`\`\``).join("\n")}

---
Task ID: \`${taskId}\`
Commit: \`${commitSha}\`
`;

  const pr = await createPR(ghHeaders, owner, repo, featureBranch, baseBranch,
    `🤖 ${commitMessage}`, prBody);

  await updateTask(supabase, taskId, {
    status: "done",
    pr_url: pr.html_url,
    pr_number: pr.number,
    commit_sha: commitSha,
    completed_at: new Date().toISOString(),
  });

  await log(supabase, taskId, "info", "done", `PR created: ${pr.html_url}`, { pr_number: pr.number });

  return { pr_url: pr.html_url, pr_number: pr.number, files_changed: filesChanged, commit_sha: commitSha };
}

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    html: "html", css: "css", json: "json", md: "markdown",
    yaml: "yaml", yml: "yaml", toml: "toml", py: "python",
    rs: "rust", go: "go", java: "java", rb: "ruby",
    sh: "bash", sql: "sql", xml: "xml", svg: "xml",
  };
  return map[ext] || "text";
}

// =================== HTTP HANDLER ===================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabase(authHeader);
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Routes: POST /agent (create task), GET /agent/:id (get task), GET /agent/:id/logs
  const lastPart = pathParts[pathParts.length - 1];
  const secondLast = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : null;

  try {
    if (req.method === "POST") {
      const body = await req.json();
      const { user_request, repo, branch, project_id } = body;

      if (!user_request || !project_id) {
        return json({ error: "user_request and project_id are required" }, 400);
      }

      // Get user
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return json({ error: "Unauthorized" }, 401);
      }

      // Create task
      const { data: task, error: insertError } = await supabase
        .from("agent_tasks")
        .insert({
          project_id,
          user_id: user.id,
          user_request,
          repo: repo || null,
          branch: branch || "main",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Execute asynchronously (non-blocking)
      // In production this would be a queue; for now we run inline
      if (repo) {
        // Don't await — run in background
        executeTask(supabase, task.id, task).catch(async (e) => {
          const errMsg = e instanceof Error ? e.message : "Unknown error";
          await updateTask(supabase, task.id, { status: "failed", error: errMsg });
          await log(supabase, task.id, "error", "orchestrator", errMsg);
        });
      }

      return json({ task_id: task.id, status: "queued" });
    }

    if (req.method === "GET") {
      // GET /agent/:id/logs
      if (lastPart === "logs" && secondLast) {
        const { data: logs } = await supabase
          .from("task_logs")
          .select("*")
          .eq("task_id", secondLast)
          .order("created_at", { ascending: true });

        return json({ logs: logs || [] });
      }

      // GET /agent/:id
      if (lastPart && lastPart !== "agent") {
        const { data: task } = await supabase
          .from("agent_tasks")
          .select("*")
          .eq("id", lastPart)
          .single();

        if (!task) return json({ error: "Task not found" }, 404);

        const { data: logs } = await supabase
          .from("task_logs")
          .select("*")
          .eq("task_id", lastPart)
          .order("created_at", { ascending: true })
          .limit(50);

        const { data: patchesData } = await supabase
          .from("applied_patches")
          .select("*")
          .eq("task_id", lastPart)
          .order("applied_at", { ascending: true });

        return json({ task, logs: logs || [], patches: patchesData || [] });
      }

      // GET /agent — list tasks
      const { data: tasks } = await supabase
        .from("agent_tasks")
        .select("id, status, user_request, repo, pr_url, files_changed, created_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(20);

      return json({ tasks: tasks || [] });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("Agent error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
