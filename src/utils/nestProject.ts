import * as vscode from "vscode";
import { getExcludeGlob } from "../utils/config";
import { findFilesSafe } from "./scan";

let cached: Promise<boolean> | undefined;

/**
 * Heuristic: does the current workspace look like a NestJS project?
 * True when ANY of these hold:
 *  - a `*.module.ts` file exists anywhere in the workspace
 *  - a workspace root's package.json depends on any `@nestjs/*` package
 *  - a `nest-cli.json` sits in a workspace root
 *
 * Result is cached per session (the check touches the FS); call
 * invalidateNestProjectCache() when workspace folders change.
 */
export function isNestJsProject(): Promise<boolean> {
  if (!cached) {
    // A failed detection must not poison the cache for the whole session —
    // the old code cached the rejected promise, so every later caller
    // (status bar, pickers) kept throwing. On failure: report false this
    // time and allow a retry on the next call.
    cached = detect().catch((err) => {
      cached = undefined;
      if (err instanceof Error) {
        console.error("[nestjs-devtools] project detection failed:", err.message);
      }
      return false;
    });
  }
  return cached;
}

export function invalidateNestProjectCache(): void {
  cached = undefined;
}

async function detect(): Promise<boolean> {
  const roots = vscode.workspace.workspaceFolders ?? [];
  if (roots.length === 0) return false;

  // Cheapest and most reliable signal first (index-backed, early-exits)
  const moduleFiles = await vscode.workspace.findFiles(
    "**/*.module.ts",
    getExcludeGlob(),
    1,
  );
  if (moduleFiles.length > 0) return true;

  for (const root of roots) {
    try {
      await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(root.uri, "nest-cli.json"),
      );
      return true;
    } catch {
      // no nest-cli.json at this root
    }

    try {
      const pkg = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(root.uri, "package.json"),
      );
      const json = JSON.parse(pkg.getText());
      const deps = { ...json.dependencies, ...json.devDependencies };
      if (Object.keys(deps).some((name) => name.startsWith("@nestjs/"))) {
        return true;
      }
    } catch {
      // no or invalid package.json at this root
    }
  }

  return false;
}

/** User-facing message explaining why nothing was found. */
export async function noNestProjectMessage(): Promise<string> {
  return (await isNestJsProject())
    ? "📁 This NestJS project has no matching files — make sure it contains *.module.ts / *.controller.ts files."
    : "📁 This workspace doesn't look like a NestJS project — no *.module.ts files and no @nestjs/* dependency found.";
}

let versionCache: Promise<string | undefined> | undefined;

/**
 * The project's `@nestjs/core` version (semver, `^`/`~` stripped) read
 * from the workspace roots' package.json — undefined when the project
 * doesn't depend on NestJS. Gates Nest-version-aware hints (e.g. v12's
 * router route-conflict warnings) and shows in the hub footer.
 */
export function getNestVersion(): Promise<string | undefined> {
  if (!versionCache) {
    versionCache = detectNestVersion().catch((err) => {
      versionCache = undefined;
      if (err instanceof Error) {
        console.error("[nestjs-devtools] version detection failed:", err.message);
      }
      return undefined;
    });
  }
  return versionCache;
}

export function invalidateNestVersionCache(): void {
  versionCache = undefined;
}

async function detectNestVersion(): Promise<string | undefined> {
  // Root package.json first (cheapest, most common layout)
  const roots = vscode.workspace.workspaceFolders ?? [];
  for (const root of roots) {
    const found = await readNestVersionFrom(
      vscode.Uri.joinPath(root.uri, "package.json"),
    );
    if (found) return found;
  }
  // The workspace may open a PARENT folder (backend nested inside it) —
  // scan the project's package.json files before giving up
  const candidates = await findFilesSafe("**/package.json", getExcludeGlob(), 30);
  for (const uri of candidates) {
    const found = await readNestVersionFrom(uri);
    if (found) return found;
  }
  return undefined;
}

async function readNestVersionFrom(
  uri: vscode.Uri,
): Promise<string | undefined> {
  try {
    const pkg = await vscode.workspace.openTextDocument(uri);
    const json = JSON.parse(pkg.getText());
    const deps = { ...json.dependencies, ...json.devDependencies };
    const raw = deps["@nestjs/core"];
    if (typeof raw === "string" && raw.trim()) {
      return raw.replace(/[\^~\s]/g, "") || undefined;
    }
  } catch {
    // no or invalid package.json at this location
  }
  return undefined;
}
