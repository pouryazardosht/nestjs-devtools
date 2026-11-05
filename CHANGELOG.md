# Changelog

All notable changes to **NestJS DevTools** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-05

### Added

- **Routes tree view.** A second tree view in the NestJS DevTools panel lists
  every route in the workspace, grouped by controller and sorted by HTTP verb
  then path, with color-coded verb icons. Clicking a route opens the
  controller at the handler's line. Routes are cached per controller file;
  saving a controller re-parses only that file (debounced 300 ms).

- **Find · Provider Usages** (`Cmd+L Cmd+U` / `Ctrl+L Ctrl+U`). Lists every
  reference to the active file's exported class, grouped by file, with DI
  injection sites annotated (`injected via constructor`). Resolves through
  the TypeScript language service — no workspace scanning.

- **View · Module Dependency Graph** (`Cmd+L Cmd+G` / `Ctrl+L Ctrl+G`). Parses
  `imports: [...]` from every `*.module.ts` and renders an interactive SVG
  dependency graph in a webview: levels computed from root modules, external
  modules (e.g. `TypeOrmModule`) shown dashed, hover highlights connected
  edges, click a node to open its module file. Self-contained renderer — no
  bundled dependencies. The graph is cached and rebuilt lazily when a module
  file is saved.

- **Swagger/OpenAPI awareness.** `@ApiOperation` summaries are parsed (single
  or multi-line, before or after the HTTP decorator) and shown in the Method
  Searcher details, Search All route details, and the Routes tree. Routes
  without a summary are flagged `no @ApiOperation`. The Method Searcher title
  shows docs coverage (e.g. `8 routes · 6/8 documented`).

- **Tree view search & collapse-all.** Both sidebar views get a `$(search)`
  title-bar button that opens a live filter box (filters as you type, purely
  in-memory) and the native collapse-all button. The Modules view filters
  files and nested module names; the Routes view filters by path, method
  name, verb, or summary and hides controllers without matches.

- **Icons for every file type.** The icon map grew from 18 to 38 suffixes —
  app entry (`main`, `bootstrap`), queue/event handlers (`subscriber`,
  `processor`, `consumer`, `job`, `queue`), scheduling (`cron`, `scheduler`,
  `task`), and patterns/utilities (`serializer`, `adapter`, `provider`,
  `factory`, `helper`, `util`, `constant`, `config`, `validation`, `schema`,
  `model`, `loader`, `e2e`). Files are now iconified by their actual filename
  suffix even when the suffix isn't a registered NestJS type (e.g. helpers).

- **Custom type icons.** `nestjs-devtools.customTypes` entries accept an
  optional `icon` (VS Code codicon id) used everywhere the type appears.

- **Custom activity bar icon.** The NestJS DevTools container now uses a
  traced monochrome SVG of the extension logo (`media/view-icon.svg`), tinted
  by the active theme via `currentColor`.

### Changed

- **Route parsing.** `@Controller` prefixes now handle extra decorator args
  (`@Controller('users', Guard)`), the options-object form
  (`@Controller({ path: 'users' })`), and trailing slashes. Previously the
  prefix silently dropped, breaking route search for those controllers.
- **Route & method listing UX.** HTTP verbs are real color-coded ThemeIcons
  via `iconPath` (no longer `$()` text in labels, which polluted fuzzy
  matching). Route rows are two-line items with guards/return type in the
  detail row, show `method()` with parens, and have a copy-route button that
  copies e.g. `GET /users/:id` without closing the picker.
- **Search All routes are grouped by controller** with per-controller
  separators, sorted by verb then path, and file items use type icons.
- **Shared route parser.** `RouteInfo`/`extractRoutes`/`getControllerPrefix`
  now live in `utils/routeUtils.ts` and serve Search All, the Routes tree,
  and Swagger summary extraction — removing the previously duplicated logic.

### Fixed

- Multi-line decorators no longer lose their contents: the parser cursor now
  skips consumed continuation lines, so a wrapped `@ApiOperation({
  summary: ... })` is parsed instead of being silently cleared (which also
  fixes multi-line `@Get(...)` route paths and decorators in the Method
  Searcher).

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
