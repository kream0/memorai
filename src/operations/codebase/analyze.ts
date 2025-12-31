/**
 * Codebase Analysis
 *
 * Phase 1 of the scan pipeline: Analyzes codebase structure,
 * estimates token counts, and prepares for partitioning.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import {
  CHARS_PER_TOKEN,
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
  MAX_FILE_TOKENS,
  type CodebaseManifest,
  type DirectoryNode,
  type FileInfo,
  type GlobalContext,
  type LanguageBreakdown,
  type SkippedFile,
} from './types.js';

/**
 * Language detection by file extension
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.swift': 'Swift',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.hpp': 'C++',
  '.cc': 'C++',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.scala': 'Scala',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.clj': 'Clojure',
  '.hs': 'Haskell',
  '.ml': 'OCaml',
  '.fs': 'F#',
  '.r': 'R',
  '.jl': 'Julia',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.sql': 'SQL',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
};

/**
 * Framework detection patterns
 */
interface FrameworkPattern {
  name: string;
  indicators: string[];
}

const FRAMEWORK_PATTERNS: FrameworkPattern[] = [
  { name: 'Next.js', indicators: ['next.config', 'pages/', 'app/'] },
  { name: 'React', indicators: ['react', 'jsx', 'tsx'] },
  { name: 'Vue', indicators: ['vue.config', '.vue'] },
  { name: 'Svelte', indicators: ['svelte.config', '.svelte'] },
  { name: 'Express', indicators: ['express'] },
  { name: 'Fastify', indicators: ['fastify'] },
  { name: 'NestJS', indicators: ['@nestjs', 'nest-cli'] },
  { name: 'FastAPI', indicators: ['fastapi'] },
  { name: 'Django', indicators: ['django', 'manage.py'] },
  { name: 'Flask', indicators: ['flask'] },
  { name: 'Rails', indicators: ['rails', 'Gemfile'] },
  { name: 'Spring', indicators: ['springframework', 'spring-boot'] },
  { name: 'Actix', indicators: ['actix'] },
  { name: 'Gin', indicators: ['gin-gonic'] },
];

/**
 * Check if a path matches any exclude pattern
 */
