---
description: Save information to project long-term memory
argument-hint: [category] [title]
---

Save information to Memorai long-term memory.

**Arguments:**
- `$1` = Category: architecture, decisions, reports, summaries, structure, notes
- `$2` and beyond = Title for the memory

**User request:** /mem-save $ARGUMENTS

## Instructions

1. **Determine content**: Based on the conversation context, identify what should be stored.

2. **Validate category**: Must be one of:
   - `architecture` - System design, API structure, components
   - `decisions` - Technical choices, ADRs, rationale
   - `reports` - Audits, analyses, reviews
   - `summaries` - Session summaries, progress updates
   - `structure` - Directory organization, conventions
   - `notes` - General observations, tips, gotchas

3. **Determine importance** (1-10):
   - 8-10: Critical, core architecture, must-remember
   - 5-7: Standard decisions, useful context
   - 1-4: Nice-to-know, minor notes

4. **Extract tags**: Identify relevant keywords for discoverability

5. **Store the memory**:

```bash
bunx memorai save "<category>" "<title>" --content "<content>" --tags "<tag1,tag2>" --importance <1-10>
```

6. **Confirm**: Report the memory ID and summary back to the user.
