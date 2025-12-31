/**
 * Phase 3: Synthesis
 *
 * Merges partition analyses into unified codebase knowledge.
 * Handles deduplication, importance calibration, and organization.
 */

import type {
  ArchitectureKnowledge,
  CodebaseKnowledge,
  CodeInsight,
  ComponentKnowledge,
  ConventionKnowledge,
  GlobalContext,
  GotchaKnowledge,
  ModuleKnowledge,
  PartitionAnalysis,
  PatternKnowledge,
  SkippedInsight,
  SynthesizerResult,
} from './types.js';

/**
 * Input for the synthesizer
 */
export interface SynthesizerInput {
  globalContext: GlobalContext;
  partitionAnalyses: PartitionAnalysis[];
  existingMemoryTitles: string[];
}

/**
 * Generate the prompt for a synthesizer agent
 */
export function generateSynthesizerPrompt(input: SynthesizerInput): string {
  const prompt = {
    global_context: {
      projectName: input.globalContext.projectName,
      description: input.globalContext.description,
      structureOverview: input.globalContext.structureOverview,
      languages: input.globalContext.languages,
      frameworks: input.globalContext.frameworks,
      entryPoints: input.globalContext.entryPoints,
      totalPartitions: input.globalContext.totalPartitions,
    },
    partition_analyses: input.partitionAnalyses.map(pa => ({
      partitionId: pa.partitionId,
      partitionDescription: pa.partitionDescription,
      insights: pa.insights,
      keyFiles: pa.keyFiles,
      crossReferences: pa.crossReferences,
      confidence: pa.confidence,
      coverage: pa.coverage,
    })),
    existing_memory_titles: input.existingMemoryTitles,
  };

  return JSON.stringify(prompt, null, 2);
}

/**
 * Parse the response from a synthesizer agent
 */
export function parseSynthesizerResponse(
  response: string
): SynthesizerResult {
  const startTime = Date.now();

  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return createErrorResult('No JSON found in response', startTime);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<{
      knowledge: Partial<CodebaseKnowledge>;
      skipped: Partial<SkippedInsight>[];
      warnings: string[];
      processingTime: number;
    }>;

    // Normalize the knowledge structure
    const knowledge = normalizeKnowledge(parsed.knowledge ?? {});

    // Normalize skipped
    const skipped: SkippedInsight[] = [];
    if (Array.isArray(parsed.skipped)) {
      for (const s of parsed.skipped) {
        if (s && typeof s.title === 'string') {
          skipped.push({
            reason: normalizeSkipReason(s.reason),
            title: s.title,
            sourcePartition: typeof s.sourcePartition === 'string' ? s.sourcePartition : 'unknown',
          });
        }
      }
    }

    // Normalize warnings
    const warnings: string[] = [];
    if (Array.isArray(parsed.warnings)) {
      for (const w of parsed.warnings) {
        if (typeof w === 'string') {
          warnings.push(w);
        }
      }
    }

    return {
      knowledge,
      skipped,
      warnings,
      processingTime: parsed.processingTime ?? (Date.now() - startTime),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResult(`Parse error: ${message}`, startTime);
  }
}

/**
 * Create an error result
 */
function createErrorResult(error: string, startTime: number): SynthesizerResult {
  return {
    knowledge: createEmptyKnowledge(),
    skipped: [],
    warnings: [],
    processingTime: Date.now() - startTime,
    error,
  };
}

/**
 * Create empty knowledge structure
 */
function createEmptyKnowledge(): CodebaseKnowledge {
  return {
    overview: '',
    architecture: {
      style: 'Unknown',
      layers: [],
      dataFlow: '',
      keyDecisions: [],
      evidence: [],
    },
    patterns: [],
    conventions: [],
    modules: [],
    components: [],
    gotchas: [],
  };
}

/**
 * Normalize the knowledge structure from agent response
 */
function normalizeKnowledge(raw: Partial<CodebaseKnowledge>): CodebaseKnowledge {
  return {
    overview: typeof raw.overview === 'string' ? raw.overview : '',
    architecture: normalizeArchitecture(raw.architecture),
    patterns: normalizePatterns(raw.patterns),
    conventions: normalizeConventions(raw.conventions),
    modules: normalizeModules(raw.modules),
    components: normalizeComponents(raw.components),
    gotchas: normalizeGotchas(raw.gotchas),
  };
}

