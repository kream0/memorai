/**
 * Codebase scan feature types
 *
 * Types for the memorai scan command that analyzes codebases
 * using parallel Opus-powered agents with intelligent partitioning.
 */

import type { Category } from '../../types/memory.js';

// ============================================================================
// Command Options & Results
// ============================================================================

/**
 * Options for the scan command
 */
export interface ScanOptions {
  /** Path to codebase root */
  path: string;
  /** Analyze only, don't spawn agents */
  dryRun?: boolean;
  /** Show insights before storing */
  preview?: boolean;
  /** Maximum number of partitions */
  maxPartitions?: number;
  /** Max concurrent exploration agents */
  parallel?: number;
  /** Include file patterns */
  include?: string[];
  /** Exclude file patterns */
  exclude?: string[];
  /** Minimum importance threshold (1-10) */
  importanceMin?: number;
  /** Maximum memories to create */
  maxMemories?: number;
  /** Resume from checkpoint */
  resume?: boolean;
  /** Progress callback */
  onProgress?: (progress: ScanProgress) => void;
}

/**
 * Progress update during scanning
 */
export interface ScanProgress {
  phase: 'analyze' | 'partition' | 'explore' | 'synthesize' | 'ingest';
  current: number;
  total: number;
  currentPartition?: string;
  message: string;
}

/**
 * Result of the scan operation
 */
export interface ScanResult {
  success: boolean;
  totalFiles: number;
  totalTokens: number;
  partitionsCreated: number;
  partitionsExplored: number;
  insightsExtracted: number;
  memoriesCreated: number;
  memoriesSkipped: number;
  byCategory: Record<Category, number>;
  warnings: string[];
  errors: string[];
  durationMs: number;
  /** Memories created (when not dry run) */
  memories?: ScanMemoryInfo[];
  /** Checkpoint for resumption */
  checkpoint?: CodebaseCheckpoint;
}

/**
 * Info about a created memory from scan
 */
export interface ScanMemoryInfo {
  id: string;
  category: Category;
  title: string;
  scope: InsightScope;
  importance: number;
  evidence: string[];
}

// ============================================================================
// Codebase Analysis
// ============================================================================

/**
 * Complete manifest of a codebase analysis
 */
export interface CodebaseManifest {
  /** Absolute path to project root */
  projectDir: string;
  /** Project name (from package.json, go.mod, etc.) */
  projectName: string;
  /** Total source files found */
  totalFiles: number;
  /** Estimated total tokens */
  totalTokens: number;
  /** Directory tree with token counts */
  structure: DirectoryNode;
  /** Language breakdown by percentage */
  languages: LanguageBreakdown;
  /** Detected entry points */
  entryPoints: string[];
  /** Config files found */
  configFiles: string[];
  /** Computed partitions */
  partitions: PartitionSpec[];
  /** Global context for all agents */
  globalContext: GlobalContext;
  /** Files that were skipped (too large) */
  skippedFiles: SkippedFile[];
  /** Hash for checkpoint validation */
  hash: string;
  /** When manifest was created */
  createdAt: string;
}

/**
 * Directory node in the structure tree
 */
export interface DirectoryNode {
  /** Directory path relative to project root */
  path: string;
  /** Files directly in this directory */
  files: FileInfo[];
  /** Subdirectories */
  children: DirectoryNode[];
  /** Total tokens in this directory (recursive) */
  totalTokens: number;
  /** Primary language in this directory */
  primaryLanguage: string;
  /** Number of files (recursive) */
  fileCount: number;
}

/**
 * Information about a source file
 */
export interface FileInfo {
  /** Absolute path */
  path: string;
  /** Path relative to project root */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Estimated token count */
  tokens: number;
  /** Detected language */
  language: string;
  /** Line count */
  lines: number;
}

/**
 * File that was skipped during analysis
 */
export interface SkippedFile {
  path: string;
  reason: 'too_large' | 'binary' | 'excluded';
  size?: number;
  tokens?: number;
}

/**
 * Language breakdown statistics
 */
export interface LanguageBreakdown {
  /** Language -> percentage (0-100) */
  [language: string]: number;
}

/**
 * Global context shared with all agents
 */
export interface GlobalContext {
  /** Project name */
  projectName: string;
  /** Project description (from README or package.json) */
  description: string;
  /** Simplified directory structure */
  structureOverview: string;
  /** Primary languages used */
  languages: string[];
  /** Detected frameworks */
  frameworks: string[];
  /** Entry point files */
  entryPoints: string[];
  /** Summary of config patterns */
  configSummary: string;
  /** README content (truncated if needed) */
  readme?: string;
  /** Total partitions for context */
  totalPartitions: number;
}

// ============================================================================
// Partitioning
// ============================================================================

/**
 * Specification for a partition to be analyzed
 */
