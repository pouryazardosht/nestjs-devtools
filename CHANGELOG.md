# Changelog

All notable changes to **NestJS DevTools** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-11-17

This release is a correctness pass plus the first feature batch: a full
audit of the parsers and edit builders found many code shapes that
produced broken code or silently missed results — all fixed here, with a
verification suite run against the compiled scanner code.

### Added

- **Diagnose · Route Conflicts.** Statically finds the route collisions
  NestJS itself only warns about at runtime (v12's router added duplicate
  warnings — this catches them before `F5`): exact duplicates (including
  `:id` vs `:userId` at the same position — they match the same
  requests), literal paths shadowed by param paths (`/users/me` vs
  `/users/:id`), and `@All` handlers overlapping specific verbs
  registered alongside them. Results carry a confidence (`certain`,
  `heuristic` with a "why this might be wrong" note, `info`), appear as
  Problems-panel warnings, and get a jumpable report grouped per conflict
  with both handler locations. Conflicting routes get a ⚠️ marker in the
  Routes tree and the view badge counts them. Shadowing is only claimed
  when the two paths differ in exactly one segment (literal vs param) —
  partially-overlapping pairs that can't actually swallow each other are
  not flagged. Once you've run the command, the Problems entries refresh
  automatically (debounced) as controller files change. Controlled by the
  new `nestjs-devtools.diagnostics.routeConflicts` setting (on by
  default).
- **`setGlobalPrefix` awareness.** `app.setGlobalPrefix('api')` in
  `main.ts`/`bootstrap.ts` is detected (commented-out calls don't count)
  and every route in the Routes tree, Search All and the Method Searcher
  now shows the path the app actually serves — `/api/v2/users/:id`, not
  `/users`. The prefix cache updates on save, create and delete of the
  entry file.
- **NestJS version awareness.** The hub title shows the project's
  `@nestjs/core` version (e.g. "🦁 NestJS DevTools · core v11.0.6"),
  detected from package.json — falling back to a bounded scan of the
  workspace's package.json files when the workspace root is a parent
  folder. The hook for all future version-aware hints.
- **Structured logging token.** `nestjs-devtools.logTemplate` accepts
  `{object}`: the selected value is appended as an object argument
  (`this.logger.log("msg", { userId })` — matching Nest 12's structured
  logging story) instead of a bare one.
- **Sidebar: route copy actions.** Right-click a route row → *Copy Route*
  (`GET /api/v2/users/:id`), *Copy Full URL* (base URL + detected
  `setGlobalPrefix` + `@Version` + path), or *Copy as cURL* (with a JSON
  content-type header and empty body for non-GET verbs). Right-click a
  controller row → *Copy All Routes*. The host comes from the new
  `nestjs-devtools.routes.baseUrl` setting (defaults to the NestJS dev
  default `http://localhost:3000`).
- **Sidebar: register orphans from the tree.** Unregistered provider files
  in the Modules tree carry a *Register in Module* right-click action —
  the same nearest-module edit the Provider Health quick fix performs
  (array + import), without opening the file first. Registered files show
  their status in the row tooltip.
- **Sidebar: module health badges.** Module rows show
  `⚠ N issues` when their own area contains unregistered providers or
  wrong-array registrations (a `@Controller` under `providers`, a service
  under `controllers`) — the sidebar is now the first place DI problems
  are visible.
- **Sidebar: pinned Conflicts group.** The Routes tree shows a
  `Conflicts (N)` section above the controllers when conflicts exist —
  each row labelled with its kind and confidence, click to jump to the
  handler.

### Fixed — edits that could corrupt your code

- **Injecting a provider into a multi-line constructor no longer produces
  invalid code.** The constructor parameter scan read the wrong line when
  the closing `)` sat on its own line, so a normal Prettier-formatted
  constructor was treated as empty and the new parameter was inserted
  without a comma.
- **Logging inside `constructor() {}` no longer breaks the file.** The
  insert position landed between the signature and the `{` instead of
  inside the braces; the log now goes inside, with the closing brace moved
  to its own line.
- **The register-provider quick fix no longer corrupts an empty
  `providers: []` / `controllers: []` array.** Inserting into `[]`
  produced `[, Name]` — a JavaScript elision hole (an `undefined` slot)
  that breaks NestJS DI at bootstrap. Empty arrays, single-line and
  multi-line, now get a clean first item.
- **Multi-line selections no longer break the log statement.** Selecting
  an expression spanning lines embedded a raw newline inside the
  double-quoted log message (a syntax error). The message now collapses
  whitespace; the value argument keeps the raw selection.
- **No duplicate `Logger` import / declaration.** Multi-line
  `@nestjs/common` imports are now understood (the import is extended in
  place, preserving formatting), `LoggerModule` is no longer mistaken for
  `Logger`, and the auto-declaration scan no longer stops at the first
  method's closing brace (it follows the class body to its real end,
  indented like the class).