function isExcluded(relativePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    // Simple glob matching
    const regex = patternToRegex(pattern);
    if (regex.test(relativePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path matches any include pattern
 */
function isIncluded(relativePath: string, includePatterns: string[]): boolean {
  for (const pattern of includePatterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(relativePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert glob pattern to regex
 *
 * Handles patterns like:
 * - `**\/node_modules\/**` matches `node_modules/foo` and `bar/node_modules/foo`
 * - `*.test.ts` matches `foo.test.ts`
 * - `src\/**\/*.ts` matches `src/foo.ts` and `src/bar/baz.ts`
 */
function patternToRegex(pattern: string): RegExp {
  let escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*');

  // If pattern starts with **/, make the leading part optional
  // so it matches both `node_modules/foo` and `bar/node_modules/foo`
  if (pattern.startsWith('**/')) {
    // Replace leading `.*\/` with `(?:.*\/)?` to make it optional
    escaped = escaped.replace(/^\.\*\//, '(?:.*/)?');
  }

  return new RegExp(`^${escaped}$`);
}

/**
 * Estimate token count from file size
 */
function estimateTokens(sizeInBytes: number): number {
  return Math.ceil(sizeInBytes / CHARS_PER_TOKEN);
}

/**
 * Count lines in a file
 */
function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? 'Unknown';
}

/**
 * Check if file is binary (non-text)
 */
function isBinaryFile(filePath: string): boolean {
  const binaryExtensions = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.wasm', '.woff', '.woff2', '.ttf', '.eot',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.db', '.sqlite', '.sqlite3',
  ]);
  return binaryExtensions.has(extname(filePath).toLowerCase());
}

/**
 * Scan a directory and build the structure tree
 */
function scanDirectory(
  dirPath: string,
  projectDir: string,
  includePatterns: string[],
  excludePatterns: string[],
  skippedFiles: SkippedFile[],
  maxDepth = 10,
  currentDepth = 0
): DirectoryNode {
  const relativePath = relative(projectDir, dirPath) || '.';
  const node: DirectoryNode = {
    path: relativePath,
    files: [],
    children: [],
    totalTokens: 0,
    primaryLanguage: 'Unknown',
    fileCount: 0,
  };

  if (currentDepth >= maxDepth) {
    return node;
  }

  try {
    const entries = readdirSync(dirPath);
    const languageCounts: Record<string, number> = {};

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const entryRelativePath = relative(projectDir, fullPath);

      // Skip hidden files/directories
      if (entry.startsWith('.')) {
        continue;
      }

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Check exclusion for directory
          if (isExcluded(entryRelativePath + '/', excludePatterns)) {
            continue;
          }

          const childNode = scanDirectory(
            fullPath,
            projectDir,
            includePatterns,
            excludePatterns,
            skippedFiles,
            maxDepth,
            currentDepth + 1
          );

          if (childNode.fileCount > 0 || childNode.children.length > 0) {
            node.children.push(childNode);
            node.totalTokens += childNode.totalTokens;
            node.fileCount += childNode.fileCount;

            // Aggregate language counts
            if (childNode.primaryLanguage !== 'Unknown') {
              languageCounts[childNode.primaryLanguage] =
                (languageCounts[childNode.primaryLanguage] ?? 0) +
                childNode.totalTokens;
            }
          }
        } else if (stat.isFile()) {
          // Check exclusion
          if (isExcluded(entryRelativePath, excludePatterns)) {
            continue;
          }

          // Check inclusion
          if (!isIncluded(entryRelativePath, includePatterns)) {
            continue;
          }

          // Check if binary
          if (isBinaryFile(fullPath)) {
            skippedFiles.push({
              path: entryRelativePath,
              reason: 'binary',
            });
            continue;
          }

          const tokens = estimateTokens(stat.size);

          // Check if too large
          if (tokens > MAX_FILE_TOKENS) {
            skippedFiles.push({
              path: entryRelativePath,
              reason: 'too_large',
              size: stat.size,
              tokens,
            });
            continue;
          }

          const language = detectLanguage(fullPath);
          let lines = 0;

          try {
            const content = readFileSync(fullPath, 'utf-8');
            lines = countLines(content);
          } catch {
            // Use estimate if can't read
            lines = Math.ceil(stat.size / 40); // ~40 chars per line average
          }

          const fileInfo: FileInfo = {
            path: fullPath,
            relativePath: entryRelativePath,
            size: stat.size,
            tokens,
            language,
            lines,
          };

          node.files.push(fileInfo);
          node.totalTokens += tokens;
          node.fileCount++;

          if (language !== 'Unknown') {
            languageCounts[language] = (languageCounts[language] ?? 0) + tokens;
          }
        }
      } catch {
        // Skip files we can't access
      }
    }

    // Determine primary language by token count
    if (Object.keys(languageCounts).length > 0) {
      node.primaryLanguage = Object.entries(languageCounts).sort(
        ([, a], [, b]) => b - a
      )[0]![0];
    }
  } catch {
    // Skip directories we can't access
  }

  return node;
}

/**
 * Calculate language breakdown from directory tree
 */
function calculateLanguageBreakdown(root: DirectoryNode): LanguageBreakdown {
  const counts: Record<string, number> = {};

  function traverse(node: DirectoryNode): void {
    for (const file of node.files) {
      if (file.language !== 'Unknown') {
        counts[file.language] = (counts[file.language] ?? 0) + file.tokens;
      }
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(root);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return {};

  const breakdown: LanguageBreakdown = {};
  for (const [lang, count] of Object.entries(counts)) {
    breakdown[lang] = Math.round((count / total) * 100);
  }

  return breakdown;
}

/**
 * Find entry point files
 */
function findEntryPoints(root: DirectoryNode): string[] {
  const entryPatterns = [
    'main.ts', 'main.js', 'main.py', 'main.go', 'main.rs',
    'index.ts', 'index.js', 'index.py',
    'app.ts', 'app.js', 'app.py',
    'server.ts', 'server.js', 'server.py',
    'mod.ts', 'mod.rs',
    'lib.rs',
  ];

  const entries: string[] = [];

  function traverse(node: DirectoryNode): void {
    for (const file of node.files) {
      const name = basename(file.relativePath);
      if (entryPatterns.includes(name)) {
        entries.push(file.relativePath);
      }
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(root);
  return entries.slice(0, 10); // Limit to 10
}

/**
 * Find config files
 */
function findConfigFiles(projectDir: string): string[] {
  const configPatterns = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'setup.py',
    'Cargo.toml',
    'go.mod',
    'Gemfile',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'Makefile',
    'CMakeLists.txt',
    'docker-compose.yml',
    'docker-compose.yaml',
    'Dockerfile',
    '.env.example',
  ];

  const found: string[] = [];
  for (const pattern of configPatterns) {
    if (existsSync(join(projectDir, pattern))) {
      found.push(pattern);
    }
  }

  return found;
}

/**
 * Detect frameworks from config files
 */
function detectFrameworks(projectDir: string, configFiles: string[]): string[] {
  const frameworks: Set<string> = new Set();

  // Check package.json
  if (configFiles.includes('package.json')) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(projectDir, 'package.json'), 'utf-8')
      ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if ('next' in deps) frameworks.add('Next.js');
      else if ('react' in deps) frameworks.add('React');
      if ('express' in deps) frameworks.add('Express');
      if ('fastify' in deps) frameworks.add('Fastify');
      if ('@nestjs/core' in deps) frameworks.add('NestJS');
      if ('vue' in deps) frameworks.add('Vue');
      if ('svelte' in deps) frameworks.add('Svelte');
    } catch {
      // Skip
    }
  }

  // Check Python
  if (configFiles.includes('pyproject.toml') || existsSync(join(projectDir, 'requirements.txt'))) {
    try {
      let content = '';
      if (existsSync(join(projectDir, 'requirements.txt'))) {
        content = readFileSync(join(projectDir, 'requirements.txt'), 'utf-8').toLowerCase();
      }
      if (existsSync(join(projectDir, 'pyproject.toml'))) {
        content += readFileSync(join(projectDir, 'pyproject.toml'), 'utf-8').toLowerCase();
      }

      if (content.includes('fastapi')) frameworks.add('FastAPI');
      else if (content.includes('django')) frameworks.add('Django');
      else if (content.includes('flask')) frameworks.add('Flask');
    } catch {
      // Skip
    }
  }

  return Array.from(frameworks);
}

/**
 * Get project name from config files
 */
function getProjectName(projectDir: string, configFiles: string[]): string {
  // Try package.json
  if (configFiles.includes('package.json')) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(projectDir, 'package.json'), 'utf-8')
      ) as { name?: string };
      if (pkg.name) return pkg.name;
    } catch {
      // Skip
    }
  }

  // Try Cargo.toml
  if (configFiles.includes('Cargo.toml')) {
    try {
      const content = readFileSync(join(projectDir, 'Cargo.toml'), 'utf-8');
      const match = content.match(/name\s*=\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    } catch {
      // Skip
    }
  }

  // Try go.mod
  if (configFiles.includes('go.mod')) {
    try {
      const content = readFileSync(join(projectDir, 'go.mod'), 'utf-8');
      const match = content.match(/module\s+(\S+)/);
      if (match?.[1]) {
        const parts = match[1].split('/');
        return parts[parts.length - 1] ?? basename(projectDir);
      }
    } catch {
      // Skip
    }
  }

  // Fall back to directory name
  return basename(projectDir);
}

