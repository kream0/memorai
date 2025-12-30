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

// Context operations (for Claude Code hooks)
export {
  getContext,
  getSessionContext,
  getPromptContext,
  formatForClaude,
  scoreMemory,
  formatRelativeTime,
  estimateTokens,
} from './operations/context.js';

export type {
  ContextMode,
  ContextOptions,
  ContextResult,
  ScoredMemory,
} from './operations/context.js';

// Hooks operations (for Claude Code integration)
export {
  installGlobalHooks,
  uninstallGlobalHooks,
  areHooksInstalled,
  getClaudeSettingsPath,
} from './operations/hooks.js';

export type { HookInstallResult } from './operations/hooks.js';

// Learn operations (for AI-powered documentation processing)
export {
  analyzeFiles,
  hashManifest,
  readChunk,
  formatManifest,
  generateExtractionTasks,
  generateExtractorPrompt,
  parseExtractorResponse,
  mergeExtractionResults,
  batchTasks,
  formatExtractionSummary,
  filterByImportance,
  estimateProcessingTime,
  generateSynthesizerPrompt,
  parseSynthesizerResponse,
  formatSynthesisSummary,
  formatMemoriesPreview,
  filterMemoriesByImportance,
  limitMemories,
  validateMemories,
  groupByCategory,
  createCheckpoint,
  updateCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  isCheckpointValid,
  getRemainingChunks,
  formatCheckpointSummary,
  getDefaultCheckpointPath,
  deleteCheckpoint,
  getCompletionPercent,
  isInClaudeCodeContext,
  getLearnInstructions,
  DEFAULT_CHUNKING,
  CHUNK_THRESHOLDS,
} from './operations/learn/index.js';

export type {
  LearnOptions,
  LearnProgress,
  LearnResult,
  LearnMemoryInfo,
  LearnManifest,
  LearnFileInfo,
  LearnChunk,
  Extraction,
  ExtractionType,
  ExtractorResult,
  SynthesizerInput,
  SynthesizerResult,
  SynthesizedMemory,
  SkippedExtraction,
  LearnCheckpoint,
  ChunkingConfig,
  ExtractionTask,
} from './operations/learn/index.js';
