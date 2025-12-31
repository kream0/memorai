/**
 * Phase 4: Ingestion
 *
 * Transforms synthesized knowledge into memorai memories
 * and stores them in the database.
 */

import type { Category, StoreOptions, StoreResult } from '../../types/memory.js';
import type { MemoraiClient } from '../../client.js';
import {
  IMPORTANCE_ADJUSTMENTS,
  INSIGHT_TO_CATEGORY,
  type CodebaseKnowledge,
  type GotchaKnowledge,
  type PatternKnowledge,
  type ScanMemoryInfo,
} from './types.js';

/**
 * Result of ingestion phase
 */
export interface IngestionResult {
  memoriesCreated: number;
  memoriesSkipped: number;
  byCategory: Record<Category, number>;
  memories: ScanMemoryInfo[];
  errors: string[];
}

/**
 * Options for ingestion
 */
export interface IngestionOptions {
  /** Minimum importance threshold */
  importanceMin: number;
  /** Maximum memories to create */
  maxMemories: number;
  /** Dry run - don't actually store */
  dryRun: boolean;
  /** Project name for memory titles */
  projectName: string;
}

/**
 * Default ingestion options
 */
export const DEFAULT_INGESTION_OPTIONS: IngestionOptions = {
  importanceMin: 3,
  maxMemories: 100,
  dryRun: false,
  projectName: 'Project',
};

/**
 * Transform knowledge into memory store options
 */
export function knowledgeToMemories(
  knowledge: CodebaseKnowledge,
  projectName: string
): StoreOptions[] {
  const memories: StoreOptions[] = [];

  // 1. Architecture Overview (importance 10)
  if (knowledge.overview) {
    memories.push({
      category: 'architecture',
      title: `${projectName} Architecture Overview`,
      content: buildArchitectureContent(knowledge),
      importance: 10,
      tags: [
        'architecture',
        'overview',
        ...knowledge.architecture.layers.map(l => l.toLowerCase()),
      ],
    });
  }

  // 2. Key Architectural Decisions (importance 8-9)
  for (let i = 0; i < knowledge.architecture.keyDecisions.length && i < 5; i++) {
    const decision = knowledge.architecture.keyDecisions[i]!;
    memories.push({
      category: 'decisions',
      title: `${projectName}: Architectural Decision ${i + 1}`,
      content: decision,
      importance: 9 - Math.floor(i / 2), // 9, 9, 8, 8, 7
      tags: ['architecture', 'decision'],
    });
  }

  // 3. Patterns (importance 6-8 based on scope)
  for (const pattern of knowledge.patterns) {
    memories.push(patternToMemory(pattern, projectName));
  }

  // 4. Conventions (importance 6-7)
  for (const convention of knowledge.conventions) {
    memories.push({
      category: 'structure',
      title: `${projectName}: ${convention.title}`,
      content: convention.description +
        (convention.examples.length > 0
          ? `\n\nExamples: ${convention.examples.join(', ')}`
          : ''),
      importance: 6,
      tags: ['convention', ...convention.tags],
    });
  }

  // 5. Modules (importance 5-6)
  for (const module of knowledge.modules) {
    if (module.purpose.length > 50) { // Skip trivial module descriptions
      memories.push({
        category: 'architecture',
        title: `${projectName}: ${module.name} Module`,
        content: module.purpose +
          (module.publicApi ? `\n\nPublic API: ${module.publicApi}` : '') +
          (module.dependencies.length > 0
            ? `\n\nDependencies: ${module.dependencies.join(', ')}`
            : ''),
        importance: 5,
        tags: ['module', module.name.toLowerCase()],
      });
    }
  }

  // 6. Gotchas (importance 5-7, always include!)
  for (const gotcha of knowledge.gotchas) {
    memories.push(gotchaToMemory(gotcha, projectName));
  }

  // 7. Key Components (importance 4-5)
  for (const component of knowledge.components.slice(0, 10)) {
    if (component.role.length > 30) { // Skip trivial components
      memories.push({
        category: 'notes',
        title: `${projectName}: ${component.name}`,
        content: `${component.role}\n\nLocation: ${component.path}` +
          (component.keyMethods
            ? `\n\nKey methods: ${component.keyMethods.join(', ')}`
            : ''),
        importance: 4,
        tags: ['component', component.name.toLowerCase()],
      });
    }
  }

  return memories;
}

/**
 * Build architecture content from knowledge
 */
function buildArchitectureContent(knowledge: CodebaseKnowledge): string {
  const parts: string[] = [knowledge.overview];

  if (knowledge.architecture.style !== 'Unknown') {
    parts.push(`\nArchitecture Style: ${knowledge.architecture.style}`);
  }

  if (knowledge.architecture.layers.length > 0) {
    parts.push(`\nLayers: ${knowledge.architecture.layers.join(' → ')}`);
  }

  if (knowledge.architecture.dataFlow) {
    parts.push(`\nData Flow: ${knowledge.architecture.dataFlow}`);
  }

  return parts.join('');
}

/**
 * Convert pattern to memory
 */
function patternToMemory(pattern: PatternKnowledge, projectName: string): StoreOptions {
  const importance = pattern.scope === 'project' ? 8 : pattern.scope === 'module' ? 6 : 5;

  return {
    category: 'architecture',
    title: `${projectName}: ${pattern.title}`,
    content: pattern.description +
      (pattern.usedIn.length > 0
        ? `\n\nUsed in: ${pattern.usedIn.slice(0, 5).join(', ')}`
        : ''),
    importance,
    tags: ['pattern', ...pattern.tags],
  };
}

