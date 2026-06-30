import * as vscode from "vscode";

export function getEnclosingClassName(
  document: vscode.TextDocument,
  line: number,
): string | undefined {
  const classRegex =
    /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/;

  let depth = 0;

  for (let i = line; i >= 0; i--) {
    const text = document.lineAt(i).text;
    const opens = (text.match(/\{/g) || []).length;
    const closes = (text.match(/\}/g) || []).length;

    // Walking upward: a close brace here means we're exiting some
    // inner block as we go up, so it *increases* effective depth
    // relative to our starting point.
    depth += closes - opens;

    const match = text.match(classRegex);
    if (match && depth <= 0) {
      return match[1];
    }
  }

  return undefined;
}
