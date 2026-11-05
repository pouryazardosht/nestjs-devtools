# 🛠️ NestJS DevTools

Supercharge your NestJS workflow inside VS Code.
Quickly insert **smart logger statements**, **navigate every file and route in
your project**, **find provider usages**, **generate boilerplate**, and
**browse methods with Swagger docs** — all without leaving the editor.

Built for fast navigation in large NestJS codebases — never touch the file tree again.

---

## ✨ Features

### 🐛 Logger Helper

Insert `this.logger.debug()`, `.log()`, `.warn()`, `.error()`, or `.verbose()`
statements with a single chord. The log message **automatically includes the
enclosing class name**, so you always know where it came from.

It's also **smart about where the log goes**. If you select a variable on a line
that's part of a multi-line statement (a chained `findOne({...})` call, a
multi-line `if`, a ternary, …), the logger is inserted **after the statement
actually ends** — never in the middle of it.

**Example** — inside `UserService.findOne()`:

```typescript
const user = await this.userRepository.findOne({
  where: { email },
  select: { id: true, email: true },
});
// select "user", press Cmd+L Cmd+D
this.logger.debug("🔍 UserService ~ user", user);
```

#### Auto-declare the logger

If the enclosing class doesn't already have a `private readonly logger`
property, the extension asks:

> No logger found in `UserService`. Add it automatically?

Saying **Yes** will:

1. Add `Logger` to the existing `@nestjs/common` import — or create the
   import if `@nestjs/common` isn't imported.
2. Insert `private readonly logger = new Logger(UserService.name);` right
   after the class's opening brace.
3. Then insert the requested log statement after the current statement ends.

#### Logger methods

| Method    | Emoji | macOS         | Windows/Linux   |
| --------- | ----- | ------------- | --------------- |
| `debug`   | 🔍    | `Cmd+L Cmd+D` | `Ctrl+L Ctrl+D` |
| `log`     | 📝    | `Cmd+L Cmd+L` | `Ctrl+L Ctrl+L` |
| `warn`    | ⚠️    | `Cmd+L Cmd+W` | `Ctrl+L Ctrl+W` |
| `error`   | ❌    | `Cmd+L Cmd+E` | `Ctrl+L Ctrl+E` |
| `verbose` | 🔊    | `Cmd+L Cmd+V` | `Ctrl+L Ctrl+V` |

#### Message template

Customise the message format with the `nestjs-devtools.logTemplate`
setting. Placeholders:

| Placeholder  | Replaced with                       |
| ------------ | ----------------------------------- |
| `{emoji}`    | The method's emoji (🔍 📝 ⚠️ ❌ 🔊) |
| `{class}`    | Enclosing class name                |
| `{variable}` | The selected text                   |

Default: `"{emoji} {class} ~ {variable}"` → `🔍 UserService ~ user`.
Remove `{emoji}` to disable emojis entirely:

```jsonc
{
  // No emojis, arrow separator instead
  "nestjs-devtools.logTemplate": "{class} -> {variable}",
}
```

#### Removing logs

**Log · Remove in This File** (Command Palette or editor context menu)
scans the active file for `this.logger.*()` calls — including multi-line
calls — and lets you remove them:

- **Remove all** in one edit pass, or
- **Choose which ones** — a checklist pre-selects every statement;
  uncheck the ones to keep, filter by line content, and remove the rest.

The file is only touched after you confirm, and removal always deletes
whole lines, so no blank gaps are left behind.

---

### 🗂️ Sidebar TreeViews

A dedicated **NestJS DevTools panel** in the activity bar (with its own lion
logo) hosts two always-visible tree views:

#### Modules

Your full module graph as an expandable tree — no command needed:

- Top-level modules appear at the root, sorted alphabetically.
- Nested modules appear as collapsible children above a module's own files.
- Each module's files are grouped by category (Core NestJS, Entities, DTOs, …)
  with ThemeIcons matching their type.
- Each module row shows its **file count** (plus nested-module count) in the
  description column, and the view header carries a badge with the total
  number of root modules.
- Clicking any file opens it immediately.
- The title bar has **Refresh**, **Search** (live filter), and
  **Generate File** buttons, plus the native **Collapse All** toggle.
- The tree refreshes automatically when `.ts` files are created or deleted.

#### Routes

Every HTTP route in the workspace, always visible:

