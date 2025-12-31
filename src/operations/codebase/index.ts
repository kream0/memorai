/**
 * Codebase Scan Module
 *
 * AI-powered codebase analysis using parallel exploration agents.
 * Extracts architectural knowledge and stores as structured memories.
 *
 * ## Usage
 *
 * ```bash
 * memorai scan [path]
 *   --dry-run        Analyze only, show partition plan
 *   --preview        Show insights before storing
 *   --parallel <n>   Max concurrent agents (default: 3)
 *   --resume         Resume from checkpoint
 * ```
 *
 * ## Architecture
 *
 * 4-Phase Pipeline:
 * 1. **Analyze** - Scan codebase, estimate tokens, create partitions
 * 2. **Explore** - Spawn parallel agents to analyze each partition
 * 3. **Synthesize** - Merge findings, deduplicate, build knowledge
 * 4. **Ingest** - Transform to memories and store
 *
 * ## Agent Integration
 *
 * This module generates prompts for:
 * - `.claude/agents/codebase-explorer.md` - Analyzes partitions
 * - `.claude/agents/codebase-synthesizer.md` - Merges findings
 *
 * The CLI outputs instructions for the parent Claude Code session
 * to spawn agents via the Task tool.
 */

// Types
export type {
  ScanOptions,
  ScanProgress,
  ScanResult,
  ScanMemoryInfo,
  CodebaseManifest,
  DirectoryNode,
  FileInfo,
  SkippedFile,
  LanguageBreakdown,
  GlobalContext,
  PartitionSpec,
  PartitionMode,
  PartitionConfig,
  PartitionAnalysis,
  CodeInsight,
  InsightScope,
  InsightType,
  KeyFile,
  CrossReference,
  SynthesizerResult,
  CodebaseKnowledge,
  ArchitectureKnowledge,
  PatternKnowledge,
  ConventionKnowledge,
  ModuleKnowledge,
  ComponentKnowledge,
  GotchaKnowledge,
  SkippedInsight,
  CodebaseCheckpoint,
} from './types.js';

// Constants
export {
  DEFAULT_INCLUDE_PATTERNS,
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_PARTITION_CONFIG,
  MAX_FILE_TOKENS,
  CHARS_PER_TOKEN,
  INSIGHT_TO_CATEGORY,
  IMPORTANCE_ADJUSTMENTS,
} from './types.js';

// Analysis
export {
  analyzeCodebase,
  getAllFiles,
  formatManifestSummary,
} from './analyze.js';

// Partitioning
export {
  createPartitions,
  formatPartitionSummary,
} from './partition.js';

// Exploration
export {
  generateExplorationTasks,
  batchTasks,
  generateExplorerPrompt,
  generateTaskSummary,
  parseExplorerResponse,
  mergeAnalysisResults,
  estimateExplorationTime,
  formatExplorationProgress,
  generateExplorationInstructions,
} from './explore.js';
export type { ExplorationTask } from './explore.js';

// Synthesis
export {
  generateSynthesizerPrompt,
  parseSynthesizerResponse,
  synthesizeLocally,
  generateSynthesisInstructions,
  formatSynthesisResult,
} from './synthesize.js';
export type { SynthesizerInput } from './synthesize.js';

// Ingestion
export {
  knowledgeToMemories,
  filterMemories,
  ingestKnowledge,
  adjustImportance,
  getCategoryForType,
  formatIngestionResult,
  previewMemories,
  DEFAULT_INGESTION_OPTIONS,
} from './ingest.js';
export type { IngestionResult, IngestionOptions } from './ingest.js';

// Checkpointing
export {
  CHECKPOINT_FILENAME,
  getCheckpointPath,
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  isCheckpointValid,
  updateCheckpointPartition,
  updateCheckpointSynthesis,
  updateCheckpointMemories,
  getRemainingPartitions,
  getCompletionPercent,
  deleteCheckpoint,
  formatCheckpointStatus,
  shouldResume,
  getResumedAnalyses,
} from './checkpoint.js';

/**
 * Quick reference for CLI usage instructions
 */
export const SCAN_USAGE = `
memorai scan - Analyze codebase and extract knowledge as memories

USAGE:
  memorai scan [path] [options]

OPTIONS:
  --dry-run              Analyze only, show partition plan (no agents)
  --preview              Show insights before storing memories
  --partitions <n>       Max partitions (default: auto-detect)
  --parallel <n>         Max concurrent agents (default: 3)
  --include <glob>       Include file patterns
  --exclude <glob>       Exclude file patterns
  --min-importance <n>   Filter threshold (default: 3)
  --max-memories <n>     Limit stored memories (default: 100)
  --resume               Resume from checkpoint
  --output <file>        Save analysis report
  --json                 Output structured JSON

EXAMPLES:
  # Dry run to see partition plan
  memorai scan . --dry-run

  # Full analysis with preview
  memorai scan /path/to/project --preview

  # Resume interrupted scan
  memorai scan . --resume

  # Custom filtering
  memorai scan . --include "src/**/*.ts" --exclude "**/*.test.ts"
`.trim();

/**
 * Instructions for automated scanning
 */
export const SCAN_INSTRUCTIONS = `
## How Codebase Scanning Works

1. **Analysis Phase** (local, fast)
   - Scans directory structure
   - Estimates token counts
   - Creates intelligent partitions

2. **Exploration Phase** (parallel agents)
   - Each partition gets an explorer agent
   - Agents reason about code (like plan mode)
   - Outputs structured insights

3. **Synthesis Phase** (single agent)
   - Merges findings from all explorers
   - Deduplicates and organizes
   - Builds knowledge hierarchy

4. **Ingestion Phase** (local)
   - Transforms insights to memories
   - Stores in memorai database
   - Ready for future sessions

## Agent Definitions

Explorer: .claude/agents/codebase-explorer.md
Synthesizer: .claude/agents/codebase-synthesizer.md
`.trim();
