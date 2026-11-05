import * as vscode from "vscode";
import {
  invalidateNestProjectCache,
  isNestJsProject,
} from "./utils/nestProject";

/**
 * Status bar hub button for NestJS DevTools. One click opens the command
 * hub (every feature, grouped and searchable) — no keybindings needed.
 *
 * Note: the status bar API only supports text + built-in codicons — no
 * custom images — so the lion SVG from the activity bar can't be rendered
 * here. The 🦁 emoji is the closest echo of the logo. Hidden in
 * non-NestJS workspaces.
 */
export async function createModuleSearcherStatusBarItem(
  context: vscode.ExtensionContext,
): Promise<vscode.StatusBarItem> {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  item.text = "🦁 NestJS";
  item.tooltip = "NestJS DevTools — all commands";
  item.command = "nestjs-log-helper.hub";

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