/**
 * Convert gotcha to memory
 */
function gotchaToMemory(gotcha: GotchaKnowledge, projectName: string): StoreOptions {
  return {
    category: 'notes',
    title: `${projectName} Gotcha: ${gotcha.title}`,
    content: gotcha.description +
      (gotcha.appliesTo.length > 0
        ? `\n\nApplies to: ${gotcha.appliesTo.join(', ')}`
        : ''),
    importance: Math.max(gotcha.importance, 5), // Floor at 5
    tags: ['gotcha', 'warning', ...gotcha.tags],
  };
}

/**
 * Filter and limit memories
 */
export function filterMemories(
  memories: StoreOptions[],
  options: IngestionOptions
): { filtered: StoreOptions[]; skipped: number } {
  // Filter by importance
  let filtered = memories.filter(m =>
    (m.importance ?? 5) >= options.importanceMin
  );

  // Sort by importance (descending)
  filtered.sort((a, b) => (b.importance ?? 5) - (a.importance ?? 5));

  // Limit count
  const skipped = Math.max(0, filtered.length - options.maxMemories);
  filtered = filtered.slice(0, options.maxMemories);

  return { filtered, skipped };
}

/**
 * Ingest knowledge into memorai
 */
export async function ingestKnowledge(
  client: MemoraiClient,
  knowledge: CodebaseKnowledge,
  options: Partial<IngestionOptions> = {}
): Promise<IngestionResult> {
  const opts: IngestionOptions = { ...DEFAULT_INGESTION_OPTIONS, ...options };

  const result: IngestionResult = {
    memoriesCreated: 0,
    memoriesSkipped: 0,
    byCategory: {
      architecture: 0,
      decisions: 0,
      reports: 0,
      summaries: 0,
      structure: 0,
      notes: 0,
    },
    memories: [],
    errors: [],
  };

  // Transform knowledge to memories
  const allMemories = knowledgeToMemories(knowledge, opts.projectName);

  // Filter and limit
  const { filtered, skipped } = filterMemories(allMemories, opts);
  result.memoriesSkipped = skipped;

  // If dry run, just count what would be stored
  if (opts.dryRun) {
    for (const memory of filtered) {
      result.byCategory[memory.category]++;
      result.memoriesCreated++;
      result.memories.push({
        id: 'dry-run',
        category: memory.category,
        title: memory.title,
        scope: 'module', // Default scope
        importance: memory.importance ?? 5,
        evidence: [],
      });
    }
    return result;
  }

  // Store each memory
  for (const memory of filtered) {
    try {
      const storeResult = await client.store(memory);

      if (storeResult.success && storeResult.id) {
        result.memoriesCreated++;
        result.byCategory[memory.category]++;
        result.memories.push({
          id: storeResult.id,
          category: memory.category,
          title: memory.title,
          scope: 'module',
          importance: memory.importance ?? 5,
          evidence: [],
        });
      } else {
        result.errors.push(`Failed to store: ${memory.title}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Error storing "${memory.title}": ${message}`);
    }
  }

  return result;
}

/**
 * Calculate importance adjustment based on insight type
 */
export function adjustImportance(
  baseImportance: number,
  insightType: keyof typeof IMPORTANCE_ADJUSTMENTS
): number {
  const adjustment = IMPORTANCE_ADJUSTMENTS[insightType] ?? 0;
  return Math.max(1, Math.min(10, baseImportance + adjustment));
}

/**
 * Get category for insight type
 */
export function getCategoryForType(
  insightType: keyof typeof INSIGHT_TO_CATEGORY
): Category {
  return INSIGHT_TO_CATEGORY[insightType] ?? 'notes';
}

/**
 * Format ingestion result for display
 */
export function formatIngestionResult(result: IngestionResult): string {
  const lines: string[] = [
    '## Ingestion Complete',
    '',
    `Memories created: ${result.memoriesCreated}`,
    `Memories skipped: ${result.memoriesSkipped}`,
    '',
    'By category:',
  ];

  for (const [category, count] of Object.entries(result.byCategory)) {
    if (count > 0) {
      lines.push(`  ${category}: ${count}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors.slice(0, 5)) {
      lines.push(`  - ${error}`);
    }
    if (result.errors.length > 5) {
      lines.push(`  - ... and ${result.errors.length - 5} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Preview memories that would be created
 */
export function previewMemories(
  knowledge: CodebaseKnowledge,
  projectName: string,
  options: Partial<IngestionOptions> = {}
): string {
  const opts: IngestionOptions = { ...DEFAULT_INGESTION_OPTIONS, ...options };

  const allMemories = knowledgeToMemories(knowledge, projectName);
  const { filtered, skipped } = filterMemories(allMemories, opts);

  const lines: string[] = [
    '## Memory Preview',
    '',
    `Total memories: ${filtered.length}`,
    `Would skip: ${skipped} (below importance threshold or over limit)`,
    '',
  ];

  // Group by category
  const byCategory = new Map<Category, StoreOptions[]>();
  for (const memory of filtered) {
    if (!byCategory.has(memory.category)) {
      byCategory.set(memory.category, []);
    }
    byCategory.get(memory.category)!.push(memory);
  }

  for (const [category, memories] of byCategory) {
    lines.push(`### ${category} (${memories.length})`);
    lines.push('');

    for (const memory of memories.slice(0, 5)) {
      lines.push(`- **${memory.title}** (importance: ${memory.importance ?? 5})`);
      lines.push(`  ${memory.content?.slice(0, 100)}...`);
    }

    if (memories.length > 5) {
      lines.push(`- ... and ${memories.length - 5} more`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
