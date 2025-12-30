---
name: memorai
description: Search and manage project long-term memory. Works with /start and /end commands. Use when user asks about past decisions, architecture, or project history, when analyzing code patterns, or when significant work should be preserved beyond session tracking files.
allowed-tools: Read, Bash
---

# Memorai - Project Long-Term Memory

## Overview

Memorai provides persistent, searchable memory for Claude Code sessions. It works alongside the Session Continuity Method (tracking files like `LAST_SESSION.md`, `TODO.md`) to provide long-term knowledge storage.

**Key Features:**
- Fast FTS5 full-text search with BM25 ranking
- Category-based organization
- Importance levels (1-10) for prioritization
- Tag-based filtering
- Integration with `/start` and `/end` commands

## When to Use This Skill

1. **Starting a new task**: Search for relevant architecture/decisions first
2. **User asks "what did we decide..."**: Search past decisions
3. **Making architectural changes**: Check existing patterns
4. **Completing significant work**: Store decisions and learnings
5. **Reviewing project history**: Browse by category or search

## Memory Categories

| Category | Use For |
|----------|---------|
| `architecture` | System design, API structure, component relationships |
| `decisions` | ADRs, technical choices, rationale for approaches |
| `reports` | Audits, analyses, reviews, benchmarks |
| `summaries` | Session summaries, milestone records, progress updates |
| `structure` | Directory organization, file conventions, naming patterns |
| `notes` | General observations, tips, gotchas, things to remember |

## Quick Reference

### Search Memories

```bash
# Search by keyword
bunx memorai find "authentication"

# Search in category
bunx memorai find "API" --category architecture

# Search by tags
bunx memorai find "security" --tags auth,oauth
```

### Get Full Memory Content

```bash
# Show memory (full content)
bunx memorai show abc12345
```

### Store New Memory

```bash
# Store memory
bunx memorai save decisions "Database Selection" "Chose PostgreSQL because..."

# With tags and importance
bunx memorai save architecture "API Design" "REST endpoints..." --tags api,rest --importance 8
```

### List and Browse

```bash
# Get stats
bunx memorai status

# List category
bunx memorai list decisions

# List all
bunx memorai list
```

### Delete Memory

```bash
bunx memorai delete abc12345
```

## Best Practices

### What to Store

**Good candidates:**
- Architectural decisions with rationale
- API design patterns and conventions
- Database schema explanations
- Non-obvious code patterns
- Session summaries after significant work
- Project-specific gotchas and tips

**Avoid storing:**
- Raw code (it's already in files)
- Trivial information
- Temporary debugging notes
- Information that changes frequently

### Importance Levels

| Level | When to Use |
|-------|-------------|
| 8-10 | Critical decisions, core architecture, must-remember |
| 5-7 | Standard decisions, patterns, useful context |
| 1-4 | Nice-to-know, minor notes, low priority |

## Slash Commands

Users can also interact directly via commands:

- `/mem-init` - Initialize memory system
- `/mem-save [category] [title]` - Save to memory
- `/mem-find [query]` - Search memories
- `/mem-list [category]` - Browse memories
- `/mem-show [id]` - View full memory
- `/mem-delete [id]` - Remove memory
- `/mem-bootstrap` - Scan project and extract knowledge

## Technical Details

- **Storage**: SQLite with FTS5 in `.memorai/memory.db`
- **Search**: BM25-ranked full-text search
- **Location**: Project-local (not global)
- **Runtime**: Requires Bun (uses bun:sqlite)
