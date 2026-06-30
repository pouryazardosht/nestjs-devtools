# 🛠️ NestJS DevTools

Supercharge your NestJS workflow inside VS Code.
Quickly insert **smart logger statements** and **navigate every file in your NestJS project** at lightning speed.

Built for fast navigation in large NestJS codebases — never touch the file tree again.

---

## ✨ Features

### 🐛 Logger Helper

Insert `this.logger.debug()`, `.log()`, `.warn()`, `.error()`, or `.verbose()` statements with a single chord.
The log message **automatically includes the enclosing class name**, so you always know where it came from.

It's also **smart about where the log goes**. If you select a variable on a line that's part of a multi-line statement (a chained `findOne({...})` call, a multi-line `if`, a ternary, …), the logger is inserted **after the statement actually ends** — never in the middle of it. The extension walks forward from your selection, tracking `{`/`}` balance, and places the log on the first safe line.

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

If the enclosing class doesn't already have a `private readonly logger` property, the extension asks:

> No logger found in `UserService`. Add it automatically?

Saying **Yes** will:

1. Add `Logger` to the existing `@nestjs/common` import — or create the import if `@nestjs/common` isn't imported.
2. Insert `private readonly logger = new Logger(UserService.name);` right after the class's opening brace.
3. Then insert the requested log statement after the current statement ends.

#### Logger methods & emojis

| Logger Method | Emoji | Shortcut (mac)      | Shortcut (win/linux) |
| ------------- | ----- | ------------------- | -------------------- |
| `debug`       | 🔍    | `Cmd+L Cmd+D`       | `Ctrl+L Ctrl+D`      |
| `log`         | 📝    | `Cmd+L Cmd+L`       | `Ctrl+L Ctrl+L`      |
| `warn`         | ⚠️    | `Cmd+L Cmd+W`       | `Ctrl+L Ctrl+W`      |
| `error`       | ❌    | `Cmd+L Cmd+E`       | `Ctrl+L Ctrl+E`      |
| `verbose`     | 🔊    | `Cmd+L Cmd+V`       | `Ctrl+L Ctrl+V`      |

The inserted line respects the indentation of your code and is placed safely where it won't break syntax.

---

### 🧭 Module File Searcher

Navigate between files inside a NestJS module without ever touching the file tree.

#### 🔎 Search from the current file

1. From any file inside a module (even deep in `auth/dto/`), press **`Cmd+L Cmd+K`** (mac) / **`Ctrl+L Ctrl+K`** (win/linux).
2. A picker appears listing every `.ts` file in that module folder and its subdirectories.
3. Files are grouped into categories: **Core NestJS** (Service, Controller, Module, Guard, …), **Entities**, **DTOs**, **Enums**, **Interfaces**, and **Other**.
4. Each row shows the file name, its type label, and a **shortcut letter** you can type to jump straight to it — no `Enter` required.
5. Category separators show live counts (e.g. `DTOs (3)`).

#### 📦 Browse all modules

1. Press **`Cmd+L Cmd+M`** (mac) / **`Ctrl+L Ctrl+M`** (win/linux) — or click the **`$(extensions) Modules`** entry in the status bar.
2. A picker lists every `*.module.ts` file in your workspace, sorted alphabetically by module name.
3. Choose one to drill into its file list.

#### 🧩 Nested module navigation

Modules that contain other modules (e.g. a `blog` module with a nested `comment` module) are handled cleanly instead of dumping everything into one flat list:

