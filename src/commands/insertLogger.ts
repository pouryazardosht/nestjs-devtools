import * as vscode from "vscode";
import { LOGGER_METHODS } from "../constants";
import { getEnclosingClassName } from "../utils/getEnclosingClassName";

/**
 * If the current line opens a block (ends with '{'), find the line
 * with the matching closing brace and return the line after that.
 * Otherwise, return the line immediately after the current line.
 */
function findInsertionLine(
  document: vscode.TextDocument,
  startLine: number,
): number {
  const lineText = document.lineAt(startLine).text.trim();

  // Check if the line ends with '{' (possibly with comment or whitespace)
  if (!lineText.endsWith("{")) {
    // No block opened → insert right after this line
    return startLine + 1;
  }

  // Count braces to find the matching closing '}'
  let braceDepth = 1;
  for (let i = startLine + 1; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    // Increase depth for each '{', decrease for each '}'
    braceDepth += (text.match(/\{/g) || []).length;
    braceDepth -= (text.match(/\}/g) || []).length;

    if (braceDepth === 0) {
      // Found the line that closes the block
      return i + 1; // insert after this closing line
    }
  }

  // Fallback: if no matching brace found, just use the next line
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

  // Determine where to insert
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
