import * as vscode from "vscode";
import { LOGGER_METHODS } from "../constants";
import { getEnclosingClassName } from "../utils/getEnclosingClassName";

/**
 * Scans forward from the selection's start line to find the correct
 * insertion point — either just after the matching closing brace of
 * a block that opens somewhere in the range, or just after the line
 * where the statement terminates without ever opening a block.
 */
function findInsertionLine(
  document: vscode.TextDocument,
  startLine: number,
): number {
  let braceDepth = 0;
  let sawOpenBrace = false;

  for (let i = startLine; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const opens = (text.match(/\{/g) || []).length;
    const closes = (text.match(/\}/g) || []).length;

    if (opens > 0) {
      sawOpenBrace = true;
    }

    braceDepth += opens;
    braceDepth -= closes;

    if (sawOpenBrace && braceDepth === 0) {
      // Found the matching closing brace for whatever opened
      return i + 1;
    }

    if (!sawOpenBrace) {
      const trimmed = text.trim();
      if (trimmed.endsWith(";") || trimmed.endsWith(",")) {
        return i + 1;
      }
    }
  }

  // Fallback: just after the start line
  return startLine + 1;
}

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

  const document = editor.document;
  const lineNumber = selection.start.line;
  const lineText = document.lineAt(lineNumber).text;
  const indentation = lineText.match(/^\s*/)?.[0] ?? "";

  const className = getEnclosingClassName(document, lineNumber);

  const emoji = LOGGER_METHODS[method] || "🔍";
  const message = className
    ? `${emoji} ${className} ~ ${selectedText}`
    : `${emoji} ${selectedText}`;

  const logStatement = `${indentation}this.logger.${method}("${message}", ${selectedText});`;

  const insertionLine = findInsertionLine(document, lineNumber);
  const insertPosition = new vscode.Position(insertionLine, 0);

  editor
    .edit((editBuilder) => {
      editBuilder.insert(insertPosition, logStatement + "\n");
    })
    .then((success) => {
      if (success) {
        vscode.window.setStatusBarMessage(`✅ Logger.${method} inserted`, 3000);
      }
    });
}
