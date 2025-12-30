---
description: Initialize Memorai memory system for this project
---

Initialize the Memorai long-term memory system for this project.

This will create:
- `.memorai/memory.db` - SQLite database with FTS5 search
- `.memorai/config.json` - Configuration file

Run the initialization:

```bash
bunx memorai init
```

After initialization:
1. The memory system is ready to use
2. Use `/mem-save` to store memories
3. Use `/mem-find` to search memories
4. The `memorai` skill will automatically suggest memory operations

If the database already exists, this command will report its current state without overwriting.
