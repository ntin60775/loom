/**
 * Retrieval Module — Scout-based knowledge retrieval for loom v2
 *
 * Exports: ScoutRetrieval, RetrievalCache, scope utilities, TypeBox schemas
 */

export { ScoutRetrieval } from "./scout-retrieval";
export type { ScoutRetrievalOptions } from "./scout-retrieval";
export { RetrievalCache } from "./cache";
export type {
  CacheEntry,
  SearchKnowledgeResponse,
  SearchResult,
} from "./cache";
export type { Scope } from "./scope-filter";
export {
  resolveSearchPaths,
  shouldIncludeFile,
} from "./scope-filter";
export {
  SearchResultSchema,
  SearchKnowledgeResponseSchema,
} from "./schemas";
