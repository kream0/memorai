/**
 * Checkpoint management for resumable learning
 *
 * Saves and loads state to allow interrupted learning to be resumed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { hashManifest } from './analyze.js';
import type {
  LearnCheckpoint,
  LearnManifest,
  Extraction,
} from './types.js';

/**
 * Create a new checkpoint
 */
export function createCheckpoint(
  manifest: LearnManifest,
  completedChunks: string[] = [],
  pendingExtractions: Extraction[] = []
): LearnCheckpoint {
  const now = new Date().toISOString();
  return {
    manifestHash: hashManifest(manifest),
    manifest,
    completedChunks,
    pendingExtractions,
    createdAt: now,
    lastUpdated: now,
  };
}

/**
 * Update an existing checkpoint
 */
export function updateCheckpoint(
  checkpoint: LearnCheckpoint,
  completedChunkId: string,
  newExtractions: Extraction[]
): LearnCheckpoint {
  return {
    ...checkpoint,
    completedChunks: [...checkpoint.completedChunks, completedChunkId],
    pendingExtractions: [...checkpoint.pendingExtractions, ...newExtractions],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Save checkpoint to file
 */
export function saveCheckpoint(
  checkpoint: LearnCheckpoint,
  filePath: string
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

/**
 * Load checkpoint from file
 */
export function loadCheckpoint(filePath: string): LearnCheckpoint | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate required fields
    if (!parsed.manifestHash || !parsed.manifest || !parsed.createdAt) {
      return null;
    }

    return {
      manifestHash: parsed.manifestHash,
      manifest: parsed.manifest,
      completedChunks: parsed.completedChunks || [],
      pendingExtractions: parsed.pendingExtractions || [],
      createdAt: parsed.createdAt,
      lastUpdated: parsed.lastUpdated || parsed.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a checkpoint matches the current manifest
 */
export function isCheckpointValid(
  checkpoint: LearnCheckpoint,
  manifest: LearnManifest
): boolean {
  const currentHash = hashManifest(manifest);
  return checkpoint.manifestHash === currentHash;
}

/**
 * Get remaining chunks to process
 */
export function getRemainingChunks(
  checkpoint: LearnCheckpoint
): string[] {
  const allChunks = checkpoint.manifest.files.flatMap((f) =>
    f.chunks.map((c) => c.id)
  );

  const completedSet = new Set(checkpoint.completedChunks);
  return allChunks.filter((id) => !completedSet.has(id));
}

/**
 * Get checkpoint summary for display
 */
export function formatCheckpointSummary(checkpoint: LearnCheckpoint): string {
  const lines: string[] = [];

  lines.push('Checkpoint found:');
  lines.push(`  Created: ${formatTime(checkpoint.createdAt)}`);
  lines.push(`  Last updated: ${formatTime(checkpoint.lastUpdated)}`);
  lines.push(`  Completed chunks: ${checkpoint.completedChunks.length}`);
  lines.push(`  Pending extractions: ${checkpoint.pendingExtractions.length}`);

  const remaining = getRemainingChunks(checkpoint);
  lines.push(`  Remaining chunks: ${remaining.length}`);

  return lines.join('\n');
}

/**
 * Format ISO timestamp for display
 */
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

/**
 * Generate default checkpoint path
 */
export function getDefaultCheckpointPath(projectDir: string): string {
  return `${projectDir}/.memorai/learn-checkpoint.json`;
}

/**
 * Clean up checkpoint file after successful completion
 */
export function deleteCheckpoint(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const fs = require('node:fs');
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate completion percentage
 */
export function getCompletionPercent(checkpoint: LearnCheckpoint): number {
  const allChunks = checkpoint.manifest.files.flatMap((f) =>
    f.chunks.map((c) => c.id)
  );

  if (allChunks.length === 0) return 100;

  return Math.round(
    (checkpoint.completedChunks.length / allChunks.length) * 100
  );
}