- **`import type { X }`, `import D, { X }`, default and namespace imports
  are recognized** when deciding whether an import must be added — no more
  duplicate-import edits.
- **New imports land after the import block**, however long the license
  header above it is, and never above leading header comments.

### Fixed — parsing correctness

- **Regex literals no longer corrupt the code scanner.** The
  string/comment stripper (used by log insertion, provider injection and
  log removal) now also skips regex bodies — `s.replace(/}/g, "")` used
  to leave a stray `}` that derailed bracket-depth tracking for the whole
  file.
- **Enclosing-class detection survives braces in strings and comments** —
  the walk now runs over stripped text with a stack of open classes
  (three drifted copies of the old raw-brace walk unified into one), and
  also recognizes `@Injectable() export class Foo` and
  `export default class` on a single line.
- **The Provider Health index is harder to fool**: `providers: [...]`
  arrays are located inside the `@Module` decorator only (a dynamic-module
  `return { providers: [...] }` above the decorator hijacked the match),
  `]` inside strings no longer truncates registration lists, and files
  saved *during* the initial scan are re-read afterwards instead of
  keeping stale content. Concurrent commands share one in-flight scan
  instead of racing two.
- **Route parsing**: a `@Controller(...)` in a comment no longer hijacks
  the route prefix; `@Controller({ version: '1', path: 'users' })` keeps
  its prefix regardless of key order; a `)` inside a decorator string
  (`@Get(':id)')`) no longer truncates the decorator; routes on the same
  line as their decorator (`@Get('x') async foo() {}`) are captured;
  arrow-property handlers show their real name (`findAll`, not "async");
  `@Version('2')` contributes a `/v2` segment; JSDoc between a decorator
  and its handler no longer hides the route.
- **Method Searcher lists `_`-prefixed methods** (`private _doWork()` was
  silently dropped) and reads the file name correctly on Windows.

### Fixed — UX

- **Both tree filter boxes work on every use.** The filter input was
  disposed when hidden but still re-shown afterwards, so the second use of
  "Tree · Filter Module Files" / "Filter Routes" silently did nothing.
- **Newly created controllers appear in the Routes tree immediately** —
  previously they only showed up after a manual refresh or an unrelated
  save.
- **Injecting an already-injected provider is refused** with a message
  instead of appending a duplicate parameter, and instance names handle
  acronyms (`HTTPService` → `httpService`, not `hTTPService`).
- **CodeLens counts match the sidebar tree** — both now count the module's
  own files and its direct nested modules ("Current Module Files" shows
  the same own-file set, as the changelog always promised).
- **Same-named controllers** in different modules are disambiguated by
  directory in the Routes tree.
- **Nested-module breadcrumbs use the module file's name**, not the
  directory name, when the two differ.
- **A failed project detection retries** on the next call instead of
  poisoning the status-bar button for the session, and the status-bar item
  can no longer leak on failure.
