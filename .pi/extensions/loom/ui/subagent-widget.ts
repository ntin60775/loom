/**
 * Subagent Widget — карточки субагентов с деревом и статистикой
 *
 * SubagentCard — TUI компонент для renderCall/renderResult loom_spawn_worker / loom_spawn_reviewer.
 * Показывает: tree-коннектор, иконка статуса, ID+описание, бейдж, статистика, текущий инструмент, retry.
 *
 * Invariants: INV-5 (read-only TUI), INV-9 (executor does not write), INV-12 (UI — русский)
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { SubagentRecord } from "../shared/subagent-state";
import { renderStatusLineText, type StatusIcon } from "./render-utils";
import { collapseOutput, collapseHint, DEFAULT_LIMITS } from "./expand-collapse";

// ── Widget (status bar) ──────────────────────────────────────────────────

export function updateSubagentWidget(ctx: ExtensionContext, subagents: SubagentRecord[]): void {
  if (subagents.length === 0) {
    ctx.ui.setWidget("loom-subagents", undefined);
    return;
  }

  const lines = ["🤖 Субагенты:"];
  for (const s of subagents) {
    const icon = s.status === "running" ? "⏳" : s.status === "completed" ? "✓" : "✗";
    const meta: string[] = [];
    if (s.type) meta.push(s.type);
    if (s.model) meta.push(s.model);
    if (s.step) meta.push(`step-${s.step}`);
    lines.push(`  ${icon} ${s.name}${meta.length > 0 ? ` [${meta.join(", ")}]` : ""}`);
  }

  ctx.ui.setWidget("loom-subagents", lines);
}

// ── SubagentCard (renderCall/renderResult component) ─────────────────────

export interface SubagentCardState {
  id: string;
  type: "worker" | "reviewer";
  step?: number;
  treePrefix: string;   // "├──" или "└──"
  childIndent: string;  // "│   " или "    "
}

function statusIcon(status: string): { icon: string; statusType: StatusIcon } {
  switch (status) {
    case "running":   return { icon: "⠋", statusType: "running" };
    case "completed": return { icon: "✓", statusType: "success" };
    case "error":
    case "failed":
    case "aborted":   return { icon: "✗", statusType: "error" };
    default:          return { icon: "○", statusType: "pending" };
  }
}

function badge(status: string): string {
  switch (status) {
    case "completed": return "[done]";
    case "failed":    return "[failed]";
    case "aborted":   return "[aborted]";
    case "running":   return "[running]";
    default:          return "";
  }
}


interface ReviewFinding {
  priority: "P0" | "P1" | "P2" | "P3";
  file: string;
  line?: number;
  description: string;
  correct?: boolean;
  confidence?: number;
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "P0": return "🔴";
    case "P1": return "🟡";
    case "P2": return "🔵";
    case "P3": return "⚪";
    default: return "⚪";
  }
}

function renderReviewFindings(findings: ReviewFinding[], indent: string, expanded?: boolean): string {
  if (!findings || findings.length === 0) return "";

  const countByP: Record<string, number> = {};
  for (const f of findings) {
    countByP[f.priority] = (countByP[f.priority] || 0) + 1;
  }
  const summary = Object.entries(countByP).sort()
    .map(([p, c]) => `${p}:${c}`).join(" · ");

  const lines: string[] = [];
  lines.push(`${indent}Findings: ${summary}`);

  for (const f of findings) {
    const icon = priorityColor(f.priority);
    const loc = f.file + (f.line !== undefined ? `:${f.line}` : "");
    let findingLine = `${indent}├── ${icon} [${f.priority}] ${f.description}  ${loc}`;
    if (f.correct !== undefined) {
      findingLine += f.correct ? "  ✓" : "  ✗";
    }
    if (f.confidence !== undefined) {
      findingLine += ` (${Math.round(f.confidence * 100)}%)`;
    }
    lines.push(findingLine);
  }

  return lines.join("\n");
}

interface SubagentStats {
  tools?: number;
  ctxCurrent?: number;
  ctxWindow?: number;
  tokensCumulative?: number;
  cost?: number;
  durationMs?: number;
  currentTool?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m${s}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(2)}`;
}

function statsLine(stats: SubagentStats): string {
  const parts: string[] = [];
  if (stats.tools !== undefined) parts.push(`${stats.tools} tools`);
  if (stats.ctxCurrent !== undefined && stats.ctxWindow !== undefined) {
    const cur = stats.ctxCurrent >= 1000 ? `${(stats.ctxCurrent / 1000).toFixed(1)}K` : `${stats.ctxCurrent}`;
    const win = stats.ctxWindow >= 1000 ? `${(stats.ctxWindow / 1000).toFixed(0)}K` : `${stats.ctxWindow}`;
    parts.push(`${cur}/${win} ctx`);
  }
  if (stats.tokensCumulative !== undefined) {
    const tok = stats.tokensCumulative >= 1000 ? `${(stats.tokensCumulative / 1000).toFixed(1)}K` : `${stats.tokensCumulative}`;
    parts.push(`Σ${tok}`);
  }
  if (stats.cost !== undefined) parts.push(formatCost(stats.cost));
  if (stats.durationMs !== undefined) parts.push(formatDuration(stats.durationMs));
  return parts.join(" · ");
}

/**
 * Отрендерить карточку субагента как строку.
 * Используется в renderCall (показывает pending/running) и renderResult (финальный статус).
 */
