import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoraiClient } from '../client.js';
import type { Category } from '../types/memory.js';
import { CATEGORIES } from '../types/memory.js';
import {
  getContext,
  formatForClaude,
  type ContextMode,
} from '../operations/context.js';
import {
  installGlobalHooks,
  uninstallGlobalHooks,
  areHooksInstalled,
} from '../operations/hooks.js';
import {
  analyzeFiles,
  formatManifest,
  generateExtractionTasks,
  generateExtractorPrompt,
  generateSynthesizerPrompt,
  estimateProcessingTime,
  getLearnInstructions,
} from '../operations/learn/index.js';
import {
  analyzeCodebase,
  createPartitions,
  formatManifestSummary,
  formatPartitionSummary,
  generateExplorationTasks,
  generateExplorerPrompt,
  generateExplorationInstructions,
  batchTasks,
  estimateExplorationTime,
  generateSynthesizerPrompt as generateCodebaseSynthesizerPrompt,
  synthesizeLocally,
  previewMemories,
  ingestKnowledge,
  formatIngestionResult,
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  shouldResume,
  getResumedAnalyses,
  formatCheckpointStatus,
  SCAN_USAGE,
  type SynthesizerInput,
} from '../operations/codebase/index.js';

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
  .option('--skip-hooks', 'Skip installing Claude Code hooks')
  .action((options) => {
    const client = getClient();
    const result = client.init();

    // Install global hooks unless skipped
    if (result.success && !options.skipHooks) {
      const hookResult = installGlobalHooks();
      (result as any).hooks = {
        installed: hookResult.success,
        path: hookResult.path,
        message: hookResult.message,
      };
    }

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

// context command - for Claude Code hooks
program
  .command('context')
  .description('Get memory context for Claude Code hooks')
  .option('--mode <mode>', 'Context mode: session or prompt', 'session')
  .option('--recent <n>', 'Number of recent memories (session mode)', '7')
  .option('--limit <n>', 'Max relevant memories (prompt mode)', '5')
  .option('--query <text>', 'Search query (prompt mode)')
  .option('--stdin', 'Read prompt from stdin JSON')
  .option('--skip-ids <ids>', 'Comma-separated IDs to skip')
  .option('--format <format>', 'Output format: claude or json', 'claude')
  .option('--max-tokens <n>', 'Maximum tokens to output', '2000')
  .action(async (options) => {
    const mode = options.mode as ContextMode;
    let query = options.query;

    // Read query from stdin if --stdin flag is set
    if (options.stdin && mode === 'prompt') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        const input = Buffer.concat(chunks).toString('utf-8').trim();

        if (input) {
          try {
            // Try to parse as JSON (from Claude Code hook)
            const json = JSON.parse(input);
            query = json.prompt || json.message || json.content || input;
          } catch {
            // Not JSON, use raw input as query
            query = input;
          }
        }
      } catch {
        // Stdin read failed, continue without query
      }
    }

    const skipIds = options.skipIds
      ? options.skipIds.split(',').map((id: string) => id.trim())
      : undefined;

    const result = getContext({
      mode,
      recent: parseInt(options.recent, 10),
      limit: parseInt(options.limit, 10),
      query,
      skipIds,
      maxTokens: parseInt(options.maxTokens, 10),
      format: options.format as 'claude' | 'json',
    });

    if (options.format === 'json') {
      output(result);
    } else {
      // Claude format - output directly to stdout
      const formatted = formatForClaude(result);
      if (formatted) {
        console.log(formatted);
      }
    }
  });

// hooks command - manage Claude Code hooks
program
  .command('hooks')
  .description('Manage Claude Code hooks for memory preloading')
  .option('--install', 'Install hooks to ~/.claude/settings.json')
  .option('--uninstall', 'Remove Memorai hooks')
  .option('--status', 'Check if hooks are installed')
  .action((options) => {
    if (options.status || (!options.install && !options.uninstall)) {
      const installed = areHooksInstalled();
      output({
        installed,
        message: installed
          ? 'Memorai hooks are installed'
          : 'Memorai hooks are not installed',
      });
      return;
    }

    if (options.install) {
      const result = installGlobalHooks();
      output(result);
      process.exit(result.success ? 0 : 1);
    }

    if (options.uninstall) {
      const result = uninstallGlobalHooks();
      output(result);
      process.exit(result.success ? 0 : 1);
    }
  });