/**
 * Normalize architecture knowledge
 */
function normalizeArchitecture(raw: unknown): ArchitectureKnowledge {
  if (!raw || typeof raw !== 'object') {
    return {
      style: 'Unknown',
      layers: [],
      dataFlow: '',
      keyDecisions: [],
      evidence: [],
    };
  }

  const arch = raw as Record<string, unknown>;

  return {
    style: typeof arch.style === 'string' ? arch.style : 'Unknown',
    layers: normalizeStringArray(arch.layers),
    dataFlow: typeof arch.dataFlow === 'string' ? arch.dataFlow : '',
    keyDecisions: normalizeStringArray(arch.keyDecisions),
    evidence: normalizeStringArray(arch.evidence),
  };
}

/**
 * Normalize patterns array
 */
function normalizePatterns(raw: unknown): PatternKnowledge[] {
  if (!Array.isArray(raw)) return [];

  const patterns: PatternKnowledge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const p = item as Record<string, unknown>;
    if (typeof p.title !== 'string' || typeof p.description !== 'string') continue;

    patterns.push({
      title: p.title,
      description: p.description,
      scope: normalizeScope(p.scope),
      usedIn: normalizeStringArray(p.usedIn),
      tags: normalizeStringArray(p.tags),
    });
  }

  return patterns;
}

/**
 * Normalize conventions array
 */
function normalizeConventions(raw: unknown): ConventionKnowledge[] {
  if (!Array.isArray(raw)) return [];

  const conventions: ConventionKnowledge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const c = item as Record<string, unknown>;
    if (typeof c.title !== 'string' || typeof c.description !== 'string') continue;

    conventions.push({
      title: c.title,
      description: c.description,
      examples: normalizeStringArray(c.examples),
      tags: normalizeStringArray(c.tags),
    });
  }

  return conventions;
}

/**
 * Normalize modules array
 */
function normalizeModules(raw: unknown): ModuleKnowledge[] {
  if (!Array.isArray(raw)) return [];

  const modules: ModuleKnowledge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const m = item as Record<string, unknown>;
    if (typeof m.name !== 'string' || typeof m.purpose !== 'string') continue;

    modules.push({
      name: m.name,
      purpose: m.purpose,
      keyFiles: normalizeStringArray(m.keyFiles),
      dependencies: normalizeStringArray(m.dependencies),
      publicApi: typeof m.publicApi === 'string' ? m.publicApi : undefined,
    });
  }

  return modules;
}

/**
 * Normalize components array
 */
function normalizeComponents(raw: unknown): ComponentKnowledge[] {
  if (!Array.isArray(raw)) return [];

  const components: ComponentKnowledge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const c = item as Record<string, unknown>;
    if (typeof c.name !== 'string' || typeof c.path !== 'string') continue;

    components.push({
      name: c.name,
      path: c.path,
      role: typeof c.role === 'string' ? c.role : '',
      keyMethods: Array.isArray(c.keyMethods)
        ? c.keyMethods.filter((m): m is string => typeof m === 'string')
        : undefined,
    });
  }

  return components;
}

/**
 * Normalize gotchas array
 */
function normalizeGotchas(raw: unknown): GotchaKnowledge[] {
  if (!Array.isArray(raw)) return [];

  const gotchas: GotchaKnowledge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const g = item as Record<string, unknown>;
    if (typeof g.title !== 'string' || typeof g.description !== 'string') continue;

    gotchas.push({
      title: g.title,
      description: g.description,
      appliesTo: normalizeStringArray(g.appliesTo),
      tags: normalizeStringArray(g.tags),
      importance: normalizeImportance(g.importance, 6), // Gotchas default higher
    });
  }

  return gotchas;
}

/**
 * Normalize string array
 */
function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

/**
 * Normalize scope
 */
function normalizeScope(raw: unknown): 'project' | 'module' | 'file' {
  if (raw === 'project' || raw === 'module' || raw === 'file') {
    return raw;
  }
  return 'module';
}

/**
 * Normalize importance
 */
function normalizeImportance(raw: unknown, defaultValue: number): number {
  if (typeof raw === 'number' && !isNaN(raw)) {
    return Math.max(1, Math.min(10, Math.round(raw)));
  }
  return defaultValue;
}