- Routes grouped by controller (alphabetical), sorted by HTTP verb then path,
  with **color-coded verb icons** (GET blue, POST green, PUT orange,
  PATCH yellow, DELETE red).
- Each controller row shows its **route count** (and its `@ApiTags` tag,
  if present) in the description column — match count while a filter is
  active — and the view header carries a badge with the total number of
  routes in the workspace.
- Clicking a route opens the controller at the handler's line.
- Routes missing an `@ApiOperation` summary are flagged **no docs**.
- Saving a controller re-parses **only that file** (debounced) — cheap to
  keep open all day.
- Title bar: **Refresh** and **Search** (live filter) buttons, plus
  **Collapse All**.

#### Live filtering

Both views have a **`$(search)` filter button**. The filter box filters as
you type — purely in-memory, no re-parsing:

- **Modules view** matches file names and nested module names.
- **Routes view** matches route path, method name, HTTP verb, or
  `@ApiOperation` summary; controllers without matches are hidden.
- The active filter is shown as a message under the view title. Clear the
  text and press Enter to reset.

---

### 🧭 Route & Method Searchers

#### 🔍 Method Searcher

Press **`Cmd+L Cmd+J`** / **`Ctrl+L Ctrl+J`** to open a compact QuickPick
listing every method in the active file, grouped into three sections:

- **Routes** — HTTP handler methods (`@Get`, `@Post`, `@Put`, `@Patch`,
  `@Delete`, …). Each row shows the **full route URL** (controller prefix +
  method path, e.g. `/blog/:id`) with a color-coded verb icon, a **hover copy
  button** that copies e.g. `GET /users/:id` without closing the picker, and
  a detail line with the `@ApiOperation` summary (or a `no @ApiOperation`
  flag), guards, and return type.
- **Decorated** — methods with non-HTTP decorators.
- **Methods** — plain methods, getters, setters, constructors, and arrow
  function properties.

Other features:

- The method your cursor is inside is **pre-selected** when the picker opens.
- Arrowing through the list **live-previews** each method by scrolling the
  editor to that line without closing the picker.
- Async methods are marked with `~`, private/protected with a lock icon.
- The title bar shows method count, route count, and **docs coverage**:
  `blog.controller.ts · 10 methods · 9 routes · 7/9 documented`.
- `@Controller` prefixes handle all forms — `@Controller('users')`,
  `@Controller('users', Guard)`, `@Controller({ path: 'users' })` — and
  multi-line decorators are parsed correctly.

#### 🌐 Search All Modules & Routes

Press **`Cmd+L Cmd+A`** / **`Ctrl+L Ctrl+A`** to search everything at once:

- **Routes grouped by controller** (alphabetical separators), sorted by verb
  then path — find any endpoint by path fragment, verb, method name, or
  controller.
- Every route row has a copy button for the `VERB /path` pair.
- Below the routes, **every file across every module** with type icons.
- Route details show the Swagger summary or the `no @ApiOperation` flag.

---

### 🔎 Find Provider Usages

Stand inside a provider (e.g. `users.service.ts`) and press
**`Cmd+L Cmd+U`** / **`Ctrl+L Ctrl+U`** to list every reference to its class:

- Results **grouped by file**, each row showing the trimmed code line and
  `L<line>`.
- **DI injection sites are annotated** — constructor params like
  `private readonly usersService: UsersService` get a `$(link)` icon and an
  `injected via constructor` detail.
- Accepting an entry jumps straight to the reference.
- Resolved through the TypeScript language service (symbols + references) —
  **zero workspace scanning**, so it's fast and stays correct with the TS
  server.

---

### 🩺 Diagnostics

Two one-shot health checks that report into the Problems panel and pickers:

#### Provider Health

**Diagnose · Provider Health** scans every decorated class
(`@Injectable`, `@Controller`, `@Guard`, …) in the workspace and flags the
ones **no module registers** in `providers`/`controllers` — the classes that
would fail at runtime with *"Nest can't resolve dependencies…"*. Findings:

- appear as **warnings in the Problems panel** (squiggle on the class), and
- in a jumpable report grouped by file.

Classes registered only via spread expressions (`...sharedProviders`) can't
be resolved textually and may need a manual check.

