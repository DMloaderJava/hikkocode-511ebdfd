import { useState } from "react";
import { Github, Link2, Unlink, ExternalLink, GitBranch, RefreshCw, Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApp } from "@/context/AppContext";

interface GitHubDialogProps {
  open: boolean;
  onClose: () => void;
}

interface RepoConnection {
  owner: string;
  repo: string;
  branch: string;
  connectedAt: Date;
}

export function GitHubDialog({ open, onClose }: GitHubDialogProps) {
  const { activeProject } = useApp();
  const [repoUrl, setRepoUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<RepoConnection | null>(null);
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    if (!repoUrl.trim()) return;

    // Parse GitHub URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s.]+)/);
    if (!match) return;

    setConnecting(true);

    // Simulate connection delay
    await new Promise(r => setTimeout(r, 1500));

    setConnection({
      owner: match[1],
      repo: match[2].replace(".git", ""),
      branch: "main",
      connectedAt: new Date(),
    });
    setConnecting(false);
    setRepoUrl("");
  };

  const handleDisconnect = () => {
    setConnection(null);
  };

  const handleCopyClone = () => {
    if (!connection) return;
    navigator.clipboard.writeText(`git clone https://github.com/${connection.owner}/${connection.repo}.git`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            GitHub Integration
          </DialogTitle>
          <DialogDescription>
            Connect your project to a GitHub repository for version control and collaboration.
          </DialogDescription>
        </DialogHeader>

        {connection ? (
          <div className="space-y-4">
            {/* Connected state */}
            <div className="bg-secondary/50 border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-sm font-medium text-foreground">Connected</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Repository</span>
                  <a
                    href={`https://github.com/${connection.owner}/${connection.repo}`}
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
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Connected</span>
                  <span className="text-xs text-foreground">
                    {connection.connectedAt.toLocaleDateString()}
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
                  {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
                Sync Now
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
              >
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connect form */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                Repository URL
              </label>
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/repository"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={!repoUrl.trim() || connecting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {connecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Connect Repository
                </>
              )}
            </button>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3">Or create a new repository</p>
              <button
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                <Github className="w-4 h-4" />
                Create New Repository
              </button>
            </div>

            {/* Info */}
            <div className="bg-secondary/30 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-medium text-foreground">How it works</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  Changes sync automatically between Laughable and GitHub
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  Push from your local IDE to see changes in Laughable
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  Use branches for features and merge via pull requests
                </li>
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
