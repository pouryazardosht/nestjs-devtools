import * as vscode from "vscode";
import { LOGGER_METHODS } from "../constants";
import { getEnclosingClassName } from "../utils/getEnclosingClassName";
import {
  findClassOpeningBrace,
  findLoggerImportState,
  hasLoggerDeclaration,
} from "../utils/loggerDeclaration";

/**
 * Scans forward from the selection's start line to find the correct
 * insertion point after the current statement.
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

    if (opens > 0) sawOpenBrace = true;

    braceDepth += opens;
    braceDepth -= closes;

    if (sawOpenBrace && braceDepth === 0) return i + 1;

    if (!sawOpenBrace) {
      const trimmed = text.trim();
      if (trimmed.endsWith(";") || trimmed.endsWith(",")) return i + 1;
    }
  }

  return startLine + 1;
}

/**
 * Finds the line number of the class declaration that encloses the
 * given line (not just the class name — we need the actual line index
 * so we can locate the opening brace).
 */
function findEnclosingClassLine(
  document: vscode.TextDocument,
  line: number,
): number | undefined {
  const classRegex =
    /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/;
  let depth = 0;

  for (let i = line; i >= 0; i--) {
    const text = document.lineAt(i).text;
    const opens = (text.match(/\{/g) || []).length;
    const closes = (text.match(/\}/g) || []).length;
    depth += closes - opens;

    if (text.match(classRegex) && depth <= 0) return i;
  }
  return undefined;
}

/**
 * Builds the edits needed to:
 *  1. Add Logger to the @nestjs/common import (or create the import)
 *  2. Insert the logger property declaration into the class body
 */
function buildDeclarationEdits(
  document: vscode.TextDocument,
  className: string,
  classLine: number,
  editBuilder: vscode.TextEditorEdit,
): void {
  // --- Logger import ---
  const { hasImport, importLine, importText } = findLoggerImportState(document);

  if (!hasImport) {
    if (importLine !== undefined && importText !== undefined) {
      // @nestjs/common import exists but Logger isn't in it — add it
      const updated = importText.replace(
        /\{([^}]+)\}/,
        (_, inner) => `{ ${inner.trim()}, Logger }`,
      );
      editBuilder.replace(document.lineAt(importLine).range, updated);
    } else {
      // No @nestjs/common import at all — prepend one
      editBuilder.insert(
        new vscode.Position(0, 0),
        `import { Logger } from '@nestjs/common';\n`,
      );
    }
  }

  // --- Logger property declaration ---
  const openingBraceLine = findClassOpeningBrace(document, classLine);
  if (openingBraceLine === undefined) return;

  const braceLineText = document.lineAt(openingBraceLine).text;
  const indentation = "  "; // 2-space indent inside class body
  const declaration = `\n${indentation}private readonly logger = new Logger(${className}.name);\n`;

  // Insert right after the '{' on the class opening line
  const insertPos = new vscode.Position(
    openingBraceLine,
    braceLineText.indexOf("{") + 1,
  );
  editBuilder.insert(insertPos, declaration);
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

  // Check if we need to auto-declare the logger
  const classLine = findEnclosingClassLine(document, lineNumber);
  const needsDeclaration =
    classLine !== undefined &&
    className !== undefined &&
    !hasLoggerDeclaration(document, classLine);

  if (needsDeclaration && classLine !== undefined && className !== undefined) {
    // Ask the user before silently modifying their class
    vscode.window
      .showInformationMessage(
        `No logger found in ${className}. Add it automatically?`,
        "Yes",
        "No",
      )
      .then((answer) => {
        if (answer === "Yes") {
          editor
            .edit((editBuilder) => {
              // Insert the logger declaration
              buildDeclarationEdits(
                document,
                className,
                classLine,
                editBuilder,
              );
              // Insert the log statement
              editBuilder.insert(insertPosition, logStatement + "\n");
            })
            .then((success) => {
              if (success) {
                vscode.window.setStatusBarMessage(
                  `✅ Logger declared and Logger.${method} inserted`,
                  3000,
                );
              }
            });
        } else {
          // User said No — just insert the log statement anyway
          editor
            .edit((editBuilder) => {
              editBuilder.insert(insertPosition, logStatement + "\n");
            })
            .then((success) => {
              if (success) {
                vscode.window.setStatusBarMessage(
                  `✅ Logger.${method} inserted`,
                  3000,
                );
              }
            });
        }
      });
  } else {
    // Logger already declared — just insert the log statement
    editor
      .edit((editBuilder) => {
        editBuilder.insert(insertPosition, logStatement + "\n");
      })
      .then((success) => {
        if (success) {
          vscode.window.setStatusBarMessage(
            `✅ Logger.${method} inserted`,
            3000,
          );
        }
      });
  }
}
