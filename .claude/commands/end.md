---
description: Perform end-of-session documentation update before stopping
---

Before ending this session, complete these steps:

## Step 1: Session Summary

Update `LAST_SESSION.md` with:
- Session number (increment from last)
- Focus area
- What was accomplished (bullet points)
- Files modified/created
- Current project status

## Step 2: Update TODO.md

- Mark completed items as done
- Update Quick Resume section with next task
- Add any new tasks discovered

## Step 3: Memory Reflection

Think about what you learned or decided during this session that should be remembered:

- Did you make any architectural decisions that weren't saved?
- Did you discover any gotchas or caveats?
- Did you learn something about the codebase that future sessions should know?
- Did you find a pattern or approach that worked well?
- Did you hit any errors with non-obvious solutions?

For each missed memory, save it now:

```bash
memorai save [category] "[Title]" --content "[insight]" --importance [1-10]
```

Categories: `architecture`, `decisions`, `notes`, `structure`

**Important:** Don't create summaries of the session - save specific, actionable knowledge that would help you (or another Claude) in future sessions.

## Step 4: Handoff Notes

Add any context the next session will need to LAST_SESSION.md under "Handoff Notes".

---

Provide a brief summary of what was documented and any memories saved.
