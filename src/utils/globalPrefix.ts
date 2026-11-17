import * as vscode from "vscode";
import { getExcludeGlob } from "./config";
import { findFilesSafe, readTextFile } from "./scan";
import { stripComments } from "./insertionPoint";

/**
 * Detects `app.setGlobalPrefix('api')` in main.ts / bootstrap.ts so every
 * route in the trees, pickers and conflict detection shows the path the
 * app ACTUALLY serves (`/api/users`, not `/users`). Commented-out calls
 * don't count (comment-stripped scanning).
 */

let cached: Promise<string> | undefined;

export function getGlobalPrefix(): Promise<string> {
  if (!cached) {
    cached = detect().catch((err) => {
      cached = undefined; // retry on next call, never poison the cache
      if (err instanceof Error) {
        console.error("[nestjs-devtools] global prefix detection failed:", err.message);
      }
      return "";
    });
  }
  return cached;
}

export function invalidateGlobalPrefixCache(): void {
  cached = undefined;
}

async function detect(): Promise<string> {
  const files = await findFilesSafe("**/{main,bootstrap}.ts", getExcludeGlob());
  for (const uri of files) {
    const text = await readTextFile(uri);
    if (!text) continue;
    const state = { inStr: null as string | null, inBlock: false };
    const stripped = text
      .split("\n")
      .map((l) => stripComments(l, state))
      .join("\n");
    const m = stripped.match(
      /\.setGlobalPrefix\s*\(\s*['"]([^'"]+)['"]/,
    );
    if (m) {
      return m[1].replace(/^\/+|\/+$/g, "");
    }
  }
  return "";
}
