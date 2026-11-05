import * as vscode from "vscode";
import { LOGGER_METHODS } from "../constants";
import { logIncludeValue, loggerDeclarationTemplate } from "../utils/config";
import { getTargetEditor } from "../utils/targetEditor";
import { getEnclosingClassName } from "../utils/getEnclosingClassName";
import { findInsertionPoint } from "../utils/insertionPoint";
import {
  findClassOpeningBrace,
  findLoggerImportState,
  hasLoggerDeclaration,
} from "../utils/loggerDeclaration";

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
  // --- Logger import (only when the declaration template uses Logger) ---
  const declarationText = loggerDeclarationTemplate().replace(
    /\{Class\}/g,
    className,
  );
  const declarationUsesLogger = /\bLogger\b/.test(declarationText);
  const { hasImport, importLine, importText } = findLoggerImportState(document);

  if (!hasImport && declarationUsesLogger) {
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
  const declaration = `\n${indentation}${declarationText}\n`;

  // Insert right after the '{' on the class opening line
  const insertPos = new vscode.Position(
    openingBraceLine,
    braceLineText.indexOf("{") + 1,
  );
  editBuilder.insert(insertPos, declaration);
}

export function insertLoggerStatement(method: string) {
  // Falls back to the last focused editor when a sidebar view has focus
  const editor = getTargetEditor();
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

  const className = getEnclosingClassName(document, lineNumber);

  // Message format is user-configurable (nestjs-devtools.logTemplate)
  const template =
    vscode.workspace
      .getConfiguration("nestjs-devtools")
      .get<string>("logTemplate") ?? "{emoji} {class} ~ {variable}";
  const emoji = LOGGER_METHODS[method] || "🔍";
  const message = template
    .replace(/\{emoji\}/g, emoji)
    .replace(/\{class\}/g, className ?? "")
    .replace(/\{variable\}/g, selectedText)
    .replace(/ {2,}/g, " ")
    .trim();
  // Escape quotes/backslashes so a user template can't break the string
  const escapedMessage = message
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  const insertion = findInsertionPoint(document, lineNumber);
  const valueArg = logIncludeValue() ? `, ${selectedText}` : "";
  const logStatement = `${insertion.indent}this.logger.${method}("${escapedMessage}"${valueArg});`;
  const insertLog = (editBuilder: vscode.TextEditorEdit): void => {
    if (insertion.at) {
      // Empty-bodied signature (constructor() {}) — inside the braces
      editBuilder.insert(insertion.at, `\n${logStatement}`);
    } else {
      editBuilder.insert(
        new vscode.Position(insertion.line + 1, 0),
        `${logStatement}\n`,
      );
    }
  };

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
              insertLog(editBuilder);
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
              insertLog(editBuilder);
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
        insertLog(editBuilder);
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
