/**
 * Expand/Collapse — сворачивание/разворачивание вывода tool-карточек
 *
 * Ctrl+O переключает режим. Свёрнуто: 3 строки, 8 ханков диффа, hint.
 * Развёрнуто: полный вывод без hint.
 *
 * Invariants: INV-5 (read-only TUI)
 */

export interface CollapseLimits {
  maxLines: number;
  maxDiffHunks: number;
}

export const DEFAULT_LIMITS: CollapseLimits = {
  maxLines: 3,
  maxDiffHunks: 8,
};

/**
 * Свернуть текстовый вывод до limits.maxLines строк.
 * Возвращает { text, truncated }.
 */
export function collapseOutput(
  content: string,
  limits: CollapseLimits = DEFAULT_LIMITS,
): { text: string; truncated: boolean } {
  const lines = content.split("\n");

  // Try to collapse diff hunks
  if (content.includes("@@") && limits.maxDiffHunks > 0) {
    return collapseDiff(content, limits);
  }

  if (lines.length <= limits.maxLines) {
    return { text: content, truncated: false };
  }

  const collapsed = lines.slice(0, limits.maxLines).join("\n");
  return { text: collapsed, truncated: true };
}

/**
 * Свернуть diff-вывод: оставить первые maxDiffHunks ханков.
 */
function collapseDiff(
  content: string,
  limits: CollapseLimits,
): { text: string; truncated: boolean } {
  const lines = content.split("\n");
  const hunks: string[][] = [];
  let currentHunk: string[] = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (currentHunk.length > 0) {
        hunks.push(currentHunk);
      }
      currentHunk = [line];
    } else {
      currentHunk.push(line);
    }
  }
  if (currentHunk.length > 0) {
    hunks.push(currentHunk);
  }

  if (hunks.length <= limits.maxDiffHunks) {
    return { text: content, truncated: false };
  }

  const collapsedHunks = hunks.slice(0, limits.maxDiffHunks);
  const result = collapsedHunks.flat().join("\n");
  return { text: result, truncated: hunks.length > limits.maxDiffHunks };
}

/**
 * Добавить hint «(Ctrl+O для подробностей)» если контент truncated.
 */
export function collapseHint(truncated: boolean): string {
  return truncated ? "(Ctrl+O для подробностей)" : "";
}
