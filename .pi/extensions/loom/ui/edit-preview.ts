/**
 * Streaming diff preview для edit/write инструментов
 *
 * Показывает дифф в реальном времени пока модель стримит аргументы.
 * Стабилизирует превью (без «сначала удаления, потом догоняют»).
 *
 * Invariants: INV-5 (read-only TUI), INV-12 (UI — русский)
 *
 * NOTE: Требует tool_call hook из pi runtime API.
 * Базовая инфраструктура готова, активация — после подтверждения API.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export interface DiffPreviewState {
  path: string;
  oldContent: string;
  newContent: string;
  isStreaming: boolean;
}

/**
 * Compute simple diff preview from partial content.
 * Strips trailing lines that are only in newContent (streaming artifact).
 */
export function computeDiffPreview(
  oldContent: string,
  newContent: string,
): { added: number; removed: number; preview: string } {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Strip trailing from newLines that don't match old (streaming artifact)
  let cleanNew = [...newLines];
  while (cleanNew.length > oldLines.length) {
    cleanNew.pop();
  }

  let added = 0;
  let removed = 0;
  const previewLines: string[] = [];

  const maxLen = Math.max(oldLines.length, cleanNew.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = cleanNew[i];
    if (oldLine !== newLine) {
      if (oldLine !== undefined) {
        previewLines.push(`- ${oldLine}`);
        removed++;
      }
      if (newLine !== undefined) {
        previewLines.push(`+ ${newLine}`);
        added++;
      }
    }
  }

  return {
    added,
    removed,
    preview: previewLines.join("\n"),
  };
}

/**
 * Render a spinner while streaming.
 */
export function streamingSpinner(theme: Theme): Text {
  return new Text(theme.fg("warning", "⟳ Стриминг..."), 0, 0);
}

/**
 * Render diff preview component.
 */
export function renderDiffPreview(state: DiffPreviewState, theme: Theme): Text {
  if (state.isStreaming) {
    return new Text(
      theme.fg("warning", `⟳ ${state.path}: стриминг...`),
      0, 0,
    );
  }

  const diff = computeDiffPreview(state.oldContent, state.newContent);
  const lines = [
    theme.fg("accent", `--- a/${state.path}`),
    theme.fg("accent", `+++ b/${state.path}`),
    `@@ -${diff.removed} +${diff.added} @@`,
    diff.preview,
  ];

  return new Text(lines.join("\n"), 0, 0);
}