export interface PartitionSpec {
  /** Unique partition ID (e.g., "partition-01") */
  id: string;
  /** Human-readable description */
  description: string;
  /** Directories included in this partition */
  directories: string[];
  /** Specific files to include */
  files: string[];
  /** Estimated token count */
  estimatedTokens: number;
  /** Other partitions this may depend on */
  relatedPartitions: string[];
  /** Priority for processing order (higher = first) */
  priority: number;
}

/**
 * Partitioning mode
 */
export type PartitionMode = 'auto' | 'directory' | 'flat';

/**
 * Partitioning configuration
 */
export interface PartitionConfig {
  /** Partitioning strategy */
  mode: PartitionMode;
  /** Target tokens per partition */
  targetTokens: number;
  /** Minimum tokens for a partition */
  minTokens: number;
  /** Maximum tokens per partition */
  maxTokens: number;
  /** Maximum number of partitions */
  maxPartitions: number;
}

/**
 * Default partition configuration
 */
export const DEFAULT_PARTITION_CONFIG: PartitionConfig = {
  mode: 'auto',
  targetTokens: 80000,   // ~80k tokens target
  minTokens: 10000,      // Don't create tiny partitions
  maxTokens: 100000,     // Stay under agent context limit
  maxPartitions: 50,     // Reasonable upper bound
};

// ============================================================================
// Exploration (Agent Output)
// ============================================================================

/**
 * Result from an explorer agent
 */
export interface PartitionAnalysis {
  /** Which partition was analyzed */
  partitionId: string;
  /** Description of the partition */
  partitionDescription: string;
  /** Extracted insights */
  insights: CodeInsight[];
  /** Key files identified */
  keyFiles: KeyFile[];
  /** References to other parts of codebase */
  crossReferences: CrossReference[];
  /** Confidence in analysis (1-10) */
  confidence: number;
  /** Coverage of partition (1-10) */
  coverage: number;
  /** Processing time in ms */
  processingTime: number;
  /** Error if analysis failed */
  error?: string;
}

/**
 * A single insight extracted from code
 */
export interface CodeInsight {
  /** Scope of the insight */
  scope: InsightScope;
  /** Type of insight */
  type: InsightType;
  /** Short title (5-15 words) */
  title: string;
  /** The actual insight (200-800 chars) */
  insight: string;
  /** File paths that support this insight */
  evidence: string[];
  /** Importance (1-10) */
  importance: number;
  /** Tags for categorization */
  tags: string[];
  /** Related areas of the codebase */
  relatedAreas: string[];
}

/**
 * Scope of an insight
 */
export type InsightScope = 'project' | 'module' | 'file';

/**
 * Type of insight extracted
 */
export type InsightType =
  | 'architecture'   // System design, structure
  | 'pattern'        // Reusable patterns, conventions
  | 'convention'     // Naming, style, organization rules
  | 'component'      // Key classes/functions/modules
  | 'dataflow'       // How data moves through system
  | 'dependency'     // Critical external dependencies
  | 'gotcha'         // Non-obvious behavior, traps
  | 'decision'       // Technical decisions with rationale
  | 'integration';   // How parts connect together

/**
 * A key file identified during exploration
 */
export interface KeyFile {
  /** File path relative to project root */
  path: string;
  /** Role of this file */
  role: string;
  /** Importance (1-10) */
  importance: number;
}

/**
 * Cross-reference to another part of codebase
 */
export interface CrossReference {
  /** Source partition */
  fromPartition: string;
  /** Target area (directory or concept) */
  toArea: string;
  /** Type of relationship */
  relationship: 'imports' | 'extends' | 'implements' | 'uses' | 'depends_on';
}

// ============================================================================
// Synthesis
// ============================================================================

/**
 * Input for the synthesizer agent
 */
export interface SynthesizerInput {
  /** All partition analyses */
  partitionAnalyses: PartitionAnalysis[];
  /** Global context */
  globalContext: GlobalContext;
  /** Existing memory titles (to avoid duplicates) */
  existingMemoryTitles: string[];
}

/**
 * Result from the synthesizer agent
 */
export interface SynthesizerResult {
  /** Unified knowledge structure */
  knowledge: CodebaseKnowledge;
  /** Skipped insights with reasons */
  skipped: SkippedInsight[];
  /** Warnings during synthesis */
  warnings: string[];
  /** Processing time in ms */
  processingTime: number;
  /** Error if synthesis failed */
  error?: string;
}

/**
 * Unified codebase knowledge structure
 */
export interface CodebaseKnowledge {
  /** Project overview */
  overview: string;
  /** Architecture insights (importance 8-10) */
  architecture: ArchitectureKnowledge;
  /** Cross-cutting patterns (importance 6-8) */
  patterns: PatternKnowledge[];
  /** Code conventions (importance 6-7) */
  conventions: ConventionKnowledge[];
  /** Module-level insights (importance 4-6) */
  modules: ModuleKnowledge[];
  /** Detailed component info (importance 3-5) */
  components: ComponentKnowledge[];
  /** Gotchas and warnings (importance 5-7) */
  gotchas: GotchaKnowledge[];
}