/**
 * Normalize skip reason
 */
function normalizeSkipReason(raw: unknown): SkippedInsight['reason'] {
  const validReasons = ['duplicate', 'trivial', 'contradiction', 'low_importance', 'subsumed'];
  if (typeof raw === 'string' && validReasons.includes(raw)) {
    return raw as SkippedInsight['reason'];
  }
  return 'trivial';
}

/**
 * Local synthesis without calling an agent
 * Used as a fallback or for small codebases
 */
export function synthesizeLocally(
  input: SynthesizerInput
): SynthesizerResult {
  const startTime = Date.now();

  const allInsights: CodeInsight[] = [];
  for (const analysis of input.partitionAnalyses) {
    allInsights.push(...analysis.insights);
  }

  // Group insights by type
  const byType = groupInsightsByType(allInsights);

  // Build knowledge structure
  const knowledge: CodebaseKnowledge = {
    overview: buildOverview(input.globalContext, input.partitionAnalyses),
    architecture: buildArchitecture(byType.architecture, byType.decision),
    patterns: buildPatterns(byType.pattern),
    conventions: buildConventions(byType.convention),
    modules: buildModules(input.partitionAnalyses),
    components: buildComponents(byType.component),
    gotchas: buildGotchas(byType.gotcha),
  };

  // Find duplicates
  const seen = new Set<string>();
  const skipped: SkippedInsight[] = [];

  for (const insight of allInsights) {
    const key = insight.title.toLowerCase().trim();
    if (seen.has(key)) {
      skipped.push({
        reason: 'duplicate',
        title: insight.title,
        sourcePartition: 'unknown',
      });
    }
    seen.add(key);
  }

  // Check against existing memories
  for (const title of input.existingMemoryTitles) {
    const key = title.toLowerCase().trim();
    if (seen.has(key)) {
      skipped.push({
        reason: 'duplicate',
        title,
        sourcePartition: 'existing',
      });
    }
  }

  return {
    knowledge,
    skipped,
    warnings: [],
    processingTime: Date.now() - startTime,
  };
}

/**
 * Group insights by type
 */
function groupInsightsByType(
  insights: CodeInsight[]
): Record<CodeInsight['type'], CodeInsight[]> {
  const groups: Record<CodeInsight['type'], CodeInsight[]> = {
    architecture: [],
    pattern: [],
    convention: [],
    component: [],
    dataflow: [],
    dependency: [],
    gotcha: [],
    decision: [],
    integration: [],
  };

  for (const insight of insights) {
    groups[insight.type].push(insight);
  }

  return groups;
}

/**
 * Build overview from context and analyses
 */
function buildOverview(
  context: GlobalContext,
  analyses: PartitionAnalysis[]
): string {
  const parts: string[] = [];

  if (context.description) {
    parts.push(context.description);
  }

  if (context.frameworks.length > 0) {
    parts.push(`Built with ${context.frameworks.join(', ')}.`);
  }

  if (context.languages.length > 0) {
    parts.push(`Primary languages: ${context.languages.join(', ')}.`);
  }

  const totalInsights = analyses.reduce((sum, a) => sum + a.insights.length, 0);
  parts.push(`${analyses.length} modules analyzed, ${totalInsights} insights extracted.`);

  return parts.join(' ');
}

/**
 * Build architecture from insights
 */
function buildArchitecture(
  archInsights: CodeInsight[],
  decisionInsights: CodeInsight[]
): ArchitectureKnowledge {
  // Find the highest-importance architecture insight for style
  const sorted = [...archInsights].sort((a, b) => b.importance - a.importance);
  const topInsight = sorted[0];

  return {
    style: topInsight?.title ?? 'Standard application architecture',
    layers: extractLayers(archInsights),
    dataFlow: extractDataFlow(archInsights),
    keyDecisions: decisionInsights.slice(0, 5).map(i => i.insight),
    evidence: [...new Set(archInsights.flatMap(i => i.evidence))].slice(0, 10),
  };
}

/**
 * Extract layers from architecture insights
 */
