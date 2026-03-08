import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GITHUB_API = "https://api.github.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
  if (!GITHUB_PAT) {
    return new Response(JSON.stringify({ error: "GitHub token not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  try {
    const { action, ...params } = await req.json();

    switch (action) {
      // Get authenticated user info
      case "user": {
        const resp = await fetch(`${GITHUB_API}/user`, { headers: ghHeaders });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`GitHub API error [${resp.status}]: ${JSON.stringify(data)}`);
        return json({ user: { login: data.login, avatar_url: data.avatar_url, name: data.name } });
      }

      // List user repos
      case "list_repos": {
        const resp = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=30`, { headers: ghHeaders });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`GitHub API error [${resp.status}]: ${JSON.stringify(data)}`);
        return json({
          repos: data.map((r: any) => ({
            id: r.id,
            full_name: r.full_name,
            html_url: r.html_url,
            default_branch: r.default_branch,
            private: r.private,
            updated_at: r.updated_at,
          })),
        });
      }

      // Create a new repo
      case "create_repo": {
        const { name, description, isPrivate } = params;
        if (!name) throw new Error("Repository name is required");

        const resp = await fetch(`${GITHUB_API}/user/repos`, {
          method: "POST",
          headers: ghHeaders,
          body: JSON.stringify({
            name,
            description: description || "",
            private: isPrivate ?? true,
            auto_init: true,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`GitHub API error [${resp.status}]: ${JSON.stringify(data)}`);
        return json({
          repo: {
            full_name: data.full_name,
            html_url: data.html_url,
            default_branch: data.default_branch,
          },
        });
      }

      // Push files to a repo
      case "push_files": {
        const { owner, repo, files, message, branch } = params;
        if (!owner || !repo || !files?.length) throw new Error("owner, repo, and files are required");

        const targetBranch = branch || "main";

        // Get latest commit SHA
        const refResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`, { headers: ghHeaders });
        const refData = await refResp.json();
        if (!refResp.ok) throw new Error(`Failed to get ref [${refResp.status}]: ${JSON.stringify(refData)}`);
        const latestCommitSha = refData.object.sha;

        // Get the tree of the latest commit
        const commitResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { headers: ghHeaders });
        const commitData = await commitResp.json();
        if (!commitResp.ok) throw new Error(`Failed to get commit [${commitResp.status}]`);
        const baseTreeSha = commitData.tree.sha;

        // Create blobs for each file
        const treeItems = [];
        for (const file of files) {
          const blobResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
            method: "POST",
            headers: ghHeaders,
            body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          });
          const blobData = await blobResp.json();
          if (!blobResp.ok) throw new Error(`Failed to create blob [${blobResp.status}]`);

          treeItems.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blobData.sha,
          });
        }

        // Create tree
        const treeResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
          method: "POST",
          headers: ghHeaders,
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
        });
        const treeData = await treeResp.json();
        if (!treeResp.ok) throw new Error(`Failed to create tree [${treeResp.status}]`);

        // Create commit
        const newCommitResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
          method: "POST",
          headers: ghHeaders,
          body: JSON.stringify({
            message: message || "Update from Laughable",
            tree: treeData.sha,
            parents: [latestCommitSha],
          }),
        });
        const newCommitData = await newCommitResp.json();
        if (!newCommitResp.ok) throw new Error(`Failed to create commit [${newCommitResp.status}]`);

        // Update ref
        const updateRefResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${targetBranch}`, {
          method: "PATCH",
          headers: ghHeaders,
          body: JSON.stringify({ sha: newCommitData.sha }),
        });
        if (!updateRefResp.ok) {
          const errBody = await updateRefResp.json();
          throw new Error(`Failed to update ref [${updateRefResp.status}]: ${JSON.stringify(errBody)}`);
        }
        await updateRefResp.json();

        return json({ success: true, commit_sha: newCommitData.sha });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("GitHub function error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