Each warning also ships a **quick fix** (lightbulb / `Cmd+.`): *Add
UsersService to users.module.ts (providers)* — the module is chosen by folder
proximity (same directory first, then ancestors), the class is inserted into
the `providers`/`controllers` array (single-line, multi-line, and both
comma styles handled, creating the array if missing), and the import is
added automatically. For `@Controller` classes the fix targets the
`controllers` array.

#### API Docs Coverage

**Diagnose · API Docs Coverage** lists every route missing an
`@ApiOperation` summary, grouped by controller, with a jump-to-handler per
row and a coverage percentage in the header (e.g. `14 of 20 routes missing
@ApiOperation (30% documented)`).

### 🧩 Insert · Injected Provider

Press **`Cmd+L Cmd+I`** / **`Ctrl+L Ctrl+I`** inside a class to inject a
provider without typing boilerplate:

1. Pick a provider from a searchable list of every decorated class in the
   workspace (with file-type icons and locations).
2. The command appends `private readonly usersService: UsersService` to the
   constructor — handling empty constructors, single-line and multi-line
   parameter lists, and both trailing-comma styles — and adds the `import`
   with a correct relative path if it's not already present.

---

### 📋 Swagger/OpenAPI awareness

Wherever routes appear, their documentation status does too:

- `@ApiOperation({ summary: … })` summaries are parsed (single-line **or**
  wrapped across lines, before or after the HTTP decorator) and displayed in
  the Method Searcher, Search All, and the Routes tree.
- Routes missing a summary are flagged, and the Method Searcher title shows
  coverage like `8 routes · 6/8 documented` — a quick way to spot undocumented
  endpoints.

---

### 🧭 Module File Searcher

Navigate between files inside a NestJS module without touching the file tree.

#### 🔎 Search from the current file

1. From any file inside a module, press **`Cmd+L Cmd+K`** / **`Ctrl+L Ctrl+K`**.
2. A picker lists every `.ts` file in that module, grouped by category with
   live counts (e.g. `DTOs (3)`).
3. Type the **shortcut letter** for the file type you want (e.g. `c` for
   Controller, `dt` for DTO) to jump straight to it — no `Enter` needed.

#### 📦 Browse all modules

1. Press **`Cmd+L Cmd+M`** / **`Ctrl+L Ctrl+M`** — or click **`Modules`** in
   the status bar.
2. Select a module to drill into its file list.

#### 🧩 Nested module navigation

- Nested modules appear as selectable entries above the file list, each
  showing its file count and a button to open its `.module.ts` directly.
- Selecting one drills into that module's own file list.
- A **Back** entry steps back up to the parent module.
- A **breadcrumb title** shows your current path (e.g. `blog  ›  comment`).

#### ⚡ Quick access

- **Status bar hub** — the `🦁 NestJS` button opens **every feature**
  in one searchable picker, grouped by type (Navigate / Insert / Generate /
  Diagnose / Logs) with icons and shortcut hints — no keybindings required.
  Hidden in non-NestJS workspaces.
- **CodeLens** above `@Module(...)` shows live file and nested module counts.
  Clicking it opens the file browser for that module. Counts are cached and
  refresh automatically when files are added or deleted.

---

### ⚙️ Generate NestJS File

Press **`Cmd+L Cmd+N`** / **`Ctrl+L Ctrl+N`** (or right-click a module in the
Sidebar TreeView) to scaffold a new NestJS file in two steps:

1. **Pick a file type** — Service, Controller, Module, Guard, Gateway,
   Interceptor, Pipe, Filter, Resolver, Decorator, Entity, DTO, Enum,
   Interface, Repository, Middleware, or Strategy. Custom types from
   `nestjs-devtools.customTypes` appear here too.
2. **Enter a name** — the file is created as `kebab-case.type.ts` with a
   fully typed class body, correct NestJS imports, and a PascalCase class
   name derived from your input.

If the file already exists you are prompted before overwriting.

For class-based types (service, controller, guard, interceptor, pipe,
filter, resolver, repository, middleware, strategy, gateway) the generator
then offers to create a **matching spec** — `users.service.spec.ts` with a
`Test.createTestingModule` scaffold, a `should be defined` test, and the
correct `providers`/`controllers` binding for the type.

---

## 🗂️ Recognized file types

