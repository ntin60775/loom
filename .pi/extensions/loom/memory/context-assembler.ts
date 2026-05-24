/**
 * Context Assembler — builds agent context from 4 memory tracks
 *
 * Priority: semantic > episodic > procedural > session
 * Token budget: configurable (default 4000 tokens).
 * Truncation: by priority, with lossy summarization for lower-priority tracks.
 *
 * INV-4: Deterministic context assembly — no hidden state.
 * INV-6: Token budget respected — output truncated to fit.
 */

import type { MemoryEntry, MemoryQuery } from "./types";
import type { MemoryManager } from "./manager";

export interface ContextAssemblerOptions {
  tokenBudget?: number;
  charsPerToken?: number;
  trackLimits?: {
    semantic?: number;
    episodic?: number;
    procedural?: number;
    session?: number;
  };
}

export interface AssembledContext {
  text: string;
  tracks: {
    semantic: { entries: MemoryEntry[]; tokens: number };
    episodic: { entries: MemoryEntry[]; tokens: number };
    procedural: { entries: MemoryEntry[]; tokens: number };
    session: { entries: MemoryEntry[]; tokens: number };
  };
  totalTokens: number;
  truncated: boolean;
}

export class ContextAssembler {
  private readonly tokenBudget: number;
  private readonly charsPerToken: number;
  private readonly trackLimits: Required<NonNullable<ContextAssemblerOptions["trackLimits"]>>;

  constructor(options: ContextAssemblerOptions = {}) {
    this.tokenBudget = options.tokenBudget ?? 4000;
    this.charsPerToken = options.charsPerToken ?? 4;
    this.trackLimits = {
      semantic: options.trackLimits?.semantic ?? 200,
      episodic: options.trackLimits?.episodic ?? 100,
      procedural: options.trackLimits?.procedural ?? 50,
      session: options.trackLimits?.session ?? 50,
    };
  }

  /**
   * Assemble context for a given task.
   * Queries all tracks with the task context and builds a prioritized text block.
   */
  assemble(manager: MemoryManager, taskId: string): AssembledContext {
    const baseQuery: MemoryQuery = {
      task_id: taskId,
      limit: this.trackLimits.semantic,
      min_relevance: 0.1,
    };

    // Query tracks by priority
    const semanticEntries = manager.query("semantic", { ...baseQuery, limit: this.trackLimits.semantic });
    const episodicEntries = manager.query("episodic", { ...baseQuery, limit: this.trackLimits.episodic });
    const proceduralEntries = manager.query("procedural", { ...baseQuery, limit: this.trackLimits.procedural });
    const sessionEntries = manager.query("session", { ...baseQuery, limit: this.trackLimits.session });

    // Build track sections
    const semanticSection = this.buildSection("Semantic Memory", semanticEntries);
    const episodicSection = this.buildSection("Episodic Memory", episodicEntries);
    const proceduralSection = this.buildSection("Procedural Memory", proceduralEntries);
    const sessionSection = this.buildSection("Session Memory", sessionEntries);

    // Budget allocation: semantic first, then episodic, procedural, session
    const sections = [
      { name: "semantic", text: semanticSection.text, entries: semanticEntries, tokens: semanticSection.tokens },
      { name: "episodic", text: episodicSection.text, entries: episodicEntries, tokens: episodicSection.tokens },
      { name: "procedural", text: proceduralSection.text, entries: proceduralEntries, tokens: proceduralSection.tokens },
      { name: "session", text: sessionSection.text, entries: sessionEntries, tokens: sessionSection.tokens },
    ];

    let remainingTokens = this.tokenBudget;
    const resultTracks: AssembledContext["tracks"] = {
      semantic: { entries: [], tokens: 0 },
      episodic: { entries: [], tokens: 0 },
      procedural: { entries: [], tokens: 0 },
      session: { entries: [], tokens: 0 },
    };

    let assembledText = "";
    let truncated = false;

    for (const section of sections) {
      if (section.tokens <= remainingTokens) {
        assembledText += section.text;
        remainingTokens -= section.tokens;
        resultTracks[section.name as keyof typeof resultTracks] = {
          entries: section.entries,
          tokens: section.tokens,
        };
      } else {
        // Try to fit a truncated / summarized version
        const truncatedSection = this.truncateSection(section.text, remainingTokens);
        if (truncatedSection.tokens > 0) {
          assembledText += truncatedSection.text;
          remainingTokens -= truncatedSection.tokens;
          resultTracks[section.name as keyof typeof resultTracks] = {
            entries: section.entries.slice(0, Math.max(1, Math.floor(section.entries.length * (truncatedSection.tokens / section.tokens)))),
            tokens: truncatedSection.tokens,
          };
        }
        truncated = true;
        break; // Stop adding lower-priority tracks
      }
    }

    const totalTokens = this.tokenBudget - remainingTokens;

    return {
      text: assembledText.trim(),
      tracks: resultTracks,
      totalTokens,
      truncated,
    };
  }

  private buildSection(title: string, entries: MemoryEntry[]): { text: string; tokens: number } {
    if (entries.length === 0) {
      return { text: `\n--- ${title} ---\n(none)\n`, tokens: 0 };
    }

    const lines: string[] = [`\n--- ${title} ---`];
    for (const entry of entries) {
      const summary = this.summarizeEntry(entry);
      lines.push(`- [${entry.relevance_score.toFixed(2)}] ${summary}`);
    }
    const text = lines.join("\n") + "\n";
    const tokens = Math.ceil(text.length / this.charsPerToken);
    return { text, tokens };
  }

  private summarizeEntry(entry: MemoryEntry): string {
    switch (entry.track_type) {
      case "semantic": {
        const c = entry.content as import("./types").SemanticContent;
        return `[${c.category}] ${c.fact.replace(/\n/g, " ")}`.slice(0, 200);
      }
      case "episodic": {
        const c = entry.content as import("./types").EpisodicContent;
        return `${c.event} → ${c.outcome}`.slice(0, 200);
      }
      case "procedural": {
        const c = entry.content as import("./types").ProceduralContent;
        return `${c.pattern} (${c.validation_status})`.slice(0, 200);
      }
      case "session": {
        const c = entry.content as import("./types").SessionContent;
        return `[${c.role}] ${c.message.replace(/\n/g, " ")}`.slice(0, 200);
      }
      default:
        return String(entry.content).slice(0, 200);
    }
  }

  private truncateSection(text: string, maxTokens: number): { text: string; tokens: number } {
    const maxChars = Math.floor(maxTokens * this.charsPerToken);
    if (text.length <= maxChars) {
      return { text, tokens: Math.ceil(text.length / this.charsPerToken) };
    }
    // Lossy truncation: cut at line boundary if possible
    let truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf("\n");
    if (lastNewline > 0) {
      truncated = truncated.slice(0, lastNewline);
    }
    return {
      text: truncated + "\n[...truncated...]\n",
      tokens: Math.ceil((truncated.length + 20) / this.charsPerToken),
    };
  }
}
