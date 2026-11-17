# Phase 0 — Existing Product Audit

**Branch:** `feature/macos-app` · **Date:** 2026-11-18 · **Status:** Complete
**Scope:** the shipped VS Code extension at v0.4.0 (commit `f645cf9`), 31 source files, ~5,600 lines of TypeScript, verified behavior suite of 55 cases.

This audit is the input to every later phase. Per the master spec: no working functionality is rewritten; reusable modules are identified as-is; gaps are named explicitly.

---

## 1. What exists and works (v0.4.0)

The extension is a mature static-analysis tool for NestJS projects running inside the VS Code extension host:

- **Parser layer (pure functions, highly reusable):** route extraction (all `@Controller` forms, `@Version`, single-line decorators, arrow handlers, JSDoc gaps), conflict/shadow detection (5 kinds, confidence-graded), class/constructor scanning (string/comment/regex-aware, strip-index mapped), module registration parsing (`@Module`-scoped, wrong-array keys), logger import/declaration state, statement-aware insertion points, import-form recognition (`import type`, default, namespace, multi-line).
- **Index layer (cached, incremental):** workspace class index + registration index; save-driven per-file invalidation, save-during-scan reconciliation, in-flight dedup; global-prefix detection; Nest version detection; project detection.
- **UI layer (VS Code surfaces):** two sidebar trees (modules with DI health badges; routes with conflicts group), CodeLens, 27 commands, 12 settings, status-bar hub, context menus, editor edits (log insertion/removal, provider injection, registration quick fix, file generation with spec scaffolds).
- **Verification:** 55-case suite running the real compiled code against a stubbed `vscode` module (parser regressions, conflict fixtures, registration arrays, insertion points). This harness pattern is directly reusable for `analysis-core` parity tests.

## 2. Reusable modules for `analysis-core` (verbatim or near-verbatim ports)

| Extension module | Reuse plan in analysis-core | Coupling to `vscode` |
|---|---|---|
| `utils/routeUtils.ts` | `parse/routes` — extract as-is; `httpMethodIcon`/`missingDocsFlag` stay UI-side | Only `ThemeIcon` helpers → strip |
| `utils/routeConflicts.ts` | `diagnostics/routeConflicts` — **zero changes needed** (pure function, already confidence-graded) | None |
| `utils/nestIndex.ts` | `providers/index` — swap `findFilesSafe`/`readTextFile` to Node `fs` adapter | 3 call sites |
| `utils/insertionPoint.ts` (`stripCode`, `stripCodeMapped`, `netDelta`, `findInsertionPoint`) | `parser/strip`, `logging/insertion` — as-is | Only `vscode.Position` in `findInsertionPoint` return → replace with plain `{line, col}` |
| `utils/classBody.ts` | `parser/classBody` — same Position swap | `vscode.Position` only |
| `utils/imports.ts` | `parser/imports` — same | `vscode.Position`, `TextDocument` |
| `utils/loggerDeclaration.ts` | `logging/declaration` — same | `vscode.Position` |
| `utils/scan.ts` (`readTextFile`, `mapWithConcurrency`) | `fs/reader` — replace `workspace.fs` with Node `fs/promises` (BOM/UTF-16/CRLF logic ports verbatim) | 2 call sites |
| `utils/moduleDirs.ts` | `modules/discovery` | `vscode.Uri`, `findFilesSafe` |
| `utils/globalPrefix.ts`, `utils/nestProject.ts` | `project/*` | `vscode.workspace` |
| `constants.ts` (`NEST_TYPES`, plurals, `matchNestType`) | `project/taxonomy` — as-is | `getConfiguration` only |
| `commands/generateNestFile.ts` (templates + spec builder) | `generation/templates` — templates are pure strings; file writes move to the agent's transactional layer | `vscode.workspace.fs` |
| `commands/routeTreeActions.ts` (cURL builder) | `routes/export` — pure string building | None |

**Conclusion: roughly 70% of the intelligence layer is already UI-free or one adapter away from it.** The strip/parse/index core was hardened in v0.4.0 specifically so it could survive this extraction.

## 3. Missing for standalone (the actual Phase 1–5 work)

