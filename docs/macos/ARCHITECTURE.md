# ARCHITECTURE.md — NestJS DevTools for macOS

**Status:** v1.0 draft (Phase 0 output) · Supersedes the standalone-only stance of PROPOSAL-STANDALONE-v2.x.

---

## 1. Product shape

A native macOS application (Swift 6 + SwiftUI, MVVM) that understands NestJS projects, with **two interchangeable runtime adapters** behind one protocol:

```
┌────────────────────────────────────────────────────────┐
│  NestJS DevTools.app — SwiftUI (Layer A)               │
│  MVVM · sessions per project/window · design system    │
├────────────────────────────────────────────────────────┤
│  Application Services (Layer B)                        │
│  ProjectSession · AnalysisOrchestrator · Connection     │
│  ActionRunner (preview→approve→apply) · Caches          │
├──────────────────────┬─────────────────────────────────┤
│  Integrated adapter  │  Standalone adapter             │
│  UDS + JSON-RPC 2.0  │  bundled Node agent + stdio     │
│  ↔ VS Code extension │  ↔ analysis-core in-process     │
├──────────────────────┴─────────────────────────────────┤
│  analysis-core (Layer C) — TypeScript                  │
│  parse · modules · providers · routes · diagnostics     │
│  logging · generation · search · project               │
└────────────────────────────────────────────────────────┘
```

**One protocol, two adapters.** The Swift app is written against Layer B's interfaces only; it never knows which adapter is active beyond a status badge.

## 2. Repository organization (decision)

The extension stays at the repository root — restructuring it is explicitly forbidden by the spec. New directories are additive:

```text
nestjs-devtools/            (existing extension — untouched layout)
├── src/                    existing extension code
├── packages/
│   ├── analysis-core/      NEW — extracted TS intelligence (Phase 1–2)
│   │   ├── src/{project,modules,providers,routes,diagnostics,logging,generation,search,parser,fs,protocol}
│   │   └── test/           Vitest + golden fixtures
│   └── contracts/          NEW — versioned JSON schemas shared by all sides
└── apps/
    ├── macos/              NEW — SwiftUI application (Phase 3+)
    └── agent/              NEW — bundled standalone Node agent (Phase 2)
docs/macos/                 NEW — the seven deliverable documents (this folder)
```

Rationale: additive-first keeps the shipped extension safe; moving `src/` into `apps/vscode-extension/` is deferred until the extension imports `analysis-core` and nothing breaks. Documented as a Phase-3 cleanup candidate, gated on green parity tests.

## 3. analysis-core boundaries (Phase 1)

Extraction rules from the Phase 0 audit (`PHASE-0-AUDIT.md`):

1. **Pure modules port first** — `routeConflicts`, `routeUtils`, `insertionPoint`, `classBody`, `imports`, `loggerDeclaration`, taxonomy — with `vscode.Position` replaced by `{ line, col }` records.
2. **Adapter seam** — every extension API (`findFiles`, `readFile`, `openTextDocument`, configuration) is replaced by a `FileSystemAdapter`/`ConfigurationAdapter` interface; the extension host and the agent each provide an implementation.
3. **Index stays index** — `nestIndex` ports with its invalidation semantics intact (save-driven, save-during-scan reconciliation, in-flight dedup); the watcher becomes an injected event source.
4. **No UI types** — icons, theme colors, QuickPicks stay in the extension; analysis-core emits data only.

## 4. Runtime adapters

### 4.1 Integrated (VS Code bridge)
- Extension registers a Unix Domain Socket server **lazily**: socket path per user (`~/Library/Application Support/NestJSDevTools/bridge.sock`), listener created on `onStartupFinished` but scanning nothing until the first RPC.
- Handshake: `initialize` → protocol version + capability set + extension version exchange; mismatch → typed error, app falls back to standalone.
- The extension answers analysis queries **from its existing index** (never re-scans for the bridge) and performs editor actions (open-at-line, WorkspaceEdit, quick fixes).
- Reconnection: app retries with backoff; stale socket files are cleaned on bind failure.

### 4.2 Standalone agent
- Bundled Node runtime + `apps/agent` entry over **stdio with Content-Length framing** (same JSON-RPC 2.0 envelope as the bridge).
- One agent process per active project window; supervised by the app (restart on EOF-abnormal, kill on window close).
- File watching: chokidar with the extension's debounced coalescing semantics; events become `workspace/event` notifications.
- **Source mutations** go through the transaction layer (preview → user approval → journaled apply → verify), per the salvaged v2.4 §7 design. No workspace scripts are ever executed during discovery or analysis.

## 5. Protocol (summary — full contract in `PROTOCOL.md`)

- JSON-RPC 2.0, byte-framed; UTF-8 everywhere.
- Namespaced methods: `project/*`, `modules/*`, `routes/*`, `providers/*`, `diagnostics/*`, `logging/*`, `generation/*`, `search/*`, `actions/*`, `editor/*`.
- Notifications: `workspace/event` (fs changes), `analysis/status` (indexing progress), `log` (agent diagnostics).
- Every mutation RPC returns an **ActionPreview** (files, hunks) — applying is a separate, explicit `actions/apply` with the preview's ID.
- Runtime validation at the boundary via the `packages/contracts` schemas; Swift decodes into typed structs only.

## 6. Application services (Layer B)

- **ProjectSession** — identity (stable path-hash id), per-window ownership, owns its adapter connection, caches, navigation history, and analysis state. Windows never share session instances.
- **AnalysisOrchestrator** — request coalescing, cancellation tokens, stale-response dropping, background incremental indexing.
- **ActionRunner** — the only component allowed to mutate sources; enforces preview-first, diff approval, transaction journaling (standalone) or delegated WorkspaceEdit (integrated).
- **RecentProjects/Favorites store** — local persistence, session restoration on relaunch.

## 7. SwiftUI layer (Layer A)

- MVVM; one view-model tree per session; `@Observable` models, stable identities, lazy containers.
- Navigation: sidebar (Dashboard / Modules / Routes / DI / Diagnostics / Files / Search) + main workspace + contextual inspector.
- All rendering consumes typed view-models built from contract types — no JSON dictionaries past the boundary.
- Design system per `DESIGN_SYSTEM.md`; Light/Dark via semantic tokens.

## 8. Error model

- Contract-level: typed error codes (per `PROTOCOL.md`), never raw strings across the boundary.
- Adapter-level: connection loss ≠ data loss — the app keeps the last analysis snapshot, marks it stale, reconnects, and re-syncs.
- App-level: user-facing errors carry an action ("Open settings", "Retry", "Switch to standalone").

## 9. Testing architecture

- analysis-core: Vitest units per module + golden fixtures (salvage suite reused) + parity tests comparing integrated vs standalone outputs on identical fixture projects.
- Swift: XCTest for sessions, isolation, navigation, connection lifecycle.
- Integration: scripted agent↔app harness; bridge tests against a headless extension-host fixture.
- UI: snapshot tests for empty/loading/error states in Light/Dark.
