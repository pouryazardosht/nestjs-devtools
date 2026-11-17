import * as vscode from "vscode";

export interface InsertionPoint {
  /** 0-based line where the current statement ENDS. The log goes after it. */
  line: number;
  /** Indentation of the statement's first line. */
  indent: string;
  /**
   * Exact insert position for empty-bodied signatures (`constructor() {}`)
   * — inside the braces, so the log doesn't land in the class body.
   */
  at?: vscode.Position;
}

/**
 * Keywords after which a `/` always starts a regex literal, never division.
 */
const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/**
 * Decides whether a `/` at this point starts a regex literal or is a
 * division operator, using the last significant character of the already
 * stripped output (the standard heuristic). Division can only follow an
 * identifier character, `)` or `]`; anything else (operators, `(`, `,`,
 * `=`, `:` …) means regex — with keywords like `return` as exceptions.
 */
function startsRegexLiteral(stripped: string): boolean {
  const last = stripped.slice(-1);
  if (!last) return true; // statement start — division can't start one
  if (last === ")" || last === "]") return false;
  if (/[A-Za-z0-9_$]/.test(last)) {
    const word = stripped.slice(-32).match(/[A-Za-z0-9_$]+$/)?.[0] ?? "";
    return REGEX_KEYWORDS.has(word);
  }
  return true;
}

/**
 * Stripped-text result plus the raw index of every emitted character, so
 * callers can map positions found in stripped text back to document
 * coordinates (needed when building edit Positions from stripped scans).
 */
export interface StripResult {
  text: string;
  /** map[strippedIndex] → raw index in the original line. */
  map: number[];
}

/**
 * Removes string literals, comments AND regex literal bodies from a line
 * so bracket counting never sees braces/parens inside strings, comments
 * or regexes (e.g. `s.replace(/}/g, "")` used to leave a stray `}` in the
 * stripped text, corrupting the depth for every scanner). State (quote
 * char, block comment) threads across lines for multi-line templates and
 * comments. Regex literals are intra-line only, so they need no state.
 */
export function stripCode(
  line: string,
  state: { inStr: string | null; inBlock: boolean },
): string {
  return stripCodeMapped(line, state).text;
}

