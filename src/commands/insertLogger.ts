import * as vscode from "vscode";
import { LOGGER_METHODS } from "../constants";
import { getEnclosingClassName } from "../utils/getEnclosingClassName";

export function insertLoggerStatement(method: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage(
      "⚠️  Select a variable or expression first",
    );
    return;
  }

  const selectedText = editor.document.getText(selection).trim();
  if (!selectedText) {
    vscode.window.showWarningMessage("⚠️  Selection is empty");
    return;
  }

  // ---- Indentation ----
  const lineNumber = selection.end.line;
  const lineText = editor.document.lineAt(lineNumber).text;
  const indentation = lineText.match(/^\s*/)?.[0] ?? "";

  // ---- Class name ----
  const className = getEnclosingClassName(editor.document, lineNumber);

  // ---- Build message ----
  const emoji = LOGGER_METHODS[method] || "🔍";
  const message = className
    ? `${emoji} ${className} ~ ${selectedText}`
    : `${emoji} ${selectedText}`;

  const logStatement = `${indentation}this.logger.${method}("${message}", ${selectedText});`;

  // ---- Insert after current line ----
  const insertPosition = new vscode.Position(lineNumber, lineText.length);
  editor
    .edit((editBuilder) => {
      editBuilder.insert(insertPosition, `\n${logStatement}`);
    })
    .then((success) => {
      if (success) {
        vscode.window.setStatusBarMessage(`✅ Logger.${method} inserted`, 3000);
      }
    });
}
