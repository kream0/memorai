# Memorai

Per-project long-term memory system for Claude Code.

## What is Memorai?

Memorai is an NPM package that provides persistent memory storage across Claude Code sessions. It uses SQLite with FTS5 for fast full-text search with BM25 ranking.

## Installation

```bash
# Global install
npm install -g memorai

# Or use directly with npx
npx memorai init
```

**Note:** Requires Bun runtime (uses bun:sqlite).

## Quick Commands

```bash
# Initialize memory in a project
npx memorai init

# Save a memory
npx memorai save architecture "API Design" "REST endpoints..."

# Search memories
npx memorai find "authentication"

# List memories
npx memorai list                # All categories
npx memorai list decisions      # Specific category

# Show full memory
npx memorai show abc12345

# Delete memory
npx memorai delete abc12345

# Bootstrap from project
npx memorai bootstrap
```

## TypeScript API

```typescript
import { MemoraiClient } from 'memorai';

const client = new MemoraiClient('/path/to/project');
await client.init();

// Store a memory
const id = await client.store({
  category: 'decisions',
  title: 'Chose PostgreSQL',
  content: 'Selected PostgreSQL for...',
  tags: ['database', 'infrastructure'],
  importance: 8
});

// Search memories
const results = await client.search('database', {
  category: 'decisions',
  limit: 10
});

// Get stats
const stats = await client.stats();
```

## Categories

- `architecture` - System design, patterns, structure
- `decisions` - Technical decisions and rationale
- `reports` - Analysis, reviews, summaries
- `summaries` - Session summaries, handoffs
- `structure` - File organization, conventions
- `notes` - General notes and observations

## Project Structure

```
src/
├── index.ts              # Main exports
├── client.ts             # MemoraiClient class
├── types/memory.ts       # TypeScript types
├── db/
│   ├── connection.ts     # Database utilities
│   └── schema.ts         # FTS5 schema + migrations
├── operations/
│   ├── store.ts          # Store/update operations
│   ├── search.ts         # FTS5 search with BM25
│   ├── list.ts           # List/stats/delete
│   └── bootstrap.ts      # Project scanning
└── bin/memorai.ts        # CLI entry point

.memorai/                 # Created per-project after init
├── memory.db             # SQLite database
└── config.json           # Configuration
```

## Technical Details

- **Storage**: SQLite with FTS5 full-text search
- **Ranking**: BM25 relevance scoring
- **Fallback**: LIKE search when FTS fails
- **IDs**: 8-character UUID prefixes
- **Summary**: Auto-generated (200 chars, sentence boundary)
