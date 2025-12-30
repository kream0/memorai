/**
 * Phase 3: Synthesis
 *
 * Merges, deduplicates, and organizes extractions into memories.
 * Generates Task tool invocation for the synthesizer agent.
 */

import type {
  Extraction,
  SynthesizerInput,
  SynthesizerResult,
  SynthesizedMemory,
  SkippedExtraction,
} from './types.js';
import type { Category } from '../../types/memory.js';

/**
 * Generate the prompt for the synthesizer agent
 */
export function generateSynthesizerPrompt(
  extractions: Extraction[],
  projectContext: string,
  existingMemoryTitles: string[]
): string {
  const input: SynthesizerInput = {
    extractions,
    projectContext,
    existingMemoryTitles,
  };

  return JSON.stringify(input, null, 2);
}

/**
 * Parse the response from the synthesizer agent
 */
export function parseSynthesizerResponse(
  response: string
): SynthesizerResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        memories: [],
        skipped: [],
        warnings: ['No JSON found in synthesizer response'],
        processingTime: 0,
        error: 'No JSON found in response',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize memories
    const memories: SynthesizedMemory[] = (parsed.memories || []).map(
      (mem: Record<string, unknown>) => ({
        category: validateCategory(String(mem.category || 'notes')),
        title: String(mem.title || ''),
        content: String(mem.content || ''),
        tags: Array.isArray(mem.tags) ? mem.tags.map(String) : [],
        importance: Math.min(10, Math.max(1, Number(mem.importance) || 5)),
        sourceFiles: Array.isArray(mem.sourceFiles)
          ? mem.sourceFiles.map(String)
          : [],
        relatedMemories: Array.isArray(mem.relatedMemories)
          ? mem.relatedMemories.map(String)
          : [],
      })
    );

    // Parse skipped
    const skipped: SkippedExtraction[] = (parsed.skipped || []).map(
      (skip: Record<string, unknown>) => ({
        reason: validateSkipReason(String(skip.reason || 'duplicate')),
        title: String(skip.title || ''),
        originalFile: String(skip.originalFile || ''),
      })
    );

    return {
      memories,
      skipped,
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.map(String)
        : [],
      processingTime: Number(parsed.processingTime) || 0,
    };
  } catch (error) {
    return {
      memories: [],
      skipped: [],
      warnings: [],
      processingTime: 0,
      error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate category string
 */
function validateCategory(cat: string): Category {
  const valid: Category[] = [
    'architecture',
    'decisions',
    'reports',
    'summaries',
    'structure',
    'notes',
  ];

  const normalized = cat.toLowerCase().trim();
  if (valid.includes(normalized as Category)) {
    return normalized as Category;
  }

  // Map common variations
  if (normalized.includes('arch') || normalized.includes('design')) {
    return 'architecture';
  }
  if (normalized.includes('decision') || normalized.includes('choice')) {
    return 'decisions';
  }
  if (normalized.includes('struct') || normalized.includes('organiz')) {
    return 'structure';
  }

  return 'notes'; // Default
}

/**
 * Validate skip reason
 */
function validateSkipReason(
  reason: string
): 'duplicate' | 'trivial' | 'contradiction' | 'low_importance' {
  const valid = ['duplicate', 'trivial', 'contradiction', 'low_importance'];
  if (valid.includes(reason)) {
    return reason as 'duplicate' | 'trivial' | 'contradiction' | 'low_importance';
  }
  return 'duplicate';
}

/**
 * Format synthesis summary for display
 */
export function formatSynthesisSummary(result: SynthesizerResult): string {
  const lines: string[] = [];

  lines.push(`Memories created: ${result.memories.length}`);
  lines.push(`Extractions skipped: ${result.skipped.length}`);

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.length}`);
  }

  // Count by category
  const byCategory: Record<string, number> = {};
  for (const mem of result.memories) {
    byCategory[mem.category] = (byCategory[mem.category] || 0) + 1;
  }

  lines.push('');
  lines.push('By category:');
  for (const [cat, count] of Object.entries(byCategory).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`  ${cat}: ${count}`);
  }

  // Count skipped by reason
  if (result.skipped.length > 0) {
    const byReason: Record<string, number> = {};
    for (const skip of result.skipped) {
      byReason[skip.reason] = (byReason[skip.reason] || 0) + 1;
    }

    lines.push('');
    lines.push('Skipped by reason:');
    for (const [reason, count] of Object.entries(byReason)) {
      lines.push(`  ${reason}: ${count}`);
    }
  }

  // Show warnings
  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

/**
 * Preview memories before storing
 */
export function formatMemoriesPreview(
  memories: SynthesizedMemory[],
  limit: number = 10
): string {
  const lines: string[] = [];

  lines.push(`Showing ${Math.min(limit, memories.length)} of ${memories.length} memories:`);
  lines.push('');

  for (let i = 0; i < Math.min(limit, memories.length); i++) {
    const mem = memories[i];
    if (!mem) continue;
    lines.push(`${i + 1}. [${mem.category}] ${mem.title}`);
    lines.push(`   Importance: ${mem.importance}/10 | Tags: ${mem.tags.join(', ')}`);
    lines.push(`   Sources: ${mem.sourceFiles.join(', ')}`);
    lines.push(`   ${truncate(mem.content, 150)}`);
    lines.push('');
  }

  if (memories.length > limit) {
    lines.push(`... and ${memories.length - limit} more`);
  }

  return lines.join('\n');
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Filter memories by importance threshold
 */
export function filterMemoriesByImportance(
  memories: SynthesizedMemory[],
  minImportance: number
): SynthesizedMemory[] {
  return memories.filter((mem) => mem.importance >= minImportance);
}

/**
 * Limit memories by max count
 */
export function limitMemories(
  memories: SynthesizedMemory[],
  maxMemories: number
): SynthesizedMemory[] {
  // Sort by importance (highest first), then take top N
  return [...memories]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxMemories);
}

/**
 * Validate memories before storage
 */
export function validateMemories(
  memories: SynthesizedMemory[]
): { valid: SynthesizedMemory[]; invalid: { memory: SynthesizedMemory; reason: string }[] } {
  const valid: SynthesizedMemory[] = [];
  const invalid: { memory: SynthesizedMemory; reason: string }[] = [];

  for (const mem of memories) {
    if (!mem.title || mem.title.trim().length === 0) {
      invalid.push({ memory: mem, reason: 'Empty title' });
      continue;
    }

    if (!mem.content || mem.content.trim().length < 20) {
      invalid.push({ memory: mem, reason: 'Content too short (< 20 chars)' });
      continue;
    }

    if (mem.title.length > 200) {
      invalid.push({ memory: mem, reason: 'Title too long (> 200 chars)' });
      continue;
    }

    valid.push(mem);
  }

  return { valid, invalid };
}

/**
 * Group memories by category for display
 */
export function groupByCategory(
  memories: SynthesizedMemory[]
): Record<Category, SynthesizedMemory[]> {
  const groups: Record<Category, SynthesizedMemory[]> = {
    architecture: [],
    decisions: [],
    reports: [],
    summaries: [],
    structure: [],
    notes: [],
  };

  for (const mem of memories) {
    groups[mem.category].push(mem);
  }

  return groups;
}
