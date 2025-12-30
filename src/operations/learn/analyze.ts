/**
 * Phase 1: Analysis
 *
 * Scans input files, calculates sizes, and creates a processing manifest
 * with chunking strategy for each file.
 */

import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  LearnManifest,
  LearnFileInfo,
  LearnChunk,
  ChunkingConfig,
} from './types.js';
import { DEFAULT_CHUNKING, CHUNK_THRESHOLDS } from './types.js';

/**
 * Analyze files and create a processing manifest
 */
export async function analyzeFiles(
  input: string | string[],
  projectDir: string,
  maxFiles?: number
): Promise<LearnManifest> {
  // Resolve input to file paths
  const filePaths = await resolveInput(input, projectDir);

  // Apply max files limit
  const limitedPaths = maxFiles ? filePaths.slice(0, maxFiles) : filePaths;

  // Analyze each file
  const files: LearnFileInfo[] = [];
  let totalSize = 0;
  let totalLines = 0;
  let estimatedChunks = 0;

  for (let i = 0; i < limitedPaths.length; i++) {
    const filePath = limitedPaths[i];
    if (filePath) {
      const fileInfo = analyzeFile(filePath, projectDir, i);
      files.push(fileInfo);
      totalSize += fileInfo.size;
      totalLines += fileInfo.lines;
      estimatedChunks += fileInfo.chunks.length;
    }
  }

  // Sort by priority (higher first)
  files.sort((a, b) => b.priority - a.priority);

  return {
    files,
    totalSize,
    totalLines,
    estimatedChunks,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Resolve input pattern(s) to file paths
 */
async function resolveInput(
  input: string | string[],
  projectDir: string
): Promise<string[]> {
  const patterns = Array.isArray(input) ? input : [input];
  const allFiles: string[] = [];

  for (const pattern of patterns) {
    // Check if it's a direct file path
    const fullPath = resolve(projectDir, pattern);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      if (fullPath.endsWith('.md') || fullPath.endsWith('.mdx')) {
        allFiles.push(fullPath);
      }
      continue;
    }

    // Handle glob patterns by walking directories
    const files = await findMarkdownFiles(projectDir, pattern);
    allFiles.push(...files);
  }

  // Remove duplicates
  return [...new Set(allFiles)];
}

/**
 * Find markdown files matching a pattern
 */
async function findMarkdownFiles(
  baseDir: string,
  pattern: string
): Promise<string[]> {
  const results: string[] = [];

  // Extract directory from pattern (e.g., "docs/**/*.md" -> "docs")
  const parts = pattern.split('/');
  let searchDir = baseDir;

  // Find the concrete directory prefix
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part && !part.includes('*') && !part.includes('?')) {
      const testPath = join(searchDir, part);
      if (existsSync(testPath) && statSync(testPath).isDirectory()) {
        searchDir = testPath;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Recursively find markdown files
  const walkDir = (dir: string, depth: number = 0): void => {
    if (depth > 5) return; // Max depth to prevent infinite loops

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip common ignore patterns
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.memorai'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath, depth + 1);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))
        ) {
          // Check if file matches pattern
          if (matchesPattern(fullPath, baseDir, pattern)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors etc.
    }
  };

  walkDir(searchDir);
  return results;
}

/**
 * Simple pattern matching for file paths
 */
function matchesPattern(
  filePath: string,
  baseDir: string,
  pattern: string
): boolean {
  const relativePath = relative(baseDir, filePath);

  // Convert glob pattern to regex
  // ** matches any path segments
  // * matches any characters except /
  let regexPattern = pattern
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*')
    .replace(/\?/g, '.');

  // Handle exact matches
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return relativePath === pattern || filePath === pattern;
  }

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(relativePath);
}

/**
 * Analyze a single file and create chunks
 */
function analyzeFile(
  filePath: string,
  projectDir: string,
  index: number
): LearnFileInfo {
  const stats = statSync(filePath);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const fileInfo: LearnFileInfo = {
    path: filePath,
    relativePath: relative(projectDir, filePath),
    size: stats.size,
    lines: lines.length,
    chunks: [],
    priority: calculatePriority(filePath, stats.size),
  };

  // Create chunks based on file size
  if (stats.size < CHUNK_THRESHOLDS.SMALL) {
    // Small file: process whole
    fileInfo.chunks = [createWholeFileChunk(index, lines.length)];
  } else if (stats.size < CHUNK_THRESHOLDS.MEDIUM) {
    // Medium file: split at headers
    fileInfo.chunks = createHeaderChunks(content, index, DEFAULT_CHUNKING);
  } else {
    // Large file: fixed-size chunks with overlap
    fileInfo.chunks = createFixedChunks(
      lines.length,
      index,
      DEFAULT_CHUNKING
    );
  }

  return fileInfo;
}

/**
 * Calculate file priority (higher = process first)
 */
function calculatePriority(filePath: string, size: number): number {
  const name = basename(filePath).toLowerCase();
  let priority = 50; // Default

  // High priority files
  if (name === 'readme.md') priority = 100;
  else if (name === 'claude.md') priority = 95;
  else if (name === 'architecture.md') priority = 90;
  else if (name.includes('overview')) priority = 85;
  else if (name.includes('getting-started')) priority = 80;
  else if (name.includes('guide')) priority = 70;

  // Lower priority for large files (may be reference/API docs)
  if (size > 50 * 1024) priority -= 10;

  // Lower priority for example/test files
  if (name.includes('example') || name.includes('test')) priority -= 20;

  return priority;
}

/**
 * Create a single chunk for the whole file
 */
function createWholeFileChunk(fileIndex: number, totalLines: number): LearnChunk {
  return {
    id: `chunk-${fileIndex}-0`,
    fileIndex,
    startLine: 1,
    endLine: totalLines,
    estimatedTokens: Math.ceil(totalLines * 10), // Rough estimate
  };
}

/**
 * Create chunks split at markdown headers
 */
function createHeaderChunks(
  content: string,
  fileIndex: number,
  config: ChunkingConfig
): LearnChunk[] {
  const lines = content.split('\n');
  const chunks: LearnChunk[] = [];

  // Find all ## headers
  const headerLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.match(/^#{1,2}\s/)) {
      headerLines.push(i + 1); // 1-indexed
    }
  }

  // If no headers, treat as single chunk
  if (headerLines.length === 0) {
    return [createWholeFileChunk(fileIndex, lines.length)];
  }

  // Create chunks between headers
  for (let i = 0; i < headerLines.length; i++) {
    const headerLine = headerLines[i];
    const nextHeaderLine = headerLines[i + 1];

    const startLine = i === 0 ? 1 : headerLine!;
    const endLine = nextHeaderLine !== undefined
      ? nextHeaderLine - 1
      : lines.length;

    const chunkLines = endLine - startLine + 1;
    const header = lines[startLine - 1]?.replace(/^#+\s*/, '').trim();

    chunks.push({
      id: `chunk-${fileIndex}-${i}`,
      fileIndex,
      startLine,
      endLine,
      header,
      estimatedTokens: Math.ceil(chunkLines * 10),
    });
  }

  // Merge small chunks
  return mergeSmallChunks(chunks, config.maxTokens / 4);
}

/**
 * Create fixed-size chunks with overlap
 */
function createFixedChunks(
  totalLines: number,
  fileIndex: number,
  config: ChunkingConfig
): LearnChunk[] {
  const chunks: LearnChunk[] = [];
  const linesPerChunk = Math.ceil(config.maxTokens / 10); // ~10 tokens per line
  const step = linesPerChunk - config.overlapLines;

  let chunkIndex = 0;
  let startLine = 1;

  while (startLine <= totalLines) {
    const endLine = Math.min(startLine + linesPerChunk - 1, totalLines);

    chunks.push({
      id: `chunk-${fileIndex}-${chunkIndex}`,
      fileIndex,
      startLine,
      endLine,
      estimatedTokens: (endLine - startLine + 1) * 10,
    });

    startLine += step;
    chunkIndex++;
  }

  return chunks;
}

/**
 * Merge chunks that are too small
 */
function mergeSmallChunks(
  chunks: LearnChunk[],
  minTokens: number
): LearnChunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: LearnChunk[] = [];
  let current: LearnChunk | null = chunks[0] ?? null;

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    if (!next || !current) continue;

    if (current.estimatedTokens < minTokens) {
      // Merge with next chunk
      current = {
        ...current,
        endLine: next.endLine,
        estimatedTokens: current.estimatedTokens + next.estimatedTokens,
        header: current.header, // Keep first header
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Generate a hash of the manifest for checkpoint matching
 */
export function hashManifest(manifest: LearnManifest): string {
  const content = manifest.files
    .map((f) => `${f.path}:${f.size}:${f.lines}`)
    .join('|');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Read a chunk's content from a file
 */
export function readChunk(
  filePath: string,
  chunk: LearnChunk
): string {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  return lines.slice(chunk.startLine - 1, chunk.endLine).join('\n');
}

/**
 * Format manifest for display
 */
export function formatManifest(manifest: LearnManifest): string {
  const lines: string[] = [];

  lines.push(`Files to process: ${manifest.files.length}`);
  lines.push(`Total size: ${formatSize(manifest.totalSize)}`);
  lines.push(`Total lines: ${manifest.totalLines.toLocaleString()}`);
  lines.push(`Estimated chunks: ${manifest.estimatedChunks}`);
  lines.push('');
  lines.push('Files:');

  for (const file of manifest.files) {
    const chunkInfo =
      file.chunks.length === 1
        ? '(whole file)'
        : `(${file.chunks.length} chunks)`;
    lines.push(
      `  ${file.relativePath} - ${formatSize(file.size)}, ${file.lines} lines ${chunkInfo}`
    );
  }

  return lines.join('\n');
}

/**
 * Format bytes as human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
