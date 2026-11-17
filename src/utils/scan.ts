import { TextDecoder } from "util";
import * as vscode from "vscode";

/**
 * Shared helpers for workspace-wide text scans.
 *
 * Two properties every bulk scan should have:
 *  1. Cache-free reads — `workspace.fs.readFile` instead of
 *     `openTextDocument`, which pins every scanned file in the extension
 *     host's document cache (noticeable on low-RAM machines with big
 *     monorepos).
 *  2. Bounded concurrency — a handful of parallel reads is 10× faster
 *     than sequential awaits (Windows/antivirus especially) without
 *     saturating low-core machines the way unbounded Promise.all would.
 */

const decoder = new TextDecoder("utf-8");

/** Parallel file reads per scan batch — keeps the extension host responsive. */
export const SCAN_CONCURRENCY = 12;

/**
 * Reads a file's text without touching the document cache, normalized to
 * the same shape `TextDocument.getText()` produces (BOM stripped, CRLF →
 * LF) so the regex parsers see identical input. UTF-16 files are decoded
 * properly instead of turning into mojibake. Returns undefined when the
 * file can't be read.
 */
export async function readTextFile(
  uri: vscode.Uri,
): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      // UTF-16 LE BOM — decode from the payload, not as UTF-8
      text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      // UTF-16 BE BOM — swap to LE and decode
      const payload = Buffer.from(bytes.subarray(2));
      payload.swap16();
      text = new TextDecoder("utf-16le").decode(payload);
    } else {
      text = decoder.decode(bytes);
    }
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    if (text.includes("\r\n")) {
      text = text.replace(/\r\n/g, "\n");
    }
    if (text.includes("\r")) {
      text = text.replace(/\r/g, "\n"); // lone CR (old Mac style)
    }
    return text;
  } catch {
    return undefined;
  }
}

/** Patterns whose findFiles already failed once (warn once per pattern). */
const warnedGlobPatterns = new Set<string>();

/**
 * Crash-proof `workspace.findFiles`: an invalid glob (e.g. a hand-edited
 * `exclude` setting) makes findFiles THROW, and every unguarded call site
 * would take its feature down with it. Returns an empty list instead,
 * warning once per offending pattern.
 */
export async function findFilesSafe(
  pattern: vscode.GlobPattern,
  exclude?: vscode.GlobPattern | null,
  maxResults?: number,
): Promise<vscode.Uri[]> {
  try {
    return await vscode.workspace.findFiles(pattern, exclude, maxResults);
  } catch (err) {
    const key = `${pattern}`;
    if (!warnedGlobPatterns.has(key)) {
      warnedGlobPatterns.add(key);
      void vscode.window.showWarningMessage(
        `NestJS DevTools: a workspace scan pattern failed (${
          err instanceof Error ? err.message : String(err)
        }) — results may be incomplete.`,
      );
    }
    return [];
  }
}

/**
 * Maps `items` → `fn` with at most `limit` requests in flight, preserving
 * input order in the results.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
