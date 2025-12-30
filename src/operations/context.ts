import { databaseExists } from '../db/connection.js';
import type { MemorySummary, SearchResult } from '../types/memory.js';
import { getRecent, search } from './search.js';

/**
 * Context retrieval mode
 */
export type ContextMode = 'session' | 'prompt';

/**
 * Options for context retrieval
 */
export interface ContextOptions {
  mode: ContextMode;
  recent?: number;        // Number of recent memories (default: 7 for session)
  limit?: number;         // Max relevant memories for prompt mode (default: 5)
  query?: string;         // Search query (prompt mode)
  maxTokens?: number;     // Token budget (default: 2000)
  skipIds?: string[];     // IDs to exclude (dedup)
  format?: 'claude' | 'json';
}

/**
 * Context result
 */
export interface ContextResult {
  mode: ContextMode;
  count: number;
  memories: ScoredMemory[];
  query?: string;
  estimatedTokens: number;
}

/**
 * Memory with combined score
 */
export interface ScoredMemory extends MemorySummary {
  score: number;
  relevance?: number;
  relativeTime: string;
}

/**
 * Estimate token count (~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString();
}

/**
 * Score a memory based on recency and importance.
 * For session mode: recency * 0.6 + importance * 0.4
 * For prompt mode with relevance: relevance * 0.5 + recency * 0.3 + importance * 0.2
 */
export function scoreMemory(
  memory: MemorySummary | SearchResult,
  hasQuery = false
): number {
  const ageMs = Date.now() - new Date(memory.createdAt).getTime();

  // Recency score: exponential decay with 24-hour half-life
  const recencyScore = Math.exp(-ageMs / (24 * 60 * 60 * 1000));

  // Importance score: normalized 1-10 → 0-1
  const importanceScore = memory.importance / 10;

  // Relevance score: from search result (0-100 → 0-1)
  const relevanceScore = 'relevance' in memory ? memory.relevance / 100 : 0;

  if (hasQuery && 'relevance' in memory) {
    // Prompt mode with relevance
    return relevanceScore * 0.5 + recencyScore * 0.3 + importanceScore * 0.2;
  }

  // Session mode: prioritize recency and importance
  return recencyScore * 0.6 + importanceScore * 0.4;
}

/**
 * Get session context - recent memories for session start
 */
export function getSessionContext(
  options: {
    recent?: number;
    maxTokens?: number;
    skipIds?: string[];
  } = {},
  dbPath?: string
): ContextResult {
  const recentLimit = options.recent ?? 7;
  const maxTokens = options.maxTokens ?? 2000;
  const skipIds = new Set(options.skipIds ?? []);

  if (!databaseExists() && !dbPath) {
    return {
      mode: 'session',
      count: 0,
      memories: [],
      estimatedTokens: 0,
    };
  }

  // Get recent memories
  const recent = getRecent(recentLimit + skipIds.size, undefined, dbPath);

  // Filter out skipped IDs and score
  const scored: ScoredMemory[] = recent
    .filter((m) => !skipIds.has(m.id))
    .slice(0, recentLimit)
    .map((m) => ({
      ...m,
      score: scoreMemory(m, false),
      relativeTime: formatRelativeTime(m.createdAt),
    }));

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Estimate tokens and truncate if needed
  let tokenCount = 0;
  const result: ScoredMemory[] = [];

  for (const memory of scored) {
    const memoryText = formatMemoryLine(memory);
    const memTokens = estimateTokens(memoryText);

    if (tokenCount + memTokens > maxTokens) {
      break;
    }

    tokenCount += memTokens;
    result.push(memory);
  }

  return {
    mode: 'session',
    count: result.length,
    memories: result,
    estimatedTokens: tokenCount,
  };
}

/**
 * Get prompt context - memories relevant to user's query
 */
export function getPromptContext(
  query: string,
  options: {
    limit?: number;
    maxTokens?: number;
    skipIds?: string[];
  } = {},
  dbPath?: string
): ContextResult {
  const limit = options.limit ?? 5;
  const maxTokens = options.maxTokens ?? 2000;
  const skipIds = new Set(options.skipIds ?? []);

  if (!databaseExists() && !dbPath) {
    return {
      mode: 'prompt',
      count: 0,
      memories: [],
      query,
      estimatedTokens: 0,
    };
  }

  // Search for relevant memories
  const searchResults = search(
    { query, limit: limit + skipIds.size + 5 },
    dbPath
  );

  // Filter out skipped IDs and score
  const scored: ScoredMemory[] = searchResults
    .filter((m) => !skipIds.has(m.id))
    .map((m) => ({
      ...m,
      score: scoreMemory(m, true),
      relativeTime: formatRelativeTime(m.createdAt),
    }));

  // Sort by combined score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Limit and check tokens
  let tokenCount = 0;
  const result: ScoredMemory[] = [];

  for (const memory of scored.slice(0, limit)) {
    const memoryText = formatMemoryLine(memory);
    const memTokens = estimateTokens(memoryText);

    if (tokenCount + memTokens > maxTokens) {
      break;
    }

    tokenCount += memTokens;
    result.push(memory);
  }

  return {
    mode: 'prompt',
    count: result.length,
    memories: result,
    query,
    estimatedTokens: tokenCount,
  };
}

/**
 * Format a single memory line for token estimation
 */
function formatMemoryLine(memory: ScoredMemory): string {
  const tags = memory.tags.length > 0 ? ` | Tags: ${memory.tags.join(', ')}` : '';
  const summary = memory.summary || '(no summary)';
  return `### [${memory.relativeTime}] ${memory.title}\n**Category:** ${memory.category} | **Importance:** ${memory.importance}/10${tags}\n> ${summary}\n\n`;
}

/**
 * Format context for Claude (markdown output)
 */
export function formatForClaude(result: ContextResult): string {
  if (result.count === 0) {
    return ''; // Empty output if no memories
  }

  const lines: string[] = [];

  // Header based on mode
  if (result.mode === 'session') {
    lines.push('<memory-context source="session">');
    lines.push('## Recent Project Context\n');
  } else {
    const queryAttr = result.query ? ` query="${result.query}"` : '';
    lines.push(`<memory-context source="prompt"${queryAttr}>`);
    lines.push(`## Relevant Memories${result.query ? ` for "${result.query}"` : ''}\n`);
  }

  // Add memories
  for (const memory of result.memories) {
    lines.push(`### [${memory.relativeTime}] ${memory.title}`);

    const tags = memory.tags.length > 0 ? ` | **Tags:** ${memory.tags.join(', ')}` : '';
    lines.push(`**Category:** ${memory.category} | **Importance:** ${memory.importance}/10${tags}`);

    if (memory.summary) {
      lines.push(`> ${memory.summary}`);
    }

    lines.push('');
  }

  lines.push('</memory-context>');

  return lines.join('\n');
}

/**
 * Main context retrieval function
 */
export function getContext(options: ContextOptions, dbPath?: string): ContextResult {
  if (options.mode === 'session') {
    return getSessionContext(
      {
        recent: options.recent,
        maxTokens: options.maxTokens,
        skipIds: options.skipIds,
      },
      dbPath
    );
  }

  if (!options.query) {
    return {
      mode: 'prompt',
      count: 0,
      memories: [],
      estimatedTokens: 0,
    };
  }

  return getPromptContext(
    options.query,
    {
      limit: options.limit,
      maxTokens: options.maxTokens,
      skipIds: options.skipIds,
    },
    dbPath
  );
}
