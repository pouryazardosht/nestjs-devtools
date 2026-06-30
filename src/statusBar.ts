import * as vscode from "vscode";

export function createModuleSearcherStatusBarItem(
  context: vscode.ExtensionContext,
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  item.text = "$(extensions) Modules";
  item.tooltip = "NestJS Devtools: Open Module Files";
  item.command = "nestjs-log-helper.moduleSearcher";
  item.show();

  context.subscriptions.push(item);
  return item;
}
