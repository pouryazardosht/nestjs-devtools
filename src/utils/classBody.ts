import * as vscode from "vscode";
import { netDelta, stripCode, stripCodeMapped } from "./insertionPoint";

/**
 * Class declaration line — also matches decorators and `export default`
 * sharing the line, which the old anchored regex missed
 * (`@Injectable() export class Foo` was never seen).
 */
const CLASS_DECL_REGEX =
  /^\s*(?:@[\w$]+(?:\s*\([^)]*\))?\s*)*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+[A-Za-z_$][\w$]*/;

/**
 * Finds the line index of the INNERMOST class declaration enclosing the
 * given line. Scans forward from the top of the file with a stack of open
 * classes, over string/comment/regex-stripped text — the old backward walk
 * counted raw braces, so a `}` inside a string or comment derailed the
 * depth and could skip the real class entirely.
 */
export function findEnclosingClassLine(
  document: vscode.TextDocument,
  line: number,
): number | undefined {
  const state = { inStr: null as string | null, inBlock: false };
  const openClasses: { line: number; depth: number }[] = [];
  let depth = 0;

  for (let i = 0; i <= line; i++) {
    const stripped = stripCode(document.lineAt(i).text, state);
    if (CLASS_DECL_REGEX.test(stripped)) {
      // depth after this line's opening brace is where the class body lives
      openClasses.push({ line: i, depth: depth + 1 });
    }
    depth += netDelta(stripped);
    while (
      openClasses.length > 0 &&
      depth < openClasses[openClasses.length - 1].depth
    ) {
      openClasses.pop(); // this class's body has closed
    }
  }
  return openClasses.length > 0
    ? openClasses[openClasses.length - 1].line
    : undefined;
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
 * derail the balance; the open-paren Position is mapped back to raw
 * coordinates via the strip map (so a `(` inside a comment above the
 * constructor can't send the edit into that comment).
 */
export function findConstructor(
  document: vscode.TextDocument,
  classLine: number,
): ConstructorInfo | undefined {
  // Thread string/comment stripping state across lines, keeping the
  // stripped→raw index map of every line
  const state = { inStr: null as string | null, inBlock: false };
  const limit = Math.min(document.lineCount, classLine + 200);
  const stripped: string[] = [];
  const maps: number[][] = [];
  for (let i = classLine; i < limit; i++) {
    const r = stripCodeMapped(document.lineAt(i).text, state);
    stripped.push(r.text);
    maps.push(r.map);
  }

  for (let i = 0; i < stripped.length; i++) {
    const declIdx = stripped[i].search(/\bconstructor\s*\(/);
    if (declIdx === -1) continue;

    // The `(` after the keyword, in stripped coordinates — then mapped to
    // the raw column for the edit Position
    const strippedOpenIdx = stripped[i].indexOf("(", declIdx);
    if (strippedOpenIdx === -1) continue;
    const rawOpenCol = maps[i][strippedOpenIdx];
    if (rawOpenCol === undefined) continue;
    const openParen = new vscode.Position(classLine + i, rawOpenCol);

    // Balance parens from the opening one
    let depth = 0;
    for (let j = i; j < stripped.length; j++) {
      const startCol = j === i ? strippedOpenIdx : 0;
      const line = stripped[j];
      for (let c = startCol; c < line.length; c++) {
        if (line[c] === "(") depth++;
        else if (line[c] === ")") {
          depth--;
          if (depth === 0) {
            const closeParen = new vscode.Position(classLine + j, c);

            // Inspect the params region (between the parens) — slice each
            // line of the range from its OWN stripped text (previously the
            // close-paren line was reused, so multi-line param lists looked
            // empty and the caller mis-detected an empty constructor).
            // `c` and the open-paren column are both stripped-text indexes,
            // so the slices stay in stripped coordinates.
            let params = "";
            for (let k = i; k <= j; k++) {
              const seg = stripped[k];
              const from = k === i ? stripped[i].indexOf("(", declIdx) + 1 : 0;
              const to = k === j ? c : seg.length;
              params += seg.slice(from, to) + " ";
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
