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
export function subagentResultRender(
  state: SubagentCardState,
  result: {
    isError?: boolean;
    details?: {
      result?: { exitCode?: number; usage?: unknown; model?: string };
      reviewJson?: { verdict?: string };
      guardResult?: { passed?: boolean };
    };
  },
  theme: Theme,
): Text {
  const exitCode = result.details?.result?.exitCode;
  const isWorkerOk = exitCode === 0 && !result.isError;
  const finalStatus = result.isError ? "failed" : "completed";

  const { icon } = statusIcon(finalStatus);
  const b = badge(finalStatus);
  const typeLabel = state.type === "reviewer" ? "reviewer" : "worker";
  const stepInfo = state.step !== undefined ? `${state.step}` : "";

  let line = `${state.treePrefix} ${icon} ${stepInfo} ${typeLabel}: ${state.id}`;
  if (b) line += ` ${b}`;

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

  const parts = [line];
  if (verdictStr) parts.push(verdictStr);
  if (guardStr) parts.push(guardStr);

  return new Text(parts.join("\n"), 0, 0);
}
