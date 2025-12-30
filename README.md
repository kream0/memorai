# Memorai

Long-term memory storage for Claude Code projects using SQLite with FTS5 full-text search.

## Requirements

- [Bun](https://bun.sh) >= 1.0.0 (uses `bun:sqlite` for database access)

## Installation

```bash
bun add memorai
```

Or install globally:

```bash
bun install -g memorai
```

## Quick Start

### CLI Usage

```bash
# Initialize memory database
memorai init

# Store a memory
memorai save decisions "API Authentication" \
  --content "We chose JWT tokens because they are stateless." \
  --tags "auth,jwt" \
  --importance 8

# Search memories
memorai find "authentication"

# List by category
memorai list decisions

# Show full content
memorai show abc12345

# Delete a memory
memorai delete abc12345

# Show stats
memorai status

# Bootstrap from project
memorai bootstrap
```

### Programmatic API

```typescript
import { MemoraiClient } from 'memorai';

const memorai = new MemoraiClient({ projectDir: '/path/to/project' });

// Initialize database
const initResult = memorai.init();

// Store a memory
const stored = memorai.store({
  category: 'decisions',
  title: 'API Authentication',
  content: 'We chose JWT tokens because they are stateless.',
  tags: ['auth', 'jwt'],
  importance: 8
});

// Search with FTS5 + BM25 ranking
const results = memorai.search({
  query: 'authentication',
  category: 'decisions',
  limit: 10
});

// Get by ID (with full content)
const memory = memorai.get('abc12345', { full: true });

// Get stats
const stats = memorai.stats();

// List all grouped by category
const all = memorai.listAll();

// List by category
const decisions = memorai.listCategory('decisions', {
  importanceMin: 7,
  limit: 20
});

// Get recent memories
const recent = memorai.getRecent(10, 'architecture');

// Delete
memorai.delete('abc12345');

// Update
memorai.update('abc12345', {
  title: 'Updated Title',
  importance: 9
});
```

## Categories

Memories are organized into categories:

- `architecture` - System architecture decisions
- `decisions` - Technical decisions and rationale
- `reports` - Analysis reports and findings
- `summaries` - Session summaries and handoffs
- `structure` - Codebase structure documentation
- `notes` - General notes and observations

## Database Schema

Memorai uses SQLite with FTS5 for full-text search:

```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    tags TEXT,  -- JSON array
    importance INTEGER DEFAULT 5,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    session_id TEXT
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
    title, content, summary, tags,
    content='memories', content_rowid='rowid'
);
```

## Project Structure

After initialization, Memorai creates:

```
.memorai/
├── memory.db      # SQLite database
└── config.json    # Configuration
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Build
bun run build
```

## License

MIT
