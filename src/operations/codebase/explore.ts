/**
 * Phase 2: Exploration
 *
 * Coordinates explorer agents to analyze codebase partitions.
 * Generates prompts and parses agent responses.
 */

import type {
  CodebaseManifest,
  CrossReference,
  GlobalContext,
  KeyFile,
  PartitionAnalysis,
  PartitionSpec,
  CodeInsight,
} from './types.js';

/**
 * Task specification for exploring a partition
 */
export interface ExplorationTask {
  id: string;
  partition: PartitionSpec;
  globalContext: GlobalContext;
  projectDir: string;
}

/**
 * Generate exploration tasks for all partitions
 */
export function generateExplorationTasks(
  manifest: CodebaseManifest
): ExplorationTask[] {
  return manifest.partitions.map(partition => ({
    id: partition.id,
    partition,
    globalContext: manifest.globalContext,
    projectDir: manifest.projectDir,
  }));
}

/**
 * Batch tasks for parallel execution
 */
export function batchTasks(
  tasks: ExplorationTask[],
  batchSize: number
): ExplorationTask[][] {
  const batches: ExplorationTask[][] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    batches.push(tasks.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Generate the prompt for an explorer agent
 */
export function generateExplorerPrompt(task: ExplorationTask): string {
  const input = {
    partition_id: task.partition.id,
    partition_description: task.partition.description,
    directories: task.partition.directories,
    files: task.partition.files,
    global_context: {
      projectName: task.globalContext.projectName,
      description: task.globalContext.description,
      structureOverview: task.globalContext.structureOverview,
      languages: task.globalContext.languages,
      frameworks: task.globalContext.frameworks,
      entryPoints: task.globalContext.entryPoints,
      configSummary: task.globalContext.configSummary,
      totalPartitions: task.globalContext.totalPartitions,
    },
  };

  return JSON.stringify(input, null, 2);
}

/**
 * Generate a human-readable summary of the task
 */
export function generateTaskSummary(task: ExplorationTask): string {
  const lines: string[] = [
    `Partition: ${task.partition.id}`,
    `Description: ${task.partition.description}`,
    `Files: ${task.partition.files.length}`,
    `Tokens: ~${formatTokens(task.partition.estimatedTokens)}`,
    '',
    'Directories:',
    ...task.partition.directories.slice(0, 5).map(d => `  - ${d}/`),
  ];

  if (task.partition.directories.length > 5) {
    lines.push(`  - ... and ${task.partition.directories.length - 5} more`);
  }

  return lines.join('\n');
}

/**
 * Format token count
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

/**
 * Parse the response from an explorer agent
 */
export function parseExplorerResponse(
  response: string,
  task: ExplorationTask
): PartitionAnalysis {
  const startTime = Date.now();

  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return createErrorResult(task, 'No JSON found in response', startTime);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<PartitionAnalysis>;

    // Validate and normalize the response
    const analysis = normalizeAnalysis(parsed, task);

    return analysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResult(task, `Parse error: ${message}`, startTime);
  }
}

/**
 * Create an error result for a failed analysis
 */
function createErrorResult(
  task: ExplorationTask,
  error: string,
  startTime: number
): PartitionAnalysis {
  return {
    partitionId: task.partition.id,
    partitionDescription: task.partition.description,
    insights: [],
    keyFiles: [],
    crossReferences: [],
    confidence: 0,
    coverage: 0,
    processingTime: Date.now() - startTime,
    error,
  };
}

/**
 * Normalize and validate an analysis response
 */
function normalizeAnalysis(
  parsed: Partial<PartitionAnalysis>,
  task: ExplorationTask
): PartitionAnalysis {
  const startTime = Date.now();

  // Normalize insights
  const insights: CodeInsight[] = [];
  if (Array.isArray(parsed.insights)) {
    for (const insight of parsed.insights) {
      const normalized = normalizeInsight(insight);
      if (normalized) {
        insights.push(normalized);
      }
    }
  }

  // Normalize key files
  const keyFiles: KeyFile[] = [];
  if (Array.isArray(parsed.keyFiles)) {
    for (const kf of parsed.keyFiles) {
      if (kf && typeof kf.path === 'string' && typeof kf.role === 'string') {
        keyFiles.push({
          path: kf.path,
          role: kf.role,
          importance: normalizeImportance(kf.importance),
        });
      }
    }
  }

  // Normalize cross references
  const crossReferences: CrossReference[] = [];
  if (Array.isArray(parsed.crossReferences)) {
    for (const cr of parsed.crossReferences) {
      if (cr && typeof cr.toArea === 'string') {
        crossReferences.push({
          fromPartition: task.partition.id,
          toArea: cr.toArea,
          relationship: normalizeRelationship(cr.relationship),
        });
      }
    }
  }

  return {
    partitionId: task.partition.id,
    partitionDescription: task.partition.description,
    insights,
    keyFiles,
    crossReferences,
    confidence: normalizeScore(parsed.confidence, 5),
    coverage: normalizeScore(parsed.coverage, 5),
    processingTime: parsed.processingTime ?? (Date.now() - startTime),
  };
}

/**
 * Normalize a single insight
 */
function normalizeInsight(raw: unknown): CodeInsight | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const insight = raw as Record<string, unknown>;

  // Required fields
  if (typeof insight.title !== 'string' || !insight.title.trim()) {
    return null;
  }
  if (typeof insight.insight !== 'string' || !insight.insight.trim()) {
    return null;
  }

  // Normalize scope
  const scope = normalizeScope(insight.scope);

  // Normalize type
  const type = normalizeInsightType(insight.type);

  // Normalize evidence
  const evidence: string[] = [];
  if (Array.isArray(insight.evidence)) {
    for (const e of insight.evidence) {
      if (typeof e === 'string') {
        evidence.push(e);
      }
    }
  }

  // Normalize tags
  const tags: string[] = [];
  if (Array.isArray(insight.tags)) {
    for (const t of insight.tags) {
      if (typeof t === 'string') {
        tags.push(t.toLowerCase());
      }
    }
  }

  // Normalize related areas
  const relatedAreas: string[] = [];
  if (Array.isArray(insight.relatedAreas)) {
    for (const r of insight.relatedAreas) {
      if (typeof r === 'string') {
        relatedAreas.push(r);
      }
    }
  }

  return {
    scope,
    type,
    title: insight.title.trim(),
    insight: insight.insight.trim(),
    evidence,
    importance: normalizeImportance(insight.importance),
    tags,
    relatedAreas,
  };
}

