import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Globe,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Rocket,
  Github,
  Link2,
  Plus,
  Lock,
  AlertCircle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
}

type PublishStage = "idle" | "building" | "deploying" | "done" | "error";

interface RepoInfo {
  owner: string;
  repo: string;
}

async function callGitHub(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("github", {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || "GitHub API call failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export function PublishDialog({ open, onClose }: PublishDialogProps) {
  const { activeProject } = useApp();
  const [stage, setStage] = useState<PublishStage>("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");

  // Repo selection
  const [repos, setRepos] = useState<Array<{ full_name: string; private: boolean }>>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoInfo | null>(null);
  const [tab, setTab] = useState<"select" | "create">("select");
  const [newRepoName, setNewRepoName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage("idle");
    setError("");
    setPublishedUrl("");
    loadRepos();
  }, [open]);

  const loadRepos = async () => {
    setLoadingRepos(true);
    try {
      const data = await callGitHub("list_repos");
      setRepos(data.repos || []);
    } catch {
      // silent — user will see empty list
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleCreateRepo = async () => {
    const name = newRepoName.trim() || activeProject?.name?.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "my-site";
    setCreating(true);
    setError("");
    try {
      const data = await callGitHub("create_repo", { name, description: `Published from hikkocode`, isPrivate: false });
      const [owner, repo] = data.repo.full_name.split("/");
      setSelectedRepo({ owner, repo });
      setTab("select");
      await loadRepos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create repo");
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedRepo || !activeProject?.files.length) return;
    setError("");
    setStage("building");

    try {
      // Small delay for UX
      await new Promise((r) => setTimeout(r, 800));
      setStage("deploying");

      const data = await callGitHub("deploy_pages", {
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
        message: `Deploy v${activeProject.version} from hikkocode`,
        files: activeProject.files.map((f) => ({ path: f.path, content: f.content })),
      });

      setPublishedUrl(data.url);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      setStage("error");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(publishedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setStage("idle");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-card border border-border rounded-2xl shadow-lovable-lg w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-lovable flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Publish to GitHub Pages</h2>
              <p className="text-xs text-muted-foreground">Deploy your app to the web</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="px-5 pb-5">
          {stage === "idle" && (
            <div className="space-y-4">
              {/* Repo selector */}
              <div className="space-y-3">
                <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => setTab("select")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      tab === "select" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Select Repo
                  </button>
                  <button
                    onClick={() => setTab("create")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      tab === "create" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Repo
                  </button>
                </div>

                {tab === "select" ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
                    {loadingRepos ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : repos.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No repos found. Create one first.</p>
                    ) : (
                      repos.map((r) => {
                        const [owner, repo] = r.full_name.split("/");
                        const isSelected = selectedRepo?.owner === owner && selectedRepo?.repo === repo;
                        return (
                          <button
                            key={r.full_name}
                            onClick={() => setSelectedRepo({ owner, repo })}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                              isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary"
                            }`}
                          >
                            {r.private ? <Lock className="w-3.5 h-3.5 text-muted-foreground" /> : <Globe className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="text-xs font-medium text-foreground truncate">{r.full_name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      placeholder={activeProject?.name || "my-site"}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                      onKeyDown={(e) => e.key === "Enter" && handleCreateRepo()}
                    />
                    <button
                      onClick={handleCreateRepo}
                      disabled={creating}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-40"
                    >
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      {creating ? "Creating..." : "Create Public Repo"}
                    </button>
                  </div>
                )}
              </div>

              {/* Project info */}
              <div className="bg-secondary/50 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Project</span>
                  <span className="text-xs font-medium text-foreground">{activeProject?.name || "Untitled"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Files</span>
                  <span className="text-xs text-foreground">{activeProject?.files.length || 0} files, v{activeProject?.version || 0}</span>
                </div>
                {selectedRepo && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Deploy to</span>
                    <span className="text-xs font-mono text-foreground">{selectedRepo.owner}/{selectedRepo.repo}</span>
                  </div>
                )}
              </div>

              <button
                onClick={handlePublish}
                disabled={!selectedRepo || !activeProject?.files.length}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Github className="w-4 h-4" />
                Deploy to GitHub Pages
              </button>
            </div>
          )}

          {(stage === "building" || stage === "deploying") && (
            <div className="py-6 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
                <p className="text-sm font-medium text-foreground">
                  {stage === "building" ? "Preparing files..." : "Deploying to GitHub Pages..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stage === "building" ? "Bundling project files" : "Pushing to gh-pages branch"}
                </p>
              </div>
              <div className="space-y-2 px-2">
                {[
                  { label: "Prepare files", done: true },
                  { label: "Push to gh-pages", done: stage === "deploying", active: stage === "deploying" },
                  { label: "Enable GitHub Pages", done: false, active: false },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {step.done ? (
                      <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-background" />
                      </div>
                    ) : step.active ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                    )}
                    <span className={`text-xs ${step.done || step.active ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === "done" && (
            <div className="py-4 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm font-semibold text-foreground">Published successfully!</p>
                <p className="text-xs text-muted-foreground text-center">
                  Your site is live on GitHub Pages (may take 1-2 min to propagate)
                </p>
              </div>

              <div className="flex items-center gap-2 bg-secondary/50 rounded-lg border border-border px-3 py-2.5">
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-foreground font-mono truncate flex-1">{publishedUrl}</span>
                <button onClick={handleCopy} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={publishedUrl} target="_blank" rel="noreferrer" className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {stage === "error" && (
            <div className="py-4 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                </div>
                <p className="text-sm font-semibold text-foreground">Deploy failed</p>
                <p className="text-xs text-muted-foreground text-center">Check your GitHub token permissions and try again</p>
              </div>
              <button
                onClick={() => { setStage("idle"); setError(""); }}
                className="w-full py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
