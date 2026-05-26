/**
 * Mock: @earendil-works/pi-coding-agent
 *
 * Minimal mock for type compatibility in tests.
 * Actual ExtensionAPI/ExtensionContext are only needed for integration tests.
 */

export interface ExtensionContext {
  cwd: string;
  ui: {
    notify: (message: string, level?: string) => void;
    setWidget: (id: string, widget: unknown) => void;
    setStatus: (id: string, content: string) => void;
    select: (prompt: string, options: string[]) => Promise<string>;
  };
  sessionManager: {
    getEntries: () => Array<{ type?: string; customType?: string; data?: unknown }>;
  };
}

export interface ExtensionAPI {
  registerCommand: (name: string, opts: Record<string, unknown>) => void;
  registerTool: (opts: Record<string, unknown>) => void;
  registerShortcut: (key: unknown, opts: Record<string, unknown>) => void;
  setActiveTools: (tools: string[]) => void;
  sendUserMessage: (message: string) => void;
  on: (event: string, handler: (...args: unknown[]) => unknown) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withFileMutationQueue(path: string, fn: () => Promise<void>): Promise<void> {
  return fn();
}
