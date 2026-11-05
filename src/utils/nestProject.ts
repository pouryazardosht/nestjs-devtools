import * as vscode from "vscode";

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
    cached = detect();
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
    "**/node_modules/**",
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
