# Changelog

All notable changes to **NestJS DevTools** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-07-05

### Added

- **Sidebar TreeView.** A new NestJS DevTools panel in the activity bar shows
  the full module graph as an expandable tree — top-level modules at the root,
  nested modules as collapsible children, and each module's own files grouped
  by category underneath. Clicking a file opens it directly. The tree title bar
  has two inline buttons: `$(refresh)` to manually refresh and `$(new-file)` to
  generate a file. The tree refreshes automatically when any `.ts` file is
  created or deleted in the workspace.

- **Generate NestJS File command** (`Cmd+L Cmd+N` / `Ctrl+L Ctrl+N`). Scaffolds
  a new NestJS file from a built-in template in two steps:
  1. Pick the file type (Service, Controller, Module, Guard, Gateway,
     Interceptor, Pipe, Filter, Resolver, Decorator, Entity, DTO, Enum,
     Interface, Repository, Middleware, Strategy).
  2. Enter a name — the file is created as `kebab-case.type.ts` in the
     correct directory with a fully typed class body, proper NestJS imports,
     and PascalCase class name derived from your input.
     Custom types configured via `nestjs-devtools.customTypes` appear in the type
     picker alongside built-in types. The command is also available via
     right-click on any module node in the Sidebar TreeView, and in the editor
     context menu. If the target file already exists you are prompted before
     overwriting.

- **Method Searcher** (`Cmd+L Cmd+J` / `Ctrl+L Ctrl+J`). Opens a compact
  QuickPick listing every method in the active TypeScript/JavaScript file,
  grouped into three sections:
  - **Routes** — methods decorated with `@Get`, `@Post`, `@Put`, `@Patch`,
    `@Delete`, `@Options`, `@Head`, `@All`, or `@Sse`. Each row shows the HTTP
    method icon, the **full route URL** (controller prefix + method path, e.g.
    `/blog/:id`), and the method name. Guards and interceptors appear in the
    description column.
  - **Decorated** — methods with non-HTTP decorators.
  - **Methods** — plain undecorated methods, getters, setters, constructors,
    and arrow function properties.

  Features:
  - Multi-line method signatures are handled correctly (the parser joins up to
    6 lines, so params that span lines are never missed).
  - The method the cursor is currently inside is pre-selected when the picker
    opens.
  - Arrowing through the list **live-previews** each method by scrolling the
    editor to that line without closing the picker.
  - Async methods are marked with `~`, private/protected with `$(lock)`.
  - The title bar shows total method count and route count separately
    (e.g. `blog.controller.ts  ·  10 methods  ·  9 routes`).
  - Also available in the editor context menu and Command Palette.

### Changed

- **Icon consistency.** The top-level module picker and all nested module
  entries now use `vscode.ThemeIcon` throughout — no raw emoji remaining in
  any QuickPick view. CodeLens titles use codicon syntax (`$(package)`,
  `$(file)`) instead of emoji for consistent rendering across themes.
- **`emoji` field removed from `NestType` interface.** Icons are now derived
  entirely from `TYPE_ICON_MAP` in `quickPickHelpers.ts`. Custom types
  configured via `nestjs-devtools.customTypes` no longer need or accept an
  `emoji` field.

## [0.1.2] - 2026-06-30

### Added

- Custom file types via the `nestjs-devtools.customTypes` setting.
- Auto-insert logger declaration when `private readonly logger` is missing.
- Project-wide file search across every module (`Cmd+L Cmd+A`).
- Status bar quick access item.
- CodeLens above `@Module(...)` with cached file and nested module counts.
- Nested module navigation with drill-in, Back button, and breadcrumb title.
- Per-category file counts in module browser separators.

### Changed

- ThemeIcons instead of emojis across every QuickPick view.
- Forward brace-depth scan for correct log insertion point.
- Upward brace-depth scan for enclosing class detection.
- Shortcut typing debounced to 200 ms.
- Effective NestJS types read fresh on every `findAllModuleFiles` call.

### Fixed

- Module's own `.module.ts` file now appears in its own file list.
- Nested module files no longer leak into the parent module's file list.
- Duplicate file entries in `searchAllModules` deduplicated by absolute path.
- CodeLens counts refresh on file create/delete via file-system watcher.

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
- Logger helper commands: `debug`, `log`, `warn`, `error`, `verbose`.
- Smart log insertion with automatic enclosing class name detection.
- Module file searcher with category grouping and shortcut hints.
