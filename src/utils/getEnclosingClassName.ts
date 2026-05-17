import * as vscode from "vscode";

export function getEnclosingClassName(
  document: vscode.TextDocument,
  line: number,
): string | undefined {
  const classRegex =
    /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/;
  for (let i = line; i >= 0; i--) {
    const match = document.lineAt(i).text.match(classRegex);
    if (match) return match[1];
  }
  return undefined;
}