export function renderSubagentCard(
  state: SubagentCardState,
  subagentStatus: string,
  stats?: SubagentStats,
  retry?: { attempt: number; max: number; reason?: string; delayMs?: number },
  theme?: Theme,
): string {
  const { icon } = statusIcon(subagentStatus);
  const b = badge(subagentStatus);
  const typeLabel = state.type === "reviewer" ? "reviewer" : "worker";
  const stepInfo = state.step !== undefined ? `${state.step}` : "";

  // Основная строка
  let line = `${state.treePrefix} ${icon} ${stepInfo} ${typeLabel}: ${state.id}`;
  if (b) line += ` ${b}`;

  // Строка статистики
  const statStr = stats ? statsLine(stats) : "";
  let currentToolStr = "";
  if (subagentStatus === "running" && stats?.currentTool) {
    currentToolStr = `${state.childIndent}╰─ ${stats.currentTool}`;
  }

  // Retry
  let retryStr = "";
  if (retry) {
    const r = retry;
    retryStr = `\n${state.childIndent}retrying ${r.attempt}/${r.max}`;
    if (r.delayMs) retryStr += ` in ${formatDuration(r.delayMs)}`;
    if (r.reason) retryStr += `: ${r.reason}`;
  }

  const parts = [line];
  if (statStr) parts.push(`${state.childIndent}${statStr}`);
  if (currentToolStr) parts.push(currentToolStr);
  if (retryStr) parts.push(retryStr);

  return parts.join("\n");
}

/**
 * Компонент Text для renderCall — показывает карточку с pending/running статусом.
 */
export function subagentCallRender(
  state: SubagentCardState,
  theme: Theme,
): Text {
  const text = renderSubagentCard(state, "running", undefined, undefined, theme);
  return new Text(text, 0, 0);
}

/**
 * Компонент Text для renderResult — показывает финальную карточку со статусом.
 */
export interface SubagentResultRenderOptions {
  expanded?: boolean;
}

export interface SubagentResultRenderOptions {
  expanded?: boolean;
}

export function subagentResultRender(
  state: SubagentCardState,
  result: {
    isError?: boolean;
    details?: {
      result?: { exitCode?: number; usage?: { input?: number; output?: number; cost?: number; turns?: number }; model?: string };
      reviewJson?: { verdict?: string };
      guardResult?: { passed?: boolean };
      progress?: {
        status?: string;
        tools_used?: number;
        ctx_current?: number;
        ctx_window?: number;
        tokens_cumulative?: number;
        cost?: number;
        duration_ms?: number;
        current_tool?: string;
      };
    };
  },
  theme: Theme,
  options: SubagentResultRenderOptions = {},
): Text {
  const exitCode = result.details?.result?.exitCode;
  const finalStatus = result.isError ? "failed" : "completed";

  const { icon } = statusIcon(finalStatus);
  const b = badge(finalStatus);
  const typeLabel = state.type === "reviewer" ? "reviewer" : "worker";
  const stepInfo = state.step !== undefined ? `${state.step}` : "";

  let line = `${state.treePrefix} ${icon} ${stepInfo} ${typeLabel}: ${state.id}`;
  if (b) line += ` ${b}`;

  // Review findings tree (P0-P3)
  let findingsStr = "";
  if (state.type === "reviewer" && result.details?.reviewJson?.findings) {
    const findings = result.details.reviewJson.findings as ReviewFinding[];
    if (Array.isArray(findings) && findings.length > 0) {
      findingsStr = renderReviewFindings(findings, state.childIndent);
    }
  }

  // Вердикт reviewer'а
  let verdictStr = "";
  if (state.type === "reviewer" && result.details?.reviewJson?.verdict) {
    const v = result.details.reviewJson.verdict;
    verdictStr = `${state.childIndent}verdict: ${v}`;
  }

  // Localization guard
  let guardStr = "";
  if (result.details?.guardResult?.passed === false) {
    guardStr = `${state.childIndent}⚠ localization guard failed`;
  }

  // Stats from ProgressEvent
  let statsStr = "";
  const p = result.details?.progress;
  if (p) {
    statsStr = statsLine({
      tools: p.tools_used,
      ctxCurrent: p.ctx_current,
      ctxWindow: p.ctx_window,
      tokensCumulative: p.tokens_cumulative,
      cost: p.cost,
      durationMs: p.duration_ms,
      currentTool: p.current_tool,
    });
  }

  const parts = [line];
  if (statsStr) parts.push(`${state.childIndent}${statsStr}`);

  // Apply expand/collapse: collapsed mode limits lines
  const expanded = options.expanded !== false; // default expanded=true
  const fullText = parts.join("\n");

  // Collapse findings + verdict + guard when not expanded
  const detailParts: string[] = [];
  if (findingsStr) detailParts.push(findingsStr);
  if (verdictStr) detailParts.push(verdictStr);
  if (guardStr) detailParts.push(guardStr);

  const detailText = detailParts.join("\n");

  if (!expanded && detailText) {
    const collapsed = collapseOutput(detailText, { maxLines: 3, maxDiffHunks: 8 });
    const hint = collapseHint(collapsed.truncated);
    const finalText = fullText + "\n" + collapsed.text + (hint ? `\n${state.childIndent}${hint}` : "");
    return new Text(finalText, 0, 0);
  }

  if (detailText) parts.push(...detailParts);
  return new Text(parts.join("\n"), 0, 0);
}
