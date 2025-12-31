/**
 * Intelligent Partitioning
 *
 * Creates logical partitions of a codebase for parallel analysis.
 * Respects module boundaries and balances partition sizes.
 */

import { basename, dirname } from 'node:path';
import { getAllFiles } from './analyze.js';
import {
  DEFAULT_PARTITION_CONFIG,
  type CodebaseManifest,
  type DirectoryNode,
  type FileInfo,
  type PartitionConfig,
  type PartitionSpec,
} from './types.js';

/**
 * A partition being built
 */
interface PartitionBuilder {
  id: string;
  description: string;
  directories: Set<string>;
  files: FileInfo[];
  tokens: number;
  relatedPartitions: Set<string>;
  priority: number;
}

/**
 * Create partitions for a codebase manifest
 */
export function createPartitions(
  manifest: CodebaseManifest,
  config: Partial<PartitionConfig> = {}
): PartitionSpec[] {
  const cfg: PartitionConfig = { ...DEFAULT_PARTITION_CONFIG, ...config };

  // If codebase is small enough, use single partition
  if (manifest.totalTokens <= cfg.maxTokens) {
    return [createSinglePartition(manifest)];
  }

  // Choose partitioning strategy
  switch (cfg.mode) {
    case 'directory':
      return partitionByDirectory(manifest, cfg);
    case 'flat':
      return partitionFlat(manifest, cfg);
    case 'auto':
    default:
      return partitionAuto(manifest, cfg);
  }
}

/**
 * Create a single partition for small codebases
 */
function createSinglePartition(manifest: CodebaseManifest): PartitionSpec {
  const allFiles = getAllFiles(manifest.structure);

  return {
    id: 'partition-01',
    description: `Complete codebase: ${manifest.projectName}`,
    directories: ['.'],
    files: allFiles.map(f => f.relativePath),
    estimatedTokens: manifest.totalTokens,
    relatedPartitions: [],
    priority: 10,
  };
}

/**
 * Partition by top-level directories
 */
function partitionByDirectory(
  manifest: CodebaseManifest,
  config: PartitionConfig
): PartitionSpec[] {
  const partitions: PartitionSpec[] = [];
  let partitionNum = 1;

  // Process each top-level directory
  for (const child of manifest.structure.children) {
    if (child.totalTokens < config.minTokens) {
      continue; // Too small, will be merged later
    }

    if (child.totalTokens > config.maxTokens) {
      // Directory too large, need to split
      const subPartitions = splitLargeDirectory(child, config, partitionNum);
      partitions.push(...subPartitions);
      partitionNum += subPartitions.length;
    } else {
      partitions.push(directoryToPartition(child, partitionNum++));
    }
  }

  // Handle root-level files
  if (manifest.structure.files.length > 0) {
    const rootTokens = manifest.structure.files.reduce((sum, f) => sum + f.tokens, 0);
    if (rootTokens >= config.minTokens) {
      partitions.push({
        id: `partition-${String(partitionNum).padStart(2, '0')}`,
        description: 'Root-level files',
        directories: ['.'],
        files: manifest.structure.files.map(f => f.relativePath),
        estimatedTokens: rootTokens,
        relatedPartitions: [],
        priority: 5,
      });
    }
  }

  // Merge small partitions
  return mergeSmallPartitions(partitions, config);
}

/**
 * Partition using flat equal-sized chunks
 */
function partitionFlat(
  manifest: CodebaseManifest,
  config: PartitionConfig
): PartitionSpec[] {
  const allFiles = getAllFiles(manifest.structure);

  // Sort files by directory to keep related files together
  allFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const partitions: PartitionSpec[] = [];
  let currentFiles: FileInfo[] = [];
  let currentTokens = 0;
  let partitionNum = 1;

  for (const file of allFiles) {
    if (currentTokens + file.tokens > config.targetTokens && currentFiles.length > 0) {
      // Create partition
      partitions.push(filesToPartition(currentFiles, currentTokens, partitionNum++));
      currentFiles = [];
      currentTokens = 0;
    }

    currentFiles.push(file);
    currentTokens += file.tokens;
  }

  // Final partition
  if (currentFiles.length > 0) {
    partitions.push(filesToPartition(currentFiles, currentTokens, partitionNum));
  }

  return partitions;
}

/**
 * Automatic intelligent partitioning
 */
