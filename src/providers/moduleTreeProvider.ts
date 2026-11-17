import * as path from "path";
import * as vscode from "vscode";
import { findAllModuleFiles } from "../commands/searchModuleFiles";
import { matchNestType, getEffectiveNestTypes } from "../constants";
import { showCounts } from "../utils/config";
import {
  brandIcon,
  iconForFileName,
  ModuleFile,
} from "../utils/quickPickHelpers";
import { getExcludeGlob } from "../utils/config";
import { findFilesSafe } from "../utils/scan";
import {
  findDirectNestedModules,
  isInsideAnyDir,
  NestedModuleDir,
} from "../utils/moduleDirs";
import {
  findProviderClasses,
  getRegistrationEntries,
  getRegistrationIndex,
  ProviderClassInfo,
} from "../utils/nestIndex";

type TreeItemType = "module" | "file";

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
      this.iconPath = brandIcon("package");
      this.contextValue = "nestModule";
      this.tooltip = moduleDir
        ? vscode.workspace.asRelativePath(moduleDir)
        : label;
    } else if (type === "file" && uri) {
      const fileName = path.basename(uri.fsPath);
      const nestTypes = getEffectiveNestTypes();
      const matched = matchNestType(fileName, nestTypes);

      this.iconPath = iconForFileName(fileName);
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

  /** Cached root modules — avoids a workspace scan on every keystroke. */
  private rootCache: ModuleTreeItem[] | undefined;

  /** Cached per-module contents (files + nested modules + DI health) for badges & children. */
  private contentsCache = new Map<
    string,
    {
      ownFiles: ModuleFile[];
      nestedModuleDirs: NestedModuleDir[];
      /** Unregistered providers + wrong-array registrations in this module's own area. */
      issues: number;
    }
  >();

  /**
   * Sink for the view-level badge (TreeView.badge), wired in extension.ts.
   * The stable API has no per-item badge, so per-module counts use the
   * item description instead.
   */
  badgeSink: ((badge: vscode.ViewBadge | undefined) => void) | undefined;

  /** Current in-memory filter (lowercased). */
  private filterText = "";
  get filterValue(): string {
    return this.filterText;
  }

  /** @param invalidateRoots false = repaint only (filter changes), true = rescan roots. */
  refresh(invalidateRoots = true): void {
    if (invalidateRoots) {
      this.rootCache = undefined;
      this.contentsCache.clear();
    }
    this._onDidChangeTreeData.fire();
  }

  /** Live filter — in-memory only, never re-parses the workspace. */
  setFilter(value: string): void {
    this.filterText = value;
    this.refresh(false);
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
    if (this.rootCache) return this.rootCache;

    const moduleFiles = await findFilesSafe("**/*.module.ts", getExcludeGlob());
    if (!moduleFiles.length) {
      this.rootCache = [];
      return this.rootCache;
    }

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

    this.rootCache = topLevel
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

    // Per-module counts via description (served from the contents cache,
    // so the per-module scans happen once per refresh, not per keystroke)
    if (showCounts()) {
      await Promise.all(
        this.rootCache.map(async (item) => {
          if (!item.moduleDir) return;
          const { ownFiles, nestedModuleDirs, issues } =
            await this.computeModuleContents(item.moduleDir);
          item.description = [
            `${ownFiles.length} file${ownFiles.length === 1 ? "" : "s"}`,
            nestedModuleDirs.length > 0
              ? `${nestedModuleDirs.length} nested`
              : undefined,
            issues > 0 ? `$(warning) ${issues} issue${issues === 1 ? "" : "s"}` : undefined,
          ]
            .filter(Boolean)
            .join(" · ");
        }),
      );

      this.badgeSink?.({
        value: this.rootCache.length,
        tooltip: `${this.rootCache.length} root module${this.rootCache.length === 1 ? "" : "s"}`,
      });
    } else {
      this.badgeSink?.(undefined);
    }

    return this.rootCache;
  }

  /** Cached parse of a module's own files, direct nested modules and DI health. */
  private async computeModuleContents(moduleDir: string): Promise<{
    ownFiles: ModuleFile[];
    nestedModuleDirs: NestedModuleDir[];
    issues: number;
  }> {
    const cached = this.contentsCache.get(moduleDir);
    if (cached) return cached;

    const [allFiles, nestedModuleDirs] = await Promise.all([
      findAllModuleFiles(moduleDir),
      findDirectNestedModules(moduleDir),
    ]);

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
        return !isInsideAnyDir(fileDir, nestedModuleDirs);
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

    // DI health of this module's OWN area: decorated classes that no
    // module registers (orphans) + classes registered in the wrong array
    // (a @Controller under `providers`, or a non-controller under
    // `controllers`). Both surfaces also via the tree's context menus.
    const [providerClasses, regEntries, registrations] = await Promise.all([
      findProviderClasses(),
      getRegistrationEntries(),
      getRegistrationIndex(),
    ]);
    const decoratorOf = new Map<string, string>(
      providerClasses.map((p) => [p.className, p.decorator] as const),
    );
    const inOwnArea = (fsPath: string): boolean => {
      const dir = path.dirname(fsPath);
      return (
        (dir === moduleDir || dir.startsWith(moduleDir + path.sep)) &&
        !isInsideAnyDir(dir, nestedModuleDirs)
      );
    };
    const orphans = providerClasses.filter(
      (p) => inOwnArea(p.uri.fsPath) && !registrations.has(p.className),
    ).length;
    const wrongArray = regEntries.filter((e) => {
      if (path.dirname(e.uri.fsPath) !== moduleDir) return false;
      const deco = decoratorOf.get(e.name);
      if (!deco) return false;
      return (
        (e.key === "providers" && deco === "Controller") ||
        (e.key === "controllers" && deco !== "Controller")
      );
    }).length;

    const result = { ownFiles, nestedModuleDirs, issues: orphans + wrongArray };
    this.contentsCache.set(moduleDir, result);
    return result;
  }

  private async getModuleChildren(
    moduleDir: string,
  ): Promise<ModuleTreeItem[]> {
    const { ownFiles, nestedModuleDirs } =
      await this.computeModuleContents(moduleDir);

    const items: ModuleTreeItem[] = [];

    const filter = this.filterText.trim().toLowerCase();
    let visibleFiles = ownFiles;
    let visibleNested = nestedModuleDirs;
    if (filter) {
      visibleFiles = ownFiles.filter((f) =>
        f.fileName.toLowerCase().includes(filter),
      );
      visibleNested = nestedModuleDirs.filter((m) =>
        m.base.toLowerCase().includes(filter),
      );
      if (visibleFiles.length === 0 && visibleNested.length === 0) {
        const emptyItem = new ModuleTreeItem(
          `No matches for "${this.filterText.trim()}"`,
          vscode.TreeItemCollapsibleState.None,
          "file",
        );
        emptyItem.description = "clear the view filter";
        return [emptyItem];
      }
    }

    // Registration state for context tokens — drives the right-click
    // "Register in Module" action on unregistered (orphan) providers
    const [providerClasses, registrations] = await Promise.all([
      findProviderClasses(),
      getRegistrationIndex(),
    ]);
    const classByFile = new Map<string, ProviderClassInfo>();
    for (const p of providerClasses) {
      if (!classByFile.has(p.uri.fsPath)) classByFile.set(p.uri.fsPath, p);
    }

    // Nested modules first, alphabetically
    for (const mod of [...visibleNested].sort((a, b) =>
      a.base.localeCompare(b.base),
    )) {
      const item = new ModuleTreeItem(
        mod.base,
        vscode.TreeItemCollapsibleState.Collapsed,
        "module",
        mod.uri,
        mod.dir,
      );
      // Same health badge the top-level rows carry
      const nested = await this.computeModuleContents(mod.dir);
      if (nested.issues > 0) {
        item.description = `$(warning) ${nested.issues} issue${nested.issues === 1 ? "" : "s"}`;
      }
      items.push(item);
    }

    // Then own files grouped by category
    for (const file of visibleFiles) {
      const item = new ModuleTreeItem(
        file.fileName,
        vscode.TreeItemCollapsibleState.None,
        "file",
        file.uri,
      );
      const cls = classByFile.get(file.uri.fsPath);
      if (cls) {
        const registered = registrations.has(cls.className);
        // Space-separated tokens: the context menus match them with =~
        item.contextValue = registered
          ? "nestFile nestRegistered"
          : "nestFile nestOrphan";
        item.tooltip = new vscode.MarkdownString(
          `${vscode.workspace.asRelativePath(file.uri)}\n\n@${cls.decorator} **${cls.className}** — ${
            registered
              ? `registered in ${registrations.get(cls.className)?.moduleName}`
              : "⚠️ not registered in any module"
          }`,
        );
      }
      items.push(item);
    }

    return items;
  }
}
