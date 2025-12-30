import { resolve } from 'node:path';
import { getDatabasePath, databaseExists, clearDatabasePathCache } from './db/connection.js';
import { initialize, findProjectRoot } from './db/schema.js';
import { storeMemory, updateMemory } from './operations/store.js';
import { search, getMemoryById, getRecent } from './operations/search.js';
import { getStats, listCategory, listAll, deleteMemory } from './operations/list.js';
import {
  scanProject,
  extractDocs,
  extractCommits,
  extractStructure,
  extractTracking,
} from './operations/bootstrap.js';
import type {
  BootstrapScanResult,
  Category,
  DeleteResult,
  InitResult,
  ListOptions,
  Memory,
  MemoraiConfig,
  MemorySummary,
  MemoryStats,
  SearchOptions,
  SearchResult,
  StoreOptions,
  StoreResult,
  UpdateOptions,
} from './types/memory.js';

/**
 * MemoraiClient - Main interface for interacting with Memorai.
 */
export class MemoraiClient {
  private projectDir: string;
  private dbPath: string;
  private config: Required<MemoraiConfig>;

  constructor(options: MemoraiConfig = {}) {
    this.projectDir = options.projectDir
      ? resolve(options.projectDir)
      : findProjectRoot();
    this.dbPath = getDatabasePath(this.projectDir);
    this.config = {
      projectDir: this.projectDir,
      autoSummaryLength: options.autoSummaryLength ?? 200,
      maxResults: options.maxResults ?? 20,
      defaultImportance: options.defaultImportance ?? 5,
    };
  }

  /**
   * Check if the database is initialized.
   */
  isInitialized(): boolean {
    return databaseExists(this.projectDir);
  }

  /**
   * Initialize the Memorai database.
   */
  init(): InitResult {
    clearDatabasePathCache();
    const result = initialize(this.projectDir);
    this.dbPath = getDatabasePath(this.projectDir);
    return result;
  }

  /**
   * Store a new memory.
   */
  store(options: StoreOptions): StoreResult {
    const opts: StoreOptions = {
      ...options,
      importance: options.importance ?? this.config.defaultImportance,
    };
    return storeMemory(opts, this.dbPath);
  }

  /**
   * Update an existing memory.
   */
  update(memoryId: string, options: UpdateOptions): StoreResult {
    return updateMemory(memoryId, options, this.dbPath);
  }

  /**
   * Search memories using FTS5 with BM25 ranking.
   */
  search(options: SearchOptions): SearchResult[] {
    const opts: SearchOptions = {
      ...options,
      limit: options.limit ?? this.config.maxResults,
    };
    return search(opts, this.dbPath);
  }

  /**
   * Get a memory by ID.
   */
  get(memoryId: string, options?: { full?: boolean }): Memory | MemorySummary | null {
    return getMemoryById(memoryId, options?.full ?? false, this.dbPath);
  }

  /**
   * Get recent memories.
   */
  getRecent(limit?: number, category?: Category): MemorySummary[] {
    return getRecent(limit ?? this.config.maxResults, category, this.dbPath);
  }

  /**
   * Get memory statistics.
   */
  stats(): MemoryStats {
    return getStats(this.dbPath);
  }

  /**
   * List memories by category.
   */
  listCategory(category: Category, options?: ListOptions): MemorySummary[] {
    return listCategory(category, options, this.dbPath);
  }

  /**
   * List all memories grouped by category.
   */
  listAll(limit?: number): Record<Category, MemorySummary[]> {
    return listAll(limit ?? 50, this.dbPath);
  }

  /**
   * Delete a memory by ID.
   */
  delete(memoryId: string): DeleteResult {
    return deleteMemory(memoryId, this.dbPath);
  }

  /**
   * Scan project for bootstrap.
   */
  scan(days?: number): BootstrapScanResult {
    return scanProject(this.projectDir, days ?? 30);
  }

  /**
   * Extract documentation content.
   */
  extractDocs(): { documents: Array<{ file: string; title: string; content: string }>; total: number } {
    return extractDocs(this.projectDir);
  }

  /**
   * Extract recent commits.
   */
  extractCommits(days?: number, limit?: number): ReturnType<typeof extractCommits> {
    return extractCommits(this.projectDir, days ?? 30, limit ?? 50);
  }

  /**
   * Extract project structure.
   */
  extractStructure(): ReturnType<typeof extractStructure> {
    return extractStructure(this.projectDir);
  }

  /**
   * Extract tracking files history.
   */
  extractTracking(): ReturnType<typeof extractTracking> {
    return extractTracking(this.projectDir);
  }

  /**
   * Get the project directory.
   */
  getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Get the database path.
   */
  getDatabasePath(): string {
    return this.dbPath;
  }
}
