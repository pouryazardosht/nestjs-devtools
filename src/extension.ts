import * as vscode from "vscode";
import { generateNestFileCommand } from "./commands/generateNestFile";
import { insertLoggerStatement } from "./commands/insertLogger";
import { moduleSearcherCommand } from "./commands/moduleSearcher";
import { searchAllModulesCommand } from "./commands/searchAllModules";
import { searchModuleFilesCommand } from "./commands/searchModuleFiles";
import { LOGGER_METHODS } from "./constants";
import { ModuleCodeLensProvider } from "./providers/moduleCodeLensProvider";
import { ModuleTreeProvider } from "./providers/moduleTreeProvider";
import { createModuleSearcherStatusBarItem } from "./statusBar";

export function activate(context: vscode.ExtensionContext) {
  // Logger commands
  const loggerSubs = Object.keys(LOGGER_METHODS).map((method) => {
    const commandId = `nestjs-log-helper.insert${capitalize(method)}Log`;
    return vscode.commands.registerCommand(commandId, () =>
      insertLoggerStatement(method),
    );
  });

  // Module searcher (from all modules)
  const moduleSearcherSub = vscode.commands.registerCommand(
    "nestjs-log-helper.moduleSearcher",
    moduleSearcherCommand,
  );

  // File searcher (from current file)
  const searchFilesSub = vscode.commands.registerCommand(
    "nestjs-log-helper.searchModuleFiles",
    searchModuleFilesCommand,
  );

  // Search all modules
  const searchAllSub = vscode.commands.registerCommand(
    "nestjs-log-helper.searchAllModules",
    searchAllModulesCommand,
  );

  // Generate NestJS file (from command palette or tree view right-click)
  const generateFileSub = vscode.commands.registerCommand(
    "nestjs-log-helper.generateNestFile",
    (item?) => generateNestFileCommand(item),
  );

  // Status bar quick access
  createModuleSearcherStatusBarItem(context);

  // CodeLens on .module.ts files
  const codeLensProvider = new ModuleCodeLensProvider();
  const codeLensSub = vscode.languages.registerCodeLensProvider(
    { language: "typescript", pattern: "**/*.module.ts" },
    codeLensProvider,
  );

  // Sidebar Tree View
  const treeProvider = new ModuleTreeProvider();
  const treeSub = vscode.window.registerTreeDataProvider(
    "nestjsModuleTree",
    treeProvider,
  );

  // Refresh tree + CodeLens when .ts files are created or deleted
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
  watcher.onDidCreate(() => {
    codeLensProvider.refresh();
    treeProvider.refresh();
  });
  watcher.onDidDelete(() => {
    codeLensProvider.refresh();
    treeProvider.refresh();
  });

  // Refresh tree command (the inline button in the view title bar)
  const refreshTreeSub = vscode.commands.registerCommand(
    "nestjs-log-helper.refreshModuleTree",
    () => treeProvider.refresh(),
  );

  context.subscriptions.push(
    ...loggerSubs,
    moduleSearcherSub,
    searchFilesSub,
    searchAllSub,
    generateFileSub,
    codeLensSub,
    treeSub,
    refreshTreeSub,
    watcher,
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {}
