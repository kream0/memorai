import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { InitResult } from '../types/memory.js';

/**
 * Find the project root directory.
 */
export function findProjectRoot(startDir?: string): string {
  const cwd = startDir ?? process.cwd();
  let searchPath = resolve(cwd);

  // Look for .claude or .git as project root indicators
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(searchPath, '.claude'))) {
      return searchPath;
    }
    if (existsSync(join(searchPath, '.git'))) {
      return searchPath;
    }

    const parent = resolve(searchPath, '..');
    if (parent === searchPath) {
      break;
    }
    searchPath = parent;
  }

  // Default to start directory
  return resolve(cwd);
}

interface TableInfo {
  name: string;
}

/**
 * Apply migrations to existing database.
 */
function migrateDatabase(db: Database): string[] {
  const migrations: string[] = [];

  // Get existing columns in memories table
  const memoryColumns = new Set<string>();
  const memoryInfo = db.query('PRAGMA table_info(memories)').all() as TableInfo[];
  for (const row of memoryInfo) {
    memoryColumns.add(row.name);
  }

  // Migration 1: Add summary column if missing
  if (!memoryColumns.has('summary')) {
    db.exec('ALTER TABLE memories ADD COLUMN summary TEXT');
    migrations.push("Added 'summary' column to memories table");
  }

  // Migration 2: Add session_id column if missing
  if (!memoryColumns.has('session_id')) {
    db.exec('ALTER TABLE memories ADD COLUMN session_id TEXT');
    migrations.push("Added 'session_id' column to memories table");
  }

  // Check tasks table for new columns
  const taskColumns = new Set<string>();
  try {
    const taskInfo = db.query('PRAGMA table_info(tasks)').all() as TableInfo[];
    for (const row of taskInfo) {
      taskColumns.add(row.name);
    }
  } catch {
    // Tasks table might not exist yet
  }

  if (taskColumns.size > 0) {
    // Migration 3: Add completion_criteria column to tasks
    if (!taskColumns.has('completion_criteria')) {
      db.exec('ALTER TABLE tasks ADD COLUMN completion_criteria TEXT');
      migrations.push("Added 'completion_criteria' column to tasks table");
    }

    // Migration 4: Add verification_result column to tasks
    if (!taskColumns.has('verification_result')) {
      db.exec('ALTER TABLE tasks ADD COLUMN verification_result TEXT');
      migrations.push("Added 'verification_result' column to tasks table");
    }

    // Migration 5: Add retry_count column to tasks
    if (!taskColumns.has('retry_count')) {
      db.exec('ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0');
      migrations.push("Added 'retry_count' column to tasks table");
    }

    // Migration 6: Add max_retries column to tasks
    if (!taskColumns.has('max_retries')) {
      db.exec('ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3');
      migrations.push("Added 'max_retries' column to tasks table");
    }

    // Migration 7: Add context_docs column to tasks
    if (!taskColumns.has('context_docs')) {
      db.exec('ALTER TABLE tasks ADD COLUMN context_docs TEXT');
      migrations.push("Added 'context_docs' column to tasks table");
    }

    // Migration 8: Add verified_at column to tasks
    if (!taskColumns.has('verified_at')) {
      db.exec('ALTER TABLE tasks ADD COLUMN verified_at TEXT');
      migrations.push("Added 'verified_at' column to tasks table");
    }
  }

  return migrations;
}

/**
 * Initialize the Memorai database schema.
 */
