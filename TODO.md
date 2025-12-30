# TODO - Memorai Development

**Last Updated:** 2025-12-30 (Session 24)

---

## Quick Resume

**Current Task:** Memorai v1.0 Complete - Ready for npm publish
**Status:** Phases 1-2 complete, GitHub published, all features tested
**Tests:** 25/25 passing
**GitHub:** https://github.com/kream0/memorai.git

---

## Session 21: Memorai/Autonoma Separation

### Goal
Separate memorai into a focused long-term memory NPM package, and integrate supervisor features into autonoma.

### Key Decisions
| Decision | Choice |
|----------|--------|
| Distribution | **NPM package** - Rewrite memorai in TypeScript |
| Database | **Shared** - Both use `.memorai/memory.db` |
| Cleanup | **Delete completely** - No archiving supervisor files |
| Human Queue | **Both CLI and TUI** in autonoma |

### Phase 1: Create Memorai NPM Package ✅ COMPLETE
| Task | Status |
|------|--------|
| Initialize TypeScript package structure | Done |
| Port `init_db.py` → `src/db/schema.ts` | Done |
| Port `search.py` → `src/operations/search.ts` | Done |
| Port `store.py` → `src/operations/store.ts` | Done |
| Port `list.py` → `src/operations/list.ts` | Done |
| Port `bootstrap.py` → `src/operations/bootstrap.ts` | Done |
| Create `src/client.ts` (MemoraiClient) | Done |
| Create CLI `bin/memorai.ts` | Done |
| Test all operations | Done (25/25 tests) |

### Phase 2: Delete Supervisor from Memorai ✅ COMPLETE
| Task | Status |
|------|--------|
| Delete `supervisor.py`, `master_protocol.py`, `worker_protocol.py` | Done |
| Delete supervisor scripts (checkpoint, tasks, verify, etc.) | Done |
| Delete Python CLI (`memorai.py`, `install.sh`) | Done |
| Delete Python skill scripts (keep only TypeScript) | Done |
| Update CLAUDE.md (memory-only scope) | Done |
| Update slash commands to use TypeScript CLI | Done |
| Clean up obsolete docs | Done |

### Phase 3: Add Supervisor Features to Autonoma
| Task | Status |
|------|--------|
| Create `src/verification/` (objective verification) | Pending |
| Create `src/human-queue/` (blocker handling) | Pending |
| Create `src/retry/` (error context injection) | Pending |
| Add 40% objective reminder to context-monitor | Pending |
| Add priority rebalancing to queue | Pending |
| Add `autonoma respond` CLI command | Pending |
| Add TUI notifications view | Pending |

### Phase 4: Memorai Integration in Autonoma
| Task | Status |
|------|--------|
| Add memorai as npm dependency | Pending |
| Init memorai on `autonoma start` | Pending |
| Search memories before phase execution | Pending |
| Store learnings after task completion | Pending |
| Store handoffs as memories | Pending |
| Migrate existing autonoma memory data | Pending |

### Phase 5: Testing & Documentation
| Task | Status |
|------|--------|
| Test memorai standalone | Done |
| Test autonoma with memorai | Pending (autonoma work) |
| Update READMEs | Done |
| Update CLAUDE.md files | Done |

---

## Backlog

See `BACKLOG.md` for:
- Semantic memory (ONNX embeddings)
- Leash integration
- CI/CD event handling
