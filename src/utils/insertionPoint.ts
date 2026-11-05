import * as vscode from "vscode";

export interface InsertionPoint {
  /** 0-based line where the current statement ENDS. The log goes after it. */
  line: number;
  /** Indentation of the statement's first line. */
  indent: string;
}

/**
 * Removes string literals and comments from a line so bracket counting
 * never sees braces/parens inside strings. State (quote char, block
 * comment) threads across lines for multi-line templates and comments.
 */
function stripCode(
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
    out += ch;
    i++;
  }
  return out;
}

/** Net bracket delta ( () {} [] ) of stripped code. */
function netDelta(text: string): number {
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

    if (t.endsWith("{")) continue; // a block opens; statement continues
    if (depth > 0) continue;
    if (depth < 0) depth = 0; // brackets opened before the window

    if (t.endsWith(";") || t.endsWith("}")) {
      end = i;
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
