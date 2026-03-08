import { useState, useEffect } from "react";
import {
  Github,
  Link2,
  Unlink,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Check,
  Copy,
  Plus,
  Lock,
  Globe,
  Upload,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

interface GitHubDialogProps {
  open: boolean;
  onClose: () => void;
}

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  updated_at: string;
}

interface RepoConnection {
  owner: string;
  repo: string;
  branch: string;
  html_url: string;
  connectedAt: Date;
}

type Tab = "connect" | "create";

async function callGitHub(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("github", {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || "GitHub API call failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export function GitHubDialog({ open, onClose }: GitHubDialogProps) {
  const { activeProject } = useApp();
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<RepoConnection | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("connect");
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  // Create repo form
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [creating, setCreating] = useState(false);

  // Load GitHub user + repos on open
  useEffect(() => {
    if (!open) return;
    setError("");
    loadGitHubData();
  }, [open]);

  const loadGitHubData = async () => {
    setLoading(true);
    setError("");
    try {
      const [userData, repoData] = await Promise.all([
        callGitHub("user"),
        callGitHub("list_repos"),
      ]);
      setGhUser(userData.user);
      setRepos(repoData.repos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to GitHub");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectRepo = (repo: GitHubRepo) => {
    const [owner, name] = repo.full_name.split("/");
    setConnection({
      owner,
      repo: name,
      branch: repo.default_branch,
      html_url: repo.html_url,
      connectedAt: new Date(),
    });
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const data = await callGitHub("create_repo", {
        name: newRepoName.trim(),
        description: newRepoDesc.trim(),
        isPrivate: newRepoPrivate,
      });
      const [owner, name] = data.repo.full_name.split("/");
      setConnection({
        owner,
        repo: name,
        branch: data.repo.default_branch,
        html_url: data.repo.html_url,
        connectedAt: new Date(),
      });
      setNewRepoName("");
      setNewRepoDesc("");
      // Refresh repo list
      const repoData = await callGitHub("list_repos");
      setRepos(repoData.repos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create repository");
    } finally {
      setCreating(false);
    }
  };

  const handlePushFiles = async () => {
    if (!connection || !activeProject?.files.length) return;
    setPushing(true);
    setPushSuccess(false);
    setError("");
    try {
      await callGitHub("push_files", {
        owner: connection.owner,
        repo: connection.repo,
        branch: connection.branch,
        message: `Update from Laughable – v${activeProject.version}`,
        files: activeProject.files.map((f) => ({ path: f.path, content: f.content })),
      });
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to push files");
    } finally {
      setPushing(false);
    }
  };

  const handleDisconnect = () => {
    setConnection(null);
    setPushSuccess(false);
  };

  const handleCopyClone = () => {
    if (!connection) return;
    navigator.clipboard.writeText(
      `git clone https://github.com/${connection.owner}/${connection.repo}.git`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            GitHub
          </DialogTitle>
          <DialogDescription>
            {connection
              ? "Repository connected. Push your project files to GitHub."
              : "Connect or create a GitHub repository."}
          </DialogDescription>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connecting to GitHub...</p>
          </div>
        ) : connection ? (
          /* === CONNECTED STATE === */
          <div className="space-y-4 overflow-y-auto">
            {/* Repo info */}
            <div className="bg-secondary/50 border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-sm font-medium text-foreground">Connected</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Repository</span>
                  <a
                    href={connection.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {connection.owner}/{connection.repo}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Branch</span>
                  <span className="flex items-center gap-1 text-xs text-foreground">
                    <GitBranch className="w-3 h-3" />
                    {connection.branch}
                  </span>
                </div>
              </div>
            </div>

            {/* Clone command */}
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-2">Clone command</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-secondary rounded px-2 py-1.5 text-foreground font-mono truncate">
                  git clone https://github.com/{connection.owner}/{connection.repo}.git
                </code>
                <button
                  onClick={handleCopyClone}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-accent" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Push + Disconnect */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePushFiles}
                disabled={pushing || !activeProject?.files.length}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {pushing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Pushing...
                  </>
                ) : pushSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Pushed!
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Push Files ({activeProject?.files.length || 0})
                  </>
                )}
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
              >
                <Unlink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* === NOT CONNECTED STATE === */
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* GitHub user badge */}
            {ghUser && (
              <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2">
                <img
                  src={ghUser.avatar_url}
                  alt={ghUser.login}
                  className="w-6 h-6 rounded-full"
                />
                <span className="text-xs font-medium text-foreground">{ghUser.login}</span>
                {ghUser.name && (
                  <span className="text-xs text-muted-foreground">({ghUser.name})</span>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setTab("connect")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  tab === "connect"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Connect Existing
              </button>
              <button
                onClick={() => setTab("create")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  tab === "create"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
            </div>

            {tab === "connect" ? (
              /* Repo list */
              <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin">
                {repos.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No repositories found</p>
                ) : (
                  repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => handleConnectRepo(repo)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-left group"
                    >
                      {repo.private ? (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {repo.full_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {repo.default_branch} · updated{" "}
                          {new Date(repo.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Create repo form */
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Repository name
                  </label>
                  <input
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder={activeProject?.name || "my-project"}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRepo()}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Description (optional)
                  </label>
                  <input
                    value={newRepoDesc}
                    onChange={(e) => setNewRepoDesc(e.target.value)}
                    placeholder="Built with Laughable"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setNewRepoPrivate(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      newRepoPrivate
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    Private
                  </button>
                  <button
                    onClick={() => setNewRepoPrivate(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      !newRepoPrivate
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Globe className="w-3 h-3" />
                    Public
                  </button>
                </div>
                <button
                  onClick={handleCreateRepo}
                  disabled={!newRepoName.trim() || creating}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Repository
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
