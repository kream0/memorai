import type { SQLQueryBindings } from 'bun:sqlite';
import { databaseExists, openDatabase } from '../db/connection.js';
import type {
  Category,
  Memory,
  MemorySummary,
  SearchOptions,
  SearchResult,
} from '../types/memory.js';

type SqlParam = SQLQueryBindings;

interface RawMemoryRow {
  id: string;
  category: string;
  title: string;
  content?: string;
  summary: string | null;
  tags: string | null;
  importance: number;
  created_at: string;
  updated_at?: string;
  session_id?: string | null;
  score?: number;
}

/**
 * Parse tags JSON string to array.
 */
function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    return JSON.parse(tagsJson) as string[];
  } catch {
    return [];
  }
}

/**
 * Search memories using FTS5 with BM25 ranking.
 */
export function searchFts(
  options: SearchOptions,
  dbPath?: string
): SearchResult[] {
  if (!databaseExists() && !dbPath) {
    return [];
  }

  const db = openDatabase(dbPath);

  try {
    // Escape special FTS characters
    const ftsQuery = options.query.replace(/"/g, '""');

    // Build query
    let sql = `
      SELECT
        m.id,
        m.category,
        m.title,
        m.summary,
        m.tags,
        m.importance,
        m.created_at,
        m.updated_at,
        bm25(memories_fts, 1.0, 0.5, 0.75, 0.5) as score
      FROM memories_fts f
      JOIN memories m ON m.rowid = f.rowid
      WHERE memories_fts MATCH ?
    `;
    const params: SqlParam[] = [ftsQuery];

    if (options.category) {
      sql += ' AND m.category = ?';
      params.push(options.category);
    }

    if (options.importanceMin) {
      sql += ' AND m.importance >= ?';
      params.push(options.importanceMin);
    }

    // Order by relevance score (lower is better for BM25)
    sql += ' ORDER BY score LIMIT ?';
    params.push(options.limit ?? 10);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as RawMemoryRow[];

    const results: SearchResult[] = [];

    for (const row of rows) {
      // Convert BM25 score to relevance percentage
      // BM25 returns negative values, more negative = better match
      const rawScore = Math.abs(row.score ?? 0);
      const relevance = Math.min(100, Math.floor(rawScore * 10));

      const memory: SearchResult = {
        id: row.id,
        category: row.category as Category,
        title: row.title,
        summary: row.summary,
        tags: parseTags(row.tags),
        importance: row.importance,
        relevance,
        createdAt: row.created_at,
      };

      // Filter by tags if specified
      if (options.tags && options.tags.length > 0) {
        const memoryTags = memory.tags;
        if (!options.tags.some((t) => memoryTags.includes(t))) {
          continue;
        }
      }

      results.push(memory);
    }

    db.close();
    return results;
  } catch (error) {
    db.close();
    // If FTS query fails, fall back to LIKE search
    return searchLike(options, dbPath);
  }
}

/**
 * Fallback LIKE-based search when FTS fails.
 */
export function searchLike(
  options: SearchOptions,
  dbPath?: string
): SearchResult[] {
  if (!databaseExists() && !dbPath) {
    return [];
  }

  const db = openDatabase(dbPath);

  try {
    const likePattern = `%${options.query}%`;

    let sql = `
      SELECT id, category, title, summary, tags, importance, created_at
      FROM memories
      WHERE (title LIKE ? OR content LIKE ? OR summary LIKE ?)
    `;
    const params: SqlParam[] = [likePattern, likePattern, likePattern];

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    if (options.importanceMin) {
      sql += ' AND importance >= ?';
      params.push(options.importanceMin);
    }

    sql += ' ORDER BY importance DESC, created_at DESC LIMIT ?';
    params.push(options.limit ?? 10);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as RawMemoryRow[];

    const results: SearchResult[] = [];

    for (const row of rows) {
      const memory: SearchResult = {
        id: row.id,
        category: row.category as Category,
        title: row.title,
        summary: row.summary,
        tags: parseTags(row.tags),
        importance: row.importance,
        relevance: 50, // Default relevance for LIKE search
        createdAt: row.created_at,
      };

      if (options.tags && options.tags.length > 0) {
        const memoryTags = memory.tags;
        if (!options.tags.some((t) => memoryTags.includes(t))) {
          continue;
        }
      }

      results.push(memory);
    }

    db.close();
    return results;
  } catch (error) {
    db.close();
    return [];
  }
}

/**
 * Get a specific memory by ID.
 */
export function getMemoryById(
  memoryId: string,
  full = false,
  dbPath?: string
): Memory | MemorySummary | null {
  if (!databaseExists() && !dbPath) {
    return null;
  }

  const db = openDatabase(dbPath);

  try {
    const sql = full
      ? 'SELECT * FROM memories WHERE id = ?'
      : 'SELECT id, category, title, summary, tags, importance, created_at FROM memories WHERE id = ?';

    const row = db.prepare(sql).get(memoryId) as RawMemoryRow | undefined;

    db.close();

    if (!row) {
      return null;
    }

    if (full) {
      return {
        id: row.id,
        category: row.category as Category,
        title: row.title,
        content: row.content ?? '',
        summary: row.summary,
        tags: parseTags(row.tags),
        importance: row.importance,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at,
        sessionId: row.session_id ?? null,
      };
    }

    return {
      id: row.id,
      category: row.category as Category,
      title: row.title,
      summary: row.summary,
      tags: parseTags(row.tags),
      importance: row.importance,
      createdAt: row.created_at,
    };
  } catch (error) {
    db.close();
    return null;
  }
}

/**
 * Get most recent memories.
 */
export function getRecent(
  limit = 10,
  category?: Category,
  dbPath?: string
): MemorySummary[] {
  if (!databaseExists() && !dbPath) {
    return [];
  }

  const db = openDatabase(dbPath);

  try {
    let sql = `
      SELECT id, category, title, summary, tags, importance, created_at
      FROM memories
    `;
    const params: SqlParam[] = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as RawMemoryRow[];

    db.close();

    return rows.map((row) => ({
      id: row.id,
      category: row.category as Category,
      title: row.title,
      summary: row.summary,
      tags: parseTags(row.tags),
      importance: row.importance,
      createdAt: row.created_at,
    }));
  } catch (error) {
    db.close();
    return [];
  }
}

/**
 * Main search function - uses FTS5 with fallback to LIKE.
 */
export function search(
  options: SearchOptions,
  dbPath?: string
): SearchResult[] {
  return searchFts(options, dbPath);
}
