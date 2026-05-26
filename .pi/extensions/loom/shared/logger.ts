/**
 * Loom Logger — structured diagnostic logging
 *
 * Invariant: INV-12 — code comments in English
 *
 * Lightweight logger for loom extension. Replaces ad-hoc console.log/warn/error
 * with consistent [loom] prefix and module-level context.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLevel];
}

function log(level: LogLevel, module: string, message: string, err?: unknown): void {
  if (!shouldLog(level)) return;
  const prefix = `[loom:${module}]`;
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

  if (err instanceof Error) {
    console[level](`${timestamp} ${prefix} ${message}: ${err.message}`);
  } else if (err !== undefined) {
    console[level](`${timestamp} ${prefix} ${message}:`, err);
  } else {
    console[level](`${timestamp} ${prefix} ${message}`);
  }
}

export const logger = {
  debug(module: string, message: string, err?: unknown): void {
    log("debug", module, message, err);
  },
  info(module: string, message: string, err?: unknown): void {
    log("info", module, message, err);
  },
  warn(module: string, message: string, err?: unknown): void {
    log("warn", module, message, err);
  },
  error(module: string, message: string, err?: unknown): void {
    log("error", module, message, err);
  },
};
