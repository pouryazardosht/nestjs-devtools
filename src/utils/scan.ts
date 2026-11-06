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
 * LF) so the regex parsers see identical input. Returns undefined when
 * the file can't be read.
 */
export async function readTextFile(
  uri: vscode.Uri,
): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    let text = decoder.decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    if (text.includes("\r\n")) {
      text = text.replace(/\r\n/g, "\n");
    }
    return text;
  } catch {
    return undefined;
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
