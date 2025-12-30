import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, resolve } from 'node:path';
import type {
  BootstrapScanResult,
  CodePatterns,
  CommitInfo,
  DocumentInfo,
  ProjectStructure,
  TrackingFileHistory,
} from '../types/memory.js';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'dist',
  'build',
  '.memorai',
  '.next',
  'coverage',
]);

const KEY_FILE_NAMES = new Set([
  'main.py',
  'app.py',
  'index.ts',
  'index.js',
  'server.py',
  'config.py',
  'settings.py',
  'database.py',
  'models.py',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
]);

/**
 * Get current codebase structure.
 */
export function getProjectStructure(
  projectDir: string,
  maxDepth = 3
): ProjectStructure {
  const structure: ProjectStructure = {
    directories: [],
    fileTypes: {},
    keyFiles: [],
    totalFiles: 0,
  };

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relPath = relative(projectDir, fullPath);

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            if (SKIP_DIRS.has(entry) || entry.startsWith('.')) {
              continue;
            }

            if (depth <= 2) {
              structure.directories.push(relPath);
            }
            walk(fullPath, depth + 1);
          } else if (stat.isFile()) {
            structure.totalFiles++;

            const ext = extname(entry).toLowerCase() || 'no_ext';
            structure.fileTypes[ext] = (structure.fileTypes[ext] ?? 0) + 1;

            if (KEY_FILE_NAMES.has(entry)) {
              structure.keyFiles.push(relPath);
            }
          }
        } catch {
          // Skip files we can't access
        }
      }
    } catch {
      // Skip directories we can't access
    }
  }

  walk(projectDir, 0);

  // Sort file types by count and take top 10
  const sortedTypes = Object.entries(structure.fileTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  structure.fileTypes = Object.fromEntries(sortedTypes);

  return structure;
}

/**
 * Get recent commits with decision-related content.
 */