- **One bad `nestjs-devtools.exclude` entry can't take features down** —
  every workspace scan runs through a crash-proof wrapper (warns once and
  returns partial results instead of throwing), and entries containing
  commas/braces are skipped with a one-time warning.
- **Files in UTF-16 encodings decode correctly** (previously mojibake) and
  lone-CR line endings are normalized.
- Visual settings (`tree.showCounts`, `routes.colorVerbs`,
  `swagger.showMissingDocs`, `customTypes`) now repaint the trees
  instantly, as documented — previously only `exclude` did.
- Custom file types are deduped among themselves, custom-type generation
  emits a minimal class scaffold instead of a comment-only file, plural
  suffixes are real (`strategies`, `repositories`, `entities`, `dtos`),
  `node_modules` file events no longer trigger tree refreshes, and "Open
  Route" on a deleted file shows a message instead of an unhandled error.

### Changed

- **`nestjs-devtools.exclude` bare folder names** (`dist`, `.nx`,
  `coverage`) now exclude that folder at every directory level, matching
  the documented monorepo behavior (they previously only matched the
  workspace root).

### Removed

- The orphaned `packages/` build artifacts (never imported by the
  extension) were deleted, and `packages/**` / `*.vsix` are now excluded
  from packaging.

## [0.3.2] - 2026-11-07

### Performance

- **Saving a file no longer rescans the workspace.** The Nest index used to
  be dropped on every save and rebuilt from scratch the next time a command
  needed it — with autosave on, that meant a full workspace scan before
  nearly every action. A save now reparses only the saved file, and deleted
  files leave the index immediately.
- **Faster scans on every platform.** All workspace-wide scans (provider
  index, module registrations, route collection, routes tree) now read
  files with bounded parallelism instead of strictly one-by-one — the
  biggest difference is on Windows with real-time antivirus, where each
  file round-trip is expensive. Scans also no longer open every file as a
  VS Code document, so large monorepos use noticeably less memory.
- **Search All runs two scans, not one per module.** The all-modules picker
  previously walked each module's subtree separately — a project with 30
  modules rescanned the same directories about 30 times. A single
  workspace scan now groups every file under its nearest enclosing module.
  As a small visible change, files in nested modules now always group
  under their closest module (previously the grouping depended on scan
  order).
- **Typing next to a Provider Health warning no longer triggers scans.**
  The register-provider quick fix caches its module list instead of
  re-running a workspace search on every code-action request — VS Code
  requests code actions on every cursor movement.
- **File bursts are handled once, not per file.** Creating or deleting
  many files at once (`nest g`, builds, git checkout) now triggers a
  single sidebar refresh 300 ms after the burst settles, instead of one
  full refresh per file. Deleting a controller re-parses only that
  controller's routes, not every controller in the workspace.
- **The Routes tree parses controllers in parallel** when first opened,
  instead of one controller at a time.

## [0.3.1] - 2026-11-06

### Added

- **Seven new settings.** `exclude` (globs ignored by every scan — monorepo
  must-have), `generate.spec` (`ask`/`always`/`never`),
  `routes.colorVerbs`, `swagger.showMissingDocs`, `logIncludeValue`,
  `tree.showCounts`, and `logger.declaration` (custom logger property
  template for Winston/Pino setups). All apply instantly — no reload.

## [0.3.0] - 2026-11-05

### Added

- **Status bar hub (🦁 NestJS).** The old "Modules" status-bar button is now
  a launcher: one click opens every feature in a single searchable picker,
  grouped by type (Navigate / Insert / Generate / Diagnose / Logs) with
  icons and platform-aware shortcut hints — no keybindings required.
  Hidden in non-NestJS workspaces.
- **Branded panel titles.** Every QuickPick and input now carries the 🦁
  lion — module browser, all searchers, generator, diagnostics — matching
  the activity-bar icon.
