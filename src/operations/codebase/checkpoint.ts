/**
 * Checkpoint Management
 *
 * Enables resumption of interrupted scan operations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  CodebaseCheckpoint,
  CodebaseKnowledge,
  CodebaseManifest,
  PartitionAnalysis,
} from './types.js';

/**
 * Default checkpoint filename
 */
export const CHECKPOINT_FILENAME = 'scan-checkpoint.json';

/**
 * Get checkpoint path for a project
 */
export function getCheckpointPath(projectDir: string): string {
  return join(projectDir, '.memorai', CHECKPOINT_FILENAME);
}

/**
 * Create a new checkpoint
 */
export function createCheckpoint(manifest: CodebaseManifest): CodebaseCheckpoint {
  return {
    manifestHash: manifest.hash,
    manifest,
    phase: 'analysis',
    completedPartitions: [],
    partitionResults: {},
    synthesisComplete: false,
    knowledge: null,
    memoriesStored: [],
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Save checkpoint to disk
 */
export function saveCheckpoint(
  checkpoint: CodebaseCheckpoint,
  projectDir: string
): void {
  const path = getCheckpointPath(projectDir);

  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Update timestamp
  checkpoint.lastUpdated = new Date().toISOString();

  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

/**
 * Load checkpoint from disk
 */
export function loadCheckpoint(projectDir: string): CodebaseCheckpoint | null {
  const path = getCheckpointPath(projectDir);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as CodebaseCheckpoint;
  } catch {
    return null;
  }
}

/**
 * Check if checkpoint is valid for current manifest
 */
export function isCheckpointValid(
  checkpoint: CodebaseCheckpoint,
  manifest: CodebaseManifest
): boolean {
  // Hash must match
  if (checkpoint.manifestHash !== manifest.hash) {
    return false;
  }

  // Partition count must match
  if (checkpoint.manifest.partitions.length !== manifest.partitions.length) {
    return false;
  }

  return true;
}

/**
 * Update checkpoint with completed partition
 */
export function updateCheckpointPartition(
  checkpoint: CodebaseCheckpoint,
  partitionId: string,
  analysis: PartitionAnalysis
): CodebaseCheckpoint {
  return {
    ...checkpoint,
    phase: 'exploration',
    completedPartitions: [...checkpoint.completedPartitions, partitionId],
    partitionResults: {
      ...checkpoint.partitionResults,
      [partitionId]: analysis,
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Update checkpoint with synthesis result
 */
export function updateCheckpointSynthesis(
  checkpoint: CodebaseCheckpoint,
  knowledge: CodebaseKnowledge
): CodebaseCheckpoint {
  return {
    ...checkpoint,
    phase: 'ingestion',
    synthesisComplete: true,
    knowledge,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Update checkpoint with stored memories
 */
export function updateCheckpointMemories(
  checkpoint: CodebaseCheckpoint,
  memoryIds: string[]
): CodebaseCheckpoint {
  return {
    ...checkpoint,
    memoriesStored: [...checkpoint.memoriesStored, ...memoryIds],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get remaining partitions to explore
 */
export function getRemainingPartitions(
  checkpoint: CodebaseCheckpoint
): string[] {
  const completed = new Set(checkpoint.completedPartitions);
  return checkpoint.manifest.partitions
    .filter(p => !completed.has(p.id))
    .map(p => p.id);
}

/**
 * Get completion percentage
 */
export function getCompletionPercent(checkpoint: CodebaseCheckpoint): number {
  const total = checkpoint.manifest.partitions.length;
  if (total === 0) return 100;

  const completed = checkpoint.completedPartitions.length;
  return Math.round((completed / total) * 100);
}

/**
 * Delete checkpoint
 */
export function deleteCheckpoint(projectDir: string): boolean {
  const path = getCheckpointPath(projectDir);

  if (!existsSync(path)) {
    return false;
  }

  try {
    const { unlinkSync } = require('node:fs');
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format checkpoint status for display
 */
export function formatCheckpointStatus(checkpoint: CodebaseCheckpoint): string {
  const lines: string[] = [
    '## Checkpoint Status',
    '',
    `Phase: ${checkpoint.phase}`,
    `Created: ${formatTime(checkpoint.createdAt)}`,
    `Last updated: ${formatTime(checkpoint.lastUpdated)}`,
    '',
  ];

  const total = checkpoint.manifest.partitions.length;
  const completed = checkpoint.completedPartitions.length;
  const percent = getCompletionPercent(checkpoint);

  lines.push(`Partitions: ${completed}/${total} (${percent}%)`);

  if (checkpoint.synthesisComplete) {
    lines.push('Synthesis: Complete');
  }

  if (checkpoint.memoriesStored.length > 0) {
    lines.push(`Memories stored: ${checkpoint.memoriesStored.length}`);
  }

  return lines.join('\n');
}

/**
 * Format timestamp for display
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Check if we should resume from checkpoint
 */
export function shouldResume(
  projectDir: string,
  manifest: CodebaseManifest
): { resume: boolean; checkpoint: CodebaseCheckpoint | null; reason: string } {
  const checkpoint = loadCheckpoint(projectDir);

  if (!checkpoint) {
    return {
      resume: false,
      checkpoint: null,
      reason: 'No checkpoint found',
    };
  }

  if (!isCheckpointValid(checkpoint, manifest)) {
    return {
      resume: false,
      checkpoint: null,
      reason: 'Checkpoint is stale (codebase has changed)',
    };
  }

  const remaining = getRemainingPartitions(checkpoint);
  if (remaining.length === 0 && checkpoint.synthesisComplete) {
    return {
      resume: false,
      checkpoint: null,
      reason: 'Checkpoint is complete, nothing to resume',
    };
  }

  return {
    resume: true,
    checkpoint,
    reason: `Can resume from ${checkpoint.phase} phase (${getCompletionPercent(checkpoint)}% complete)`,
  };
}

/**
 * Get resumed partition analyses
 */
export function getResumedAnalyses(
  checkpoint: CodebaseCheckpoint
): PartitionAnalysis[] {
  return Object.values(checkpoint.partitionResults);
}
