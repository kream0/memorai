# Memorai NPM Package

## Overview

Create a TypeScript NPM package that provides long-term memory storage for Claude Code projects. This is a rewrite of the existing Python implementation.

## Requirements

### Core Features

1. **Database Initialization**
   - Create `.memorai/` directory and `memory.db` SQLite database
   - Set up FTS5 virtual table for full-text search
   - Create triggers to keep FTS in sync
   - Support migrations for schema updates

2. **Memory Storage**
   - Store memories with: id, category, title, content, summary, tags, importance
   - Categories: architecture, decisions, reports, summaries, structure, notes
   - Auto-generate summary from content (first paragraph, max 200 chars)
   - Support create and update operations

3. **Search (FTS5 with BM25)**
   - Full-text search using FTS5 MATCH
   - BM25 ranking for relevance scoring
   - Filter by category, tags, minimum importance
   - Fallback to LIKE search if FTS fails
   - Get by ID (with optional full content)
   - Get recent memories

4. **Listing & Stats**
   - Get memory statistics (total, by category, recent, important)
   - List by category with importance filtering
   - List all grouped by category
   - Delete memory by ID

5. **Bootstrap** (nice to have)
   - Scan project structure
   - Extract from git history
   - Parse documentation files

### Package Structure

```
memorai/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Main exports
│   ├── client.ts              # MemoraiClient class
│   ├── db/
│   │   ├── schema.ts          # SQLite schema + migrations
│   │   └── connection.ts      # Database connection
│   ├── operations/
│   │   ├── store.ts           # Create/update memories
│   │   ├── search.ts          # FTS5 search
│   │   ├── list.ts            # Browse/delete
│   │   └── bootstrap.ts       # Cold-start extraction
│   ├── types/
│   │   └── memory.ts          # TypeScript types
│   └── utils/
│       └── platform.ts        # Cross-platform paths
├── bin/
│   └── memorai.ts             # CLI entry point
├── tests/
│   └── *.test.ts              # Test files
└── README.md
```

### TypeScript API

```typescript
import { MemoraiClient } from 'memorai';

const memorai = new MemoraiClient({ projectDir: '/path/to/project' });

// Initialize database
await memorai.init();

// Store a memory
const memory = await memorai.store({
  category: 'decisions',
  title: 'API Authentication',
  content: 'Chose JWT because...',
  tags: ['auth', 'api'],
  importance: 8
});

// Search (FTS5 with BM25 ranking)
const results = await memorai.search({
  query: 'authentication',
  category: 'decisions',
  limit: 10
});

// Get by ID
const full = await memorai.get('abc12345', { full: true });

// Stats & List
const stats = await memorai.stats();
const all = await memorai.listAll();
const arch = await memorai.listCategory('architecture');

// Delete
await memorai.delete('abc12345');
```

### CLI Commands

```bash
npx memorai init              # Initialize .memorai/
npx memorai save <cat> <title> --content "..." --tags "a,b" --importance 8
npx memorai find <query> --category decisions --limit 10
npx memorai list [category]   # List or show stats
npx memorai show <id>         # Full memory content
npx memorai delete <id>       # Remove memory
npx memorai bootstrap         # Cold-start from git/docs
npx memorai status            # Show stats summary
```

### Database Schema

```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    category TEXT CHECK(category IN ('architecture','decisions','reports','summaries','structure','notes')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    tags TEXT,  -- JSON array
    importance INTEGER DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    session_id TEXT
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
    title, content, summary, tags,
    content='memories', content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, title, content, summary, tags)
    VALUES (NEW.rowid, NEW.title, NEW.content, NEW.summary, NEW.tags);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, content, summary, tags)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.summary, OLD.tags);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, content, summary, tags)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.summary, OLD.tags);
    INSERT INTO memories_fts(rowid, title, content, summary, tags)
    VALUES (NEW.rowid, NEW.title, NEW.content, NEW.summary, NEW.tags);
END;

-- Indexes
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
CREATE INDEX idx_memories_created ON memories(created_at DESC);
```

### Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: better-sqlite3 (synchronous SQLite bindings)
- **Testing**: Bun test or Vitest
- **Build**: tsup or Bun bundler

### Acceptance Criteria

1. All CRUD operations work correctly
2. FTS5 search returns ranked results
3. CLI commands work as documented
4. Tests pass with good coverage
5. Package can be imported and used programmatically
6. Cross-platform: works on Windows, macOS, Linux

### Reference Implementation

The Python implementation is in `.claude/skills/memorai/scripts/`:
- `init_db.py` - Database schema and migrations
- `search.py` - FTS5 search with BM25
- `store.py` - Memory storage
- `list.py` - Listing and stats
- `bootstrap.py` - Project scanning
- `db_utils.py` - Database utilities

Port the logic from these files to TypeScript.