- Nested modules appear as their own selectable entries at the top of the picker, each showing its file count and a `go-to-file` action button to open the `*.module.ts` file directly.
- Selecting one drills straight into that module's own file list.
- A **Back** entry (showing the parent module's name) appears once you're nested, so you can step back up to the parent module without restarting the whole search.
- A **breadcrumb title** at the top of the picker shows your current path (e.g. `blog  ›  comment`), so you always know where you are.

#### ⚡ Quick access

- **Status bar item** (`$(extensions) Modules`) on the left side of the status bar — one click opens the module browser. No keybinding or Command Palette needed.
- **CodeLens** appears above `@Module(...)` in every `.module.ts` file, rendered as `$(package) N nested modules, $(file) M files` (the nested-modules segment is omitted when zero). Clicking it jumps straight into that module's file list. Counts are cached per module directory and refreshed automatically when files are created or deleted anywhere in the workspace.

#### 🔍 Search all modules

Press **`Cmd+L Cmd+A`** (mac) / **`Ctrl+L Ctrl+A`** (win/linux) to fuzzy-search every file across **every module in the workspace** at once, instead of just the current one. Files are grouped under per-module separators sorted alphabetically by module name. Useful when you know the file name but not which module it lives in.

---

## 🗂️ Recognized file types

Every `.ts` file in a module folder is shown, grouped by category. Each type has a one- or two-letter shortcut you can type to jump straight to it:

| Category        | Type         | Suffix           | Shortcut | ThemeIcon            |
| --------------- | ------------ | ---------------- | -------- | -------------------- |
| **Core NestJS** | Service      | `.service.ts`    | `s`      | `gear`               |
|                 | Controller   | `.controller.ts` | `c`      | `symbol-method`      |
|                 | Module       | `.module.ts`     | `m`      | `package`            |
|                 | Guard        | `.guard.ts`      | `g`      | `shield`             |
|                 | Gateway      | `.gateway.ts`    | `gw`     | `radio-tower`        |
|                 | Interceptor  | `.interceptor.ts`| `i`      | `filter`             |
|                 | Pipe         | `.pipe.ts`       | `p`      | `symbol-ruler`       |
|                 | Filter       | `.filter.ts`     | `f`      | `filter`             |
|                 | Resolver     | `.resolver.ts`   | `r`      | `type-hierarchy`     |
|                 | Decorator    | `.decorator.ts`  | `d`      | `symbol-color`       |
| **Entities**    | Entity       | `.entity.ts`     | `e`      | `database`           |
| **DTOs**        | DTO          | `.dto.ts`        | `dt`     | `symbol-structure`   |
| **Enums**       | Enum         | `.enum.ts`       | `en`     | `symbol-enum`        |
| **Interfaces**  | Interface    | `.interface.ts`  | `if`     | `symbol-interface`   |
| **Other**       | Repository   | `.repository.ts` | `rp`     | `archive`            |
|                 | Middleware   | `.middleware.ts` | `mw`     | `layers`             |
|                 | Strategy     | `.strategy.ts`   | `st`     | `compass`            |
|                 | Test         | `.spec.ts`       | `t`      | `beaker`             |
| **Other Files** | (anything else) | (any `.ts`)   | —        | `file`               |

Plural suffixes are also recognized for the `Core NestJS` types above (e.g. `.guards.ts`, `.pipes.ts`, `.interceptors.ts`), so multi-export barrels are grouped correctly.

Any file that doesn't match a known suffix is shown under an **Other Files** category with a generic `file` icon.

---

## ⚙️ Extension Settings

This extension contributes the following settings:

### `nestjs-devtools.customTypes`

Add custom NestJS file types to the module browser. Custom types merge with the built-in types at runtime; entries that duplicate a built-in suffix or are missing required fields are silently ignored.

**Type:** `array` (default: `[]`)

Each item is an object with the following required fields:

| Field        | Type     | Description                                                                                          |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `suffix`     | `string` | File suffix without extension (e.g. `"handler"` for `.handler.ts`)                                   |
| `typeLabel`  | `string` | Display label shown in the picker (e.g. `"Handler"`)                                                  |
| `shortcut`   | `string` | Shortcut letter(s) to jump to this file type (e.g. `"h"`)                                             |
| `category`   | `string` | Category group shown as a separator (e.g. `"Other"` or your own name)                                |

**Example `settings.json`:**

```jsonc
{
  "nestjs-devtools.customTypes": [
    {
      "suffix": "handler",
      "typeLabel": "Handler",
      "shortcut": "h",
      "category": "Other"
    },
    {
      "suffix": "validator",
      "typeLabel": "Validator",
      "shortcut": "v",
      "category": "Other"
    }
  ]
}
```

Changes apply immediately — no need to reload the extension.

---

## ⌨️ Keyboard Shortcuts

All shortcuts can be customised via **Preferences: Open Keyboard Shortcuts** (search for `nestjs-log-helper`).

| Command ID                            | macOS         | Windows/Linux   |
| ------------------------------------- | ------------- | --------------- |
| `nestjs-log-helper.insertDebugLog`    | `Cmd+L Cmd+D` | `Ctrl+L Ctrl+D` |
| `nestjs-log-helper.insertLogLog`      | `Cmd+L Cmd+L` | `Ctrl+L Ctrl+L` |
| `nestjs-log-helper.insertWarnLog`     | `Cmd+L Cmd+W` | `Ctrl+L Ctrl+W` |
| `nestjs-log-helper.insertErrorLog`    | `Cmd+L Cmd+E` | `Ctrl+L Ctrl+E` |
| `nestjs-log-helper.insertVerboseLog`  | `Cmd+L Cmd+V` | `Ctrl+L Ctrl+V` |
| `nestjs-log-helper.searchModuleFiles` | `Cmd+L Cmd+K` | `Ctrl+L Ctrl+K` |
| `nestjs-log-helper.moduleSearcher`    | `Cmd+L Cmd+M` | `Ctrl+L Ctrl+M` |
| `nestjs-log-helper.searchAllModules`  | `Cmd+L Cmd+A` | `Ctrl+L Ctrl+A` |

The `Insert Log` command is also available in the editor context menu when text is selected, and `Search Files in Current Module` is always available in the editor context menu.

---

## 📦 Installation

### From the VS Code Marketplace

1. Open VS Code.
2. Go to the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`).
3. Search for **NestJS DevTools**.
4. Click **Install**.

### From a `.vsix` file

1. Build a `.vsix` with `vsce package`.
2. In VS Code, open the Extensions view, click the `…` menu, and choose **Install from VSIX…**.
3. Select the built `.vsix` file.

---

## 🧑‍💻 Usage

### Logger Helper

1. Place the cursor on a variable or expression (or select it).
2. Press one of the logger chord shortcuts in the table above.
3. The log is inserted right after the current statement ends, never breaking existing code blocks.
4. If the enclosing class has no `logger` property, you'll be prompted to add one automatically.

### Module File Searcher

#### From the current file

1. Open any TypeScript file inside a module.
2. Press **`Cmd+L Cmd+K`** (mac) / **`Ctrl+L Ctrl+K`** (win/linux).
3. A quick pick shows all `.ts` files in the same module, grouped by category.
4. Type the shortcut letter of the file you want (e.g. `c` for Controller, `dt` for DTO) to open it instantly — no `Enter` needed.

#### From the module picker

1. Press **`Cmd+L Cmd+M`** (mac) / **`Ctrl+L Ctrl+M`** (win/linux) — or click the **`$(extensions) Modules`** entry in the status bar.
2. Select a module from the list.
3. Browse its files, or select a nested module to drill in further. Use **Back** to step out again.

#### Across the whole workspace

1. Press **`Cmd+L Cmd+A`** (mac) / **`Ctrl+L Ctrl+A`** (win/linux).
2. Type any part of a file name to fuzzy-search across every module in the project at once.

---

## 🛠️ Development

Want to contribute or run the extension locally?

1. Clone the repository:

   ```bash
   git clone https://github.com/pouryazardosht/nestjs-devtools.git
   cd nestjs-devtools
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Open the folder in VS Code.
4. Press **F5** to launch the Extension Development Host.
5. Test the features in the new window.

### Project structure

The code is structured cleanly:

```
src/
├── extension.ts                    # Entry point: command registration, status bar, CodeLens, file watcher
├── constants.ts                    # LOGGER_METHODS, NEST_TYPES, getEffectiveNestTypes()
├── statusBar.ts                    # Status bar item factory
├── commands/
│   ├── insertLogger.ts             # Logger statement insertion + auto-declaration logic
│   ├── moduleSearcher.ts           # Browse all modules + nested module navigation
│   ├── searchModuleFiles.ts        # Search files in current module + findAllModuleFiles()
│   └── searchAllModules.ts         # Project-wide fuzzy search across all modules
├── providers/
│   └── moduleCodeLensProvider.ts   # CodeLens above @Module() with cache + refresh
└── utils/
    ├── getEnclosingClassName.ts    # Upward brace-depth scan for enclosing class name
    ├── loggerDeclaration.ts        # Detect/add Logger import and class logger property
    └── quickPickHelpers.ts         # ThemeIcons, grouping, breadcrumb, shortcut typing
```

### Build scripts

| Script             | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `npm run compile`  | Webpack build (development)                              |
| `npm run watch`    | Webpack in watch mode                                    |
| `npm run package`  | Production build with hidden source maps (for `.vsix`)   |
| `npm run lint`     | ESLint on `src/`                                         |
| `npm run test`     | Run extension tests via `vscode-test`                    |

---

## 🤝 Contributing

Contributions are welcome!
Please open an issue to discuss your idea before submitting a pull request.

---

## 📄 License

MIT – see the [LICENSE](LICENSE.md) file for details.

---

**Happy debugging! 🚀🐛**