| Category        | Type        | Suffix            | Shortcut | Icon               |
| --------------- | ----------- | ----------------- | -------- | ------------------ |
| **Core NestJS** | Service     | `.service.ts`     | `s`      | `gear`             |
|                 | Controller  | `.controller.ts`  | `c`      | `symbol-method`    |
|                 | Module      | `.module.ts`      | `m`      | `package`          |
|                 | Guard       | `.guard.ts`       | `g`      | `shield`           |
|                 | Gateway     | `.gateway.ts`     | `gw`     | `radio-tower`      |
|                 | Interceptor | `.interceptor.ts` | `i`      | `filter`           |
|                 | Pipe        | `.pipe.ts`        | `p`      | `symbol-ruler`     |
|                 | Filter      | `.filter.ts`      | `f`      | `filter`           |
|                 | Resolver    | `.resolver.ts`    | `r`      | `type-hierarchy`   |
|                 | Decorator   | `.decorator.ts`   | `d`      | `symbol-color`     |
| **Entities**    | Entity      | `.entity.ts`      | `e`      | `database`         |
| **DTOs**        | DTO         | `.dto.ts`         | `dt`     | `symbol-structure` |
| **Enums**       | Enum        | `.enum.ts`        | `en`     | `symbol-enum`      |
| **Interfaces**  | Interface   | `.interface.ts`   | `if`     | `symbol-interface` |
| **Other**       | Repository  | `.repository.ts`  | `rp`     | `archive`          |
|                 | Middleware  | `.middleware.ts`  | `mw`     | `layers`           |
|                 | Strategy    | `.strategy.ts`    | `st`     | `compass`          |
|                 | Test        | `.spec.ts`        | `t`      | `beaker`           |
| **Other Files** | (anything)  | (any `.ts`)       | —        | `file`             |

Plural suffixes are also recognized (`.guards.ts`, `.pipes.ts`, …).

Beyond registered types, **every `.something.ts` suffix gets an icon** derived
from its filename — 38 suffixes are mapped, including `main` / `bootstrap` →
rocket, `subscriber` → broadcast, `processor` → tools, `consumer` →
cloud-download, `cron` / `scheduler` → watch, `adapter` → combine, `provider`
→ plug, `config` → settings-gear, `schema` → symbol-field, `e2e` → browser,
and more. Unknown suffixes fall back to the generic file icon.

---

## ⚙️ Extension Settings

### `nestjs-devtools.logTemplate`

Message template for inserted log statements. **Type:** `string`
(default: `"{emoji} {class} ~ {variable}"`).

Placeholders: `{emoji}`, `{class}`, `{variable}`. Unknown placeholders are
left untouched; consecutive spaces collapse; quotes and backslashes in the
output are escaped automatically.

### `nestjs-devtools.customTypes`

Add custom NestJS file types to the module browser and file generator. Custom
types merge with built-in types at runtime — no extension reload needed.

**Type:** `array` (default: `[]`)

Each item requires:

| Field       | Type     | Description                                          |
| ----------- | -------- | ---------------------------------------------------- |
| `suffix`    | `string` | File suffix without extension (e.g. `"handler"`)     |
| `typeLabel` | `string` | Display label in the picker (e.g. `"Handler"`)       |
| `shortcut`  | `string` | Shortcut letter(s) to jump to this type (e.g. `"h"`) |
| `category`  | `string` | Category group separator (e.g. `"Other"`)            |

**Example:**

```jsonc
{
  "nestjs-devtools.customTypes": [
    {
      "suffix": "handler",
      "typeLabel": "Handler",
      "shortcut": "h",
      "category": "Other",
    },
    {
      "suffix": "validator",
      "typeLabel": "Validator",
      "shortcut": "v",
      "category": "Other",
    },
  ],
}
```

---

## ⌨️ Keyboard Shortcuts

All shortcuts can be customised via **Preferences: Open Keyboard Shortcuts**
(search for `nestjs-log-helper`). Prefer no shortcuts at all? The status-bar
`🦁 NestJS` button opens every command, grouped and searchable. Every
picker in the extension carries the 🦁 brand in its title.

