---
description: Scan project and extract knowledge into Memorai (2-phase approach)
---

Bootstrap Memorai with knowledge from the existing codebase.

## Bootstrap Command

```bash
bunx memorai bootstrap
```

**What it scans:**
- Project structure and file patterns
- Documentation files (README, CLAUDE.md, etc.)
- Recent git commits (last 30 days)
- Code patterns and conventions

## What to Store in Memorai

After reviewing the bootstrap output, store important findings:

| What to Store | Category | Importance |
|---------------|----------|------------|
| Architecture decisions (why X over Y) | `architecture` | 8-10 |
| Tech stack choices with rationale | `decisions` | 7-8 |
| Key patterns/conventions | `architecture` | 7-8 |
| Integration gotchas | `notes` | 8 |
| Project structure overview | `structure` | 6-7 |

**Skip:** Pure implementation details, outdated info, trivial TODOs.

## Example Workflow

```bash
# 1. Run bootstrap scan
bunx memorai bootstrap

# 2. Review findings and store key ones
bunx memorai save architecture "Project Architecture" --content "Tech stack..."
bunx memorai save decisions "Database Selection" --content "Chose PostgreSQL..."
```
