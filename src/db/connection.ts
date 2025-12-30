import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

let cachedDbPath: string | null = null;

/**
 * Find the .memorai/memory.db database file by walking up the directory tree.
 */
export function findDatabasePath(startDir?: string): string {
  const cwd = startDir ?? process.cwd();
  let searchPath = resolve(cwd);

  for (let i = 0; i < 10; i++) {
    const dbPath = join(searchPath, '.memorai', 'memory.db');
    if (existsSync(dbPath)) {
      return dbPath;
    }

    const parent = resolve(searchPath, '..');
    if (parent === searchPath) {
      break;
    }
    searchPath = parent;
  }

  // Return default path even if it doesn't exist
  return join(cwd, '.memorai', 'memory.db');
}

/**
 * Get cached database path or find it.
 */
export function getDatabasePath(projectDir?: string): string {
  if (projectDir) {
    return join(resolve(projectDir), '.memorai', 'memory.db');
  }

  if (!cachedDbPath) {
    cachedDbPath = findDatabasePath();
  }
  return cachedDbPath;
}

/**
 * Clear cached database path.
 */
export function clearDatabasePathCache(): void {
  cachedDbPath = null;
}

/**
 * Open a database connection.
 */
export function openDatabase(dbPath?: string): Database {
  const path = dbPath ?? getDatabasePath();
  return new Database(path);
}

/**
 * Check if the database exists.
 */
export function databaseExists(projectDir?: string): boolean {
  const dbPath = getDatabasePath(projectDir);
  return existsSync(dbPath);
}
