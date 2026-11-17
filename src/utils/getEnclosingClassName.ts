import * as vscode from "vscode";
import { findEnclosingClassLine } from "./classBody";

/**
 * Name of the INNERMOST class enclosing the given line. Delegates to the
 * strip-aware stack scan in classBody.ts (the old copy here counted raw
 * braces, so a `}` inside a string or comment derailed the depth walk and
 * produced a wrong or missing class name in log messages).
 */
export function getEnclosingClassName(
  document: vscode.TextDocument,
  line: number,
): string | undefined {
  const classLine = findEnclosingClassLine(document, line);
  if (classLine === undefined) return undefined;
  return document
    .lineAt(classLine)
    .text.match(/class\s+([A-Za-z_$][\w$]*)/)?.[1];
}