1. **No process boundary today.** Everything runs in the extension host; there is no JSON-RPC, no serialization of analysis results, no versioned contracts.
2. **No Node-side file services.** `workspace.findFiles`, `workspace.fs.writeFile`, `workspace.openTextDocument`, configuration reads — all need Node adapters (glob walking, atomic writes, config loading from `package.json`/settings defaults).
3. **No file watching** in reusable form — extension uses `vscode.FileSystemWatcher`; agent needs `fs.watch`/chokidar with the same debounced invalidation semantics.
4. **No safe source-transformation layer.** Edit builders produce `WorkspaceEdit`s (VS Code applies atomically). Standalone needs an apply-verify-preview transaction layer with backups — the salvaged transaction design (`~/Desktop/nestjs-devtools-mac-app/docs/salvage/`, proposal v2.4 §7) is prior art for exactly this.
5. **No editor actions.** "Open file at line", "reveal range" — integrated mode delegates to the extension; standalone mode shells out to the `code` CLI when available and degrades gracefully.
6. **No settings persistence** outside VS Code configuration — agent needs a JSON config file.
7. **Gaps in capabilities that the extension papered over with VS Code APIs:** TypeScript language-service usages (`findProviderUsages` uses `vscode.executeWorkspaceSymbolProvider`/`executeReferenceProvider`) — standalone must run `ts.createLanguageService` itself (port of the same flow, different service host).

## 4. Known technical debt (carried forward, not rewritten silently)

| Item | Impact | Planned handling |
|---|---|---|
| Picker shortcut timeout hijacks typing (200 ms) | Minor UX | Redesign in native search |
| `mapWithConcurrency` lacks rejection isolation | Latent (single never-throwing consumer) | Fix during `fs/reader` port |
| Textual parsing is Tier-A heuristic (no type checker) | Edge cases on exotic code | Documented limits; Tier-B (Program + TypeChecker) is Phase-2 stretch in analysis-core |
| No formal test runner in repo | Regression risk | Jest/Vitest in analysis-core from Phase 1; parity fixtures from the salvage suite |
| `parseModuleArray` name-only extraction can't see spread-element resolution | Orphan false positives | Documented limit; Tier-B resolves |

## 5. Relationship to prior proposals

The archived proposals (`PROPOSAL-STANDALONE-v2.x`, kept at `~/Desktop/nestjs-devtools-mac-app/docs/`) took a **standalone-only** stance ("no extension integration, no shared packages"). This spec **supersedes that stance**: both operating modes are required, sharing one TypeScript analysis core. Salvaged assets that remain valid regardless of stance:

- Golden analysis fixtures + capture scripts (`docs/salvage/golden/`, `capture-golden.mjs`, `count-golden.mjs`) — reuse for parity testing.
- Transaction journal / crash-recovery design (v2.4 §7) — reuse for the standalone source-transformation layer.
- UI design system work — superseded by the new design language in `DESIGN_SYSTEM.md`.

## 6. Integration risks

1. **Extension startup cost** — the bridge must be lazy (`onStartupFinished` + first-use init); the extension currently activates via contributed-UI implicit activation and stays idle. A socket listener that scans on boot would be a regression; spec forbids it.
2. **Two analyzers, one truth** — integrated mode must serve analysis from the extension's existing index (not a second scan by the agent) or results can diverge. The capability matrix tracks which side computes what.
3. **Version skew** — bridge and app negotiate protocol + capability versions at handshake; the extension ships independently of the app (Marketplace cadence differs).
4. **Socket lifecycle** — UDS path per user; stale sockets after crashes need cleanup; reconnect with backoff in the app.

## 7. Phase 0 verdict

The extension is a viable analysis core with a clean extraction path and a functioning verification harness. Recommended sequencing (matches `ROADMAP.md`):

1. Extract `analysis-core` with Node adapters + Vitest + golden fixtures (Phase 1–2).
2. Protocol + standalone agent on stdio (Phase 2).
3. SwiftUI shell with sessions/design system (Phase 3), explorers (Phase 4), actions with preview/apply transactions (Phase 5).

No blockers identified. The riskiest component — safe source transformations outside VS Code — has prior art in the salvage docs and must not ship without its transaction layer.
