# 🛠️ NestJS DevTools

Supercharge your NestJS workflow inside VS Code.  
Quickly insert **smart logger statements** and **navigate through all files in a module** at lightning speed.

---

## ✨ Features

### 🐛 Logger Helper

Insert `this.logger.debug()`, `.log()`, `.warn()`, `.error()`, or `.verbose()` statements with a single chord.  
The log message **automatically includes the enclosing class name**, so you always know where it came from.  
And it’s **smart** – if you select a variable on a line that opens a block (like `findOne({...})`), the logger is inserted **after the closing brace**, not inside the block.

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

The inserted line respects the indentation of your code and is placed safely where it won’t break syntax.

### 🧭 Module File Searcher

Navigate between **all files** inside a NestJS module in two quick steps – no more hunting through the file tree.

#### 🔎 Search from current file

1. From any file inside a module (even deep in `auth/dto/`), press **Cmd+L Cmd+K**.
2. A beautiful picker appears listing **every `.ts` file** in that module folder and its subdirectories.
3. Files are grouped into categories:
   **Core NestJS** (service, controller, module, guard, …), **Entities**, **DTOs**, **Enums**, **Interfaces**, and **Other**.
4. Each file shows its **file name**, its type label, and a shortcut letter.
5. Type the **shortcut letter** (S, C, M, G, E, DT, EN, IF, …) to **open the file instantly** – no Enter required!

#### 📦 Browse all modules

1. Press **Cmd+L Cmd+M**.
2. A picker lists all `*.module.ts` files in your workspace.
3. Choose one, and you immediately see every file that belongs to that module – same beautiful grouped view with instant shortcuts.

Both commands show emojis and shortcut hints for each file type:

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

\*Alternatively, download the `.vsix` from the [latest release]() and install via **Install from VSIX…\***

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

The log is inserted **after** the current statement, never breaking existing code blocks.

### Module File Searcher

#### From the current file

1. Open any TypeScript file inside a module.
2. Press **`Cmd+L Cmd+K`** (macOS) / **`Ctrl+L Ctrl+K`** (Windows/Linux).
3. A quick pick shows all `.ts` files in the same module, grouped by category.
4. Type the shortcut letter of the file you want (e.g., `c` for controller) to open it instantly.

#### From a module picker

1. Press **`Cmd+L Cmd+M`** (macOS) / **`Ctrl+L Ctrl+M`** (Windows/Linux).
2. Select a module from the list.
3. The file picker appears – jump to any file in that module using the same shortcuts.

---

## ⌨️ Keyboard Shortcuts

All shortcuts can be customised via **Preferences: Open Keyboard Shortcuts** (search for `nestjs-log-helper` or `nestjs-dev-tools`).

| Command ID                            | macOS         | Windows/Linux   |
| ------------------------------------- | ------------- | --------------- |
| `nestjs-log-helper.insertDebugLog`    | `Cmd+L Cmd+D` | `Ctrl+L Ctrl+D` |
| `nestjs-log-helper.insertLogLog`      | `Cmd+L Cmd+L` | `Ctrl+L Ctrl+L` |
| `nestjs-log-helper.insertWarnLog`     | `Cmd+L Cmd+W` | `Ctrl+L Ctrl+W` |
| `nestjs-log-helper.insertErrorLog`    | `Cmd+L Cmd+E` | `Ctrl+L Ctrl+E` |
| `nestjs-log-helper.insertVerboseLog`  | `Cmd+L Cmd+V` | `Ctrl+L Ctrl+V` |
| `nestjs-log-helper.searchModuleFiles` | `Cmd+L Cmd+K` | `Ctrl+L Ctrl+K` |
| `nestjs-log-helper.moduleSearcher`    | `Cmd+L Cmd+M` | `Ctrl+L Ctrl+M` |

---

## ⚙️ Extension Settings

_Currently no additional settings. Future versions may allow customising the emoji, log format, or file categories._

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

- `src/extension.ts` – entry point, command registration
- `src/constants.ts` – logger methods, NestJS file types with categories
- `src/commands/` – logger insertion, module file searchers
- `src/utils/` – helper functions (e.g., class name detection)

---

## 🤝 Contributing

Contributions are welcome!
Please open an issue to discuss your idea before submitting a pull request.

---

## 📄 License

MIT – see the [LICENSE](LICENSE) file for details.

---

**Happy debugging! 🚀🐛**
