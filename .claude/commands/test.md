---
description: Pre-test checklist before running tests
---

Before testing Memorai, verify:

```bash
# Check Bun
bun --version

# Run tests
bun test

# Check database (if initialized)
bunx memorai status 2>/dev/null || echo "No memories yet"
```

Report test results:

| Check | Status |
|-------|--------|
| Bun installed | Pass/Fail |
| Tests passing | X/Y |
| Database | OK / Not initialized |
