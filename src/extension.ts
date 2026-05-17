import * as vscode from "vscode";
import { insertLoggerStatement } from "./commands/insertLogger";
import { moduleSearcherCommand } from "./commands/moduleSearcher";
import { LOGGER_METHODS } from "./constants";

export function activate(context: vscode.ExtensionContext) {
  // ----- Logger commands -----
  const loggerSubs = Object.keys(LOGGER_METHODS).map((method) => {
    const commandId = `nestjs-log-helper.insert${capitalize(method)}Log`;
    return vscode.commands.registerCommand(commandId, () =>
      insertLoggerStatement(method),
    );
  });

  // ----- Module searcher command -----
  const moduleSearcherSub = vscode.commands.registerCommand(
    "nestjs-log-helper.moduleSearcher",
    moduleSearcherCommand,
  );

  context.subscriptions.push(...loggerSubs, moduleSearcherSub);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {}
