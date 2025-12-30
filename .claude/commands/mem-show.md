---
description: Show full content of a specific memory
argument-hint: [memory-id]
---

Show the full content of a Memorai memory.

**Memory ID:** $ARGUMENTS

## Instructions

1. **Fetch the full memory**:

```bash
bunx memorai show "$1"
```

2. **Present the memory**: Display all fields:
   - ID, Title, Category
   - Tags, Importance
   - Created/Updated dates
   - Full content

3. **Offer actions**:
   - Delete: `/mem-delete <id>` (if no longer relevant)
   - Search related: `/mem-find <related-terms>`

## Example Output

```
Memory: dec_a1b2
Title: API Authentication Design
Category: decisions
Tags: auth, jwt, security
Importance: 8/10
Created: 2025-01-15T10:30:00

---

## Background

We needed to decide on an authentication mechanism for our REST API...

## Decision

Chose JWT with refresh tokens because:
1. Stateless authentication reduces server load
2. Works well with our microservices architecture
3. Industry standard with good library support

---

Actions:
- /mem-delete dec_a1b2 - Remove this memory
- /mem-find jwt security - Find related memories
```
