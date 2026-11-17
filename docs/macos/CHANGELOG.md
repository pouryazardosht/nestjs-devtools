# NestJS DevTools for macOS — Changelog

Tracks the native macOS application track only. The VS Code extension's changelog remains at the repository root.

## [Phase 0] — 2026-11-18

### Added
- `feature/macos-app` branch opened from v0.4.0 (`f645cf9`).
- Phase 0 audit (`PHASE-0-AUDIT.md`) — reusable-module mapping, standalone gaps, technical debt, prior-proposal reconciliation, integration risks.
- Deliverable documents: ARCHITECTURE.md, FEATURE_MATRIX.md (all 68 capabilities registered across both operating modes), PROTOCOL.md (JSON-RPC v1 draft), DESIGN_SYSTEM.md, ROADMAP.md (phases 0–6 with gates), PERFORMANCE.md (budgets + instrumentation).
- No product code yet — per spec §21, Phase 1 (shared foundation) starts after this gate.

### Decisions
- Additive repository layout: extension stays at the root; `packages/analysis-core`, `packages/contracts`, `apps/{macos,agent}` are new directories.
- Prior PROPOSAL-STANDALONE-v2.x stance (no extension integration) superseded by the master spec's dual-mode architecture; salvage assets (golden fixtures, transaction-journal design) remain in scope.
- Extension host types leave the shared layer at the adapter seam; analysis-core emits plain data (`{line, col}`, no `vscode.*`).
