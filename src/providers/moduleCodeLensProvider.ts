import * as path from "path";
import * as vscode from "vscode";
import { findAllModuleFiles } from "../commands/searchModuleFiles";
import { isInsideAnyDir, findDirectNestedModules } from "../utils/moduleDirs";

interface CacheEntry {
  fileCount: number;
  nestedModuleCount: number;
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
      // Counts match the sidebar tree exactly: own files only (files
      // inside nested modules belong to the nested module, not here) and
      // DIRECT nested modules (the old lens counted every nested dir at
      // any depth and all files incl. nested subtrees — the numbers
      // disagreed with the tree for any module with nested modules).
      const [allFiles, nestedModuleDirs] = await Promise.all([
        findAllModuleFiles(moduleDir),
        findDirectNestedModules(moduleDir),
      ]);
      const ownFiles = allFiles.filter((file) => {
        const fileDir = path.dirname(file.uri.fsPath);
        return !isInsideAnyDir(fileDir, nestedModuleDirs);
      });
      entry = {
        fileCount: ownFiles.length,
        nestedModuleCount: nestedModuleDirs.length,
      };
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
        ? `${entry.nestedModuleCount} nested module${entry.nestedModuleCount === 1 ? "" : "s"}, `
        : "";

    const lens = new vscode.CodeLens(range, {
      title: `$(package) ${nestedLabel}$(file) ${entry.fileCount} file${entry.fileCount === 1 ? "" : "s"}`,
      command: "nestjs-log-helper.searchModuleFiles",
      tooltip: "Browse files in this module",
    });

    return [lens];
  }
}