export function getRecentCommits(
  projectDir: string,
  days = 30,
  limit = 50
): CommitInfo[] {
  const candidates: CommitInfo[] = [];

  try {
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const result = execSync(
      `git log --since="${sinceDate}" -n${limit} --format="%H|||%s|||%b|||%an|||%ad" --date=short`,
      {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const keywords = [
      'because',
      'decision',
      'chose',
      'architecture',
      'design',
      'refactor',
      'migration',
      'breaking',
      'important',
      'why',
      'trade-off',
      'instead of',
      'approach',
      'fix',
      'implement',
    ];

    for (const entry of result.trim().split('\n')) {
      if (!entry.includes('|||')) continue;

      const parts = entry.split('|||');
      if (parts.length < 3) continue;

      const [commitHash, subject, body] = parts;
      const author = parts[3] ?? '';
      const date = parts[4] ?? '';
      const fullMessage = `${subject}\n${body}`.trim();

      // Include if substantial or has keywords
      if (
        fullMessage.length > 30 ||
        keywords.some((kw) => fullMessage.toLowerCase().includes(kw))
      ) {
        candidates.push({
          hash: commitHash?.slice(0, 8) ?? '',
          subject: subject?.slice(0, 100) ?? '',
          date,
          author,
          hasBody: (body?.length ?? 0) > 10,
        });
      }
    }
  } catch {
    // Git not available or not a git repo
  }

  return candidates;
}

/**
 * Get list of documentation files with their titles.
 */
export function getDocumentationSummary(projectDir: string): DocumentInfo[] {
  const docs: DocumentInfo[] = [];
  const seen = new Set<string>();
  const skipTerms = ['.memorai', 'node_modules', 'vendor', '.git', 'changelog'];

  const docPatterns = [
    'README.md',
    'ARCHITECTURE.md',
    'CONTRIBUTING.md',
    'CLAUDE.md',
    'TODO.md',
    'BACKLOG.md',
  ];

  // Check root level docs
  for (const pattern of docPatterns) {
    const filepath = join(projectDir, pattern);
    if (existsSync(filepath) && !seen.has(filepath)) {
      seen.add(filepath);
      try {
        const content = readFileSync(filepath, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1] ?? pattern;
        const sections = (content.match(/\n##\s+/g) ?? []).length;

        docs.push({
          file: pattern,
          title: title.slice(0, 60),
          sections,
          size: content.length,
        });
      } catch {
        // Skip files we can't read
      }
    }
  }

  // Check docs directory
  const docsDir = join(projectDir, 'docs');
  if (existsSync(docsDir)) {
    try {
      for (const file of readdirSync(docsDir)) {
        if (!file.endsWith('.md')) continue;
        const filepath = join(docsDir, file);
        const relPath = join('docs', file);

        if (seen.has(filepath) || skipTerms.some((s) => relPath.includes(s))) {
          continue;
        }
        seen.add(filepath);

        try {
          const content = readFileSync(filepath, 'utf-8');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch?.[1] ?? file;
          const sections = (content.match(/\n##\s+/g) ?? []).length;

          docs.push({
            file: relPath,
            title: title.slice(0, 60),
            sections,
            size: content.length,
          });
        } catch {
          // Skip
        }
      }
    } catch {
      // Skip if can't read docs dir
    }
  }

  return docs;
}

/**
 * Get git history of tracking files.
 */
export function getTrackingFilesHistory(
  projectDir: string,
  limit = 20
): TrackingFileHistory[] {
  const trackingFiles = [
    'TODO.md',
    'LAST_SESSION.md',
    'BACKLOG.md',
    'CLAUDE.md',
  ];
  const history: TrackingFileHistory[] = [];

  for (const tf of trackingFiles) {
    if (!existsSync(join(projectDir, tf))) continue;

    try {
      const result = execSync(
        `git log -n${limit} --format="%h|||%s|||%ad" --date=short -- "${tf}"`,
        {
          cwd: projectDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      if (!result.trim()) continue;

      const commits: Array<{ hash: string; subject: string; date: string }> =
        [];
      for (const line of result.trim().split('\n').slice(0, 5)) {
        if (!line.includes('|||')) continue;
        const parts = line.split('|||');
        commits.push({
          hash: parts[0] ?? '',
          subject: (parts[1] ?? '').slice(0, 60),
          date: parts[2] ?? '',
        });
      }

      if (commits.length > 0) {
        history.push({
          file: tf,
          recentChanges: commits,
        });
      }
    } catch {
      // Skip if git fails
    }
  }

  return history;
}

/**
 * Detect common patterns in the codebase.
 */
export function getCodePatterns(projectDir: string): CodePatterns {
  const patterns: CodePatterns = {};

  // Detect by package.json
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if ('next' in deps) patterns.framework = 'Next.js';
      else if ('react' in deps) patterns.framework = 'React';
      else if ('express' in deps) patterns.framework = 'Express';
      else if ('fastify' in deps) patterns.framework = 'Fastify';

      patterns.language = 'typescript' in deps ? 'TypeScript' : 'JavaScript';

      if ('jest' in deps) patterns.testing = 'Jest';
      else if ('vitest' in deps) patterns.testing = 'Vitest';
    } catch {
      // Skip
    }
  }

  // Detect Python
  const reqPath = join(projectDir, 'requirements.txt');
  const pyprojectPath = join(projectDir, 'pyproject.toml');
  if (existsSync(reqPath) || existsSync(pyprojectPath)) {
    patterns.language = 'Python';
    try {
      let reqs = '';
      if (existsSync(reqPath)) {
        reqs = readFileSync(reqPath, 'utf-8').toLowerCase();
      }
      if (reqs.includes('fastapi')) patterns.framework = 'FastAPI';
      else if (reqs.includes('django')) patterns.framework = 'Django';
      else if (reqs.includes('flask')) patterns.framework = 'Flask';

      if (reqs.includes('pytest')) patterns.testing = 'pytest';
      if (reqs.includes('sqlalchemy')) patterns.database = 'SQLAlchemy';
      if (reqs.includes('jwt') || reqs.includes('jose')) patterns.auth = 'JWT';
    } catch {
      // Skip
    }
  }

  // Detect Rust
  if (existsSync(join(projectDir, 'Cargo.toml'))) {
    patterns.language = 'Rust';
  }

  // Detect Go
  if (existsSync(join(projectDir, 'go.mod'))) {
    patterns.language = 'Go';
  }

  return patterns;
}

/**
 * Quick project scan - outputs lightweight summary.
 */
export function scanProject(
  projectDir: string,
  days = 30
): BootstrapScanResult {
  const resolvedDir = resolve(projectDir);

  const structure = getProjectStructure(resolvedDir);
  const patterns = getCodePatterns(resolvedDir);
  const documentation = getDocumentationSummary(resolvedDir);
  const commits = getRecentCommits(resolvedDir, days, 30);
  const trackingHistory = getTrackingFilesHistory(resolvedDir);

  const recommendations: string[] = [];

  if (documentation.length > 0) {
    recommendations.push(
      `Run 'extract docs' to read ${documentation.length} documentation files`
    );
  }
  if (commits.length > 0) {
    recommendations.push(
      `Run 'extract commits --days ${days}' to analyze ${commits.length} recent commits`
    );
  }
  if (structure.keyFiles.length > 0) {
    recommendations.push(
      `Key files found: ${structure.keyFiles.slice(0, 5).join(', ')}`
    );
  }
  if (trackingHistory.length > 0) {
    recommendations.push(
      `Tracking files have history - run 'extract tracking' for details`
    );
  }

  return {
    scanDate: new Date().toISOString().split('T')[0]!,
    structure,
    patterns,
    documentation,
    recentActivity: {
      daysScanned: days,
      commits,
    },
    trackingHistory,
    recommendations,
  };
}

/**
 * Extract full documentation content.
 */
export function extractDocs(
  projectDir: string
): { documents: Array<{ file: string; title: string; content: string }>; total: number } {
  const docs: Array<{ file: string; title: string; content: string }> = [];

  for (const doc of getDocumentationSummary(projectDir)) {
    try {
      const content = readFileSync(join(projectDir, doc.file), 'utf-8');
      docs.push({
        file: doc.file,
        title: doc.title,
        content: content.slice(0, 5000),
      });
    } catch {
      // Skip files we can't read
    }
  }

  return { documents: docs, total: docs.length };
}

/**
 * Extract commit details with full messages.
 */
export function extractCommits(
  projectDir: string,
  days = 30,
  limit = 50
): { commits: CommitInfo[]; days: number } {
  const candidates: CommitInfo[] = [];

  try {
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const result = execSync(
      `git log --since="${sinceDate}" -n${limit} --format="%H|||%s|||%b|||%an|||%ad" --date=short`,
      {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    for (const entry of result.trim().split('\n')) {
      if (!entry.includes('|||')) continue;

      const parts = entry.split('|||');
      if (parts.length >= 3) {
        candidates.push({
          hash: parts[0]?.slice(0, 8) ?? '',
          subject: parts[1] ?? '',
          body: (parts[2] ?? '').slice(0, 500),
          author: parts[3] ?? '',
          date: parts[4] ?? '',
        });
      }
    }
  } catch {
    // Git not available
  }

  return { commits: candidates, days };
}

/**
 * Extract detailed codebase structure.
 */
export function extractStructure(
  projectDir: string
): { structure: ProjectStructure; patterns: CodePatterns } {
  return {
    structure: getProjectStructure(projectDir, 4),
    patterns: getCodePatterns(projectDir),
  };
}

/**
 * Extract tracking files history with current content.
 */
export function extractTracking(
  projectDir: string
): { trackingFiles: TrackingFileHistory[] } {
  const history = getTrackingFilesHistory(projectDir, 10);

  for (const item of history) {
    try {
      item.currentContent = readFileSync(
        join(projectDir, item.file),
        'utf-8'
      ).slice(0, 3000);
    } catch {
      // Skip
    }
  }

  return { trackingFiles: history };
}