/**
 * Get project description from README
 */
function getProjectDescription(projectDir: string): string {
  const readmePaths = ['README.md', 'readme.md', 'README', 'README.txt'];

  for (const readme of readmePaths) {
    const fullPath = join(projectDir, readme);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        // Get first paragraph after title
        const lines = content.split('\n');
        let foundTitle = false;
        const descLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('#') && !foundTitle) {
            foundTitle = true;
            continue;
          }
          if (foundTitle) {
            if (line.trim() === '') {
              if (descLines.length > 0) break;
              continue;
            }
            if (line.startsWith('#')) break;
            descLines.push(line.trim());
          }
        }

        if (descLines.length > 0) {
          return descLines.join(' ').slice(0, 500);
        }
      } catch {
        // Skip
      }
    }
  }

  return '';
}

/**
 * Get README content for global context
 */
function getReadmeContent(projectDir: string): string | undefined {
  const readmePaths = ['README.md', 'readme.md', 'README'];

  for (const readme of readmePaths) {
    const fullPath = join(projectDir, readme);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        // Truncate if too long
        if (content.length > 10000) {
          return content.slice(0, 10000) + '\n\n[... truncated ...]';
        }
        return content;
      } catch {
        // Skip
      }
    }
  }

  return undefined;
}

/**
 * Generate structure overview for global context
 */
