import * as path from "path";
import * as vscode from "vscode";

/** Index of the last top-level `import …` line (capped scan). */
export function findLastImportLine(document: vscode.TextDocument): number {
  let last = -1;
  const lineCount = Math.min(document.lineCount, 200);
  for (let i = 0; i < lineCount; i++) {
    if (/^import\s/.test(document.lineAt(i).text)) last = i;
  }
  return last;
}

/**
 * Builds `import { ClassName } from './rel/path';\n` — the specifier is
 * relative from fromUri's directory to the provider file
 * ("./users.service" same dir, "../users/users.service" otherwise).
 */
export function buildRelativeImport(
  fromUri: vscode.Uri,
  providerUri: vscode.Uri,
  className: string,
): string {
  const fromDir = path.dirname(fromUri.fsPath);
  const relDir = path
    .relative(fromDir, path.dirname(providerUri.fsPath))
    .split(path.sep)
    .join("/");
  const base = path.basename(providerUri.fsPath, ".ts");
  const specifier = relDir
    ? `${relDir.startsWith(".") ? "" : "./"}${relDir}/${base}`
    : `./${base}`;
  return `import { ${className} } from '${specifier}';\n`;
}

/** Insert position for a new top-level import (after the last one). */
export function importInsertionPosition(
  document: vscode.TextDocument,
): vscode.Position {
  return new vscode.Position(findLastImportLine(document) + 1, 0);
}

/** True when the document already imports { … ClassName … }. */
export function hasImport(
  document: vscode.TextDocument,
  className: string,
): boolean {
  return new RegExp(
    `import\\s*\\{[^}]*\\b${className}\\b[^}]*\\}`,
  ).test(document.getText());
}
