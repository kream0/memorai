/**
 * Learn feature types
 *
 * Types for the memorai learn command that processes documentation
 * files using Opus-powered agents.
 */

import type { Category } from '../../types/memory.js';

/**
 * Options for the learn command
 */
export interface LearnOptions {
  /** Glob pattern or array of file paths */
  input: string | string[];
  /** Analyze only, don't store memories */
  dryRun?: boolean;
  /** Show extractions before storing */
  preview?: boolean;
  /** Maximum files to process */
  maxFiles?: number;
  /** Maximum memories to create */
  maxMemories?: number;
  /** Minimum importance threshold (1-10) */
  importanceMin?: number;
  /** Max concurrent extraction agents */
  parallel?: number;
  /** Path to checkpoint file for resumption */
  resumeFrom?: string;
  /** Progress callback */
  onProgress?: (progress: LearnProgress) => void;
}

/**
 * Progress update during learning
 */
export interface LearnProgress {
  phase: 'analyze' | 'extract' | 'synthesize' | 'store';
  current: number;
  total: number;
  currentFile?: string;
  message: string;
}

/**
 * Result of the learn operation
 */
export interface LearnResult {
  success: boolean;
  filesProcessed: number;
  chunksProcessed: number;
  extractionsTotal: number;
  memoriesCreated: number;
  memoriesSkipped: number;
  byCategory: Record<Category, number>;
  warnings: string[];
  errors: string[];
  durationMs: number;
  /** Memories created (when not dry run) */
  memories?: LearnMemoryInfo[];
  /** Checkpoint for resumption */
  checkpoint?: LearnCheckpoint;
}

/**
 * Info about a created memory
 */
export interface LearnMemoryInfo {
  id: string;
  category: Category;
  title: string;
  sourceFiles: string[];
  importance: number;
}

/**
 * File manifest for processing
 */
export interface LearnManifest {
  files: LearnFileInfo[];
  totalSize: number;
  totalLines: number;
  estimatedChunks: number;
  createdAt: string;
}

/**
 * Information about a file to process
 */
export interface LearnFileInfo {
  path: string;
  relativePath: string;
  size: number;
  lines: number;
  chunks: LearnChunk[];
  priority: number;
}

/**
 * A chunk of a file to process
 */
export interface LearnChunk {
  id: string;
  fileIndex: number;
  startLine: number;
  endLine: number;
  header?: string;
  estimatedTokens: number;
}

/**
 * Extraction from a single file/chunk
 */
export interface Extraction {
  type: ExtractionType;
  title: string;
  content: string;
  sourceFile: string;
  sourceSection: string;
  startLine: number;
  endLine: number;
  importance: number;
  tags: string[];
  relatedTo: string[];
}

/**
 * Types of knowledge that can be extracted
 */
export type ExtractionType =
  | 'concept'      // Core ideas, definitions, terminology
  | 'decision'     // Design decisions with rationale
  | 'pattern'      // Reusable patterns, conventions
  | 'config'       // Important settings, options
  | 'relationship' // How concepts relate
  | 'example'      // Illustrative examples
  | 'warning';     // Gotchas, pitfalls, caveats

/**
 * Result from an extractor agent
 */
export interface ExtractorResult {
  file: string;
  chunk?: {
    id: string;
    startLine: number;
    endLine: number;
  };
  extractions: Extraction[];
  crossReferences: string[];
  processingTime: number;
  error?: string;
}

/**
 * Input for the synthesizer agent
 */
export interface SynthesizerInput {
  extractions: Extraction[];
  projectContext: string;
  existingMemoryTitles: string[];
}

/**
 * Result from the synthesizer agent
 */
export interface SynthesizerResult {
  memories: SynthesizedMemory[];
  skipped: SkippedExtraction[];
  warnings: string[];
  processingTime: number;
  error?: string;
}

/**
 * A memory ready to be stored
 */
export interface SynthesizedMemory {
  category: Category;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  sourceFiles: string[];
  relatedMemories: string[];
}

/**
 * An extraction that was skipped
 */
export interface SkippedExtraction {
  reason: 'duplicate' | 'trivial' | 'contradiction' | 'low_importance';
  title: string;
  originalFile: string;
}

/**
 * Checkpoint for resuming interrupted processing
 */
export interface LearnCheckpoint {
  manifestHash: string;
  manifest: LearnManifest;
  completedChunks: string[];
  pendingExtractions: Extraction[];
  createdAt: string;
  lastUpdated: string;
}

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  /** Max tokens per chunk (rough estimate) */
  maxTokens: number;
  /** Lines of overlap between chunks */
  overlapLines: number;
  /** Prefer splitting at markdown headers */
  splitAtHeaders: boolean;
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING: ChunkingConfig = {
  maxTokens: 8000,
  overlapLines: 50,
  splitAtHeaders: true,
};

/**
 * File size thresholds for chunking strategy
 */
export const CHUNK_THRESHOLDS = {
  /** Files under this size are processed whole */
  SMALL: 8 * 1024,  // 8KB
  /** Files under this size split at headers */
  MEDIUM: 32 * 1024, // 32KB
  /** Files over MEDIUM use fixed chunks */
} as const;
