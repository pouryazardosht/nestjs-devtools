# Changelog

All notable changes to **NestJS DevTools** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-06-30

### Added

- **Custom file types** via the `nestjs-devtools.customTypes` setting. Define
  your own `.handler.ts`, `.validator.ts`, `.policy.ts` (or anything else) with
  a `suffix`, `typeLabel`, `shortcut`, and `category` — they merge with the
  built-in types at runtime, so you no longer need to fork the extension to
  support non-standard NestJS file conventions. Entries that duplicate a
  built-in suffix or are missing required fields are silently ignored.
- **Auto-insert logger declaration.** When a log command is triggered inside a
  class that has no `private readonly logger` property, the extension prompts
  `No logger found in <Class>. Add it automatically?`. Accepting it:
  1. Injects `Logger` into the existing `@nestjs/common` import — or creates
     the import if `@nestjs/common` isn't imported at all.
  2. Inserts `private readonly logger = new Logger(<Class>.name);` directly
     after the class's opening brace, using a 2-space indent.
  3. Then inserts the requested log statement on the line after the current
     statement ends.
- **Project-wide file search** across every module at once
  (`Cmd+L Cmd+A` / `Ctrl+L Ctrl+A`). Files are deduplicated by absolute path
  (so overlapping module folders don't produce duplicates) and grouped under
  per-module separators sorted alphabetically by module name.
- **Status bar quick access** item on the left side of the status bar showing
  `$(extensions) Modules`. One click opens the module browser — no keybinding
  or Command Palette needed.
- **CodeLens above `@Module(...)`** in every `.module.ts` file, rendering as
  `$(package) N nested modules, $(file) M files` (omitting the nested-modules
  segment when zero). Clicking it triggers the module file browser for that
  module. Counts are cached per module directory and invalidated through a
  workspace-wide `*.ts` file-system watcher, so adding or deleting a file
  refreshes the lens without re-saving the `.module.ts` file.
- **Nested module navigation** in the module browser. Nested `*.module.ts`
  files are detected, deduplicated by directory hierarchy (so a deeply nested
  module isn't shown multiple times), and presented as their own selectable
  entries above the file list — each showing its file count and a
  `go-to-file` action button to open the `*.module.ts` file directly.
  Selecting one drills into that module's file list, and a **Back** entry
  (with the parent module's name) steps back up.
- **Breadcrumb title** at the top of the module browser showing the full
  navigation path (e.g. `blog  ›  comment`), so you always know where you are
  in a nested module tree.
- **Per-category file counts** in module browser separators — for example
  `DTOs (3)` — so you can see at a glance how each group is populated.

### Changed

- **ThemeIcons instead of emojis** across every QuickPick view. File types
  now render with VS Code ThemeIcons (`gear` for Service, `symbol-method` for
  Controller, `package` for Module, `shield` for Guard, `database` for
  Entity, `symbol-structure` for DTO, etc.), and nested modules use a purple
  `package` icon. They adapt cleanly to light, dark, and high-contrast
  themes and are no longer locked to the emoji set.
- **Forward brace-depth scan for log insertion.** The insertion point is now
  found by walking forward from the selection's start line, tracking `{`/`}`
  balance. The log is inserted on the first line after brace depth returns to
  zero (or after a `;`/`,` if no brace was opened). This correctly handles
  multi-line expressions, chained calls like
  `this.repo.findOne({ where: ..., select: ... })`, multi-line `if`
  conditions, and ternaries — instead of only inspecting the selected line.
- **Upward brace-depth scan for enclosing class detection.**
  `getEnclosingClassName` now tracks `{`/`}` balance while walking upward, so
  a `class` keyword inside a decorator, an interface, or a nested object no
  longer produces a false-positive class name in decorator-heavy files.
- **Shortcut typing debounced.** The QuickPick's `onDidChangeValue` shortcut
  matcher now waits 200 ms before resolving, preventing accidental early
  matches when shortcuts share a prefix (e.g. typing `d` for Decorator no
  longer pre-empts typing `dt` for DTO).
- **Effective NestJS types are read fresh on every call** to
  `findAllModuleFiles`, so changes to `nestjs-devtools.customTypes` apply
  immediately without reloading the extension.
- The module browser's "no files found" and "no modules found" empty states
  now use information messages with an 📁 prefix for consistency.

### Fixed

- A module's own `.module.ts` file now correctly appears in its own file list
  (previously it was filtered out because the module-search step treated it
  as a "nested" module).
- Files belonging to a nested module no longer leak into the parent module's
  flat file list — `exploreModule` now filters out any file whose directory
  is equal to, or nested under, a known nested-module directory.
- Duplicate file entries across overlapping module folders in
  `searchAllModules` are deduplicated by absolute path.
- CodeLens counts no longer go stale when files are added or deleted outside
  the `.module.ts` file — the file-system watcher now fires
  `codeLensProvider.refresh()` on `onDidCreate` and `onDidDelete` for any
  `*.ts` file.

## [0.1.1] - 2026-06-30

### Changed

- Rewrote the README with full feature documentation, keyboard shortcut
  tables, and a project structure overview.

## [0.1.0] - 2026-06-30

### Added

- Module file searcher with grouped categories and shortcut-letter jumping.
- Nested module navigation with a Back button.
- All-modules project-wide search command.
- Status bar item for one-click access to the module browser.
- CodeLens on `.module.ts` files showing file and nested module counts.

## [0.0.3] - 2026-06-29

### Added

- Initial release.
- Logger helper commands: `debug`, `log`, `warn`, `error`, `verbose`, each
  with a chord keybinding (`Cmd+L Cmd+D`, `Cmd+L Cmd+L`, etc.).
- Smart log insertion with automatic enclosing class name detection.
- Module file searcher with category grouping and shortcut hints.
