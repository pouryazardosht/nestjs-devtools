import * as vscode from "vscode";

let lastActiveEditor: vscode.TextEditor | undefined;

/**
 * Keeps a reference to the most recently active text editor, so commands
 * still work when focus sits on a sidebar view (Explorer, the NestJS
 * trees, …) — where vscode.window.activeTextEditor is undefined.
 */
export function trackActiveEditor(): vscode.Disposable {
  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) lastActiveEditor = editor;
  });
}

/**
 * The editor a command should operate on: the focused editor if any,
 * otherwise the last editor that had focus while still visible, otherwise
 * any visible editor.
 */
export function getTargetEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (active) return active;

  if (
    lastActiveEditor &&
    vscode.window.visibleTextEditors.includes(lastActiveEditor)
  ) {
    return lastActiveEditor;
  }
  return vscode.window.visibleTextEditors[0];
}
