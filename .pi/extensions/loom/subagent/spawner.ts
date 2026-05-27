/**
 * Subagent Spawner — spawn worker/reviewer via pi CLI in isolated sessions
 *
 * Invariants:
 *   INV-6: clean sessions (--no-context-files)
 *   INV-10: model config from subagent-config.json
 *   INV-14: pi CLI flags verified via PoC
 */

import { spawn, exec } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { SubagentResult, WorkerSpec, ReviewerSpec, ProgressEvent } from "./specs";
import { getFinalOutput } from "../shared/utils";
import { logger } from "../shared/logger";

function getPiInvocation(): Promise<{ command: string; args: string[] }> {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return Promise.resolve({ command: process.execPath, args: [currentScript] });
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return Promise.resolve({ command: process.execPath, args: [] });
  }

  // Fallback: verify 'pi' is in PATH before using it (async)
  return new Promise((resolve, reject) => {
    exec("command -v pi 2>/dev/null || which pi 2>/dev/null || echo ''", {
      encoding: "utf-8",
      timeout: 2000,
    }, (err, stdout) => {
      const which = (stdout ?? "").trim();
      if (which && !err) {
        resolve({ command: "pi", args: [] });
      } else {
        reject(new Error("pi CLI not found in PATH and no suitable runtime detected"));
      }
    });
  });
}

async function writePromptToTempFile(name: string, prompt: string): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "loom-subagent-"));
  const safeName = name.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  });
  return { dir: tmpDir, filePath };
}

export async function spawnSubagent(
  spec: WorkerSpec | ReviewerSpec,
  signal?: AbortSignal,
  onUpdate?: (output: string | ProgressEvent) => void,
  timeoutMs?: number, // read from execution-config; falls back to 5 min
): Promise<SubagentResult> {
  const invocation = await getPiInvocation();
  const args: string[] = ["--mode", "json", "-p", "--no-session", "--no-context-files"];

  if (spec.model) args.push("--model", spec.model);
  if (spec.tools && spec.tools.length > 0) args.push("--tools", spec.tools.join(","));

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const result: SubagentResult = {
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
    model: spec.model,
  };

  try {
    const effectiveTimeout = timeoutMs ?? 300_000; // default 5 min

    if (spec.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(spec.name, spec.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${spec.task}`);

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn(invocation.command, [...invocation.args, ...args], {
        cwd: spec.cwd ?? process.cwd(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";
      let wasAborted = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: { type?: string; message?: SubagentResult["messages"][number] } | null = null;
        try {
          event = JSON.parse(line);
        } catch (err) {
          logger.warn("spawner", "Failed to parse subagent output line", err);
        }

        if (event.type === "message_end" && event.message) {
          const msg = event.message as SubagentResult["messages"][number];
          result.messages.push(msg);

          if (msg.role === "assistant") {
            result.usage.turns++;
            const usage = msg.usage;
            if (usage) {
              result.usage.input += usage.input || 0;
              result.usage.output += usage.output || 0;
              result.usage.cacheRead += usage.cacheRead || 0;
              result.usage.cacheWrite += usage.cacheWrite || 0;
              result.usage.cost += usage.cost?.total || 0;
            }
            if (!result.model && msg.model) result.model = msg.model;
            if (msg.stopReason) result.stopReason = msg.stopReason;
            if (msg.errorMessage) result.errorMessage = msg.errorMessage;
          }

          const output = getFinalOutput(result.messages);
          if (onUpdate && output) onUpdate(output);
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        result.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => resolve(1));

      // Internal timeout as safety net (SIGTERM → 5s → SIGKILL)
      const timeout = setTimeout(() => {
        logger.warn("spawner", `Subagent "${spec.name}" timed out after ${timeoutMs}ms`);
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      }, effectiveTimeout);

      proc.on("close", () => clearTimeout(timeout));

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };
        if (signal.aborted) killProc();
        else signal.addEventListener("abort", killProc, { once: true });
      }
    });

    result.exitCode = exitCode;
    return result;
  } finally {
    if (tmpPromptPath) {
      try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
    }
    if (tmpPromptDir) {
      try { fs.rmSync(tmpPromptDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