export function initDatabase(projectRoot: string): {
  dbPath: string;
  createdNew: boolean;
  migrations: string[];
} {
  const projectDir = resolve(projectRoot);
  const memoraiDir = join(projectDir, '.memorai');
  const dbPath = join(memoraiDir, 'memory.db');

  const alreadyExists = existsSync(dbPath);

  // Create directory
  mkdirSync(memoraiDir, { recursive: true });

  // Connect and create schema
  const db = new Database(dbPath);

  // Apply migrations to existing database
  let migrations: string[] = [];
  if (alreadyExists) {
    migrations = migrateDatabase(db);
  }

  // Create main memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK(category IN (
        'architecture', 'decisions', 'reports',
        'summaries', 'structure', 'notes'
      )),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      importance INTEGER DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      session_id TEXT
    )
  `);

  // Create FTS5 virtual table for full-text search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      title,
      content,
      summary,
      tags,
      content='memories',
      content_rowid='rowid'
    )
  `);

  // Create triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, title, content, summary, tags)
      VALUES (NEW.rowid, NEW.title, NEW.content, NEW.summary, NEW.tags);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, content, summary, tags)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.summary, OLD.tags);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, content, summary, tags)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.summary, OLD.tags);
      INSERT INTO memories_fts(rowid, title, content, summary, tags)
      VALUES (NEW.rowid, NEW.title, NEW.content, NEW.summary, NEW.tags);
    END
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_category
    ON memories(category)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_importance
    ON memories(importance DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_created
    ON memories(created_at DESC)
  `);

  // Create sessions table for tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      summary TEXT
    )
  `);

  // === AUTONOMOUS AGENT SYSTEM TABLES ===

  // Checkpoints for context recovery
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      current_task TEXT,
      queue_summary TEXT,
      pending_decisions TEXT,
      next_action TEXT,
      context_estimate INTEGER,
      instance_id TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp
    ON checkpoints(timestamp DESC)
  `);

  // Task queue (persistent across sessions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN (
        'pending', 'in_progress', 'blocked', 'done', 'verified', 'failed', 'human_owned'
      )),
      priority INTEGER DEFAULT 5 CHECK(priority >= 1 AND priority <= 10),
      depends_on TEXT,
      assigned_worker TEXT,
      result TEXT,
      blockers TEXT,
      completion_criteria TEXT,
      verification_result TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      context_docs TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      verified_at TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON tasks(status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_priority
    ON tasks(priority DESC)
  `);

  // Human interaction queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS human_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN (
        'question', 'approval', 'override', 'steer', 'info'
      )),
      content TEXT NOT NULL,
      options TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN (
        'low', 'medium', 'high', 'critical'
      )),
      blocking INTEGER DEFAULT 0,
      from_agent TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN (
        'pending', 'responded', 'expired'
      )),
      response TEXT,
      created_at TEXT NOT NULL,
      responded_at TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_human_queue_status
    ON human_queue(status)
  `);

  // Events log (external triggers, hooks, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      processed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_processed
    ON events(processed, created_at DESC)
  `);

  db.close();

  return {
    dbPath,
    createdNew: !alreadyExists,
    migrations,
  };
}

/**
 * Create the default config.json file.
 */
export function createConfig(projectRoot: string): string {
  const projectDir = resolve(projectRoot);
  const configPath = join(projectDir, '.memorai', 'config.json');

  if (existsSync(configPath)) {
    return configPath;
  }

  const config = {
    version: '1.0',
    categories: [
      'architecture',
      'decisions',
      'reports',
      'summaries',
      'structure',
      'notes',
    ],
    defaultImportance: 5,
    maxResults: 20,
    autoSummaryLength: 200,
  };

  // Ensure directory exists
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  return configPath;
}

/**
 * Initialize Memorai for a project.
 */
export function initialize(projectDir?: string): InitResult {
  const projectRoot = projectDir ? resolve(projectDir) : findProjectRoot();

  // Initialize database
  const { dbPath, createdNew, migrations } = initDatabase(projectRoot);

  // Create config
  const configPath = createConfig(projectRoot);

  // Build message
  let message: string;
  if (createdNew) {
    message = 'Memorai initialized successfully';
  } else if (migrations.length > 0) {
    message = `Memorai database migrated: ${migrations.join(', ')}`;
  } else {
    message = 'Memorai database already exists';
  }

  return {
    success: true,
    projectRoot,
    database: dbPath,
    config: configPath,
    createdNew,
    migrations,
    message,
  };
}
