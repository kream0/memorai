import type { SQLQueryBindings } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import { databaseExists, openDatabase } from '../db/connection.js';
import type {
  StoreOptions,
  StoreResult,
  UpdateOptions,
} from '../types/memory.js';

type SqlParam = SQLQueryBindings;

/**
 * Generate a short unique ID (8 characters).
 */
export function generateId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Generate a brief summary from content.
 */
export function generateSummary(content: string, maxLength = 200): string {
  // Clean up content
  const trimmed = content.trim();

  // Try to get first paragraph
  const paragraphs = trimmed.split('\n\n');
  let firstPara = paragraphs[0]?.trim() ?? trimmed;

  // Remove markdown headers
  const lines = firstPara.split('\n');
  const cleanLines = lines.filter((l) => !l.startsWith('#'));
  firstPara = cleanLines.join(' ').trim();

  // Truncate if needed
  if (firstPara.length <= maxLength) {
    return firstPara;
  }

  // Try to break at sentence
  const truncated = firstPara.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');

  if (lastPeriod > maxLength / 2) {
    return truncated.slice(0, lastPeriod + 1);
  }

  // Break at word
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Store a new memory in the database.
 */
export function storeMemory(
  options: StoreOptions,
  dbPath?: string
): StoreResult {
  if (!databaseExists() && !dbPath) {
    return {
      success: false,
      error: 'Database not found. Run memorai init first.',
    };
  }

  const db = openDatabase(dbPath);

  try {
    const id = generateId();
    const summary = generateSummary(options.content);
    const now = new Date().toISOString();
    const tagsJson = options.tags ? JSON.stringify(options.tags) : null;
    const importance = options.importance ?? 5;

    const stmt = db.prepare(`
      INSERT INTO memories (
        id, category, title, content, summary,
        tags, importance, created_at, updated_at, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      options.category,
      options.title,
      options.content,
      summary,
      tagsJson,
      importance,
      now,
      now,
      options.sessionId ?? null
    );

    db.close();

    return {
      success: true,
      id,
      category: options.category,
      title: options.title,
      summary,
      importance,
      createdAt: now,
    };
  } catch (error) {
    db.close();
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: `Failed to store memory: ${message}`,
    };
  }
}

/**
 * Update an existing memory.
 */
export function updateMemory(
  memoryId: string,
  options: UpdateOptions,
  dbPath?: string
): StoreResult {
  if (!databaseExists() && !dbPath) {
    return {
      success: false,
      error: 'Database not found.',
    };
  }

  const db = openDatabase(dbPath);

  try {
    // Check if memory exists
    const existing = db
      .prepare('SELECT * FROM memories WHERE id = ?')
      .get(memoryId) as Record<string, unknown> | undefined;

    if (!existing) {
      db.close();
      return {
        success: false,
        error: `Memory ${memoryId} not found`,
      };
    }

    // Build update
    const updates: string[] = [];
    const params: SqlParam[] = [];

    if (options.content !== undefined) {
      updates.push('content = ?');
      params.push(options.content);
      updates.push('summary = ?');
      params.push(generateSummary(options.content));
    }

    if (options.title !== undefined) {
      updates.push('title = ?');
      params.push(options.title);
    }

    if (options.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(options.tags));
    }

    if (options.importance !== undefined) {
      updates.push('importance = ?');
      params.push(options.importance);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(memoryId);

    const stmt = db.prepare(
      `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`
    );
    stmt.run(...params);

    db.close();

    return {
      success: true,
      id: memoryId,
    };
  } catch (error) {
    db.close();
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: `Failed to update memory: ${message}`,
    };
  }
}
