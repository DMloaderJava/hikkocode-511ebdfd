import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Play, Loader2, CheckCircle2, XCircle, Clock, GitBranch,
  ExternalLink, FileText, RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, Search, Database,
} from "lucide-react";
import { createAgentTask, getAgentTask, subscribeToTaskLogs, subscribeToTask, indexProject } from "@/lib/agentApi";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

interface TaskLog {
  id: string;
  level: string;
  phase: string | null;
  message: string;
  detail: any;
  created_at: string;
}

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  planning: { icon: Search, color: "text-blue-400", label: "Planning" },
  executing: { icon: Loader2, color: "text-yellow-400", label: "Generating" },
  building: { icon: GitBranch, color: "text-purple-400", label: "Building" },
  testing: { icon: Play, color: "text-cyan-400", label: "Testing" },
  fixing: { icon: RefreshCw, color: "text-orange-400", label: "Fixing" },
  done: { icon: CheckCircle2, color: "text-green-400", label: "Done" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
};

const levelColors: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-yellow-400",
  error: "text-destructive",
};

export function AgentTasksPanel() {
  const { activeProject } = useApp();
  const [taskRequest, setTaskRequest] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [branchInput, setBranchInput] = useState("main");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskData, setTaskData] = useState<any>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to realtime logs
  useEffect(() => {
    if (!activeTaskId) return;

    const unsubLogs = subscribeToTaskLogs(activeTaskId, (log) => {
      setLogs(prev => [...prev, log]);
    });

    const unsubTask = subscribeToTask(activeTaskId, (update) => {
      setTaskData((prev: any) => prev ? { ...prev, task: { ...prev.task, ...update } } : prev);
    });

    return () => { unsubLogs(); unsubTask(); };
  }, [activeTaskId]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Poll task status
  useEffect(() => {
    if (!activeTaskId) return;
    const interval = setInterval(async () => {
      try {
        const data = await getAgentTask(activeTaskId);
        setTaskData(data);
        if (data.logs) setLogs(data.logs);
        if (["done", "failed"].includes(data.task.status)) {
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTaskId]);

  const handleSubmit = async () => {
    if (!taskRequest.trim() || !activeProject || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await createAgentTask({
        projectId: activeProject.id,
        userRequest: taskRequest.trim(),
        repo: repoInput.trim() || undefined,
        branch: branchInput.trim() || "main",
      });

      setActiveTaskId(result.task_id);
      setLogs([]);
      setTaskData(null);
      setTaskRequest("");
      toast.success(`Task created: ${result.task_id.slice(0, 8)}`);

      // Load initial data
      const data = await getAgentTask(result.task_id);
      setTaskData(data);
      if (data.logs) setLogs(data.logs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIndex = async () => {
    if (!activeProject || isIndexing) return;
    setIsIndexing(true);
    try {
      const result = await indexProject({
        projectId: activeProject.id,
        repo: repoInput.trim() || undefined,
        branch: branchInput.trim() || "main",
      });
      toast.success(`Indexed ${result.indexed} files`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setIsIndexing(false);
    }
  };

  const task = taskData?.task;
  const statusInfo = task ? statusConfig[task.status] || statusConfig.queued : null;
  const StatusIcon = statusInfo?.icon || Clock;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Bot className="w-4 h-4" />
          Agent Tasks
        </div>
      </div>

      {/* Task input */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex gap-2">
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            className="flex-1 px-2 py-1.5 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            placeholder="branch"
            className="w-20 px-2 py-1.5 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleIndex}
            disabled={isIndexing}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            title="Index repo"
          >
            {isIndexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
          </button>
        </div>

        <textarea
          value={taskRequest}
          onChange={(e) => setTaskRequest(e.target.value)}
          placeholder="Describe the task... e.g. 'Добавь страницу логина'"
          className="w-full px-2.5 py-2 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none min-h-[60px]"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!taskRequest.trim() || isSubmitting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating task...</>
          ) : (
            <><Play className="w-3.5 h-3.5" /> Run Agent Task</>
          )}
        </button>
      </div>

      {/* Active task status */}
      {task && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className={`w-4 h-4 ${statusInfo?.color} ${
              !["done", "failed"].includes(task.status) ? "animate-spin" : ""
            }`} />
            <span className="text-xs font-medium text-foreground">{statusInfo?.label}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{task.id.slice(0, 8)}</span>
          </div>

          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.user_request}</p>

          {task.pr_url && (
            <a
              href={task.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <GitBranch className="w-3 h-3" />
              PR #{task.pr_number}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {task.error && (
            <div className="flex items-start gap-1.5 mt-2 p-2 bg-destructive/10 rounded-md">
              <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
              <span className="text-xs text-destructive">{task.error}</span>
            </div>
          )}

          {task.files_changed?.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <div className="text-[10px] text-muted-foreground font-medium">Files changed:</div>
              {task.files_changed.map((f: string) => (
                <div key={f} className="flex items-center gap-1 text-xs text-foreground">
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate">{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logs */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="border-b border-border/50"
            >
              <button
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-secondary/50 transition-colors"
              >
                {log.detail ? (
                  expandedLog === log.id ?
                    <ChevronDown className="w-3 h-3 mt-0.5 text-muted-foreground flex-shrink-0" /> :
                    <ChevronRight className="w-3 h-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                ) : <div className="w-3" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {log.phase && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground">
                        {log.phase}
                      </span>
                    )}
                    <span className={`text-xs ${levelColors[log.level] || "text-foreground"}`}>
                      {log.message}
                    </span>
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </button>

              {expandedLog === log.id && log.detail && (
                <div className="px-3 pb-2 ml-5">
                  <pre className="text-[10px] text-muted-foreground bg-secondary rounded p-2 overflow-x-auto max-h-40">
                    {JSON.stringify(log.detail, null, 2)}
                  </pre>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