function partitionAuto(
  manifest: CodebaseManifest,
  config: PartitionConfig
): PartitionSpec[] {
  const builders: PartitionBuilder[] = [];
  let partitionNum = 1;

  // First pass: identify natural module boundaries
  const modules = identifyModules(manifest.structure);

  // Group modules into partitions
  for (const module of modules) {
    if (module.tokens > config.maxTokens) {
      // Module too large, split it
      const subPartitions = splitModule(module, config, partitionNum);
      builders.push(...subPartitions);
      partitionNum += subPartitions.length;
    } else if (module.tokens >= config.minTokens) {
      // Module is right-sized
      builders.push(moduleToBuilder(module, partitionNum++));
    } else {
      // Module too small, try to merge with siblings
      const merged = tryMergeModule(module, builders, config);
      if (!merged) {
        builders.push(moduleToBuilder(module, partitionNum++));
      }
    }
  }

  // Handle orphan files (not in any module)
  const orphanFiles = findOrphanFiles(manifest.structure, modules);
  if (orphanFiles.length > 0) {
    const orphanTokens = orphanFiles.reduce((sum, f) => sum + f.tokens, 0);
    if (orphanTokens >= config.minTokens) {
      builders.push({
        id: `partition-${String(partitionNum).padStart(2, '0')}`,
        description: 'Configuration and utility files',
        directories: new Set(['.', ...orphanFiles.map(f => dirname(f.relativePath))]),
        files: orphanFiles,
        tokens: orphanTokens,
        relatedPartitions: new Set(),
        priority: 3,
      });
    } else if (builders.length > 0) {
      // Merge into smallest existing partition
      const smallest = builders.sort((a, b) => a.tokens - b.tokens)[0]!;
      smallest.files.push(...orphanFiles);
      smallest.tokens += orphanTokens;
    }
  }

  // Detect cross-partition relationships
  detectRelationships(builders);

  // Assign priorities based on importance
  assignPriorities(builders, manifest);

  // Convert builders to specs
  return builders
    .sort((a, b) => b.priority - a.priority)
    .slice(0, config.maxPartitions)
    .map(builderToSpec);
}

/**
 * Identify logical modules in the codebase
 */
interface ModuleInfo {
  path: string;
  name: string;
  files: FileInfo[];
  tokens: number;
  depth: number;
}

function identifyModules(root: DirectoryNode): ModuleInfo[] {
  const modules: ModuleInfo[] = [];

  function traverse(node: DirectoryNode, depth: number): void {
    // A module is a directory with files or significant subdirectories
    const hasSignificantContent =
      node.files.length > 0 ||
      node.children.some(c => c.fileCount > 3);

    const isModuleBoundary =
      hasSignificantContent &&
      depth >= 1 &&
      (node.totalTokens > 5000 || node.fileCount > 5);

    if (isModuleBoundary) {
      modules.push({
        path: node.path,
        name: generateModuleName(node),
        files: collectAllFiles(node),
        tokens: node.totalTokens,
        depth,
      });
      // Don't traverse deeper - this is the module boundary
      return;
    }

    // Continue traversing
    for (const child of node.children) {
      traverse(child, depth + 1);
    }

    // Handle root-level files
    if (depth === 0 && node.files.length > 0) {
      modules.push({
        path: '.',
        name: 'root',
        files: [...node.files],
        tokens: node.files.reduce((sum, f) => sum + f.tokens, 0),
        depth: 0,
      });
    }
  }

  traverse(root, 0);
  return modules;
}

/**
 * Generate a descriptive name for a module
 */
function generateModuleName(node: DirectoryNode): string {
  const path = node.path;
  const parts = path.split('/');

  // Use last two path components for description
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }

  return parts[parts.length - 1] ?? path;
}

/**
 * Collect all files from a directory tree
 */
function collectAllFiles(node: DirectoryNode): FileInfo[] {
  const files: FileInfo[] = [...node.files];

  for (const child of node.children) {
    files.push(...collectAllFiles(child));
  }

  return files;
}

/**
 * Split a large module into smaller partitions
 */
