/**
 * Unified diff generator and applier.
 * Produces and applies unified diff patches (like git diff).
 */

export interface UnifiedPatch {
  filePath: string;
  hunks: PatchHunk[];
  rawPatch: string;
}

export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[]; // prefixed with +, -, or space
}

/**
 * Generate a unified diff between old and new content.
 */
export function generateUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Find common prefix and suffix
  let commonPrefix = 0;
  while (commonPrefix < oldLines.length && commonPrefix < newLines.length &&
    oldLines[commonPrefix] === newLines[commonPrefix]) {
    commonPrefix++;
  }

  let commonSuffix = 0;
  while (commonSuffix < oldLines.length - commonPrefix &&
    commonSuffix < newLines.length - commonPrefix &&
    oldLines[oldLines.length - 1 - commonSuffix] === newLines[newLines.length - 1 - commonSuffix]) {
    commonSuffix++;
  }

  const oldChanged = oldLines.slice(commonPrefix, oldLines.length - commonSuffix);
  const newChanged = newLines.slice(commonPrefix, newLines.length - commonSuffix);

  if (oldChanged.length === 0 && newChanged.length === 0) {
    return ""; // No changes
  }

  // Build hunks with context (3 lines)
  const contextLines = 3;
  const hunkStart = Math.max(0, commonPrefix - contextLines);
  const hunkEnd = Math.min(oldLines.length, oldLines.length - commonSuffix + contextLines);
  const newHunkEnd = Math.min(newLines.length, newLines.length - commonSuffix + contextLines);

  const lines: string[] = [];
  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);

  const oldHunkLines = hunkEnd - hunkStart;
  const newHunkLines = newHunkEnd - hunkStart;
  lines.push(`@@ -${hunkStart + 1},${oldHunkLines} +${hunkStart + 1},${newHunkLines} @@`);

  // Context before
  for (let i = hunkStart; i < commonPrefix; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  // Removed lines
  for (const line of oldChanged) {
    lines.push(`-${line}`);
  }

  // Added lines
  for (const line of newChanged) {
    lines.push(`+${line}`);
  }

  // Context after
  const afterStart = oldLines.length - commonSuffix;
  const afterEnd = Math.min(oldLines.length, afterStart + contextLines);
  for (let i = afterStart; i < afterEnd; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  return lines.join("\n");
}

/**
 * Parse a unified diff string into structured patches.
 */
export function parseUnifiedDiff(diffText: string): UnifiedPatch[] {
  const patches: UnifiedPatch[] = [];
  const lines = diffText.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Find --- line
    if (lines[i].startsWith("--- ")) {
      const oldFile = lines[i].replace(/^--- [ab]\//, "");
      i++;
      if (i >= lines.length || !lines[i].startsWith("+++ ")) { continue; }
      const newFile = lines[i].replace(/^\+\+\+ [ab]\//, "");
      i++;

      const hunks: PatchHunk[] = [];
      
      while (i < lines.length && lines[i].startsWith("@@")) {
        const hunkHeader = lines[i].match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (!hunkHeader) { i++; continue; }

        const hunk: PatchHunk = {
          oldStart: parseInt(hunkHeader[1]),
          oldLines: parseInt(hunkHeader[2] || "1"),
          newStart: parseInt(hunkHeader[3]),
          newLines: parseInt(hunkHeader[4] || "1"),
          lines: [],
        };
        i++;

        while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("--- ")) {
          if (lines[i].startsWith("+") || lines[i].startsWith("-") || lines[i].startsWith(" ")) {
            hunk.lines.push(lines[i]);
          } else if (lines[i] === "") {
            // Empty line in diff = unchanged empty line
            hunk.lines.push(" ");
          }
          i++;
        }

        hunks.push(hunk);
      }

      patches.push({ filePath: newFile || oldFile, hunks, rawPatch: "" });
    } else {
      i++;
    }
  }

  return patches;
}

/**
 * Apply a unified diff patch to file content.
 */
export function applyPatch(content: string, diffText: string): string {
  const patches = parseUnifiedDiff(diffText);
  if (patches.length === 0) return content;

  let lines = content.split("\n");

  for (const patch of patches) {
    for (const hunk of patch.hunks) {
      const newLines: string[] = [];
      let oldIdx = 0;

      // Copy lines before hunk
      const hunkStartIdx = hunk.oldStart - 1;
      while (oldIdx < hunkStartIdx && oldIdx < lines.length) {
        newLines.push(lines[oldIdx]);
        oldIdx++;
      }

      // Apply hunk
      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          newLines.push(line.slice(1));
        } else if (line.startsWith("-")) {
          oldIdx++; // Skip removed line
        } else if (line.startsWith(" ")) {
          newLines.push(line.slice(1));
          oldIdx++;
        }
      }

      // Copy remaining lines
      while (oldIdx < lines.length) {
        newLines.push(lines[oldIdx]);
        oldIdx++;
      }

      lines = newLines;
    }
  }

  return lines.join("\n");
}

/**
 * Generate a human-readable diff summary.
 */
export function diffSummaryText(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const added = newLines.length - oldLines.length;
  
  const diff = generateUnifiedDiff(filePath, oldContent, newContent);
  const addedCount = (diff.match(/^\+[^+]/gm) || []).length;
  const removedCount = (diff.match(/^-[^-]/gm) || []).length;

  return `${filePath}: +${addedCount} -${removedCount} (${added >= 0 ? "+" : ""}${added} lines net)`;
}
