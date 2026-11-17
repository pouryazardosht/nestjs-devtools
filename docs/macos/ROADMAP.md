# ROADMAP.md — NestJS DevTools for macOS

Incremental delivery; **every phase ends with a working, testable product state** (spec §21). Gates are hard: a phase does not close until its gate passes.

---

## Phase 0 — Existing Product Audit ✅ (this branch)

- Full audit: `PHASE-0-AUDIT.md`
- Deliverable documents created: ARCHITECTURE, FEATURE_MATRIX (68 capabilities), PROTOCOL v1, DESIGN_SYSTEM, PERFORMANCE, ROADMAP
- **Gate:** audit + documents committed on `feature/macos-app` ✅

## Phase 1 — Shared Foundation

- `packages/analysis-core` scaffold: Vitest, TS config, Node adapters (`fs/reader`, `fs/walker`, `config`), package boundaries
- Port pure modules (strip/parse/classBody/imports/loggerDeclaration/taxonomy/routeConflicts) with the `{line,col}` position swap; golden-fixture port from the salvage suite
- `packages/contracts`: JSON schemas for the v1 protocol types + validation helpers
- Swift workspace: Xcode project, design-system tokens, empty shell, `ProjectSession` model, recent-projects store, multi-window skeleton
- **Gate:** analysis-core unit tests green (golden fixtures pass); Swift app launches, opens/closes windows, remembers recent projects; zero extension regressions (`npm run compile` + vsce package unaffected)

## Phase 2 — Runtime Integration

- Standalone agent (`apps/agent`): stdio JSON-RPC server implementing `project/*`, `modules/*`, `routes/*`, `providers/*`, `diagnostics/*`, `search/*`, `workspace/event` — served from analysis-core
- VS Code bridge: lazy UDS listener in the extension implementing the same methods from its existing index (+ `editor/*`)
- File watching with debounced `workspace/event` notifications; incremental index invalidation
- Swift: adapter abstraction, connection lifecycle, handshake/version negotiation, cancellation, reconnection, parity harness (same fixtures through both adapters)
- **Gate:** FEATURE_MATRIX rows marked P2 reach `parity-tested` — identical results on fixture projects through both adapters; extension v0.4.x behavior unchanged

## Phase 3 — Native Application Shell

- Project opening (open panel + drag-drop), recent/favorites, project switching, per-window sessions
- Sidebar navigation, toolbar, Dashboard (metrics from `project/health`, every metric navigates), Settings, Command Center (`⌘K`)
- Design system components v1 (rows, badges, empty/loading/error states) in Light/Dark
- **Gate:** a user can open a real NestJS project standalone, see live metrics, navigate all sections; multi-window isolation tested (two windows, independent state)

## Phase 4 — Core Explorers

- Module tree + **interactive module graph** (synchronized selection, zoom/pan/fit, stable layout, large-graph fallback)
- Route explorer (grouping/filtering/search/conflicts/URL composition/copy actions)
- DI explorer (orphans, wrong-array, usages, relationships) and Diagnostics center (filter/group/navigate)
- Global search across all scopes with keyboard-first UX and cancellation
- **Gate:** FEATURE_MATRIX P4 rows `parity-tested`; graph stays responsive on a 1,000+ file fixture (performance budget per `PERFORMANCE.md`)

## Phase 5 — Developer Actions

- Logging workspace (insert/preview/remove, templates, custom loggers)
- File generation with destination control + spec scaffolds
- Provider registration / injection with **preview → approve → apply** transactions (journal + rollback on the standalone path; delegated WorkspaceEdit on integrated)
- Route copying, selective log cleanup
- **Gate:** FEATURE_MATRIX P5 rows `parity-tested`; no mutation reaches disk without a preview approval; crash-mid-apply recovers via journal

## Phase 6 — Production Polish

- Keyboard-complete UX, context menus, accessibility pass (VoiceOver, contrast, reduce-motion)
- Performance hardening against `PERFORMANCE.md` budgets (profiled, not guessed)
- Error-recovery flows (stale snapshots, agent crash-restart, bridge reconnect)
- Full test matrix (unit + parity + integration + UI snapshots)
- **Gate:** spec §23 "Definition of Done" checklist passes item by item

---

## Standing rules

1. No phase starts before the previous gate passes.
2. Extension regressions block everything (CI: `tsc` + `npm run compile` + vsce package + lint on every push).
3. Every capability lands with tests in the same change; FEATURE_MATRIX is updated in the same commit.
4. No fake data in unfinished screens; incomplete = visibly marked "in development", not hidden.