function extractLayers(insights: CodeInsight[]): string[] {
  const layerKeywords = ['layer', 'tier', 'level', 'module', 'component'];
  const layers = new Set<string>();

  for (const insight of insights) {
    const text = `${insight.title} ${insight.insight}`.toLowerCase();

    if (text.includes('api') || text.includes('controller')) layers.add('API');
    if (text.includes('service') || text.includes('business')) layers.add('Service');
    if (text.includes('repository') || text.includes('data access')) layers.add('Data Access');
    if (text.includes('domain') || text.includes('model')) layers.add('Domain');
    if (text.includes('infrastructure')) layers.add('Infrastructure');
    if (text.includes('presentation') || text.includes('view')) layers.add('Presentation');
  }

  return Array.from(layers);
}

/**
 * Extract data flow description
 */
function extractDataFlow(insights: CodeInsight[]): string {
  const flowInsight = insights.find(i =>
    i.type === 'dataflow' ||
    i.title.toLowerCase().includes('flow') ||
    i.insight.toLowerCase().includes('flow')
  );

  return flowInsight?.insight ?? '';
}

/**
 * Build patterns from insights
 */
function buildPatterns(insights: CodeInsight[]): PatternKnowledge[] {
  return insights
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10)
    .map(i => ({
      title: i.title,
      description: i.insight,
      scope: i.scope,
      usedIn: i.evidence,
      tags: i.tags,
    }));
}

/**
 * Build conventions from insights
 */
function buildConventions(insights: CodeInsight[]): ConventionKnowledge[] {
  return insights
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10)
    .map(i => ({
      title: i.title,
      description: i.insight,
      examples: i.evidence.slice(0, 3),
      tags: i.tags,
    }));
}

/**
 * Build modules from partition analyses
 */
function buildModules(analyses: PartitionAnalysis[]): ModuleKnowledge[] {
  return analyses.map(a => ({
    name: a.partitionId,
    purpose: a.partitionDescription,
    keyFiles: a.keyFiles.map(kf => kf.path),
    dependencies: a.crossReferences.map(cr => cr.toArea),
  }));
}

/**
 * Build components from insights
 */
function buildComponents(insights: CodeInsight[]): ComponentKnowledge[] {
  return insights
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15)
    .map(i => ({
      name: i.title,
      path: i.evidence[0] ?? '',
      role: i.insight.slice(0, 200),
    }));
}

/**
 * Build gotchas from insights
 */
function buildGotchas(insights: CodeInsight[]): GotchaKnowledge[] {
  return insights
    .sort((a, b) => b.importance - a.importance)
    .map(i => ({
      title: i.title,
      description: i.insight,
      appliesTo: i.evidence,
      tags: i.tags,
      importance: Math.max(i.importance, 5), // Floor gotchas at 5
    }));
}

/**
 * Generate synthesis instructions for display
 */
export function generateSynthesisInstructions(
  analysisCount: number,
  insightCount: number
): string {
  return [
    '## Synthesis Phase',
    '',
    `Partition analyses: ${analysisCount}`,
    `Total insights: ${insightCount}`,
    '',
    'The synthesizer agent will now:',
    '1. Merge related insights from different partitions',
    '2. Deduplicate redundant findings',
    '3. Elevate cross-cutting patterns',
    '4. Build a coherent knowledge structure',
    '',
    'This may take 1-2 minutes...',
  ].join('\n');
}

/**
 * Format synthesis result for display
 */
export function formatSynthesisResult(result: SynthesizerResult): string {
  const lines: string[] = [
    '## Synthesis Complete',
    '',
  ];

  if (result.error) {
    lines.push(`Error: ${result.error}`);
    return lines.join('\n');
  }

  const k = result.knowledge;

  lines.push(`Overview: ${k.overview.slice(0, 200)}...`);
  lines.push('');
  lines.push(`Architecture style: ${k.architecture.style}`);
  lines.push(`Layers: ${k.architecture.layers.join(', ') || 'Not identified'}`);
  lines.push('');
  lines.push(`Patterns: ${k.patterns.length}`);
  lines.push(`Conventions: ${k.conventions.length}`);
  lines.push(`Modules: ${k.modules.length}`);
  lines.push(`Components: ${k.components.length}`);
  lines.push(`Gotchas: ${k.gotchas.length}`);
  lines.push('');
  lines.push(`Skipped: ${result.skipped.length} insights`);

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}