function splitModule(
  module: ModuleInfo,
  config: PartitionConfig,
  startNum: number
): PartitionBuilder[] {
  const builders: PartitionBuilder[] = [];

  // Group files by subdirectory
  const bySubdir = new Map<string, FileInfo[]>();
  for (const file of module.files) {
    const rel = file.relativePath.replace(module.path + '/', '');
    const subdir = dirname(rel);
    const key = subdir === '.' ? module.path : `${module.path}/${subdir.split('/')[0]}`;

    if (!bySubdir.has(key)) {
      bySubdir.set(key, []);
    }
    bySubdir.get(key)!.push(file);
  }

  // Create partitions from subdirectory groups
  let partitionNum = startNum;
  let currentBuilder: PartitionBuilder | null = null;

  for (const [subdir, files] of bySubdir.entries()) {
    const subdirTokens = files.reduce((sum, f) => sum + f.tokens, 0);

    if (currentBuilder && currentBuilder.tokens + subdirTokens <= config.targetTokens) {
      // Merge into current partition
      currentBuilder.files.push(...files);
      currentBuilder.tokens += subdirTokens;
      currentBuilder.directories.add(subdir);
    } else {
      // Start new partition
      if (currentBuilder) {
        builders.push(currentBuilder);
      }

      currentBuilder = {
        id: `partition-${String(partitionNum++).padStart(2, '0')}`,
        description: `${module.name}: ${basename(subdir)}`,
        directories: new Set([subdir]),
        files,
        tokens: subdirTokens,
        relatedPartitions: new Set(),
        priority: 5,
      };
    }
  }

  if (currentBuilder) {
    builders.push(currentBuilder);
  }

  return builders;
}

/**
 * Split a large directory into partitions
 */
function splitLargeDirectory(
  node: DirectoryNode,
  config: PartitionConfig,
  startNum: number
): PartitionSpec[] {
  const module: ModuleInfo = {
    path: node.path,
    name: generateModuleName(node),
    files: collectAllFiles(node),
    tokens: node.totalTokens,
    depth: 1,
  };

  return splitModule(module, config, startNum).map(builderToSpec);
}

/**
 * Convert a directory node to a partition
 */
function directoryToPartition(node: DirectoryNode, num: number): PartitionSpec {
  const files = collectAllFiles(node);

  return {
    id: `partition-${String(num).padStart(2, '0')}`,
    description: `${generateModuleName(node)} (${node.primaryLanguage})`,
    directories: [node.path],
    files: files.map(f => f.relativePath),
    estimatedTokens: node.totalTokens,
    relatedPartitions: [],
    priority: 5,
  };
}

/**
 * Convert files to a partition
 */
function filesToPartition(
  files: FileInfo[],
  tokens: number,
  num: number
): PartitionSpec {
  const dirs = new Set(files.map(f => dirname(f.relativePath)));

  return {
    id: `partition-${String(num).padStart(2, '0')}`,
    description: `Files chunk ${num}`,
    directories: Array.from(dirs),
    files: files.map(f => f.relativePath),
    estimatedTokens: tokens,
    relatedPartitions: [],
    priority: 5,
  };
}

/**
 * Convert module to partition builder
 */
function moduleToBuilder(module: ModuleInfo, num: number): PartitionBuilder {
  return {
    id: `partition-${String(num).padStart(2, '0')}`,
    description: module.name,
    directories: new Set([module.path]),
    files: module.files,
    tokens: module.tokens,
    relatedPartitions: new Set(),
    priority: 5,
  };
}

/**
 * Try to merge a small module with an existing partition
 */
function tryMergeModule(
  module: ModuleInfo,
  builders: PartitionBuilder[],
  config: PartitionConfig
): boolean {
  // Find a partition in the same parent directory
  const parentDir = dirname(module.path);

  for (const builder of builders) {
    const builderParent = dirname(Array.from(builder.directories)[0] ?? '');

    if (builderParent === parentDir && builder.tokens + module.tokens <= config.targetTokens) {
      builder.files.push(...module.files);
      builder.tokens += module.tokens;
      builder.directories.add(module.path);
      builder.description = `${builderParent} modules`;
      return true;
    }
  }

  return false;
}

/**
 * Find files not covered by any module
 */
