import * as vscode from "vscode";
import {
  invalidateNestProjectCache,
  isNestJsProject,
} from "./utils/nestProject";

/**
 * Status bar quick access to the module browser.
 * Hidden entirely in workspaces that don't look like NestJS projects, and
 * re-evaluated when workspace folders change.
 */
export async function createModuleSearcherStatusBarItem(
  context: vscode.ExtensionContext,
): Promise<vscode.StatusBarItem> {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  item.text = "$(extensions) Modules";
  item.tooltip = "NestJS Devtools: Open Module Files";
  item.command = "nestjs-log-helper.moduleSearcher";

  const update = async () => {
    if (await isNestJsProject()) {
      item.show();
    } else {
      item.hide();
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      invalidateNestProjectCache();
      await update();
    }),
  );

  await update();
  context.subscriptions.push(item);
  return item;
}
