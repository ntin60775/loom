/**
 * renderStatusLine — единая строка статуса для loom-инструментов
 *
 * Паттерн: иконка + тип операции + описание
 * Цветовая индикация: success/error/warning/pending/running
 *
 * Invariants: INV-5 (read-only TUI), INV-12 (UI — русский)
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export type StatusIcon = "success" | "error" | "warning" | "pending" | "running";

const ICONS: Record<StatusIcon, string> = {
  success: "✓",
  error:   "✗",
  warning: "⚠",
  pending: "○",
  running: "⠋",
};

const ICON_COLORS: Record<StatusIcon, keyof Theme["fg"] extends (...args: infer A) => string ? never : string> = {
  success: "success",
  error:   "error",
  warning: "warning",
  pending: "dim",
  running: "accent",
};

export interface StatusLineOptions {
  icon: StatusIcon;
  title: string;
  description?: string;
}

/**
 * Вернуть цветную строку: "✓ Операция  описание..."
 */
export function renderStatusLineText(opts: StatusLineOptions, theme: Theme): string {
  const icon = ICONS[opts.icon] ?? "?";
  const color = ICON_COLORS[opts.icon] ?? "muted";
  let line = theme.fg(color, `${icon} ${opts.title}`);
  if (opts.description) {
    line += "  " + theme.fg("muted", opts.description);
  }
  return line;
}

/**
 * Компонент Text с renderStatusLine
 */
export function renderStatusLine(opts: StatusLineOptions, theme: Theme): Text {
  return new Text(renderStatusLineText(opts, theme), 0, 0);
}