function generateStructureOverview(root: DirectoryNode, maxDepth = 3): string {
  const lines: string[] = [];

  function traverse(node: DirectoryNode, depth: number, prefix: string): void {
    if (depth > maxDepth) return;

    const name = node.path === '.' ? '.' : basename(node.path);
    const tokenInfo = `(${formatTokens(node.totalTokens)}, ${node.fileCount} files)`;
    lines.push(`${prefix}${name}/ ${tokenInfo}`);

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      const isLast = i === node.children.length - 1;
      const newPrefix = prefix + (isLast ? '  ' : '| ');
      traverse(child, depth + 1, newPrefix);
    }
  }

  traverse(root, 0, '');
  return lines.join('\n');
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k tokens`;
  }
  return `${tokens} tokens`;
}

/**
 * Generate config summary
 */
function generateConfigSummary(projectDir: string, configFiles: string[]): string {
  const summaryParts: string[] = [];

  if (configFiles.includes('package.json')) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(projectDir, 'package.json'), 'utf-8')
      ) as { scripts?: Record<string, string> };
      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts).slice(0, 5);
        summaryParts.push(`npm scripts: ${scripts.join(', ')}`);
      }
    } catch {
      // Skip
    }
  }

  if (configFiles.includes('tsconfig.json')) {
    summaryParts.push('TypeScript project with tsconfig.json');
  }

  if (configFiles.includes('Dockerfile') || configFiles.includes('docker-compose.yml')) {
    summaryParts.push('Docker containerization configured');
  }

  return summaryParts.join('; ') || 'Standard project configuration';
}

/**
 * Generate hash for manifest validation
 */
function generateManifestHash(
  projectDir: string,
  totalFiles: number,
  totalTokens: number
): string {
  const data = `${projectDir}:${totalFiles}:${totalTokens}:${Date.now()}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/**
 * Analyze a codebase and create a manifest
 */
export function analyzeCodebase(
  projectDir: string,
  options: {
    include?: string[];
    exclude?: string[];
  } = {}
): CodebaseManifest {
  const resolvedDir = resolve(projectDir);
  const includePatterns = options.include ?? DEFAULT_INCLUDE_PATTERNS;
  const excludePatterns = options.exclude ?? DEFAULT_EXCLUDE_PATTERNS;

  const skippedFiles: SkippedFile[] = [];

  // Scan directory structure
  const structure = scanDirectory(
    resolvedDir,
    resolvedDir,
    includePatterns,
    excludePatterns,
    skippedFiles
  );

  // Calculate language breakdown
  const languages = calculateLanguageBreakdown(structure);

  // Find key files
  const entryPoints = findEntryPoints(structure);
  const configFiles = findConfigFiles(resolvedDir);

  // Detect frameworks
  const frameworks = detectFrameworks(resolvedDir, configFiles);

  // Get project info
  const projectName = getProjectName(resolvedDir, configFiles);
  const description = getProjectDescription(resolvedDir);
  const readme = getReadmeContent(resolvedDir);

  // Build global context
  const globalContext: GlobalContext = {
    projectName,
    description,
    structureOverview: generateStructureOverview(structure),
    languages: Object.keys(languages),
    frameworks,
    entryPoints,
    configSummary: generateConfigSummary(resolvedDir, configFiles),
    readme,
    totalPartitions: 0, // Will be set after partitioning
  };

  // Create manifest
  const manifest: CodebaseManifest = {
    projectDir: resolvedDir,
    projectName,
    totalFiles: structure.fileCount,
    totalTokens: structure.totalTokens,
    structure,
    languages,
    entryPoints,
    configFiles,
    partitions: [], // Will be populated by partition step
    globalContext,
    skippedFiles,
    hash: generateManifestHash(resolvedDir, structure.fileCount, structure.totalTokens),
    createdAt: new Date().toISOString(),
  };

  return manifest;
}

/**
 * Get all files from a directory tree
 */
export function getAllFiles(root: DirectoryNode): FileInfo[] {
  const files: FileInfo[] = [];

  function traverse(node: DirectoryNode): void {
    files.push(...node.files);
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(root);
  return files;
}

/**
 * Format manifest summary for display
 */
export function formatManifestSummary(manifest: CodebaseManifest): string {
  const lines: string[] = [
    `Project: ${manifest.projectName}`,
    `Path: ${manifest.projectDir}`,
    '',
    `Files: ${manifest.totalFiles}`,
    `Tokens: ${formatTokens(manifest.totalTokens)}`,
    '',
    'Languages:',
  ];

  for (const [lang, pct] of Object.entries(manifest.languages).sort(
    ([, a], [, b]) => b - a
  )) {
    lines.push(`  ${lang}: ${pct}%`);
  }

  if (manifest.globalContext.frameworks.length > 0) {
    lines.push('');
    lines.push(`Frameworks: ${manifest.globalContext.frameworks.join(', ')}`);
  }

  if (manifest.entryPoints.length > 0) {
    lines.push('');
    lines.push(`Entry points: ${manifest.entryPoints.slice(0, 5).join(', ')}`);
  }

  if (manifest.skippedFiles.length > 0) {
    lines.push('');
    lines.push(`Skipped: ${manifest.skippedFiles.length} files`);
    const tooLarge = manifest.skippedFiles.filter(f => f.reason === 'too_large');
    if (tooLarge.length > 0) {
      lines.push(`  Too large: ${tooLarge.length} (>${formatTokens(MAX_FILE_TOKENS)} each)`);
    }
  }

  return lines.join('\n');
}