/**
 * Architecture-level knowledge
 */
export interface ArchitectureKnowledge {
  /** Architecture style */
  style: string;
  /** Architectural layers */
  layers: string[];
  /** Data flow description */
  dataFlow: string;
  /** Key architectural decisions */
  keyDecisions: string[];
  /** Evidence files */
  evidence: string[];
}

/**
 * Pattern knowledge
 */
export interface PatternKnowledge {
  /** Pattern title */
  title: string;
  /** Pattern description */
  description: string;
  /** Scope of the pattern */
  scope: InsightScope;
  /** Where pattern is used */
  usedIn: string[];
  /** Tags */
  tags: string[];
}

/**
 * Convention knowledge
 */
export interface ConventionKnowledge {
  /** Convention title */
  title: string;
  /** Convention description */
  description: string;
  /** Examples */
  examples: string[];
  /** Tags */
  tags: string[];
}

/**
 * Module-level knowledge
 */
export interface ModuleKnowledge {
  /** Module name/path */
  name: string;
  /** Module purpose */
  purpose: string;
  /** Key files in module */
  keyFiles: string[];
  /** Dependencies */
  dependencies: string[];
  /** Public API summary */
  publicApi?: string;
}

/**
 * Component knowledge
 */
export interface ComponentKnowledge {
  /** Component name */
  name: string;
  /** File path */
  path: string;
  /** Component role */
  role: string;
  /** Important methods/functions */
  keyMethods?: string[];
}

/**
 * Gotcha/warning knowledge
 */
export interface GotchaKnowledge {
  /** Gotcha title */
  title: string;
  /** Gotcha description */
  description: string;
  /** Where this gotcha applies */
  appliesTo: string[];
  /** Tags */
  tags: string[];
  /** Importance (elevated for gotchas) */
  importance: number;
}

/**
 * An insight that was skipped during synthesis
 */
export interface SkippedInsight {
  /** Reason for skipping */
  reason: 'duplicate' | 'trivial' | 'contradiction' | 'low_importance' | 'subsumed';
  /** Original insight title */
  title: string;
  /** Source partition */
  sourcePartition: string;
}

// ============================================================================
// Checkpoint
// ============================================================================

/**
 * Checkpoint for resuming interrupted scan
 */
export interface CodebaseCheckpoint {
  /** Hash of manifest (detect codebase changes) */
  manifestHash: string;
  /** The manifest */
  manifest: CodebaseManifest;
  /** Current phase */
  phase: 'analysis' | 'exploration' | 'synthesis' | 'ingestion';
  /** Completed partitions */
  completedPartitions: string[];
  /** Results from completed partitions */
  partitionResults: Record<string, PartitionAnalysis>;
  /** Whether synthesis is complete */
  synthesisComplete: boolean;
  /** Synthesized knowledge (if synthesis done) */
  knowledge: CodebaseKnowledge | null;
  /** Stored memory IDs */
  memoriesStored: string[];
  /** When checkpoint was created */
  createdAt: string;
  /** Last update time */
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default file patterns to include
 */
export const DEFAULT_INCLUDE_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.py',
  '**/*.go',
  '**/*.rs',
  '**/*.java',
  '**/*.kt',
  '**/*.swift',
  '**/*.c',
  '**/*.cpp',
  '**/*.h',
  '**/*.hpp',
  '**/*.cs',
  '**/*.rb',
  '**/*.php',
  '**/*.vue',
  '**/*.svelte',
];

/**
 * Default file patterns to exclude
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.memorai/**',
  '**/target/**',
  '**/bin/**',
  '**/obj/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.generated.*',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Cargo.lock',
  '**/go.sum',
];

/**
 * Maximum tokens for a single file before skipping
 */
export const MAX_FILE_TOKENS = 100000;

/**
 * Token estimation: ~4 characters per token
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Map insight types to memorai categories
 */
export const INSIGHT_TO_CATEGORY: Record<InsightType, Category> = {
  architecture: 'architecture',
  pattern: 'architecture',
  convention: 'structure',
  component: 'notes',
  dataflow: 'architecture',
  dependency: 'notes',
  gotcha: 'notes',
  decision: 'decisions',
  integration: 'architecture',
};

/**
 * Importance adjustments by insight type
 */
export const IMPORTANCE_ADJUSTMENTS: Record<InsightType, number> = {
  architecture: 2,   // Boost architecture insights
  pattern: 1,
  convention: 0,
  component: -1,
  dataflow: 1,
  dependency: 0,
  gotcha: 2,         // Gotchas are valuable!
  decision: 2,       // Decisions are valuable!
  integration: 1,
};
