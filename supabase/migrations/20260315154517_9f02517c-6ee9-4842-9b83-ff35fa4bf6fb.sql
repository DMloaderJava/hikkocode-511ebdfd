
-- Agent tasks table
CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  user_request text NOT NULL,
  repo text,
  branch text DEFAULT 'main',
  status text NOT NULL DEFAULT 'queued',
  plan jsonb DEFAULT '[]'::jsonb,
  patches jsonb DEFAULT '[]'::jsonb,
  build_log text,
  test_log text,
  error text,
  iterations integer DEFAULT 0,
  max_iterations integer DEFAULT 3,
  files_changed text[] DEFAULT '{}',
  pr_url text,
  pr_number integer,
  commit_sha text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tasks" ON public.agent_tasks FOR ALL TO authenticated USING (user_id = auth.uid());

-- File index for project understanding
CREATE TABLE public.file_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  language text NOT NULL DEFAULT 'text',
  size_bytes integer DEFAULT 0,
  hash text,
  summary text,
  symbols jsonb DEFAULT '[]'::jsonb,
  dependencies jsonb DEFAULT '[]'::jsonb,
  embedding jsonb, -- stored as JSON array of floats
  last_indexed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, file_path)
);

ALTER TABLE public.file_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own file index" ON public.file_index FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- Task execution logs
CREATE TABLE public.task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE CASCADE NOT NULL,
  level text NOT NULL DEFAULT 'info',
  phase text,
  message text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own task logs" ON public.task_logs FOR ALL TO authenticated
  USING (task_id IN (SELECT id FROM public.agent_tasks WHERE user_id = auth.uid()));

-- Applied patches history
CREATE TABLE public.applied_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  action text NOT NULL DEFAULT 'modify',
  patch_content text,
  full_content text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reverted boolean DEFAULT false,
  reverted_at timestamptz
);

ALTER TABLE public.applied_patches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own patches" ON public.applied_patches FOR ALL TO authenticated
  USING (task_id IN (SELECT id FROM public.agent_tasks WHERE user_id = auth.uid()));

-- Enable realtime for task updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_logs;
