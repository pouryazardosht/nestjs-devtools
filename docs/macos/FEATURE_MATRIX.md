# FEATURE_MATRIX.md — Capability Parity Register

Tracks all **68 existing capabilities** across both operating modes. A row is only "Complete" when the capability has automated coverage in both modes (spec §4.3: visual representation alone never counts).

**Legend**
- **Ext** — shipped in the VS Code extension v0.4.0 (reference implementation; every row starts ✅ here).
- **Shared** — computed by `analysis-core`, identical results in both modes.
- **SA** — standalone mode (bundled agent).
- **IN** — integrated mode (VS Code bridge).
- Status values: `planned` → `in-progress` → `parity-tested` → `complete`.

Phases refer to `ROADMAP.md`.

---

## Logging (CAP-01 … CAP-10)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-01 | Insert debug/info/warn/error/verbose statements | `logging/insert` | P5 | P5 | edit target differs; insertion logic identical |
| CAP-02 | Enclosing class name detection | `parser/classBody` | P1 | P2 | ported verbatim |
| CAP-03 | Statement-end insertion across multi-line code | `logging/insertion` | P5 | P5 | |
| CAP-04 | Empty-body-safe insertion | `logging/insertion` | P5 | P5 | |
| CAP-05 | Auto-declare missing logger (property) | `logging/declaration` | P5 | P5 | |
| CAP-06 | Logger import merge (multi-line, LoggerModule-safe) | `parser/imports` + `logging/declaration` | P5 | P5 | |
| CAP-07 | Message template `{emoji}/{class}/{variable}` | app-side rendering | P3 | P3 | template value shared via settings contract |
| CAP-08 | `{object}` structured argument mode | app-side rendering | P3 | P3 | |
| CAP-09 | Remove all logger statements (multi-line aware) | `logging/scan` + transaction | P5 | P5 | |
| CAP-10 | Selective removal (pick which to keep) | `logging/scan` | P5 | P5 | |

## Navigation & Search (CAP-11 … CAP-20)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-11 | Browse modules with nested drill-in | `modules/graph` | P4 | P4 | |
| CAP-12 | Breadcrumb + back navigation | app-side state | P3 | P3 | |
| CAP-13 | Current-module file listing | `modules/files` | P4 | P4 | |
| CAP-14 | Project-wide files+routes search | `search/*` | P4 | P4 | |
| CAP-15 | Method search (routes/decorated/plain) | `search/methods` | P4 | P4 | port of `methodSearcher` extraction |
| CAP-16 | Shortcut-letter jumping | app-side | P4 | P4 | |
| CAP-17 | Live preview navigation | app-side (+ `editor/*` in IN) | P4 | P4 | SA: in-app preview pane |
| CAP-18 | Route parse: all decorator forms | `routes/extract` | P2 | P2 | verbatim port |
| CAP-19 | Served paths: global prefix + @Version | `project/prefix` + `routes/extract` | P2 | P2 | |
| CAP-20 | Full URL composition | `routes/export` | P5 | P5 | |

## DI Health (CAP-21 … CAP-30)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-21 | Orphan provider detection | `providers/index` | P2 | P2 | |
| CAP-22 | Wrong-array registration detection | `providers/index` (array keys) | P2 | P2 | |
| CAP-23 | Register orphan into nearest module (fix) | `providers/fix` + transaction | P5 | P5 | IN uses existing WorkspaceEdit quick fix |
| CAP-24 | Tree-level register action | app-side + CAP-23 | P5 | P5 | |
| CAP-25 | Inject provider into class (all ctor shapes) | `providers/inject` + transaction | P5 | P5 | |
| CAP-26 | Acronym-safe instance naming | `providers/inject` | P5 | P5 | |
| CAP-27 | Find all usages with injection-site annotation | `providers/usages` | P2 | P2 | SA runs its own TS Language Service |
| CAP-28 | Jump to providing module | `providers/index` | P4 | P4 | |
| CAP-29 | Module health badges (orphans + wrong-array) | `providers/health` | P4 | P4 | |
| CAP-30 | Provider registration status per file | `providers/index` | P4 | P4 | |

