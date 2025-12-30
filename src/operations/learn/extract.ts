/**
 * Phase 2: Extraction
 *
 * Coordinates extraction agents to process files and collect results.
 * This module generates Task tool invocations for the parent Claude Code
 * session to execute.
 */

import type {
  LearnManifest,
  LearnFileInfo,
  LearnChunk,
  Extraction,
  ExtractorResult,
} from './types.js';

/**
 * Generate Task tool invocations for extraction
 *
 * Since we're running within Claude Code, we can't directly spawn agents.
 * Instead, we return the task specifications for the parent to execute.
 */
export function generateExtractionTasks(
  manifest: LearnManifest,
  projectDir: string,
  _parallel: number = 3
): ExtractionTask[] {
  const tasks: ExtractionTask[] = [];

  for (const file of manifest.files) {
    for (const chunk of file.chunks) {
      tasks.push({
        id: chunk.id,
        file: file,
        chunk: chunk,
        projectDir: projectDir,
      });
    }
  }

  return tasks;
}

/**
 * Task specification for an extraction
 */
export interface ExtractionTask {
  id: string;
  file: LearnFileInfo;
  chunk: LearnChunk;
  projectDir: string;
}

/**
 * Generate the prompt for an extractor agent
 */
export function generateExtractorPrompt(task: ExtractionTask): string {
  const input = {
    file_path: task.file.path,
    chunk: task.chunk.startLine === 1 && task.chunk.endLine === task.file.lines
      ? null
      : {
          startLine: task.chunk.startLine,
          endLine: task.chunk.endLine,
          header: task.chunk.header,
        },
    context: `Documentation file: ${task.file.relativePath}`,
    project_dir: task.projectDir,
  };

  return JSON.stringify(input, null, 2);
}

/**
 * Parse the response from an extractor agent
 */
export function parseExtractorResponse(
  response: string,
  task: ExtractionTask
): ExtractorResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        file: task.file.relativePath,
        chunk: {
          id: task.chunk.id,
          startLine: task.chunk.startLine,
          endLine: task.chunk.endLine,
        },
        extractions: [],
        crossReferences: [],
        processingTime: 0,
        error: 'No JSON found in response',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize extractions
    const extractions: Extraction[] = (parsed.extractions || []).map(
      (ext: Record<string, unknown>) => ({
        type: ext.type || 'concept',
        title: String(ext.title || ''),
        content: String(ext.content || ''),
        sourceFile: task.file.relativePath,
        sourceSection: String(ext.sourceSection || ''),
        startLine: Number(ext.startLine) || task.chunk.startLine,
        endLine: Number(ext.endLine) || task.chunk.endLine,
        importance: Math.min(10, Math.max(1, Number(ext.importance) || 5)),
        tags: Array.isArray(ext.tags) ? ext.tags.map(String) : [],
        relatedTo: Array.isArray(ext.relatedTo) ? ext.relatedTo.map(String) : [],
      })
    );

    return {
      file: task.file.relativePath,
      chunk: {
        id: task.chunk.id,
        startLine: task.chunk.startLine,
        endLine: task.chunk.endLine,
      },
      extractions,
      crossReferences: Array.isArray(parsed.crossReferences)
        ? parsed.crossReferences.map(String)
        : [],
      processingTime: Number(parsed.processingTime) || 0,
    };
  } catch (error) {
    return {
      file: task.file.relativePath,
      chunk: {
        id: task.chunk.id,
        startLine: task.chunk.startLine,
        endLine: task.chunk.endLine,
      },
      extractions: [],
      crossReferences: [],
      processingTime: 0,
      error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Merge results from multiple extractor agents
 */
export function mergeExtractionResults(
  results: ExtractorResult[]
): {
  allExtractions: Extraction[];
  allCrossReferences: string[];
  errors: string[];
  totalProcessingTime: number;
} {
  const allExtractions: Extraction[] = [];
  const allCrossReferences: Set<string> = new Set();
  const errors: string[] = [];
  let totalProcessingTime = 0;

  for (const result of results) {
    allExtractions.push(...result.extractions);
    result.crossReferences.forEach((ref) => allCrossReferences.add(ref));
    totalProcessingTime += result.processingTime;

    if (result.error) {
      errors.push(`${result.file}: ${result.error}`);
    }
  }

  return {
    allExtractions,
    allCrossReferences: [...allCrossReferences],
    errors,
    totalProcessingTime,
  };
}

/**
 * Batch tasks for parallel execution
 */
export function batchTasks(
  tasks: ExtractionTask[],
  batchSize: number
): ExtractionTask[][] {
  const batches: ExtractionTask[][] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    batches.push(tasks.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Format extraction summary for display
 */
export function formatExtractionSummary(
  results: ExtractorResult[]
): string {
  const lines: string[] = [];
  let totalExtractions = 0;
  let filesWithExtractions = 0;

  const byFile: Record<string, number> = {};

  for (const result of results) {
    const count = result.extractions.length;
    totalExtractions += count;

    if (count > 0) {
      filesWithExtractions++;
    }

    byFile[result.file] = (byFile[result.file] || 0) + count;
  }

  lines.push(`Total extractions: ${totalExtractions}`);
  lines.push(`Files with extractions: ${filesWithExtractions}`);
  lines.push('');
  lines.push('By file:');

  for (const [file, count] of Object.entries(byFile)) {
    lines.push(`  ${file}: ${count} extractions`);
  }

  // Count by type
  const byType: Record<string, number> = {};
  for (const result of results) {
    for (const ext of result.extractions) {
      byType[ext.type] = (byType[ext.type] || 0) + 1;
    }
  }

  lines.push('');
  lines.push('By type:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type}: ${count}`);
  }

  return lines.join('\n');
}

/**
 * Filter extractions by importance threshold
 */
export function filterByImportance(
  extractions: Extraction[],
  minImportance: number
): Extraction[] {
  return extractions.filter((ext) => ext.importance >= minImportance);
}

/**
 * Estimate processing time based on manifest
 */
export function estimateProcessingTime(
  manifest: LearnManifest,
  parallel: number
): string {
  // Rough estimate: 30 seconds per chunk for Opus
  const chunksPerBatch = parallel;
  const batches = Math.ceil(manifest.estimatedChunks / chunksPerBatch);
  const secondsPerBatch = 30;
  const totalSeconds = batches * secondsPerBatch;

  if (totalSeconds < 60) {
    return `~${totalSeconds} seconds`;
  } else if (totalSeconds < 3600) {
    return `~${Math.ceil(totalSeconds / 60)} minutes`;
  } else {
    return `~${(totalSeconds / 3600).toFixed(1)} hours`;
  }
}
