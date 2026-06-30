import * as path from "path";
import * as vscode from "vscode";
import { findAllModuleFiles } from "../commands/searchModuleFiles";

interface CacheEntry {
  fileCount: number;
  nestedModuleCount: number;
}

async function countNestedModules(moduleDir: string): Promise<number> {
  const allModuleFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(moduleDir, "**/*.module.ts"),
    "**/node_modules/**",
  );

  const nestedDirs = new Set<string>();
  for (const file of allModuleFiles) {
    const dir = path.dirname(file.fsPath);
    if (dir !== moduleDir) {
      nestedDirs.add(dir);
    }
  }
  return nestedDirs.size;
}

export class ModuleCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private cache = new Map<string, CacheEntry>();

  /**
   * Clears the cache and notifies VS Code to re-render lenses.
   * Call this from file-system watcher events.
   */
  refresh(): void {
    this.cache.clear();
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Invalidates just one module dir's cache entry, useful if you ever
   * want more granular invalidation than a full clear.
   */
  invalidate(moduleDir: string): void {
    this.cache.delete(moduleDir);
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    if (!document.fileName.endsWith(".module.ts")) {
      return [];
    }

    const moduleDir = path.dirname(document.uri.fsPath);

    let entry = this.cache.get(moduleDir);
    if (!entry) {
      const [allFiles, nestedModuleCount] = await Promise.all([
        findAllModuleFiles(moduleDir),
        countNestedModules(moduleDir),
      ]);
      entry = { fileCount: allFiles.length, nestedModuleCount };
      this.cache.set(moduleDir, entry);
    }

    const text = document.getText();
    const decoratorMatch = text.match(/@Module\s*\(/);
    const line = decoratorMatch
      ? document.positionAt(decoratorMatch.index ?? 0).line
      : 0;

    const range = new vscode.Range(line, 0, line, 0);

    const nestedLabel =
      entry.nestedModuleCount > 0
        ? `📦 ${entry.nestedModuleCount} nested module${entry.nestedModuleCount === 1 ? "" : "s"}, `
        : "";

    const lens = new vscode.CodeLens(range, {
      title: `${nestedLabel}📄 ${entry.fileCount} file${entry.fileCount === 1 ? "" : "s"}`,
      command: "nestjs-log-helper.searchModuleFiles",
      tooltip: "Browse files in this module",
    });

    return [lens];
  }
}
