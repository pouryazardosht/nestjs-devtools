import * as vscode from "vscode";
import { LOGGER_METHODS } from "../constants";
import {
  logIncludeValue,
  logTemplate,
  loggerDeclarationTemplate,
} from "../utils/config";
import { findEnclosingClassLine } from "../utils/classBody";
import { getTargetEditor } from "../utils/targetEditor";
import { getEnclosingClassName } from "../utils/getEnclosingClassName";
import { findInsertionPoint } from "../utils/insertionPoint";
import { importInsertionPosition } from "../utils/imports";
import {
  findClassOpeningBrace,
  findLoggerImportState,
  hasLoggerDeclaration,
} from "../utils/loggerDeclaration";

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
  const importState = findLoggerImportState(document);

  if (declarationUsesLogger && !importState.hasImport) {
    if (importState.addLoggerEdit) {
      // @nestjs/common import exists but Logger isn't in it — extend the
      // list in place (handles single- AND multi-line import formatting)
      editBuilder.insert(
        importState.addLoggerEdit.position,
        importState.addLoggerEdit.text,
      );
    } else {
      // No @nestjs/common import at all — add one after the import block
      // (or after a leading header comment; never above it)
      editBuilder.insert(
        importInsertionPosition(document),
        `import { Logger } from '@nestjs/common';\n`,
      );
    }
  }

  // --- Logger property declaration ---
  const openingBrace = findClassOpeningBrace(document, classLine);
  if (openingBrace === undefined) return;

  const indentation = "  "; // 2-space indent inside class body
  const declaration = `\n${indentation}${declarationText}\n`;

  // Insert right after the '{' of the class body (raw column from the
  // strip-aware scan — the first raw `{` on the line may belong to a
  // decorator or generic)
  const insertPos = new vscode.Position(
    openingBrace.line,
    openingBrace.col + 1,
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
  const template = logTemplate();
  const emoji = LOGGER_METHODS[method] || "🔍";
  // {variable} goes inside a double-quoted string literal — a multi-line
  // selection would embed a raw newline (syntax error), so collapse
  // whitespace runs to single spaces. The value argument below keeps the
  // raw selection: newlines are valid inside an argument list.
  const messageVariable = selectedText.replace(/\s+/g, " ").trim();
  // {object} is a marker token, not message text: the value is appended
  // as an object argument (`…, { userId }` — structured-logging style)
  // instead of a bare one, and the marker is removed from the message.
  const wantsObject = /\{object\}/i.test(template);
  const message = template
    .replace(/\{emoji\}/g, emoji)
    .replace(/\{class\}/g, className ?? "")
    .replace(/\{variable\}/g, messageVariable)
    .replace(/\{object\}/gi, "")
    .replace(/ {2,}/g, " ")
    .trim();
  // Escape quotes/backslashes so a user template can't break the string
  const escapedMessage = message
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  const insertion = findInsertionPoint(document, lineNumber);
  const valueArg = wantsObject
    ? `, { ${selectedText} }`
    : logIncludeValue()
      ? `, ${selectedText}`
      : "";
  const logStatement = `${insertion.indent}this.logger.${method}("${escapedMessage}"${valueArg});`;
  const insertLog = (editBuilder: vscode.TextEditorEdit): void => {
    if (insertion.at) {
      // Empty-bodied signature (constructor() {}) — insert inside the
      // braces and move the closing brace to its own line. indent is
      // sigIndent + 2 spaces (set by findInsertionPoint), so slicing the
      // 2 spaces off recovers the closing brace's indentation.
      const sigIndent = insertion.indent.slice(0, -2);
      editBuilder.insert(insertion.at, `\n${logStatement}\n${sigIndent}`);
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