/**
 * Normalize scope value
 */
function normalizeScope(value: unknown): 'project' | 'module' | 'file' {
  if (value === 'project' || value === 'module' || value === 'file') {
    return value;
  }
  return 'module'; // Default to module scope
}

/**
 * Normalize insight type
 */
function normalizeInsightType(
  value: unknown
): CodeInsight['type'] {
  const validTypes = [
    'architecture',
    'pattern',
    'convention',
    'component',
    'dataflow',
    'dependency',
    'gotcha',
    'decision',
    'integration',
  ];

  if (typeof value === 'string' && validTypes.includes(value)) {
    return value as CodeInsight['type'];
  }

  return 'pattern'; // Default
}

/**
 * Normalize importance score (1-10)
 */
function normalizeImportance(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.max(1, Math.min(10, Math.round(value)));
  }
  return 5; // Default
}

/**
 * Normalize score (1-10)
 */
function normalizeScore(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.max(1, Math.min(10, Math.round(value)));
  }
  return defaultValue;
}

/**
 * Normalize relationship type
 */
function normalizeRelationship(
  value: unknown
): CrossReference['relationship'] {
  const validRelationships = ['imports', 'extends', 'implements', 'uses', 'depends_on'];

  if (typeof value === 'string' && validRelationships.includes(value)) {
    return value as CrossReference['relationship'];
  }

  return 'uses'; // Default
}

/**
 * Merge results from multiple analyses
 */
export function mergeAnalysisResults(
  results: PartitionAnalysis[]
): {
  allInsights: CodeInsight[];
  allKeyFiles: KeyFile[];
  allCrossReferences: CrossReference[];
  errors: string[];
  avgConfidence: number;
  avgCoverage: number;
} {
  const allInsights: CodeInsight[] = [];
  const allKeyFiles: KeyFile[] = [];
  const allCrossReferences: CrossReference[] = [];
  const errors: string[] = [];

  let totalConfidence = 0;
  let totalCoverage = 0;
  let validCount = 0;

  for (const result of results) {
    allInsights.push(...result.insights);
    allKeyFiles.push(...result.keyFiles);
    allCrossReferences.push(...result.crossReferences);

    if (result.error) {
      errors.push(`${result.partitionId}: ${result.error}`);
    } else {
      totalConfidence += result.confidence;
      totalCoverage += result.coverage;
      validCount++;
    }
  }

  return {
    allInsights,
    allKeyFiles,
    allCrossReferences,
    errors,
    avgConfidence: validCount > 0 ? totalConfidence / validCount : 0,
    avgCoverage: validCount > 0 ? totalCoverage / validCount : 0,
  };
}

/**
 * Estimate time for exploration
 */
export function estimateExplorationTime(
  tasks: ExplorationTask[],
  parallel: number
): { batches: number; estimatedMinutes: number } {
  const batches = Math.ceil(tasks.length / parallel);
  // Estimate ~60 seconds per batch (agents run in parallel)
  const estimatedMinutes = Math.ceil((batches * 60) / 60);

  return { batches, estimatedMinutes };
}

/**
 * Format exploration progress
 */
export function formatExplorationProgress(
  completed: number,
  total: number,
  currentPartitions: string[]
): string {
  const pct = Math.round((completed / total) * 100);
  const lines: string[] = [
    `Progress: ${completed}/${total} partitions (${pct}%)`,
  ];

  if (currentPartitions.length > 0) {
    lines.push(`Currently exploring: ${currentPartitions.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Generate instructions for the CLI to display
 */
export function generateExplorationInstructions(
  tasks: ExplorationTask[],
  parallel: number
): string {
  const { batches, estimatedMinutes } = estimateExplorationTime(tasks, parallel);

  const lines: string[] = [
    '## Exploration Phase',
    '',
    `Partitions to analyze: ${tasks.length}`,
    `Parallel agents: ${parallel}`,
    `Batches: ${batches}`,
    `Estimated time: ~${estimatedMinutes} minutes`,
    '',
    '### Partitions:',
    '',
  ];

  for (const task of tasks) {
    lines.push(
      `- **${task.partition.id}**: ${task.partition.description} ` +
      `(${task.partition.files.length} files, ~${formatTokens(task.partition.estimatedTokens)} tokens)`
    );
  }

  lines.push('');
  lines.push('The exploration agents will now analyze each partition...');

  return lines.join('\n');
}