- **Register-provider quick fix.** The Provider Health warnings now offer a
  Code Action that registers the orphan class in the nearest module's
  `providers`/`controllers` array (same directory first, then ancestors) —
  handling single-line and multi-line arrays, both comma styles, and a
  missing array — and adds the import.
- **Routes tree shows `@ApiTags`.** Controller rows now display their
  Swagger tag next to the route count.
- **Log template setting** (`nestjs-devtools.logTemplate`). Customise the
  message format of inserted log statements with `{emoji}`, `{class}` and
  `{variable}` placeholders — remove `{emoji}` to disable emojis. Quotes
  and backslashes are escaped automatically.
- **Log · Remove in This File.** Scans the active file for `this.logger.*()`
  calls (multi-line calls included, via the same string-aware parser as log
  insertion), previews them, and removes all — or a hand-picked subset via
  a pre-selected checklist — in a single whole-line edit pass.
- **Tree view counts & badges.** Module rows show file (and nested-module)
  counts; controller rows show route counts (match counts while filtering,
  plus the Swagger tag). Both view headers carry a badge with the workspace
  totals (root modules / routes).
- **Generate file + matching spec.** After generating a class-based type
  (service, controller, guard, interceptor, pipe, filter, resolver,
  repository, middleware, strategy, gateway) the generator offers to create
  a `*.spec.ts` with a `Test.createTestingModule` scaffold and the correct
  `providers`/`controllers` binding.

### Changed

- **Minimum VS Code raised to 1.86** to support the view-header badges
  (`TreeView.badge`).
- **Uniform icon system.** Every icon across trees, pickers and the hub now
  inherits the theme foreground color via a single shared helper
  (`brandIcon`) — removing the one-off purple module icons. Routes-tree
  controller rows use an explicit `$(server)` icon instead of the file
  theme's generic icon.
- **Current-module-files picker shows a header** with the module being
  browsed (e.g. `🦁 auth · module files`).

### Fixed

- **Dev-host crash during `npm run watch`.** Webpack no longer emits a
  broken bundle when a compilation has errors (`optimization.emitOnErrors:
  false`) — the last good build is kept, so reloading the Extension
  Development Host mid-edit never loads a broken extension.
- **Routes tree icons.** Controller rows no longer inherit the file theme's
  generic/folder icon; empty-state rows get explicit icons too.

## [0.2.0] - 2026-11-05

### Added

- **Diagnose · Provider Health.** Scans every decorated class
  (`@Injectable`, `@Controller`, …) and flags those no module registers in
  `providers`/`controllers` as Problems-panel warnings, with a jumpable
  report. Includes **Navigate · Providing Module** — jump from a provider
  file to the module that registers it.
- **Insert · Injected Provider** (`Cmd+L Cmd+I`). Pick a provider from a
  workspace-wide list of decorated classes and the command appends
  `private readonly x: X` to the constructor (empty, single-line and
  multi-line forms, both trailing-comma styles) plus the import with a
  correct relative path.
- **Diagnose · API Docs Coverage.** Reports every route missing an
  `@ApiOperation` summary, grouped by controller with jump-to-handler and
  a coverage percentage.
- **Shared Nest index.** Decorated classes and module registrations are
  cached per session and invalidated lazily on save — no background scans.
- **Routes tree view.** A second tree view in the NestJS DevTools panel lists
  every route in the workspace, grouped by controller and sorted by HTTP verb
  then path, with color-coded verb icons. Clicking a route opens the
  controller at the handler's line. Routes are cached per controller file;
  saving a controller re-parses only that file (debounced 300 ms).

- **Find · Provider Usages** (`Cmd+L Cmd+U` / `Ctrl+L Ctrl+U`). Lists every
  reference to the active file's exported class, grouped by file, with DI
  injection sites annotated (`injected via constructor`). Resolves through
  the TypeScript language service — no workspace scanning.

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
