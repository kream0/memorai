// Main client export
export { MemoraiClient } from './client.js';

// Types
export type {
  Category,
  Memory,
  MemorySummary,
  SearchResult,
  StoreOptions,
  UpdateOptions,
  SearchOptions,
  ListOptions,
  MemoryStats,
  StoreResult,
  DeleteResult,
  MemoraiConfig,
  InitResult,
  BootstrapScanResult,
  ProjectStructure,
  CodePatterns,
  DocumentInfo,
  CommitInfo,
  TrackingFileHistory,
} from './types/memory.js';

export { CATEGORIES } from './types/memory.js';

// Database utilities (for advanced usage)
export {
  findDatabasePath,
  getDatabasePath,
  databaseExists,
  openDatabase,
  clearDatabasePathCache,
} from './db/connection.js';

export {
  initialize,
  initDatabase,
  createConfig,
  findProjectRoot,
} from './db/schema.js';

// Operations (for direct access)
export { storeMemory, updateMemory, generateId, generateSummary } from './operations/store.js';
export { search, searchFts, searchLike, getMemoryById, getRecent } from './operations/search.js';
export { getStats, listCategory, listAll, deleteMemory } from './operations/list.js';
export {
  scanProject,
  extractDocs,
  extractCommits,
  extractStructure,
  extractTracking,
  getProjectStructure,
  getCodePatterns,
  getDocumentationSummary,
  getRecentCommits,
  getTrackingFilesHistory,
} from './operations/bootstrap.js';
