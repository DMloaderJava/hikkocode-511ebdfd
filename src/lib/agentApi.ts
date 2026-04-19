/**
 * Agent API client — local mock interface.
 */

import { supabase } from "@/integrations/supabase/client";

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

/**
 * Create a new agent task (Local Mock).
 */
export async function createAgentTask(params: CreateTaskParams): Promise<{ task_id: string; status: string }> {
  console.log("Mock: Creating agent task", params);
  return { task_id: crypto.randomUUID(), status: "pending" };
}

/**
 * Get task details (Local Mock).
 */
export async function getAgentTask(taskId: string): Promise<{
  task: AgentTask;
  logs: TaskLog[];
  patches: AppliedPatch[];
}> {
  console.log("Mock: Getting agent task", taskId);
  return {
    task: {
      id: taskId,
      project_id: "mock",
      user_request: "Mock request",
      repo: null,
      branch: "main",
      status: "completed",
      plan: {},
      patches: [],
      build_log: null,
      test_log: null,
      error: null,
      iterations: 0,
      files_changed: [],
      pr_url: null,
      pr_number: null,
      commit_sha: null,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    },
    logs: [],
    patches: [],
  };
}

/**
 * List recent tasks (Local Mock).
 */
export async function listAgentTasks(): Promise<{ tasks: AgentTask[] }> {
  return { tasks: [] };
}

/**
 * Subscribe to task logs (Local Mock).
 */
export function subscribeToTaskLogs(
  taskId: string,
  onLog: (log: TaskLog) => void
): () => void {
  console.log("Mock: Subscribing to logs", taskId);
  return () => {};
}

/**
 * Subscribe to task status changes (Local Mock).
 */
export function subscribeToTask(
  taskId: string,
  onUpdate: (task: Partial<AgentTask>) => void
): () => void {
  console.log("Mock: Subscribing to task", taskId);
  return () => {};
}

/**
 * Index a project's files (Local Mock).
 */
export async function indexProject(params: {
  projectId: string;
  repo?: string;
  branch?: string;
}): Promise<{ success: boolean; indexed: number; files: any[] }> {
  console.log("Mock: Indexing project", params);
  return { success: true, indexed: 0, files: [] };
}

/**
 * Search file index for relevant files (Local Mock).
 */
export async function searchFileIndex(projectId: string, query: string): Promise<any[]> {
  const { data } = await supabase
    .from("file_index")
    .select("*")
    .eq("project_id", projectId)
    .limit(20);

  return data || [];
}
