---
description: List memories by category or show overview
argument-hint: [category?]
---

List Memorai memories.

**User request:** /mem-list $ARGUMENTS

## Instructions

### If no category specified:

Show memory statistics:

```bash
bunx memorai status
```

Present:
- Total memory count
- Count by category
- Recent memories

### If category specified:

List memories in that category:

```bash
bunx memorai list <category>
```

Valid categories: architecture, decisions, reports, summaries, structure, notes

## Example Output

**Stats view:**
```
Memorai Status:
- Total: 15 memories
- By category:
  - decisions: 5
  - architecture: 4
  - reports: 3
  - notes: 2
  - summaries: 1

Recent:
1. [dec_xyz] API Rate Limiting (decisions) - 2 hours ago
2. [arch_abc] Database Schema v2 (architecture) - 1 day ago
...
```

**Category view:**
```
Architecture memories (4 total):

| ID       | Title                    | Importance | Created    |
|----------|--------------------------|------------|------------|
| arch_abc | Database Schema v2       | 8          | 2025-01-15 |
| arch_def | API Design Patterns      | 7          | 2025-01-10 |
...
```
