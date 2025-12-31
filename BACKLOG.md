# Backlog - Memorai Long-Term Roadmap

**Last Reviewed:** 2025-12-31

---

## High Priority

### Test `memorai scan` on Real Codebases

The scan feature is implemented but needs real-world testing:
- [ ] Test on a large TypeScript monorepo (500k+ tokens)
- [ ] Test on a Python codebase
- [ ] Verify multi-partition exploration works correctly
- [ ] Test synthesis with multiple partition results
- [ ] Benchmark memory quality vs `memorai learn` on docs

---

### Autonomous Agent System ✅ COMPLETE

The supervisor/agent system has been fully separated:
- Memorai is now a pure long-term memory NPM package
- All supervisor features integrated into autonoma

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Create Memorai NPM Package | ✅ COMPLETE |
| 2 | Delete Supervisor from Memorai | ✅ COMPLETE |
| 3-5 | Autonoma Integration | ✅ COMPLETE |

---

### Semantic Memory (ONNX Embeddings)

Replace keyword-based FTS with semantic similarity search:
- Local ONNX runtime (no API costs)
- sentence-transformers model (~80MB)
- Vector similarity for retrieval
- Auto-categorization from embeddings

**Benefits:**
- "auth" finds "login", "session", "credentials"
- No need to know exact keywords
- LLM-native retrieval

---

## Medium Priority

### TSAD+M Method Testing
- [ ] Test full workflow on real enterprise project
- [ ] Create installation script (`install-tsadm.sh`)
- [ ] Document edge cases and troubleshooting

### Memory Enhancements
- Memory deduplication/merge (consolidate similar)
- Memory export/import (backup/restore)
- Memory decay (auto-reduce importance over time)
- Conflict detection on store

### MCP Server Option
- Expose Memorai as MCP server
- Enable cross-project memory access
- Support for memory federation

---

## Low Priority / Future

### Alternative Integrations
- GitHub/GitLab MCP support (alternative to ADO)
- Playwright MCP support (alternative to Chrome DevTools)

### Multi-Agent Coordination
- Swarm integration
- Agent communication protocol
- Shared memory access patterns

### browser-lite Deployment
- [ ] Install in WSL (`~/.claude/skills/browser-lite/`)
- [ ] Update facturai CLAUDE.md
- [ ] Remove chrome-devtools MCP from facturai

---

## Completed

### Session 4 - Codebase-Memory Sync
- [x] 3-layer sync enforcement
- [x] /sync command
- [x] Step 4B in /end

### Session 3 - TSAD+M Method
- [x] Method synthesis and documentation
- [x] Enterprise templates
- [x] /mem-bootstrap

### Session 1-2 - Core Memorai
- [x] SQLite + FTS5 storage
- [x] CRUD scripts
- [x] Skill integration
- [x] Session hooks
