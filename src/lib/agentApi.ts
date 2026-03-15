/**
 * Agent API client — frontend interface to the orchestrator and indexer edge functions.
 */

import { supabase } from "@/integrations/supabase/client";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface CreateTaskParams {
  projectId: string;
  userRequest: string;
  repo?: string;
  branch?: string;
}

interface AgentTask {
  id: string;
  project_id: string;
  user_request: string;
  repo: string | null;
  branch: string;
  status: string;
  plan: any;
  patches: any;
  build_log: string | null;
  test_log: string | null;
  error: string | null;
  iterations: number;
  files_changed: string[];
  pr_url: string | null;
  pr_number: number | null;
  commit_sha: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TaskLog {
  id: string;
  task_id: string;
  level: string;
  phase: string | null;
  message: string;
  detail: any;
  created_at: string;
}

interface AppliedPatch {
  id: string;
  task_id: string;
  file_path: string;
  action: string;
  patch_content: string | null;
  full_content: string | null;
  applied_at: string;
  reverted: boolean;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
}

/**
 * Create a new agent task.
 */
export async function createAgentTask(params: CreateTaskParams): Promise<{ task_id: string; status: string }> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${BASE_URL}/functions/v1/agent`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: params.projectId,
      user_request: params.userRequest,
      repo: params.repo,
      branch: params.branch,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Agent API error ${resp.status}`);
  }

  return resp.json();
}

/**
 * Get task details with logs and patches.
 */
export async function getAgentTask(taskId: string): Promise<{
  task: AgentTask;
  logs: TaskLog[];
  patches: AppliedPatch[];
}> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${BASE_URL}/functions/v1/agent/${taskId}`, {
    method: "GET",
    headers,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Agent API error ${resp.status}`);
  }

  return resp.json();
}

/**
 * List recent tasks.
 */
export async function listAgentTasks(): Promise<{ tasks: AgentTask[] }> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${BASE_URL}/functions/v1/agent`, {
    method: "GET",
    headers,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Agent API error ${resp.status}`);
  }

  return resp.json();
}

/**
 * Get task logs (streaming via realtime).
 */
export function subscribeToTaskLogs(
  taskId: string,
  onLog: (log: TaskLog) => void
): () => void {
  const channel = supabase
    .channel(`task-logs-${taskId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "task_logs",
        filter: `task_id=eq.${taskId}`,
      },
      (payload) => onLog(payload.new as TaskLog)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to task status changes.
 */
export function subscribeToTask(
  taskId: string,
  onUpdate: (task: Partial<AgentTask>) => void
): () => void {
  const channel = supabase
    .channel(`task-${taskId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "agent_tasks",
        filter: `id=eq.${taskId}`,
      },
      (payload) => onUpdate(payload.new as Partial<AgentTask>)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Index a project's files.
 */
export async function indexProject(params: {
  projectId: string;
  repo?: string;
  branch?: string;
}): Promise<{ success: boolean; indexed: number; files: any[] }> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${BASE_URL}/functions/v1/indexer`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: params.projectId,
      repo: params.repo,
      branch: params.branch,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Indexer error ${resp.status}`);
  }

  return resp.json();
}

/**
 * Search file index for relevant files.
 */
export async function searchFileIndex(projectId: string, query: string): Promise<any[]> {
  const { data } = await supabase
    .from("file_index")
    .select("*")
    .eq("project_id", projectId)
    .or(`summary.ilike.%${query}%,file_path.ilike.%${query}%`)
    .limit(20);

  return data || [];
}
