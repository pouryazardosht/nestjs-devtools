import * as vscode from "vscode";
import { stripCodeMapped } from "./insertionPoint";

/**
 * Checks whether the class already has a logger property declared.
 * Looks for any of the common patterns:
 *   private readonly logger = new Logger(...)
 *   private readonly logger: Logger = ...
 *   private logger = ...
 */
export function hasLoggerDeclaration(
  document: vscode.TextDocument,
  classLine: number,
): boolean {
  const loggerRegex = /private\s+(readonly\s+)?logger/;
  // The class body ends at a closing brace indented like the class itself —
  // trimming the line (as the old scan did) made the FIRST method's `}`
  // terminate the search, so loggers declared after it were never seen and
  // a duplicate was offered.
  const classIndent =
    document.lineAt(classLine).text.match(/^\s*/)?.[0] ?? "";
  const classEndRegex = new RegExp(`^${classIndent}}`);
  for (let i = classLine; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    if (i > classLine && classEndRegex.test(text)) break;
    if (loggerRegex.test(text)) return true;
  }
  return false;
}

/**
 * Finds the opening `{` of the class body — the first brace at paren-depth
 * zero from the class declaration on (so `implements Record<K, {…}>`-style
 * generic braces and decorator object args don't fool it). Handles class
 * declarations spanning multiple lines, and returns the RAW column so the
 * caller can build an edit position directly.
 */
export function findClassOpeningBrace(
  document: vscode.TextDocument,
  classLine: number,
): { line: number; col: number } | undefined {
  const state = { inStr: null as string | null, inBlock: false };
  for (
    let i = classLine;
    i < Math.min(classLine + 20, document.lineCount);
    i++
  ) {
    const { text: stripped, map } = stripCodeMapped(
      document.lineAt(i).text,
      state,
    );
    let parenDepth = 0;
    for (let c = 0; c < stripped.length; c++) {
      if (stripped[c] === "(") parenDepth++;
      else if (stripped[c] === ")") parenDepth--;
      else if (stripped[c] === "{" && parenDepth === 0) {
        return { line: i, col: map[c] };
      }
    }
  }
  return undefined;
}

/**
 * Checks whether @nestjs/common is imported and whether `Logger` is
 * already in its list. Understands single- AND multi-line imports, and
 * matches `Logger` as a whole word (the old `includes("Logger")` matched
 * `LoggerModule`, leaving a `new Logger(...)` referencing nothing).
 *
 * When the import exists but lacks Logger, `addLoggerEdit` carries the
 * exact insertion (position + text) to extend the existing list in place —
 * preserving single-line and multi-line formatting.
 */
export function findLoggerImportState(document: vscode.TextDocument): {
  hasImport: boolean;
  addLoggerEdit?: { position: vscode.Position; text: string };
} {
  const text = document.getText();
  // Note: `import type { … }` intentionally doesn't match — a type-only
  // import can't provide the runtime `new Logger(...)` value.
  const match = /import\s*\{([^}]*)\}\s*from\s*['"]@nestjs\/common['"]/.exec(
    text,
  );
  if (!match || match.index === undefined) {
    return { hasImport: false };
  }
  if (/\bLogger\b/.test(match[1])) {
    return { hasImport: true };
  }

  // Position right before the closing `}` of the matched import
  const braceOffset = match.index + match[0].lastIndexOf("}");
  const bracePos = document.positionAt(braceOffset);
  const itemsText = match[1];
  const endsWithComma = /,\s*$/.test(itemsText);

  if (!itemsText.includes("\n")) {
    // Single-line: `import { A } from` → `{ A, Logger }`
    //              `import { A, } from` → `{ A, Logger }`
    const insertText = endsWithComma ? " Logger" : ", Logger";
    return { hasImport: false, addLoggerEdit: { position: bracePos, text: insertText } };
  }

  // Multi-line: append on its own line, indented like the last item
  let indent = "  ";
  for (const line of itemsText.split("\n").reverse()) {
    const im = line.match(/^([ \t]*)\S/);
    if (im) {
      indent = im[1];
      break;
    }
  }
  const insertText = endsWithComma
    ? `\n${indent}Logger`
    : `,\n${indent}Logger`;
  return { hasImport: false, addLoggerEdit: { position: bracePos, text: insertText } };
}