/** Same as stripCode, but also returns the stripped→raw index map. */
export function stripCodeMapped(
  line: string,
  state: { inStr: string | null; inBlock: boolean },
): StripResult {
  let out = "";
  const map: number[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1];

    if (state.inBlock) {
      if (ch === "*" && next === "/") {
        state.inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (state.inStr) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === state.inStr) state.inStr = null;
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      state.inStr = ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") break; // rest is a line comment
    if (ch === "/" && next === "*") {
      state.inBlock = true;
      i += 2;
      continue;
    }
    // Regex literal (not `//` or `/*`): skip its body so brackets inside
    // character classes or patterns never reach the counters
    if (ch === "/" && startsRegexLiteral(out)) {
      let inClass = false;
      i++;
      while (i < line.length) {
        const rc = line[i];
        if (rc === "\\") {
          i += 2;
          continue;
        }
        if (rc === "[") inClass = true;
        else if (rc === "]") inClass = false;
        else if (rc === "/" && !inClass) {
          i++; // past the closing `/`
          while (i < line.length && /[a-zA-Z]/.test(line[i])) i++; // flags
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    map.push(i);
    i++;
  }
  return { text: out, map };
}

/**
 * Removes ONLY comments (`//`, `/* ... *&#47;`) from a line, KEEPING string
 * literals and regex bodies intact — for scanners that must read string
 * contents (route paths, summaries) but can't be fooled by decorators
 * mentioned inside comments. State threads across lines like stripCode.
 */
export function stripComments(
  line: string,
  state: { inStr: string | null; inBlock: boolean },
): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1];

    if (state.inBlock) {
      if (ch === "*" && next === "/") {
        state.inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (state.inStr) {
      if (ch === "\\") {
        out += ch + (line[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (ch === state.inStr) state.inStr = null;
      out += ch;
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      state.inStr = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") break; // rest is a line comment
    if (ch === "/" && next === "*") {
      state.inBlock = true;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Net bracket delta ( () {} [] ) of stripped code. */
export function netDelta(text: string): number {
  let d = 0;
  for (const ch of text) {
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d--;
  }
  return d;
}

/**
 * True when a line ending in `{` opens a NEW block (class, method,
 * control flow) rather than continuing the current statement — the
 * backward walk must not cross these.
 */
function isBlockHeader(trimmed: string): boolean {
  if (/^(export\s+)?(abstract\s+)?(class|interface|enum)\s/.test(trimmed)) {
    return true;
  }
  if (/^(if|for|while|switch|try|catch|finally|else|do)\b/.test(trimmed)) {
    return true;
  }
  if (/^(constructor|get|set)\b.*\{\s*$/.test(trimmed)) {
    return true;
  }
  // Method signature: `async foo(a: b): Ret {` — but not arrows (`=> {`),
  // and not call arguments like `findOne({`.
  if (!trimmed.includes("=>") && /\)\s*(?::\s*[^=]*)?\{\s*$/.test(trimmed)) {
    return true;
  }
  return false;
}

/** Previous line continues the statement onto the current one. */
function isContinuation(trimmed: string): boolean {
  return /[([{,=+\-*/%?:&|.<>]$|=>\s*$/.test(trimmed);
}

/** Next line continues the statement (chains, else, catch…). */
function startsWithContinuation(trimmed: string): boolean {
  return /^[.)\]}:,?&|=+\-*/%]|^(?:else|catch|finally)\b/.test(trimmed);
}

function nextNonEmptyIdx(stripped: string[], from: number): number {
  for (let i = from; i < stripped.length; i++) {
    if (stripped[i].trim()) return i;
  }
  return -1;
}

/**
 * Finds where the statement containing the selection actually ends, so a
 * log statement can be inserted after it — never inside it.
 *
 * Handles: multi-line object literals and calls (braces or parens only),
 * one-line `if (x) return null;`, if/else and try/catch chains, arrow
 * function bodies (logs go inside the block, not after the whole chain),
 * strings/templates/comments containing brackets, and semicolon-less code.
 *
 * Scan window: 30 lines back, 80 forward — statements longer than that
 * fall back to inserting right after the selection line.
 */
export function findInsertionPoint(
  document: vscode.TextDocument,
  selectionLine: number,
): InsertionPoint {
  const winStart = Math.max(0, selectionLine - 30);
  const winEnd = Math.min(document.lineCount, selectionLine + 80);
  const idx = selectionLine - winStart;

  // Strip strings/comments once for the window, threading state across lines
  const stripped: string[] = [];
  const deltas: number[] = [];
  const state = { inStr: null as string | null, inBlock: false };
  for (let i = winStart; i < winEnd; i++) {
    const text = stripCode(document.lineAt(i).text, state);
    stripped.push(text);
    deltas.push(netDelta(text));
  }

  // ── Backward: walk to the statement's first line ──────────────────────────
  let start = idx;
  let steps = 0;
  while (start > 0 && steps++ < 20) {
    // Current line chains off the one above (`.map(…)`, `? valueA`, `: …`)
    const cur = stripped[start].trim();
    if (cur && startsWithContinuation(cur)) {
      start--;
      continue;
    }
    const prev = stripped[start - 1].trim();
    if (!prev || prev.endsWith(";")) break;
    if (prev.endsWith("{")) {
      // Arrow body: the block belongs to the surrounding statement, but the
      // statements INSIDE it are independent — stop there in both cases.
      if (prev.includes("=>") || isBlockHeader(prev)) break;
      // `const obj = {`, `return {`, `findOne({` — statement continues above
      start--;
      continue;
    }
    if (deltas[start - 1] > 0 || isContinuation(prev)) {
      start--;
      continue;
    }
    break;
  }

  // ── Forward: find where the statement ends ────────────────────────────────
  let depth = 0;
  let end = idx; // fallback: right after the selection line
  for (let i = start; i < stripped.length; i++) {
    depth += deltas[i];
    const t = stripped[i].trim();

    if (t.endsWith("{")) {
      // Function-like signature (method, constructor, getter — NOT arrow /
      // `function` callbacks, control-flow headers, or object literals):
      // a selection on the signature (e.g. a parameter) should log at the
      // TOP of the body, not after the whole method. The signature may
      // span lines — the body-opening line can be a few lines below the
      // selection (e.g. `handle(\n  event: E,\n): Promise<void> {`).
      if (
        i - start <= 6 &&
        /\)\s*(?::\s*[^=]*)?\{\s*$/.test(t) &&
        !t.includes("=>") &&
        !t.includes("function") &&
        !/^(if|for|while|switch)\b/.test(t)
      ) {
        // Indent like the first body statement (signature indent + 2 fallback)
        let bodyIndent: string | undefined;
        for (let k = i + 1; k < stripped.length; k++) {
          const raw = document.lineAt(winStart + k).text;
          if (raw.trim().length > 0) {
            bodyIndent = raw.match(/^\s*/)?.[0];
            break;
          }
        }
        bodyIndent ??=
          `${document.lineAt(winStart + i).text.match(/^\s*/)?.[0] ?? ""}  `;
        return { line: winStart + i, indent: bodyIndent };
      }
      continue; // a block opens; statement continues
    }
    if (depth > 0) continue;
    if (depth < 0) depth = 0; // brackets opened before the window

    if (t.endsWith(";") || t.endsWith("}")) {
      end = i;

      // Function-like empty body on the closing line — `constructor() {}`,
      // `foo(): void {}` — would put the log in the class body (a syntax
      // error). Insert inside the braces instead.
      const emptyBody = /\)\s*(?::\s*[^=]*)?\{\s*\}\s*$/.exec(
        document.lineAt(winStart + i).text,
      );
      if (
        emptyBody &&
        !t.includes("=>") &&
        !t.includes("function") &&
        !/^(if|for|while|switch)\b/.test(t)
      ) {
        const sigIndent =
          document.lineAt(winStart + i).text.match(/^\s*/)?.[0] ?? "";
        // The match starts at `)`, so `emptyBody.index + 1` would land
        // BEFORE the `{` — point at the first character inside the braces
        // instead (the caller inserts right after this position)
        const braceInside =
          emptyBody.index + emptyBody[0].indexOf("{") + 1;
        return {
          line: winStart + i,
          indent: `${sigIndent}  `,
          at: new vscode.Position(winStart + i, braceInside),
        };
      }
      break;
    }

    // Semicolon-less style (or trailing expression): the statement is
    // complete unless the next line chains into it (`.`, `)`, `else`, …)
    const next = nextNonEmptyIdx(stripped, i + 1);
    if (next === -1 || !startsWithContinuation(stripped[next].trim())) {
      end = i;
      break;
    }
    end = i;
  }

  const indent =
    document.lineAt(winStart + start).text.match(/^\s*/)?.[0] ?? "";

  return { line: winStart + end, indent };
}
