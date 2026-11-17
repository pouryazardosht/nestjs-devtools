import * as path from "path";
import * as vscode from "vscode";

/**
 * Index of the last top-level `import …` line — the end of the import
 * block. Understands the real-world forms the old line-regex missed:
 * `import{X}from"y"` (no spaces), `import type { X }`, `import D, { X }`,
 * `import * as X`, side-effect `import 'x'`, and multi-line import
 * statements. There is no line cap — long license headers above the
 * imports are fine.
 */
export function findLastImportLine(document: vscode.TextDocument): number {
  let last = -1;
  let inImport = false;
  for (let i = 0; i < document.lineCount; i++) {
    const trimmed = document.lineAt(i).text.trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      continue; // blank lines and comments never end the import block
    }
    // `import` followed by whitespace, `{`, `*`, a quote, or an identifier —
    // but NOT `import(` (dynamic import call, part of a statement)
    if (/^import[\s{*'"(\w]/.test(trimmed) && !/^import\s*\(/.test(trimmed)) {
      inImport = true;
    } else if (!inImport) {
      break; // first code line after the imports — block is over
    }
    if (inImport) {
      last = i;
      // A single-line import ends here; a multi-line one ends on the line
      // carrying the module string (`} from '…';` / `from "…"`), usually
      // terminated by `;` or the closing quote. A trailing comma means the
      // statement continues (rare, but seen in comma-heavy styles).
      if (/['"][^'"]*['"]\s*;?\s*$/.test(trimmed) && !/,\s*$/.test(trimmed)) {
        inImport = false;
      }
    }
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
  const last = findLastImportLine(document);
  if (last >= 0) {
    return new vscode.Position(last + 1, 0);
  }
  // No imports at all — don't drop the new import above a leading
  // license/header comment block; insert after it instead.
  let i = 0;
  for (; i < document.lineCount; i++) {
    const t = document.lineAt(i).text.trim();
    if (
      t === "" ||
      t.startsWith("//") ||
      t.startsWith("/*") ||
      t.startsWith("*")
    ) {
      continue;
    }
    break;
  }
  return new vscode.Position(i, 0);
}

/** Escapes a class name for embedding in a RegExp. */
function escapeClassName(name: string): string {
  return name.replace(/\$/g, "\\$");
}

/** True when the document already imports the class in any common form. */
export function hasImport(
  document: vscode.TextDocument,
  className: string,
): boolean {
  const esc = escapeClassName(className);
  const text = document.getText();
  return [
    // `import { …X… } from` / `import{X}from` — [^}] spans lines, so
    // multi-line import lists are covered
    new RegExp(`import\\s*\\{[^}]*\\b${esc}\\b[^}]*\\}\\s*from`),
    // `import type { …X… } from`
    new RegExp(`import\\s+type\\s*\\{[^}]*\\b${esc}\\b[^}]*\\}\\s*from`),
    // `import D, { …X… } from`
    new RegExp(`import\\s+[\\w$]+\\s*,\\s*\\{[^}]*\\b${esc}\\b[^}]*\\}\\s*from`),
    // default: `import X from`
    new RegExp(`import\\s+${esc}\\s+from`),
    // namespace: `import * as X from`
    new RegExp(`import\\s+\\*\\s+as\\s+${esc}\\s+from`),
  ].some((re) => re.test(text));
}
