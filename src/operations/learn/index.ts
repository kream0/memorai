/**
 * Learn module - Intelligent documentation processing
 *
 * Uses Claude Code's Task tool to spawn Opus-powered agents for
 * extracting and organizing knowledge from documentation files.
 */

// Types
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
} from './types.js';

export {
  DEFAULT_CHUNKING,
  CHUNK_THRESHOLDS,
} from './types.js';

// Analysis (Phase 1)
export {
  analyzeFiles,
  hashManifest,
  readChunk,
  formatManifest,
} from './analyze.js';

// Extraction (Phase 2)
export {
  generateExtractionTasks,
  generateExtractorPrompt,
  parseExtractorResponse,
  mergeExtractionResults,
  batchTasks,
  formatExtractionSummary,
  filterByImportance,
  estimateProcessingTime,
} from './extract.js';
export type { ExtractionTask } from './extract.js';

// Synthesis (Phase 3)
export {
  generateSynthesizerPrompt,
  parseSynthesizerResponse,
  formatSynthesisSummary,
  formatMemoriesPreview,
  filterMemoriesByImportance,
  limitMemories,
  validateMemories,
  groupByCategory,
} from './synthesize.js';

// Checkpointing
export {
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
} from './checkpoint.js';

/**
 * Instructions for using the learn feature
 *
 * This feature must be run within Claude Code to access the Task tool.
 * The workflow is:
 *
 * 1. CLI calls analyzeFiles() to create a manifest
 * 2. CLI displays manifest and asks for confirmation
 * 3. For each chunk, CLI tells Claude Code to spawn learn-extractor agent
 * 4. Extraction results are collected and parsed
 * 5. CLI tells Claude Code to spawn learn-synthesizer agent
 * 6. Synthesized memories are stored via MemoraiClient
 *
 * Example CLI output:
 * ```
 * memorai learn "docs/*.md"
 *
 * Analyzing files...
 * Found 8 files (152KB, 3,485 lines)
 * Estimated: 12 chunks, ~6 minutes
 *
 * Processing Phase 1/3: Extraction
 *   [Use Task tool to spawn learn-extractor for chunk-0-0]
 *   [Use Task tool to spawn learn-extractor for chunk-1-0]
 *   ...
 *
 * Processing Phase 2/3: Synthesis
 *   [Use Task tool to spawn learn-synthesizer]
 *
 * Processing Phase 3/3: Storage
 *   Storing 42 memories...
 *
 * Complete!
 * ```
 */

/**
 * Check if running in Claude Code context
 *
 * The learn feature requires the Task tool which is only available
 * when running inside Claude Code.
 */
export function isInClaudeCodeContext(): boolean {
  // If we can detect Claude Code environment, return true
  // This is a heuristic - Claude Code typically sets certain env vars
  return (
    process.env.CLAUDE_CODE === '1' ||
    process.env.ANTHROPIC_API_KEY !== undefined ||
    process.env.USER_PROMPT !== undefined
  );
}

/**
 * Get usage instructions for the learn command
 */
export function getLearnInstructions(): string {
  return `
The 'memorai learn' command processes documentation files using AI agents.

This command must be run from within Claude Code because it uses the
Task tool to spawn extraction and synthesis agents.

Usage from within Claude Code:
  1. Start Claude Code: claude
  2. Run: memorai learn "docs/**/*.md"

The command will:
  1. Analyze the files and show a processing plan
  2. Spawn Opus-powered agents to extract knowledge
  3. Synthesize extractions into organized memories
  4. Store memories in the Memorai database

Options:
  --dry-run          Show what would be extracted without storing
  --preview          Review extractions before storing
  --max-files N      Limit number of files to process
  --max-memories N   Limit number of memories to create
  --importance-min N Only store memories with importance >= N
  --parallel N       Max concurrent extraction agents (default: 3)
  --resume FILE      Resume from a checkpoint file
`.trim();
}
