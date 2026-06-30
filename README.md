# 🛠️ NestJS DevTools

Supercharge your NestJS workflow inside VS Code.  
Quickly insert **smart logger statements** and **navigate through every file in your NestJS project** at lightning speed.

---

## ✨ Features

### 🐛 Logger Helper

Insert `this.logger.debug()`, `.log()`, `.warn()`, `.error()`, or `.verbose()` statements with a single chord.  
The log message **automatically includes the enclosing class name**, so you always know where it came from.  
And it's **smart** – if you select a variable on a line that's part of a multi-line statement (like a chained `findOne({...})` call or a multi-line `if`), the logger is inserted **after the statement actually ends**, not in the middle of it.

**Example** – inside `UserService.findOne()`:

```typescript
const user = await this.userRepository.findOne({
  where: { email },
  select: { id: true, email: true },
});
// select "user", press Cmd+L Cmd+D
this.logger.debug("🔍 UserService ~ user", user);
```

| Logger Method | Emoji |
| ------------- | ----- |
| debug         | 🔍    |
| log           | 📝    |
| warn          | ⚠️    |
| error         | ❌    |
| verbose       | 🔊    |

The inserted line respects the indentation of your code and is placed safely where it won't break syntax.

---

### 🧭 Module File Searcher

Navigate between files inside a NestJS module without ever touching the file tree.

#### 🔎 Search from current file

1. From any file inside a module (even deep in `auth/dto/`), press **Cmd+L Cmd+K**.
2. A picker appears listing every `.ts` file in that module folder and its subdirectories.
3. Files are grouped into categories: **Core NestJS** (service, controller, module, guard, …), **Entities**, **DTOs**, **Enums**, **Interfaces**, and **Other**.
4. Each row shows the file name and its type — and a shortcut letter you can type to **jump straight to it**, no Enter required.

#### 📦 Browse all modules

1. Press **Cmd+L Cmd+M**.
2. A picker lists all `*.module.ts` files in your workspace.
3. Choose one to see every file belonging to that module, grouped the same way as above.

#### 🧩 Nested module navigation

Modules that contain other modules (e.g. a `blog` module with a nested `comment` module) are handled cleanly instead of dumping everything into one flat list:

- Nested modules show up as their own selectable entries at the top, separate from regular files.
- Selecting one drills straight into that module's own file list.
- A **Back** entry appears once you're nested, so you can step back up to the parent module at any point without restarting the whole search.

#### ⚡ Quick access

- A **status bar item** (`📦 Modules`) gives one-click access to the module browser — no keybinding or Command Palette needed.
- A **CodeLens** appears above `@Module(...)` in every `.module.ts` file, showing a live count of files and nested modules (e.g. `📦 2 nested modules, 9 files`). Click it to jump straight into that module's file list.

#### 🔍 Search all modules

Press **Cmd+L Cmd+A** to fuzzy-search every file across **every module in the workspace** at once, instead of just the current one. Useful when you know the file name but not which module it lives in.

---

Every command shows emojis and shortcut hints for each file type:

- 🛠️ (S) Service
- 🎮 (C) Controller
- 📦 (M) Module
- 🛡️ (G) Guard
- 🌐 (GW) Gateway
- 🚧 (I) Interceptor
- 🔧 (P) Pipe
- 🧹 (F) Filter
- 🧬 (R) Resolver
- 🎨 (D) Decorator
- 🗃️ (E) Entity
- 📋 (DT) DTO
- 🎛️ (EN) Enum
- 🔗 (IF) Interface
- 🗄️ (RP) Repository
- ⚙️ (MW) Middleware
- 🧠 (ST) Strategy
- 🧪 (T) Test

Every `.ts` file in the module folder is shown, so you never miss a file again.

---

## 📦 Installation

1. Open VS Code.
2. Go to the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`).
3. Search for **NestJS DevTools**.
4. Click **Install**.

\*Alternatively, build a `.vsix` yourself with `vsce package` and install it via **Install from VSIX…\***

---

## 🧑‍💻 Usage

### Logger Helper

1. Place the cursor on a variable or expression (or select it).
2. Press one of the following chords:

| Command            | macOS Chord   | Windows/Linux Chord |
| ------------------ | ------------- | ------------------- |
| Insert debug log   | `Cmd+L Cmd+D` | `Ctrl+L Ctrl+D`     |
| Insert log log     | `Cmd+L Cmd+L` | `Ctrl+L Ctrl+L`     |
| Insert warn log    | `Cmd+L Cmd+W` | `Ctrl+L Ctrl+W`     |
| Insert error log   | `Cmd+L Cmd+E` | `Ctrl+L Ctrl+E`     |
| Insert verbose log | `Cmd+L Cmd+V` | `Ctrl+L Ctrl+V`     |

The log is inserted right after the current statement, never breaking existing code blocks.

### Module File Searcher

#### From the current file

1. Open any TypeScript file inside a module.
2. Press **`Cmd+L Cmd+K`** (macOS) / **`Ctrl+L Ctrl+K`** (Windows/Linux).
3. A quick pick shows all `.ts` files in the same module, grouped by category.
4. Type the shortcut letter of the file you want (e.g., `c` for controller) to open it instantly.

#### From the module picker

1. Press **`Cmd+L Cmd+M`** (macOS) / **`Ctrl+L Ctrl+M`** (Windows/Linux) — or click the **📦 Modules** entry in the status bar.
2. Select a module from the list.
3. Browse its files, or select a nested module to drill in further. Use **Back** to step out again.

#### Across the whole workspace

1. Press **`Cmd+L Cmd+A`** (macOS) / **`Ctrl+L Ctrl+A`** (Windows/Linux).
2. Type any part of a file name to fuzzy-search across every module in the project at once.

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

---

## ⚙️ Extension Settings

_Currently no additional settings. Future versions may allow customising emojis, log format, or adding custom file-type categories._

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

The code is structured cleanly:

- `src/extension.ts` – entry point, command registration, status bar item, CodeLens registration
- `src/constants.ts` – logger methods, NestJS file types with categories
- `src/commands/` – logger insertion, module browsing, project-wide search
- `src/providers/` – CodeLens provider for `.module.ts` files (with caching for large projects)
- `src/utils/` – shared QuickPick UI helpers, class name detection

---

## 🤝 Contributing

Contributions are welcome!
Please open an issue to discuss your idea before submitting a pull request.

---

## 📄 License

MIT – see the [LICENSE](LICENSE) file for details.

---

**Happy debugging! 🚀🐛**
