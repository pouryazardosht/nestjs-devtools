import * as vscode from "vscode";
import { stripCode } from "./insertionPoint";

/**
 * Finds the line index of the class declaration enclosing the given line
 * (brace-depth based, same approach as the logger declaration scan).
 */
export function findEnclosingClassLine(
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

export interface ConstructorInfo {
  /** Position right after the opening `(`. */
  openParen: vscode.Position;
  /** Position of the closing `)`. */
  closeParen: vscode.Position;
  /** True when the parameter list is empty. */
  isEmptyParams: boolean;
  /** Line index holding the last parameter (when params exist). */
  lastParamLine: number;
}

/**
 * Finds the constructor of the class starting at classLine and returns
 * the positions needed to append a parameter. Paren matching runs over
 * string/comment-stripped text so params like `@Body("x{y}")` can't
 * derail the balance.
 */
export function findConstructor(
  document: vscode.TextDocument,
  classLine: number,
): ConstructorInfo | undefined {
  // Thread string/comment stripping state across lines
  const state = { inStr: null as string | null, inBlock: false };
  const limit = Math.min(document.lineCount, classLine + 80);
  const stripped: string[] = [];
  for (let i = classLine; i < limit; i++) {
    stripped.push(stripCode(document.lineAt(i).text, state));
  }

  for (let i = 0; i < stripped.length; i++) {
    const declIdx = stripped[i].search(/\bconstructor\s*\(/);
    if (declIdx === -1) continue;

    // Stripping only removes characters, and we skip lines that contain
    // strings/comments before the constructor — good enough for decl lines
    const openCol =
      document.lineAt(classLine + i).text.indexOf("(", declIdx);
    if (openCol === -1) continue;
    const openParen = new vscode.Position(classLine + i, openCol);

    // Balance parens from the opening one
    let depth = 0;
    for (let j = i; j < stripped.length; j++) {
      const startCol = j === i ? openCol : 0;
      const line = stripped[j];
      for (let c = startCol; c < line.length; c++) {
        if (line[c] === "(") depth++;
        else if (line[c] === ")") {
          depth--;
          if (depth === 0) {
            const closeParen = new vscode.Position(classLine + j, c);

            // Inspect the params region (between the parens)
            let params = "";
            for (let k = i; k <= j; k++) {
              const from = k === i ? openCol + 1 : 0;
              const to = k === j ? c : line.length;
              params += line.slice(from, to) + " ";
            }
            const isEmptyParams = params.trim().length === 0;

            // Last param line: walk back from the close paren
            let lastParamLine = openParen.line;
            for (let k = j; k >= i; k--) {
              const seg = k === j ? stripped[k].slice(0, c) : stripped[k];
              if (seg.trim().length > 0) {
                lastParamLine = classLine + k;
                break;
              }
            }

            return {
              openParen,
              closeParen,
              isEmptyParams,
              lastParamLine,
            };
          }
        }
      }
    }
    return undefined; // unbalanced constructor — bail
  }
  return undefined;
}
