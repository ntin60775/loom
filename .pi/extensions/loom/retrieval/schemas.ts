/**
 * TypeBox Schema Definitions for Search Results
 *
 * Provides runtime-validatable schemas for scout retrieval output.
 * Used by the extension for type-safe JSON validation.
 *
 * Invariant: INV-12 — all code comments in English
 */

import { Type } from "@earendil-works/pi-ai";

/** Schema for a single search result */
export const SearchResultSchema = Type.Object({
  rank: Type.Integer({ minimum: 1, description: "Rank position (1 = most relevant)" }),
  source_path: Type.String({ description: "Path to the source file" }),
  excerpt: Type.String({
    maxLength: 500,
    description: "Relevant excerpt from the source, max 500 characters",
  }),
  relevance_score: Type.Number({
    minimum: 0,
    maximum: 1,
    description: "Relevance score from 0.0 (irrelevant) to 1.0 (highly relevant)",
  }),
  reasoning: Type.String({ description: "Explanation of why this result is relevant" }),
});

/** Schema for the full search knowledge response */
export const SearchKnowledgeResponseSchema = Type.Object({
  query: Type.String({ description: "Original search query" }),
  scope: Type.String({ description: "Search scope used" }),
  results: Type.Array(SearchResultSchema, { description: "Ranked search results" }),
  cached: Type.Boolean({ description: "Whether this response was served from cache" }),
  execution_time_ms: Type.Number({ description: "Total execution time in milliseconds" }),
});
