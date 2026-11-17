# DESIGN_SYSTEM.md — NestJS DevTools for macOS (v1 draft)

Design language: **native macOS conventions + Linear-grade information hierarchy + a restrained NestJS accent.** The accent is an identity — never a paint bucket.

---

## 1. Principles (enforced in review)

1. Information density without clutter — tables over cards, monospaced data over prose.
2. One accent, many grays — orange appears only on identity moments (app icon, active session, primary CTA) and **status semantics**.
3. Content is the chrome — toolbars and inspectors shrink when content grows.
4. Every state designed: empty, loading, error, stale-connection — never a blank rectangle.
5. Motion is confirmation, not decoration — ≤ 200 ms, easing `easeOut`, never blocking interaction.
6. Dark first, Light equal — both designed against real code screenshots, not toggled at the end.

## 2. Color tokens (semantic, theme-aware)

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg/canvas` | system background | system background | window |
| `bg/surface` | white / `#1E1F22` | — | cards, tables |
| `bg/elevated` | material popover | — | inspector, popovers |
| `fg/primary` | label color | label color | — |
| `fg/secondary` | secondaryLabel | — | metadata |
| `fg/tertiary` | tertiaryLabel | — | placeholders |
| `accent/brand` | NestJS orange `#E0234E`→ refined `#E1454D` | same, slightly desaturated | brand moments only |
| `accent/interactive` | system blue | system blue | links, selection |
| `status/ok` | `#34C759` | — | health OK |
| `status/warning` | `#FFB020` | — | heuristic diagnostics |
| `status/error` | `#E1454D` | — | certain conflicts, DI errors |
| `status/info` | system gray-blue | — | informational diagnostics |
| `verb/get` | `#4A9DEC` | — | route verbs (match extension) |
| `verb/post` | `#43B97F` | | |
| `verb/put` | `#E8A13C` | | |
| `verb/patch` | `#D8B434` | | |
| `verb/delete` | `#E1454D` | | |

Rules: no raw hex in views — only tokens. Conflicts use `status/*` by confidence (certain → error, heuristic → warning, info → info).

## 3. Typography

| Token | Font | Size / Weight | Usage |
|---|---|---|---|
| `type/display` | SF Pro Display | 22 semibold | dashboard project name |
| `type/title` | SF Pro Text | 15 semibold | section headers, window titles |
| `type/body` | SF Pro Text | 13 regular | default |
| `type/caption` | SF Pro Text | 11 regular | metadata, counts |
| `type/code` | SF Mono (fallback Menlo) | 12 regular | paths, routes, code, diffs |

Code content is always `type/code` — identifiers, HTTP paths, module names, signatures. Line-height 1.35 for code blocks.

## 4. Spacing & geometry

- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32** (no other values).
- Corner radii: cards & panes **8**, controls **6**, chips/badges **999** (pill), code blocks **6**.
- Borders: 1px `separator` color; shadows only on floating layers (popover, inspector) — **no shadows on docked panes**.
- Density: table row height 28 (default) / 24 (compact, user-toggleable); tree indent 16.

## 5. Layout

- Three-pane shell: **sidebar (fixed 220, resizable 180–320) · workspace · inspector (optional, 300, resizable)**.
- Toolbar per pane: 52 pt, borderless buttons, search field right-aligned.
- Inspector appears only with a selection that has detail; Escape closes it; state remembered per session.
- Split view uses native `NavigationSplitView` patterns; remember pane widths.

## 6. Components (core set)

- `RouteRow` — verb chip (color-tinted monospace), path (code), handler + summary (secondary), confidence dot when conflicted.
- `ModuleRow` — package icon, name, counts (files · nested · ⚠ issues), disclosure chevron.
- `HealthBadge` — pill: `⚠ 3 issues` (warning tint) / `OK` (ok tint).
- `DiagnosticRow` — severity icon, title, location, actions on hover.
- `DiffPane` — unified diff, `type/code`, gutter line numbers, added/removed tints at 12% background + 100% gutter mark.
- `EmptyState` — icon, one-line title, one-line hint, primary action. Written per screen, never generic.
- `LoadingState` — skeleton rows matching final layout (no spinners for known-structure lists).
- `ErrorState` — what failed, why, one recovery action.

## 7. Motion

- Disclosure/selection: 120 ms opacity + 4 pt vertical shift.
- Pane transitions: 200 ms `easeOut`.
- Graph: 250 ms layout settle; **no** node idle animation.
- `prefers-reduced-motion` honored everywhere.

## 8. Iconography

- SF Symbols only; custom glyphs (lion brand, framework marks) as a single 16 pt template set.
- Verb symbols reuse the extension's semantic mapping (GET ↓, POST +, PUT ✎, PATCH ±, DELETE 🗑 analogs in SF Symbols).
- Every icon has an accessibility label; decorative icons are `hiddenFromAccessibility`.

## 9. Accessibility

- Full keyboard traversal: sidebar → workspace → inspector cycle (`Tab`), arrow-key tree navigation, `⌘K` command center everywhere, `Esc` dismisses inspector/dialogs.
- VoiceOver labels for rows (verb + path + controller, not just "row 5").
- Contrast: all text ≥ 4.5:1 against its background in both themes; confidence dots always paired with text labels.
- Reduce transparency: material backgrounds degrade to solid tokens.

## 10. Do-not list (review gate)

No generic dashboard cards, no glass on docked panes, no decorative charts, no random accent colors, no more than one primary button per view, no spinner where a skeleton works, no empty states without an action, no orange outside identity/semantics.