function findOrphanFiles(root: DirectoryNode, modules: ModuleInfo[]): FileInfo[] {
  const coveredPaths = new Set(
    modules.flatMap(m => m.files.map(f => f.relativePath))
  );

  const orphans: FileInfo[] = [];

  function traverse(node: DirectoryNode): void {
    for (const file of node.files) {
      if (!coveredPaths.has(file.relativePath)) {
        orphans.push(file);
      }
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(root);
  return orphans;
}

/**
 * Merge small partitions together
 */
function mergeSmallPartitions(
  partitions: PartitionSpec[],
  config: PartitionConfig
): PartitionSpec[] {
  const result: PartitionSpec[] = [];
  let accumulated: PartitionSpec | null = null;

  // Sort by size
  const sorted = [...partitions].sort((a, b) => a.estimatedTokens - b.estimatedTokens);

  for (const partition of sorted) {
    if (partition.estimatedTokens >= config.minTokens) {
      if (accumulated) {
        result.push(accumulated);
        accumulated = null;
      }
      result.push(partition);
    } else if (!accumulated) {
      accumulated = { ...partition };
    } else if (accumulated.estimatedTokens + partition.estimatedTokens <= config.targetTokens) {
      // Merge
      accumulated.directories = [...accumulated.directories, ...partition.directories];
      accumulated.files = [...accumulated.files, ...partition.files];
      accumulated.estimatedTokens += partition.estimatedTokens;
      accumulated.description = 'Merged modules';
    } else {
      result.push(accumulated);
      accumulated = { ...partition };
    }
  }

  if (accumulated) {
    result.push(accumulated);
  }

  return result;
}

/**
 * Detect relationships between partitions
 */
function detectRelationships(builders: PartitionBuilder[]): void {
  // Build a map of file paths to partition IDs
  const fileToPartition = new Map<string, string>();
  for (const builder of builders) {
    for (const file of builder.files) {
      fileToPartition.set(file.relativePath, builder.id);
    }
  }

  // For each partition, check if its directories relate to others
  for (const builder of builders) {
    const dirs = Array.from(builder.directories);

    for (const otherBuilder of builders) {
      if (otherBuilder.id === builder.id) continue;

      // Check for directory prefix relationships
      const otherDirs = Array.from(otherBuilder.directories);
      for (const dir of dirs) {
        for (const otherDir of otherDirs) {
          if (dir.startsWith(otherDir + '/') || otherDir.startsWith(dir + '/')) {
            builder.relatedPartitions.add(otherBuilder.id);
          }
        }
      }
    }
  }
}

/**
 * Assign priorities based on content importance
 */
function assignPriorities(builders: PartitionBuilder[], manifest: CodebaseManifest): void {
  const entryPointDirs = new Set(
    manifest.entryPoints.map(ep => dirname(ep))
  );

  for (const builder of builders) {
    let priority = 5; // Default

    const dirs = Array.from(builder.directories);
    const files = builder.files.map(f => f.relativePath);

    // Boost if contains entry points
    if (files.some(f => manifest.entryPoints.includes(f))) {
      priority += 3;
    }

    // Boost if in entry point directory
    if (dirs.some(d => entryPointDirs.has(d))) {
      priority += 2;
    }

    // Boost for core directories
    if (dirs.some(d => /^src\/?$|^lib\/?$|^core\/?$/i.test(d))) {
      priority += 2;
    }

    // Reduce for test directories
    if (dirs.some(d => /test|spec|__test__|e2e/i.test(d))) {
      priority -= 2;
    }

    // Reduce for generated/build directories
    if (dirs.some(d => /generated|build|dist/i.test(d))) {
      priority -= 3;
    }

    builder.priority = Math.max(1, Math.min(10, priority));
  }
}

/**
 * Convert builder to final spec
 */
function builderToSpec(builder: PartitionBuilder): PartitionSpec {
  return {
    id: builder.id,
    description: builder.description,
    directories: Array.from(builder.directories),
    files: builder.files.map(f => f.relativePath),
    estimatedTokens: builder.tokens,
    relatedPartitions: Array.from(builder.relatedPartitions),
    priority: builder.priority,
  };
}

/**
 * Format partition summary for display
 */
export function formatPartitionSummary(partitions: PartitionSpec[]): string {
  const lines: string[] = [
    `Partitions: ${partitions.length}`,
    '',
  ];

  for (const partition of partitions) {
    const tokens =
      partition.estimatedTokens >= 1000
        ? `${(partition.estimatedTokens / 1000).toFixed(1)}k`
        : String(partition.estimatedTokens);

    lines.push(
      `${partition.id}: ${partition.description} (${tokens} tokens, ${partition.files.length} files)`
    );

    // Show directories
    for (const dir of partition.directories.slice(0, 3)) {
      lines.push(`  - ${dir}/`);
    }
    if (partition.directories.length > 3) {
      lines.push(`  - ... and ${partition.directories.length - 3} more`);
    }
  }

  return lines.join('\n');
}
