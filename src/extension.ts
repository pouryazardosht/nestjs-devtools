import * as vscode from "vscode";
import { insertLoggerStatement } from "./commands/insertLogger";
import { moduleSearcherCommand } from "./commands/moduleSearcher";
import { searchAllModulesCommand } from "./commands/searchAllModules";
import { searchModuleFilesCommand } from "./commands/searchModuleFiles";
import { LOGGER_METHODS } from "./constants";
import { ModuleCodeLensProvider } from "./providers/moduleCodeLensProvider";
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

  // Status bar quick access
  createModuleSearcherStatusBarItem(context);

  // CodeLens on .module.ts files
  const codeLensProvider = new ModuleCodeLensProvider();
  const codeLensSub = vscode.languages.registerCodeLensProvider(
    { language: "typescript", pattern: "**/*.module.ts" },
    codeLensProvider,
  );

  // Refresh CodeLens counts when files are created/deleted, since module
  // contents can change without the .module.ts file itself being saved
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
  watcher.onDidCreate(() => codeLensProvider.refresh());
  watcher.onDidDelete(() => codeLensProvider.refresh());

  context.subscriptions.push(
    ...loggerSubs,
    moduleSearcherSub,
    searchFilesSub,
    codeLensSub,
    watcher,
  );

  const searchAllSub = vscode.commands.registerCommand(
    "nestjs-log-helper.searchAllModules",
    searchAllModulesCommand,
  );

  context.subscriptions.push(
    ...loggerSubs,
    moduleSearcherSub,
    searchFilesSub,
    searchAllSub, // add this
    codeLensSub,
    watcher,
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {}
