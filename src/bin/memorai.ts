import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoraiClient } from '../client.js';
import type { Category } from '../types/memory.js';
import { CATEGORIES } from '../types/memory.js';

const program = new Command();

// Try to get version from package.json
let version = '1.0.0';
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  version = pkg.version;
} catch {
  // Use default version
}

program
  .name('memorai')
  .description('Long-term memory storage for Claude Code projects')
  .version(version);

// Helper to create client
function getClient(): MemoraiClient {
  return new MemoraiClient();
}

// Helper to output JSON
function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// init command
program
  .command('init')
  .description('Initialize .memorai/ directory and database')
  .action(() => {
    const client = getClient();
    const result = client.init();
    output(result);
    process.exit(result.success ? 0 : 1);
  });

// save command
program
  .command('save <category> <title>')
  .description('Store a new memory')
  .option('-c, --content <content>', 'Memory content')
  .option('-f, --file <file>', 'Read content from file')
  .option('--stdin', 'Read content from stdin')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-i, --importance <n>', 'Importance level (1-10)', '5')
  .action(async (category: string, title: string, options) => {
    if (!CATEGORIES.includes(category as Category)) {
      output({
        success: false,
        error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}`,
      });
      process.exit(1);
    }

    let content: string;

    if (options.stdin) {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      content = Buffer.concat(chunks).toString('utf-8');
    } else if (options.file) {
      try {
        content = readFileSync(options.file, 'utf-8');
      } catch (error) {
        output({ success: false, error: `Failed to read file: ${options.file}` });
        process.exit(1);
      }
    } else if (options.content) {
      content = options.content;
    } else {
      output({
        success: false,
        error: 'No content provided. Use --content, --file, or --stdin',
      });
      process.exit(1);
    }

    const tags = options.tags
      ? options.tags.split(',').map((t: string) => t.trim())
      : undefined;
    const importance = parseInt(options.importance, 10);

    const client = getClient();
    const result = client.store({
      category: category as Category,
      title,
      content,
      tags,
      importance,
    });

    output(result);
    process.exit(result.success ? 0 : 1);
  });

// find command
program
  .command('find <query>')
  .description('Search memories using full-text search')
  .option('-c, --category <category>', 'Filter by category')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-l, --limit <n>', 'Maximum results', '10')
  .option('--importance-min <n>', 'Minimum importance level')
  .action((query: string, options) => {
    if (options.category && !CATEGORIES.includes(options.category)) {
      output({
        success: false,
        error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}`,
      });
      process.exit(1);
    }

    const tags = options.tags
      ? options.tags.split(',').map((t: string) => t.trim())
      : undefined;

    const client = getClient();
    const results = client.search({
      query,
      category: options.category as Category | undefined,
      tags,
      limit: parseInt(options.limit, 10),
      importanceMin: options.importanceMin
        ? parseInt(options.importanceMin, 10)
        : undefined,
    });

    output({
      query,
      count: results.length,
      results,
    });
  });

// list command
program
  .command('list [category]')
  .description('List memories or show stats')
  .option('-a, --all', 'List all memories grouped by category')
  .option('-s, --stats', 'Show memory statistics')
  .option('-l, --limit <n>', 'Maximum results', '20')
  .option('--importance-min <n>', 'Minimum importance level')
  .action((category: string | undefined, options) => {
    const client = getClient();

    if (options.stats) {
      output(client.stats());
      return;
    }

    if (options.all) {
      output(client.listAll(parseInt(options.limit, 10)));
      return;
    }

    if (category) {
      if (!CATEGORIES.includes(category as Category)) {
        output({
          success: false,
          error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}`,
        });
        process.exit(1);
      }

      const results = client.listCategory(category as Category, {
        limit: parseInt(options.limit, 10),
        importanceMin: options.importanceMin
          ? parseInt(options.importanceMin, 10)
          : undefined,
      });

      output({
        category,
        count: results.length,
        memories: results,
      });
      return;
    }

    // Default: show stats
    output(client.stats());
  });

// show command
program
  .command('show <id>')
  .description('Show full content of a memory')
  .action((id: string) => {
    const client = getClient();
    const memory = client.get(id, { full: true });

    if (!memory) {
      output({ error: `Memory '${id}' not found` });
      process.exit(1);
    }

    output(memory);
  });

// delete command
program
  .command('delete <id>')
  .description('Delete a memory by ID')
  .action((id: string) => {
    const client = getClient();
    const result = client.delete(id);
    output(result);
    process.exit(result.success ? 0 : 1);
  });

// bootstrap command
program
  .command('bootstrap')
  .description('Scan project and extract knowledge')
  .option('--days <n>', 'Days of git history to scan', '30')
  .action((options) => {
    const client = getClient();
    const result = client.scan(parseInt(options.days, 10));
    output(result);
  });

// status command
program
  .command('status')
  .description('Show memory stats summary')
  .action(() => {
    const client = getClient();
    const stats = client.stats();

    if (!stats.initialized) {
      output({
        initialized: false,
        message: 'Memorai not initialized. Run: memorai init',
      });
      return;
    }

    output({
      initialized: true,
      total: stats.total,
      byCategory: stats.byCategory,
      recentCount: stats.recent.length,
      importantCount: stats.important.length,
    });
  });

// recent command
program
  .command('recent [limit]')
  .description('Get most recent memories')
  .option('-c, --category <category>', 'Filter by category')
  .action((limit: string | undefined, options) => {
    const client = getClient();
    const results = client.getRecent(
      limit ? parseInt(limit, 10) : 10,
      options.category as Category | undefined
    );

    output({
      count: results.length,
      memories: results,
    });
  });

// Parse arguments
program.parse();
