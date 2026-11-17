import * as vscode from "vscode";
import {
  invalidateNestProjectCache,
  invalidateNestVersionCache,
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

  // Register the item BEFORE the first update: if detection throws, the
  // old code skipped the push and leaked the created item.
  context.subscriptions.push(item);

  const update = async () => {
    try {
      if (await isNestJsProject()) {
        item.show();
      } else {
        item.hide();
      }
    } catch {
      item.hide(); // never let detection failure break the bar
    }
  };

  const invalidateAndRepaint = async () => {
    invalidateNestProjectCache();
    invalidateNestVersionCache();
    await update();
  };

  // Workspace folders change → re-detect
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void invalidateAndRepaint();
    }),
  );
  // Excluding a folder can remove the last *.module.ts — the visibility
  // must follow (the old code only listened to folder changes)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("nestjs-devtools.exclude")) {
        void invalidateAndRepaint();
      }
    }),
  );

  await update();
  return item;
}
