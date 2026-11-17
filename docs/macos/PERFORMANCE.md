# PERFORMANCE.md — Budgets & Instrumentation (v1 draft)

Performance is a product feature (spec §16). Targets assume workspaces with **thousands of source files**; every budget below is measured, not asserted.

---

## 1. Budgets

### Analysis (analysis-core / agent)
| Operation | Cold budget | Warm/incremental budget |
|---|---|---|
| Initial index (1,000-file project) | ≤ 3 s | — |
| Initial index (5,000-file project) | ≤ 10 s | — |
| Single file re-index (on save) | — | ≤ 15 ms |
| Route extraction (full workspace) | ≤ 1 s | ≤ 50 ms per changed controller |
| Conflict detection | ≤ 100 ms @ 2,000 routes | ≤ 10 ms delta |
| Module graph build | ≤ 500 ms @ 200 modules | ≤ 50 ms delta |
| Search query (cached index) | ≤ 150 ms first page | — |
| Agent startup → ready | ≤ 1.5 s | — |
| Agent steady-state RSS | ≤ 300 MB @ 5,000 files | bounded caches, no unbounded AST retention |

### Swift app
| Operation | Budget |
|---|---|
| Window open → interactive (existing project, warm cache) | ≤ 500 ms |
| Cold launch → dashboard | ≤ 2 s |
| Tree/filter interaction latency | ≤ 16 ms per frame (no drops while typing) |
| Graph: 200-module layout | ≤ 250 ms; pan/zoom at 60 fps |
| Bridge round-trip (integrated mode, simple query) | p50 ≤ 20 ms, p99 ≤ 100 ms |
| App RSS (3 open projects) | ≤ 400 MB |

### Extension (bridge additions — must not regress v0.4.0)
| Operation | Budget |
|---|---|
| Extension activation delta from bridge init | ≤ 5 ms (lazy, no scans at boot) |
| Idle bridge overhead | 0 scans, 0 timers while unconnected |

## 2. Techniques (mandated where relevant)

- **analysis-core:** incremental per-file caches keyed by content hash; dependency-aware invalidation; bounded concurrency reads (port `SCAN_CONCURRENCY` semantics); paged search results; no full scans on keystrokes; debounced watcher coalescing (300 ms, port from extension).
- **Agent:** no AST retention after a file's derived data is computed; release obsolete project sessions; one process per active window.
- **SwiftUI:** `@Observable` models with granular invalidation; stable item identities; `LazyVStack`/`List` for long tables; graph rendering on `Canvas` with static layout between mutations; diff-heavy views precomputed in view-models, never in `body`.
- **Communication:** batch `workspace/event` handling; drop stale responses via request tokens; coalesce identical in-flight requests; payload paging for >1,000-item results.

## 3. Instrumentation plan

- analysis-core: per-phase timing hooks (`index.cold`, `index.delta`, `routes.collect`, `conflicts.detect`, `search.query`) exported over a `log` notification + local perf log file.
- Agent: startup-to-ready timestamp; RSS sampled every 5 s (logged, not streamed).
- Bridge: round-trip latency histogram kept in the extension (visible via a diagnostic command, not UI).
- App: signpost instrumentation (`os_signpost`) for indexing wait, first paint, graph layout, search keystroke→render.
- Parity/perf fixtures: the salvage golden projects (554-file main workspace, multi-root) become the standard perf fixture set.

## 4. Profiling discipline

1. Budget defined → instrument → measure on the perf fixture → only then optimize.
2. No optimization without a profile proving the hot path (spec: no Rust unless profiling demands it).
3. Regressions beyond budget block the phase gate, same as functional failures.
