import type { SQLQueryBindings } from 'bun:sqlite';
import { databaseExists, openDatabase } from '../db/connection.js';
import type {
  Category,
  DeleteResult,
  ListOptions,
  MemorySummary,
  MemoryStats,
} from '../types/memory.js';

type SqlParam = SQLQueryBindings;

interface RawMemoryRow {
  id: string;
  category: string;
  title: string;
  summary: string | null;
  tags: string | null;
  importance: number;
  created_at: string;
  updated_at?: string;
}

interface CategoryCount {
  category: string;
  count: number;
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
 * Get memory statistics.
 */
export function getStats(dbPath?: string): MemoryStats {
  if (!databaseExists() && !dbPath) {
    return {
      initialized: false,
      total: 0,
      byCategory: {
        architecture: 0,
        decisions: 0,
        reports: 0,
        summaries: 0,
        structure: 0,
        notes: 0,
      },
      recent: [],
      important: [],
    };
  }

  const db = openDatabase(dbPath);

  try {
    // Total count
    const totalRow = db
      .prepare('SELECT COUNT(*) as total FROM memories')
      .get() as { total: number };
    const total = totalRow.total;

    // Count by category
    const categoryRows = db
      .prepare(
        `
      SELECT category, COUNT(*) as count
      FROM memories
      GROUP BY category
      ORDER BY count DESC
    `
      )
      .all() as CategoryCount[];

    const byCategory: Record<Category, number> = {
      architecture: 0,
      decisions: 0,
      reports: 0,
      summaries: 0,
      structure: 0,
      notes: 0,
    };

    for (const row of categoryRows) {
      byCategory[row.category as Category] = row.count;
    }

    // Recent memories
    const recentRows = db
      .prepare(
        `
      SELECT id, title, category, created_at
      FROM memories
      ORDER BY created_at DESC
      LIMIT 5
    `
      )
      .all() as Array<{
      id: string;
      title: string;
      category: string;
      created_at: string;
    }>;

    const recent = recentRows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category as Category,
      createdAt: row.created_at,
    }));

    // High importance
    const importantRows = db
      .prepare(
        `
      SELECT id, title, category, importance
      FROM memories
      WHERE importance >= 7
      ORDER BY importance DESC, created_at DESC
      LIMIT 5
    `
      )
      .all() as Array<{
      id: string;
      title: string;
      category: string;
      importance: number;
    }>;

    const important = importantRows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category as Category,
      importance: row.importance,
    }));

    db.close();

    return {
      initialized: true,
      total,
      byCategory,
      recent,
      important,
    };
  } catch (error) {
    db.close();
    return {
      initialized: false,
      total: 0,
      byCategory: {
        architecture: 0,
        decisions: 0,
        reports: 0,
        summaries: 0,
        structure: 0,
        notes: 0,
      },
      recent: [],
      important: [],
    };
  }
}

/**
 * List memories in a specific category.
 */
export function listCategory(
  category: Category,
  options: ListOptions = {},
  dbPath?: string
): MemorySummary[] {
  if (!databaseExists() && !dbPath) {
    return [];
  }

  const db = openDatabase(dbPath);

  try {
    let sql = `
      SELECT id, title, summary, tags, importance, created_at, updated_at
      FROM memories
      WHERE category = ?
    `;
    const params: SqlParam[] = [category];

    if (options.importanceMin) {
      sql += ' AND importance >= ?';
      params.push(options.importanceMin);
    }

    sql += ' ORDER BY importance DESC, created_at DESC LIMIT ?';
    params.push(options.limit ?? 20);

    const rows = db.prepare(sql).all(...params) as RawMemoryRow[];

    db.close();

    return rows.map((row) => ({
      id: row.id,
      category,
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
 * List all memories grouped by category.
 */
export function listAll(
  limit = 50,
  dbPath?: string
): Record<Category, MemorySummary[]> {
  const categories: Category[] = [
    'architecture',
    'decisions',
    'reports',
    'summaries',
    'structure',
    'notes',
  ];

  const result: Record<Category, MemorySummary[]> = {
    architecture: [],
    decisions: [],
    reports: [],
    summaries: [],
    structure: [],
    notes: [],
  };

  if (!databaseExists() && !dbPath) {
    return result;
  }

  const db = openDatabase(dbPath);

  try {
    const perCategory = Math.floor(limit / categories.length) + 5;

    for (const cat of categories) {
      const rows = db
        .prepare(
          `
        SELECT id, title, summary, importance, created_at
        FROM memories
        WHERE category = ?
        ORDER BY importance DESC, created_at DESC
        LIMIT ?
      `
        )
        .all(cat, perCategory) as RawMemoryRow[];

      result[cat] = rows.map((row) => ({
        id: row.id,
        category: cat,
        title: row.title,
        summary: row.summary,
        tags: [],
        importance: row.importance,
        createdAt: row.created_at,
      }));
    }

    db.close();
    return result;
  } catch (error) {
    db.close();
    return result;
  }
}

/**
 * Delete a memory by ID.
 */
export function deleteMemory(memoryId: string, dbPath?: string): DeleteResult {
  if (!databaseExists() && !dbPath) {
    return {
      success: false,
      error: 'Database not found',
    };
  }

  const db = openDatabase(dbPath);

  try {
    // Check if exists
    const row = db
      .prepare('SELECT id, title FROM memories WHERE id = ?')
      .get(memoryId) as { id: string; title: string } | undefined;

    if (!row) {
      db.close();
      return {
        success: false,
        error: `Memory '${memoryId}' not found`,
      };
    }

    const title = row.title;

    // Delete
    db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId);
    db.close();

    return {
      success: true,
      id: memoryId,
      title,
      message: `Memory '${title}' deleted`,
    };
  } catch (error) {
    db.close();
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: `Failed to delete memory: ${message}`,
    };
  }
}