// learn command - AI-powered documentation processing
program
  .command('learn <input>')
  .description('Process documentation files using AI agents')
  .option('--dry-run', 'Analyze only, show what would be extracted')
  .option('--preview', 'Show extractions before storing')
  .option('--max-files <n>', 'Maximum files to process', '20')
  .option('--max-memories <n>', 'Maximum memories to create', '100')
  .option('--importance-min <n>', 'Minimum importance threshold (1-10)', '3')
  .option('--parallel <n>', 'Max concurrent extraction agents', '3')
  .option('--resume <file>', 'Resume from checkpoint file')
  .option('--output <file>', 'Save detailed report to file')
  .option('--json', 'Output JSON for agent consumption')
  .action(async (input: string, options) => {
    const client = getClient();
    const stats = client.stats();

    if (!stats.initialized) {
      output({
        success: false,
        error: 'Memorai not initialized. Run: memorai init',
      });
      process.exit(1);
    }

    try {
      // Phase 1: Analyze files
      console.log('Analyzing files...');
      const manifest = await analyzeFiles(
        input,
        process.cwd(),
        parseInt(options.maxFiles, 10)
      );

      if (manifest.files.length === 0) {
        output({
          success: false,
          error: 'No markdown files found matching the pattern',
        });
        process.exit(1);
      }

      // Show manifest
      console.log('');
      console.log(formatManifest(manifest));
      console.log('');
      console.log(`Estimated processing time: ${estimateProcessingTime(manifest, parseInt(options.parallel, 10))}`);
      console.log('');

      if (options.dryRun) {
        // Dry run - just show what would be done
        const tasks = generateExtractionTasks(manifest, process.cwd(), parseInt(options.parallel, 10));

        if (options.json) {
          output({
            mode: 'dry-run',
            manifest,
            taskCount: tasks.length,
            instructions: getLearnInstructions(),
          });
        } else {
          console.log('DRY RUN - No extraction will be performed.');
          console.log('');
          console.log('To process these files, run without --dry-run from within Claude Code.');
          console.log('');
          console.log(getLearnInstructions());
        }
        process.exit(0);
      }

      // Generate extraction tasks for Claude Code
      const tasks = generateExtractionTasks(manifest, process.cwd(), parseInt(options.parallel, 10));

      if (options.json) {
        // Output structured data for Claude Code to process
        output({
          mode: 'extract',
          manifest,
          tasks: tasks.map((t) => ({
            id: t.id,
            file: t.file.relativePath,
            chunk: t.chunk,
            prompt: generateExtractorPrompt(t),
          })),
          synthesizePrompt: null, // Will be generated after extraction
          options: {
            maxMemories: parseInt(options.maxMemories, 10),
            importanceMin: parseInt(options.importanceMin, 10),
            parallel: parseInt(options.parallel, 10),
          },
        });
      } else {
        // Human-readable instructions
        console.log('='.repeat(60));
        console.log('MEMORAI LEARN - AI Documentation Processing');
        console.log('='.repeat(60));
        console.log('');
        console.log('This command requires Claude Code to spawn extraction agents.');
        console.log('');
        console.log('Next steps:');
        console.log('1. Copy the extraction tasks below');
        console.log('2. Use the Task tool to spawn learn-extractor agents');
        console.log('3. Collect the extraction results');
        console.log('4. Run memorai learn-synthesize with the results');
        console.log('');
        console.log(`Tasks to process: ${tasks.length}`);
        console.log('');

        // Show first few tasks as example
        const sampleTasks = tasks.slice(0, 3);
        console.log('Example task prompts:');
        for (const task of sampleTasks) {
          console.log('');
          console.log(`--- Task: ${task.id} ---`);
          console.log(generateExtractorPrompt(task));
        }

        if (tasks.length > 3) {
          console.log('');
          console.log(`... and ${tasks.length - 3} more tasks`);
        }

        console.log('');
        console.log('Use --json flag for machine-readable output.');
      }

    } catch (error) {
      output({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// learn-synthesize command - finalize learning process
program
  .command('learn-synthesize')
  .description('Synthesize extractions into memories (internal use)')
  .option('--stdin', 'Read extractions from stdin JSON')
  .option('--max-memories <n>', 'Maximum memories to create', '100')
  .option('--importance-min <n>', 'Minimum importance threshold', '3')
  .action(async () => {
    const client = getClient();

    try {
      // Read extractions from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const input = Buffer.concat(chunks).toString('utf-8').trim();

      if (!input) {
        output({ success: false, error: 'No input provided' });
        process.exit(1);
      }

      const data = JSON.parse(input);
      const extractions = data.extractions || [];
      const allMemories = client.listAll(1000);
      const existingTitles = Object.values(allMemories)
        .flat()
        .map((m) => m.title);

      // Generate synthesizer prompt
      const prompt = generateSynthesizerPrompt(
        extractions,
        data.projectContext || 'Documentation project',
        existingTitles
      );

      output({
        mode: 'synthesize',
        extractionCount: extractions.length,
        existingMemoryCount: existingTitles.length,
        prompt,
      });

    } catch (error) {
      output({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// scan command - AI-powered codebase analysis
program
  .command('scan [path]')
  .description('Analyze codebase and extract knowledge as memories')
  .option('--dry-run', 'Analyze only, show partition plan (no agents)')
  .option('--preview', 'Show insights before storing memories')
  .option('--partitions <n>', 'Maximum partitions (default: auto-detect)')
  .option('--parallel <n>', 'Max concurrent exploration agents', '3')
  .option('--include <glob>', 'Include file patterns (can be used multiple times)', (val, acc: string[]) => { acc.push(val); return acc; }, [])
  .option('--exclude <glob>', 'Exclude file patterns (can be used multiple times)', (val, acc: string[]) => { acc.push(val); return acc; }, [])
  .option('--min-importance <n>', 'Minimum importance threshold (1-10)', '3')
  .option('--max-memories <n>', 'Maximum memories to create', '100')
  .option('--resume', 'Resume from checkpoint')
  .option('--output <file>', 'Save analysis report to file')
  .option('--json', 'Output JSON for agent consumption')
  .action(async (inputPath: string | undefined, options) => {
    const projectPath = inputPath || process.cwd();
    const client = getClient();
    const stats = client.stats();

    if (!stats.initialized) {
      output({
        success: false,
        error: 'Memorai not initialized. Run: memorai init',
      });
      process.exit(1);
    }

    try {
      // Check for resume
      if (options.resume) {
        const manifest = analyzeCodebase(projectPath, {
          include: options.include.length > 0 ? options.include : undefined,
          exclude: options.exclude.length > 0 ? options.exclude : undefined,
        });

        const resumeInfo = shouldResume(projectPath, manifest);
        if (!resumeInfo.resume || !resumeInfo.checkpoint) {
          console.log(resumeInfo.reason);
          console.log('Starting fresh analysis...');
        } else {
          console.log(formatCheckpointStatus(resumeInfo.checkpoint));
          console.log('');
          console.log('Resuming from checkpoint...');
          // TODO: Implement full resume logic
          // For now, just show status
          process.exit(0);
        }
      }

      // Phase 1: Analyze codebase
      console.log('Analyzing codebase...');
      const manifest = analyzeCodebase(projectPath, {
        include: options.include.length > 0 ? options.include : undefined,
        exclude: options.exclude.length > 0 ? options.exclude : undefined,
      });

      if (manifest.totalFiles === 0) {
        output({
          success: false,
          error: 'No source files found matching the patterns',
        });
        process.exit(1);
      }

      // Create partitions
      const maxPartitions = options.partitions ? parseInt(options.partitions, 10) : undefined;
      const partitions = createPartitions(manifest, { maxPartitions });
      manifest.partitions = partitions;
      manifest.globalContext.totalPartitions = partitions.length;

      // Show manifest
      console.log('');
      console.log(formatManifestSummary(manifest));
      console.log('');
      console.log(formatPartitionSummary(partitions));
      console.log('');

      // Estimate time
      const tasks = generateExplorationTasks(manifest);
      const { batches, estimatedMinutes } = estimateExplorationTime(
        tasks,
        parseInt(options.parallel, 10)
      );
      console.log(`Estimated time: ~${estimatedMinutes} minutes (${batches} batches)`);
      console.log('');

      if (options.dryRun) {
        // Dry run - just show what would be done
        if (options.json) {
          output({
            mode: 'dry-run',
            manifest: {
              projectName: manifest.projectName,
              projectDir: manifest.projectDir,
              totalFiles: manifest.totalFiles,
              totalTokens: manifest.totalTokens,
              languages: manifest.languages,
              frameworks: manifest.globalContext.frameworks,
              skippedFiles: manifest.skippedFiles.length,
            },
            partitions: partitions.map(p => ({
              id: p.id,
              description: p.description,
              files: p.files.length,
              tokens: p.estimatedTokens,
            })),
            taskCount: tasks.length,
          });
        } else {
          console.log('DRY RUN - No exploration will be performed.');
          console.log('');
          console.log('To analyze this codebase, run without --dry-run from within Claude Code.');
          console.log('');
          console.log('The scan command will spawn exploration agents for each partition,');
          console.log('then synthesize findings into structured memories.');
        }
        process.exit(0);
      }

      // Generate exploration instructions
      if (options.json) {
        // Output structured data for Claude Code to process
        output({
          mode: 'explore',
          manifest: {
            projectName: manifest.projectName,
            projectDir: manifest.projectDir,
            totalFiles: manifest.totalFiles,
            totalTokens: manifest.totalTokens,
            hash: manifest.hash,
          },
          globalContext: manifest.globalContext,
          tasks: tasks.map(t => ({
            id: t.id,
            partition: {
              id: t.partition.id,
              description: t.partition.description,
              files: t.partition.files.length,
              tokens: t.partition.estimatedTokens,
            },
            prompt: generateExplorerPrompt(t),
          })),
          options: {
            parallel: parseInt(options.parallel, 10),
            maxMemories: parseInt(options.maxMemories, 10),
            importanceMin: parseInt(options.minImportance, 10),
          },
        });
      } else {
        // Human-readable instructions
        console.log('='.repeat(60));
        console.log('MEMORAI SCAN - AI Codebase Analysis');
        console.log('='.repeat(60));
        console.log('');
        console.log('This command requires Claude Code to spawn exploration agents.');
        console.log('');
        console.log(generateExplorationInstructions(tasks, parseInt(options.parallel, 10)));
        console.log('');
        console.log('='.repeat(60));
        console.log('');
        console.log('Next steps:');
        console.log('1. Use the Task tool to spawn codebase-explorer agents for each partition');
        console.log('2. Collect the analysis results from all explorers');
        console.log('3. Run memorai scan-synthesize with the results');
        console.log('');
        console.log('Example agent invocation:');
        console.log('');
        console.log('Task: codebase-explorer');
        console.log(`Prompt: ${generateExplorerPrompt(tasks[0]!).slice(0, 200)}...`);
        console.log('');
        console.log('Use --json flag for machine-readable output.');

        // Save checkpoint
        const checkpoint = createCheckpoint(manifest);
        saveCheckpoint(checkpoint, projectPath);
        console.log('');
        console.log(`Checkpoint saved to: ${projectPath}/.memorai/scan-checkpoint.json`);
      }

    } catch (error) {
      output({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// scan-synthesize command - finalize codebase scanning
program
  .command('scan-synthesize')
  .description('Synthesize exploration results into memories (internal use)')
  .option('--stdin', 'Read analyses from stdin JSON')
  .option('--max-memories <n>', 'Maximum memories to create', '100')
  .option('--importance-min <n>', 'Minimum importance threshold', '3')
  .option('--preview', 'Show memories before storing')
  .option('--local', 'Use local synthesis (no agent)')
  .action(async (options) => {
    const client = getClient();

    try {
      // Read analyses from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const input = Buffer.concat(chunks).toString('utf-8').trim();

      if (!input) {
        output({ success: false, error: 'No input provided' });
        process.exit(1);
      }

      const data = JSON.parse(input) as {
        globalContext: SynthesizerInput['globalContext'];
        partitionAnalyses: SynthesizerInput['partitionAnalyses'];
        projectName?: string;
      };

      const allMemories = client.listAll(1000);
      const existingTitles = Object.values(allMemories)
        .flat()
        .map((m) => m.title);

      if (options.local) {
        // Local synthesis without agent
        const result = synthesizeLocally({
          globalContext: data.globalContext,
          partitionAnalyses: data.partitionAnalyses,
          existingMemoryTitles: existingTitles,
        });

        if (options.preview) {
          // Preview what would be stored
          console.log(previewMemories(
            result.knowledge,
            data.projectName ?? data.globalContext.projectName,
            {
              importanceMin: parseInt(options.importanceMin, 10),
              maxMemories: parseInt(options.maxMemories, 10),
            }
          ));
          process.exit(0);
        }

        // Ingest memories
        const ingestionResult = await ingestKnowledge(
          client,
          result.knowledge,
          {
            projectName: data.projectName ?? data.globalContext.projectName,
            importanceMin: parseInt(options.importanceMin, 10),
            maxMemories: parseInt(options.maxMemories, 10),
          }
        );

        console.log(formatIngestionResult(ingestionResult));
        output({
          success: true,
          memoriesCreated: ingestionResult.memoriesCreated,
          memoriesSkipped: ingestionResult.memoriesSkipped,
          byCategory: ingestionResult.byCategory,
        });

      } else {
        // Generate synthesizer prompt for agent
        const prompt = generateCodebaseSynthesizerPrompt({
          globalContext: data.globalContext,
          partitionAnalyses: data.partitionAnalyses,
          existingMemoryTitles: existingTitles,
        });

        output({
          mode: 'synthesize',
          analysisCount: data.partitionAnalyses.length,
          insightCount: data.partitionAnalyses.reduce(
            (sum, a) => sum + a.insights.length,
            0
          ),
          existingMemoryCount: existingTitles.length,
          prompt,
        });
      }

    } catch (error) {
      output({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
