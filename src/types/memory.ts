/**
 * Valid memory categories
 */
export const CATEGORIES = [
  'architecture',
  'decisions',
  'reports',
  'summaries',
  'structure',
  'notes',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * A stored memory
 */
export interface Memory {
  id: string;
  category: Category;
  title: string;
  content: string;
  summary: string | null;
  tags: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
  sessionId: string | null;
}

/**
 * Memory without full content (for listings)
 */
export interface MemorySummary {
  id: string;
  category: Category;
  title: string;
  summary: string | null;
  tags: string[];
  importance: number;
  createdAt: string;
}

/**
 * Search result with relevance score
 */
export interface SearchResult extends MemorySummary {
  relevance: number;
}

/**
 * Options for storing a memory
 */
export interface StoreOptions {
  category: Category;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  sessionId?: string;
}

/**
 * Options for updating a memory
 */
export interface UpdateOptions {
  title?: string;
  content?: string;
  tags?: string[];
  importance?: number;
}

/**
 * Options for searching memories
 */
export interface SearchOptions {
  query: string;
  category?: Category;
  tags?: string[];
  importanceMin?: number;
  limit?: number;
}

/**
 * Options for listing memories
 */
export interface ListOptions {
  category?: Category;
  importanceMin?: number;
  limit?: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  initialized: boolean;
  total: number;
  byCategory: Record<Category, number>;
  recent: Array<{
    id: string;
    title: string;
    category: Category;
    createdAt: string;
  }>;
  important: Array<{
    id: string;
    title: string;
    category: Category;
    importance: number;
  }>;
}

/**
 * Result of storing a memory
 */
export interface StoreResult {
  success: boolean;
  id?: string;
  category?: Category;
  title?: string;
  summary?: string;
  importance?: number;
  createdAt?: string;
  error?: string;
}

/**
 * Result of deleting a memory
 */
export interface DeleteResult {
  success: boolean;
  id?: string;
  title?: string;
  message?: string;
  error?: string;
}

/**
 * Configuration for MemoraiClient
 */
export interface MemoraiConfig {
  projectDir?: string;
  autoSummaryLength?: number;
  maxResults?: number;
  defaultImportance?: number;
}

/**
 * Database initialization result
 */
export interface InitResult {
  success: boolean;
  projectRoot: string;
  database: string;
  config: string;
  createdNew: boolean;
  migrations: string[];
  message: string;
}

/**
 * Bootstrap scan result
 */
export interface BootstrapScanResult {
  scanDate: string;
  structure: ProjectStructure;
  patterns: CodePatterns;
  documentation: DocumentInfo[];
  recentActivity: {
    daysScanned: number;
    commits: CommitInfo[];
  };
  trackingHistory: TrackingFileHistory[];
  recommendations: string[];
}

/**
 * Project structure info
 */
export interface ProjectStructure {
  directories: string[];
  fileTypes: Record<string, number>;
  keyFiles: string[];
  totalFiles: number;
}

/**
 * Detected code patterns
 */
export interface CodePatterns {
  framework?: string;
  language?: string;
  testing?: string;
  database?: string;
  auth?: string;
}

/**
 * Documentation file info
 */
export interface DocumentInfo {
  file: string;
  title: string;
  sections: number;
  size: number;
}

/**
 * Commit info
 */
export interface CommitInfo {
  hash: string;
  subject: string;
  date: string;
  author: string;
  hasBody?: boolean;
  body?: string;
}

/**
 * Tracking file history
 */
export interface TrackingFileHistory {
  file: string;
  recentChanges: Array<{
    hash: string;
    subject: string;
    date: string;
  }>;
  currentContent?: string;
}
