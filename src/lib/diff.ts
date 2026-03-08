/**
 * Simple line-based diff utility.
 * Produces a list of changes between two strings.
 */

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  hunks: DiffLine[];
  additions: number;
  deletions: number;
}

/**
 * Compute a simple line diff between old and new content.
 * Uses LCS (Longest Common Subsequence) for accuracy.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;

  // For large files, use a simplified approach
  if (m * n > 500000) {
    return simpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m, j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "unchanged", content: oldLines[i - 1], oldLineNum: i, newLineNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", content: newLines[j - 1], newLineNum: j });
      j--;
    } else {
      stack.push({ type: "removed", content: oldLines[i - 1], oldLineNum: i });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

/** Simplified diff for large files — just mark changed regions */
function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      result.push({ type: "unchanged", content: oldLine!, oldLineNum: i + 1, newLineNum: i + 1 });
    } else {
      if (oldLine !== undefined) {
        result.push({ type: "removed", content: oldLine, oldLineNum: i + 1 });
      }
      if (newLine !== undefined) {
        result.push({ type: "added", content: newLine, newLineNum: i + 1 });
      }
    }
  }

  return result;
}

/**
 * Compute diff between old and new file sets.
 * Returns a list of file diffs.
 */
export function diffFiles(
  oldFiles: Array<{ path: string; content: string }>,
  newFiles: Array<{ path: string; content: string }>
): FileDiff[] {
  const diffs: FileDiff[] = [];
  const oldMap = new Map(oldFiles.map(f => [f.path, f.content]));
  const newMap = new Map(newFiles.map(f => [f.path, f.content]));

  // Modified or deleted files
  for (const [path, oldContent] of oldMap) {
    const newContent = newMap.get(path);
    if (newContent === undefined) {
      // Deleted
      const hunks = oldContent.split("\n").map((line, i): DiffLine => ({
        type: "removed", content: line, oldLineNum: i + 1,
      }));
      diffs.push({ path, status: "deleted", hunks, additions: 0, deletions: hunks.length });
    } else if (newContent !== oldContent) {
      // Modified
      const hunks = diffLines(oldContent, newContent);
      diffs.push({
        path,
        status: "modified",
        hunks,
        additions: hunks.filter(h => h.type === "added").length,
        deletions: hunks.filter(h => h.type === "removed").length,
      });
    }
  }

  // New files
  for (const [path, newContent] of newMap) {
    if (!oldMap.has(path)) {
      const hunks = newContent.split("\n").map((line, i): DiffLine => ({
        type: "added", content: line, newLineNum: i + 1,
      }));
      diffs.push({ path, status: "added", hunks, additions: hunks.length, deletions: 0 });
    }
  }

  return diffs;
}

/** Generate a compact summary string */
export function diffSummary(diffs: FileDiff[]): string {
  const added = diffs.filter(d => d.status === "added").length;
  const modified = diffs.filter(d => d.status === "modified").length;
  const deleted = diffs.filter(d => d.status === "deleted").length;
  const totalAdditions = diffs.reduce((s, d) => s + d.additions, 0);
  const totalDeletions = diffs.reduce((s, d) => s + d.deletions, 0);

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (modified > 0) parts.push(`${modified} modified`);
  if (deleted > 0) parts.push(`${deleted} deleted`);
  parts.push(`+${totalAdditions} -${totalDeletions}`);
  return parts.join(" · ");
}
