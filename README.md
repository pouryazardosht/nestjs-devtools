🛠️ NestJS DevTools

Supercharge your NestJS workflow inside VS Code.  
Quickly insert **logger statements** with class context and navigate between **module files** at lightning speed.

✨ Features

🐛 Logger Helper

Insert `this.logger.debug()`, `.log()`, `.warn()`, `.error()`, or `.verbose()` statements with one chord.  
The log message automatically includes the enclosing class name – no more guessing where a log came from.

Example – inside `AppService.getHello()`:

```
const msg = 'Hello';
// select "msg", press Cmd+L Cmd+D
this.logger.debug("🔍 AppService ~ msg", msg);
```

| Logger Method | Emoji |
| ------------- | ----- |
| debug         | 🔍    |
| log           | 📝    |
| warn          | ⚠️    |
| error         | ❌    |
| verbose       | 🔊    |

The inserted line respects your indentation and is placed right below the selected line.

🧭 Module Searcher

Jump to any file of a NestJS module instantly.

1. Press Cmd+L Cmd+L (or Ctrl+L Ctrl+L).
2. Pick a module (e.g., 📦 users).
3. A beautiful list of related files appears: Service, Controller, Module, Guard, Gateway, etc.
4. Press the shortcut key (S, C, M, G, …) to open the file immediately – no Enter required!

File types and their shortcut keys are displayed with colorful emojis:

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

📦 Installation

1. Open VS Code.
2. Go to the Extensions view (Cmd+Shift+X / Ctrl+Shift+X).
3. Search for NestJS DevTools.
4. Click Install.

Alternatively, you can download the .vsix file from the latest release and install it via the Install from VSIX… command.

🧑‍💻 Usage

Logger Helper

1. Place the cursor on a variable or expression (or select the text).
2. Press one of the following chords:

| Command            | macOS Chord | Windows/Linux Chord |
| ------------------ | ----------- | ------------------- |
| Insert debug log   | Cmd+L Cmd+D | Ctrl+L Ctrl+D       |
| Insert log log     | Cmd+L Cmd+L | Ctrl+L Ctrl+L       |
| Insert warn log    | Cmd+L Cmd+W | Ctrl+L Ctrl+W       |
| Insert error log   | Cmd+L Cmd+E | Ctrl+L Ctrl+E       |
| Insert verbose log | Cmd+L Cmd+V | Ctrl+L Ctrl+V       |

If you prefer different shortcuts, you can override them in Keyboard Shortcuts settings.

Module Searcher

1. Press Cmd+L Cmd+L (macOS) / Ctrl+L Ctrl+L (Windows/Linux).
2. A quick pick shows all \*.module.ts files in your workspace.
3. Select a module (or type to filter).
4. A second list appears with all related NestJS files for that module.
5. Type the shortcut letter (e.g., s for Service, c for Controller) to instantly open that file.
6. You can also use arrow keys and Enter for normal selection.

⌨️ Keyboard Shortcuts

All shortcuts are customisable.  
Open Preferences: Open Keyboard Shortcuts and search for nestjs-log-helper or nestjs-dev-tools to change them.

Default chords:

| Command ID                         | Keybinding (macOS) | Keybinding (Win/Linux) |
| ---------------------------------- | ------------------ | ---------------------- |
| nestjs-log-helper.insertDebugLog   | Cmd+L Cmd+D        | Ctrl+L Ctrl+D          |
| nestjs-log-helper.insertLogLog     | Cmd+L Cmd+L        | Ctrl+L Ctrl+L          |
| nestjs-log-helper.insertWarnLog    | Cmd+L Cmd+W        | Ctrl+L Ctrl+W          |
| nestjs-log-helper.insertErrorLog   | Cmd+L Cmd+E        | Ctrl+L Ctrl+E          |
| nestjs-log-helper.insertVerboseLog | Cmd+L Cmd+V        | Ctrl+L Ctrl+V          |
| nestjs-log-helper.moduleSearcher   | Cmd+L Cmd+L        | Ctrl+L Ctrl+L          |

⚙️ Extension Settings

This extension currently does not add any VS Code settings. Future versions may allow customising the emoji or log format.

🛠️ Development

Want to contribute or run the extension locally?

1. Clone the repository:
   git clone <your-repo-url>
   cd nestjs-devtools
2. Install dependencies:
   npm install
3. Open the folder in VS Code.
4. Press F5 to launch the Extension Development Host.
5. Try out the features in the new window.

The code is structured cleanly:

- src/extension.ts – entry point, command registration
- src/constants.ts – logger methods, NestJS file types
- src/commands/ – command implementations
- src/utils/ – helper functions

🤝 Contributing

Contributions are welcome!  
Please open an issue to discuss your idea before submitting a pull request.

📄 License

MIT – see the LICENSE file for details.

Happy debugging! 🚀🐛
