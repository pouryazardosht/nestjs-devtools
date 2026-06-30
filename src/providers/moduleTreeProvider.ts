import * as path from "path";
import * as vscode from "vscode";
import { findAllModuleFiles } from "../commands/searchModuleFiles";
import { getEffectiveNestTypes, NestType } from "../constants";
import { iconForFile } from "../utils/quickPickHelpers";

type TreeItemType = "module" | "file";

const PLURAL_TYPES = new Set([
  "guard",
  "gateway",
  "interceptor",
  "pipe",
  "filter",
  "decorator",
  "resolver",
  "middleware",
  "strategy",
]);

function matchNestType(
  fileName: string,
  nestTypes: NestType[],
): NestType | undefined {
  for (const t of nestTypes) {
    const suffixes = PLURAL_TYPES.has(t.suffix)
      ? [t.suffix, t.suffix + "s"]
      : [t.suffix];
    if (suffixes.some((s) => fileName.endsWith(`.${s}.ts`))) {
      return t;
    }
  }
  return undefined;
}

export class ModuleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: TreeItemType,
    public readonly uri?: vscode.Uri,
    public readonly moduleDir?: string,
  ) {
    super(label, collapsibleState);

    if (type === "module") {
      this.iconPath = new vscode.ThemeIcon(
        "package",
        new vscode.ThemeColor("charts.purple"),
      );
      this.contextValue = "nestModule";
      this.tooltip = moduleDir
        ? vscode.workspace.asRelativePath(moduleDir)
        : label;
    } else if (type === "file" && uri) {
      const fileName = path.basename(uri.fsPath);
      const nestTypes = getEffectiveNestTypes();
      const matched = matchNestType(fileName, nestTypes);

      this.iconPath = iconForFile(matched?.suffix ?? "");
      this.contextValue = "nestFile";
      this.resourceUri = uri;
      this.description = matched?.typeLabel ?? "File";
      this.tooltip = vscode.workspace.asRelativePath(uri);
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri],
      };
    }
  }
}

export class ModuleTreeProvider implements vscode.TreeDataProvider<ModuleTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ModuleTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ModuleTreeItem): Promise<ModuleTreeItem[]> {
    if (!element) {
      return this.getRootModules();
    }
    if (element.type === "module" && element.moduleDir) {
      return this.getModuleChildren(element.moduleDir);
    }
    return [];
  }

  private async getRootModules(): Promise<ModuleTreeItem[]> {
    const moduleFiles = await vscode.workspace.findFiles(
      "**/*.module.ts",
      "**/node_modules/**",
    );
    if (!moduleFiles.length) return [];

    // Sort by path length so we always process shallower paths first
    const sorted = [...moduleFiles].sort(
      (a, b) => a.fsPath.length - b.fsPath.length,
    );

    const topLevel: vscode.Uri[] = [];
    for (const file of sorted) {
      const dir = path.dirname(file.fsPath);
      // Skip if this file's directory is nested inside an already-kept module
      const isNested = topLevel.some((kept) => {
        const keptDir = path.dirname(kept.fsPath);
        return dir !== keptDir && dir.startsWith(keptDir + path.sep);
      });
      if (!isNested) {
        topLevel.push(file);
      }
    }

    return topLevel
      .sort((a, b) =>
        path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)),
      )
      .map((file) => {
        const base = path.basename(file.fsPath, ".module.ts");
        const dir = path.dirname(file.fsPath);
        return new ModuleTreeItem(
          base,
          vscode.TreeItemCollapsibleState.Collapsed,
          "module",
          file,
          dir,
        );
      });
  }

  private async getModuleChildren(
    moduleDir: string,
  ): Promise<ModuleTreeItem[]> {
    const [allFiles, nestedModuleFiles] = await Promise.all([
      findAllModuleFiles(moduleDir),
      vscode.workspace.findFiles(
        new vscode.RelativePattern(moduleDir, "**/*.module.ts"),
        "**/node_modules/**",
      ),
    ]);

    // Find direct nested modules — shallowest level only
    const nested = [...nestedModuleFiles]
      .filter((f) => path.dirname(f.fsPath) !== moduleDir)
      .sort((a, b) => a.fsPath.length - b.fsPath.length);

    const nestedModuleDirs: { uri: vscode.Uri; dir: string; base: string }[] =
      [];
    for (const file of nested) {
      const dir = path.dirname(file.fsPath);
      const isInsideExisting = nestedModuleDirs.some((m) =>
        dir.startsWith(m.dir + path.sep),
      );
      if (!isInsideExisting) {
        nestedModuleDirs.push({
          uri: file,
          dir,
          base: path.basename(file.fsPath, ".module.ts"),
        });
      }
    }

    // Own files — exclude anything inside a nested module's subtree
    const categoryOrder = [
      "Core NestJS",
      "Entities",
      "DTOs",
      "Enums",
      "Interfaces",
      "Other",
      "Other Files",
    ];

    const ownFiles = allFiles
      .filter((file) => {
        const fileDir = path.dirname(file.uri.fsPath);
        return !nestedModuleDirs.some(
          (m) => fileDir === m.dir || fileDir.startsWith(m.dir + path.sep),
        );
      })
      .sort((a, b) => {
        const idxA = categoryOrder.indexOf(a.category);
        const idxB = categoryOrder.indexOf(b.category);
        if (idxA !== idxB) {
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        }
        return a.fileName.localeCompare(b.fileName);
      });

    const items: ModuleTreeItem[] = [];

    // Nested modules first, alphabetically
    for (const mod of [...nestedModuleDirs].sort((a, b) =>
      a.base.localeCompare(b.base),
    )) {
      items.push(
        new ModuleTreeItem(
          mod.base,
          vscode.TreeItemCollapsibleState.Collapsed,
          "module",
          mod.uri,
          mod.dir,
        ),
      );
    }

    // Then own files grouped by category
    for (const file of ownFiles) {
      items.push(
        new ModuleTreeItem(
          file.fileName,
          vscode.TreeItemCollapsibleState.None,
          "file",
          file.uri,
        ),
      );
    }

    return items;
  }
}