## Routes (CAP-31 … CAP-40)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-31 | Workspace route collection | `routes/collect` | P2 | P2 | |
| CAP-32 | Group/sort by controller, tag, verb, path | app-side over shared data | P4 | P4 | |
| CAP-33 | Conflict detection (5 kinds, confidence) | `diagnostics/routeConflicts` | P2 | P2 | pure function — zero-change port |
| CAP-34 | Versioned-twin handling (info) | `diagnostics/routeConflicts` | P2 | P2 | |
| CAP-35 | Conflict surfacing (problems/tree/report) | app-side + auto-refresh | P4 | P4 | IN: Problems panel; SA: Diagnostics center |
| CAP-36 | Copy route / full URL / cURL | `routes/export` | P4 | P4 | cURL body+escaping rules shared |
| CAP-37 | Copy all controller routes | `routes/export` | P4 | P4 | |
| CAP-38 | API docs coverage report | `routes/swagger` | P4 | P4 | |
| CAP-39 | Swagger summaries/tags/no-docs flags | `routes/swagger` | P2 | P2 | |
| CAP-40 | Jump to handler line | `editor/*` (IN) / in-app (SA) | P4 | P4 | |

## Generation (CAP-41 … CAP-45)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-41 | 18 file-type scaffolds | `generation/templates` | P5 | P5 | templates are pure strings |
| CAP-42 | Correct imports/decorator/naming per type | `generation/templates` | P5 | P5 | |
| CAP-43 | Custom file types | `project/taxonomy` | P3 | P3 | |
| CAP-44 | Matching spec scaffolds | `generation/spec` | P5 | P5 | |
| CAP-45 | Overwrite protection | transaction layer | P5 | P5 | journal + approval |

## Project Awareness (CAP-46 … CAP-51)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-46 | NestJS project detection | `project/detect` | P2 | P2 | |
| CAP-47 | NestJS core version detection | `project/version` | P3 | P3 | |
| CAP-48 | Module registration graph | `modules/registrations` | P2 | P2 | |
| CAP-49 | Singular/plural suffix recognition | `project/taxonomy` | P1 | P1 | |
| CAP-50 | 43+ file-suffix iconography | taxonomy + app icons | P3 | P3 | SA: SF Symbols mapping |
| CAP-51 | Module CodeLens counts | `modules/counts` | — | ✅ Ext | CodeLens is editor-only; SA exposes counts in the tree instead (equivalent capability, different surface) |

## Sidebar Exploration (CAP-52 … CAP-58)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-52 | Module graph tree | app-side over `modules/*` | P4 | P4 | |
| CAP-53 | Routes tree | app-side over `routes/*` | P4 | P4 | |
| CAP-54 | Health issues at a glance | `providers/health` | P4 | P4 | |
| CAP-55 | Conflicts at a glance | `diagnostics/routeConflicts` | P4 | P4 | |
| CAP-56 | Live filtering | app-side over cached data | P4 | P4 | |
| CAP-57 | Open at exact line | `editor/open` (IN) / in-app viewer (SA) | P4 | P4 | |
| CAP-58 | Auto-refresh on fs events | `fs/watcher` + `workspace/event` | P2 | P2 | |

## One-Click Everything (CAP-59 … CAP-63)

| ID | Capability | SA | IN | Notes |
|----|------------|----|----|-------|
| CAP-59 | Command hub / Command Center | P3 | P3 | app-side; IN adds editor-scoped commands |
| CAP-60 | Status-bar access | ✅ Ext | — | app equivalent: menu bar / dock presence |
| CAP-61 | Editor context-menu shortcuts | ✅ Ext | ✅ Ext | SA: context menus in-app |
| CAP-62 | 12 keyboard chords (remappable) | P3 | ✅ Ext | |
| CAP-63 | Context actions for every list item | P4 | P4 | |

## Reliability (CAP-64 … CAP-68)

| ID | Capability | Shared module | SA | IN | Notes |
|----|------------|---------------|----|----|-------|
| CAP-64 | String/comment/template/regex-safe parsing | `parser/strip` | P1 | P1 | |
| CAP-65 | Crash-proof scanning | `fs/reader` + `scan` | P2 | ✅ Ext | |
| CAP-66 | Incremental caches | `index/*` + watcher | P2 | ✅ Ext | |
| CAP-67 | UTF-8/UTF-16, CRLF, Windows paths | `fs/reader` | P2 | ✅ Ext | |
| CAP-68 | Zero-configuration operation | defaults in `contracts` | P3 | ✅ Ext | |

---

## Counters

- 68 capabilities total · Extension v0.4.0 ships **all 68** (reference implementation).
- Standalone: **complete = 0**, planned across Phases 1–5 with the heavy concentration in P2 (analysis/parity) and P5 (actions).
- Integrated: analysis rows (P2) complete once `analysis-core` is extracted and the bridge serves from the existing index; editor rows (P4/P5) reuse the extension's shipped implementations.

**Rule enforced:** no row may move to `complete` without a parity test (same fixture project, equivalent results in both modes) recorded in `test/parity/`.
