import * as vscode from "vscode";
import { insertLoggerStatement } from "./commands/insertLogger";
import { moduleSearcherCommand } from "./commands/moduleSearcher";
import { searchModuleFilesCommand } from "./commands/searchModuleFiles";
import { LOGGER_METHODS } from "./constants";

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

  context.subscriptions.push(...loggerSubs, moduleSearcherSub, searchFilesSub);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {}
