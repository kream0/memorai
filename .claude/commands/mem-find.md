---
description: Search project memories
argument-hint: [query] [--category cat] [--tags t1,t2]
---

Search Memorai long-term memory.

**User query:** $ARGUMENTS

## Instructions

1. **Parse the query**: The user may include:
   - A search query (required)
   - `--category <cat>` or `-c <cat>` to filter by category
   - `--tags <t1,t2>` to filter by tags

2. **Run the search**:

```bash
bunx memorai find "<query>" --limit 10
```

With filters:
```bash
bunx memorai find "<query>" --category <category> --tags "<tag1,tag2>" --limit 10
```

3. **Present results**: Show the user:
   - Number of results found
   - For each result: ID, title, category, relevance, summary
   - Suggest using `/mem-show <id>` for full content

4. **If relevant to current task**: Offer to incorporate the memory into the current work.

## Example Output

```
Found 3 memories matching "authentication":

1. [dec_a1b2] API Authentication Design (decisions) - 95% match
   Summary: Chose JWT with refresh tokens for stateless auth...

2. [arch_c3d4] User Session Management (architecture) - 78% match
   Summary: Sessions stored in Redis with 24h TTL...

3. [note_e5f6] OAuth Gotchas (notes) - 65% match
   Summary: Remember to handle token refresh edge cases...

Use /mem-show <id> for full content.
```
