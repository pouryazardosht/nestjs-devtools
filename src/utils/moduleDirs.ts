import * as path from "path";
import * as vscode from "vscode";
import { getExcludeGlob } from "./config";
import { findFilesSafe } from "./scan";

export interface NestedModuleDir {
  uri: vscode.Uri;
  dir: string;
  base: string;
}

/**
 * Direct nested modules under moduleDir — the shallowest level of
 * `*.module.ts` files in SUBDIRECTORIES (moduleDir's own module excluded,
 * deeper files absorbed into their nearest ancestor). One shared
 * implementation so the tree, the CodeLens counts and the pickers can't
 * drift apart (they previously disagreed about what "nested" meant).
 */
export async function findDirectNestedModules(
  moduleDir: string,
): Promise<NestedModuleDir[]> {
  const nestedModuleFiles = await findFilesSafe(
    new vscode.RelativePattern(moduleDir, "**/*.module.ts"),
    getExcludeGlob(),
  );

  const nested = [...nestedModuleFiles]
    .filter((f) => path.dirname(f.fsPath) !== moduleDir)
    .sort((a, b) => a.fsPath.length - b.fsPath.length);

  const dirs: NestedModuleDir[] = [];
  for (const file of nested) {
    const dir = path.dirname(file.fsPath);
    if (dirs.some((m) => dir.startsWith(m.dir + path.sep))) {
      continue; // deeper than an already-kept nested module
    }
    dirs.push({
      uri: file,
      dir,
      base: path.basename(file.fsPath, ".module.ts"),
    });
  }
  return dirs;
}

/** True when fileDir is inside (or equal to) any of the given dirs. */
export function isInsideAnyDir(
  fileDir: string,
  dirs: { dir: string }[],
): boolean {
  return dirs.some(
    (m) => fileDir === m.dir || fileDir.startsWith(m.dir + path.sep),
  );
}
