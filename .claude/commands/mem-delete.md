---
description: Delete a memory from the project
argument-hint: [memory-id]
---

Delete a memory from Memorai.

**Memory ID:** $ARGUMENTS

## Instructions

1. **Confirm the memory exists** - First fetch it to show the user what will be deleted:

```bash
bunx memorai show "$1"
```

2. **Ask for confirmation** if the memory exists:
   - Show the title and summary
   - Ask user to confirm deletion

3. **Delete if confirmed**:

```bash
bunx memorai delete "$1"
```

4. **Report result**:
   - Confirm deletion with memory title
   - Note that this action cannot be undone

## Example Flow

```
User: /mem-delete dec_a1b2

Claude: Found memory to delete:
  ID: dec_a1b2
  Title: API Authentication Design
  Category: decisions
  Summary: Chose JWT with refresh tokens...

Are you sure you want to delete this memory? This cannot be undone.

User: yes

Claude: Memory "API Authentication Design" (dec_a1b2) has been deleted.
```

## Notes

- Deletion is permanent - there is no recycle bin
- Consider if the memory should be updated instead of deleted