| Command                                | macOS         | Windows/Linux   |
| -------------------------------------- | ------------- | --------------- |
| Insert Debug Log                       | `Cmd+L Cmd+D` | `Ctrl+L Ctrl+D` |
| Insert Log                             | `Cmd+L Cmd+L` | `Ctrl+L Ctrl+L` |
| Insert Warning Log                     | `Cmd+L Cmd+W` | `Ctrl+L Ctrl+W` |
| Insert Error Log                       | `Cmd+L Cmd+E` | `Ctrl+L Ctrl+E` |
| Insert Verbose Log                     | `Cmd+L Cmd+V` | `Ctrl+L Ctrl+V` |
| Navigate · Current Module Files        | `Cmd+L Cmd+K` | `Ctrl+L Ctrl+K` |
| Navigate · Browse Modules              | `Cmd+L Cmd+M` | `Ctrl+L Ctrl+M` |
| Navigate · Search All Modules & Routes | `Cmd+L Cmd+A` | `Ctrl+L Ctrl+A` |
| Navigate · Methods in File             | `Cmd+L Cmd+J` | `Ctrl+L Ctrl+J` |
| Generate NestJS File                   | `Cmd+L Cmd+N` | `Ctrl+L Ctrl+N` |
| Find · Provider Usages                 | `Cmd+L Cmd+U` | `Ctrl+L Ctrl+U` |
| Insert · Injected Provider             | `Cmd+L Cmd+I` | `Ctrl+L Ctrl+I` |

---

## 📦 Installation

### From the VS Code Marketplace

1. Open VS Code.
2. Go to the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`).
3. Search for **NestJS DevTools**.
4. Click **Install**.

### From a `.vsix` file

1. Build with `vsce package`.
2. In VS Code, open the Extensions view, click `…`, and choose
   **Install from VSIX…**.

---

## 🛠️ Development

```bash
git clone https://github.com/pouryazardosht/nestjs-devtools.git
cd nestjs-devtools
npm install
```

Open the folder in VS Code and press **F5** to launch the Extension
Development Host.

### Project structure

```
src/
├── extension.ts # Entry point: commands, status bar, CodeLens, trees, watcher
├── constants.ts # LOGGER_METHODS, NEST_TYPES, getEffectiveNestTypes()
├── statusBar.ts # Status bar item factory
├── commands/
│ ├── insertLogger.ts # Logger insertion + auto-declaration
│ ├── removeLogs.ts # Log cleanup with preview
│ ├── moduleSearcher.ts # Browse all modules + nested navigation
│ ├── searchModuleFiles.ts # Search files in current module
│ ├── searchAllModules.ts # Project-wide routes + files search
│ ├── generateNestFile.ts # File scaffold generator (+ spec option)
│ ├── methodSearcher.ts # Method/route browser for active file
│ ├── findProviderUsages.ts # DI-aware find usages via TS language service
│ ├── injectProvider.ts # Constructor injection helper
│ ├── providerHealth.ts # Orphan detector + go-to-providing-module
│ ├── apiDocsCoverage.ts # Routes missing @ApiOperation
│ └── registerProviderFix.ts # Quick fix: register orphan providers
├── providers/
│ ├── moduleCodeLensProvider.ts # CodeLens above @Module() with caching
│ ├── moduleTreeProvider.ts # Sidebar Modules tree (cached roots + filter)
│ └── routesTreeProvider.ts # Sidebar Routes tree (per-file cache + filter)
└── utils/
├── getEnclosingClassName.ts # Brace-depth class name detection
├── classBody.ts # Class/constructor scanning for injection
├── loggerDeclaration.ts # Logger import and property auto-insert
├── insertionPoint.ts # Statement-aware log insertion scanning
├── nestIndex.ts # Workspace index: classes + module registrations
├── nestProject.ts # NestJS workspace detection
├── quickPickHelpers.ts # ThemeIcons, grouping, breadcrumb, shortcuts
├── routeUtils.ts # Shared route parsing, @Controller prefix, Swagger
└── targetEditor.ts # Focus-aware editor resolution
```

### Build scripts

| Script            | Purpose                      |
| ----------------- | ---------------------------- |
| `npm run compile` | Webpack build (development)  |
| `npm run watch`   | Webpack watch mode           |
| `npm run package` | Production build for `.vsix` |
| `npm run lint`    | ESLint on `src/`             |

---

## 🤝 Contributing

Contributions are welcome!
Please open an issue to discuss your idea before submitting a pull request.

---

## 📄 License

MIT – see the [LICENSE](LICENSE.md) file for details.

---

**Happy debugging! 🚀🐛**
