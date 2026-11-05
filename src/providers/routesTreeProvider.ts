import * as path from "path";
import * as vscode from "vscode";
import { HTTP_METHOD_ORDER, httpMethodIcon, RouteInfo, extractRoutes } from "../utils/routeUtils";

type TreeItemType = "controller" | "route" | "empty";

interface RouteCacheEntry {
  routes: RouteInfo[];
}

/**
 * Tree view listing every route in the workspace, grouped by controller.
 *
 * Resource-friendly by design:
 *  - Parsed routes are cached per controller file.
 *  - Saving one controller re-parses only that file (incremental refresh).
 *  - Nothing is scanned until the view is first revealed, and re-scans only
 *    happen on explicit refresh, file create/delete or controller saves.
 */
export class RoutesTreeProvider
  implements vscode.TreeDataProvider<RouteTreeItem>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<RouteTreeItem | void>();
  readonly onDidChangeTreeData: vscode.Event<RouteTreeItem | void> =
    this._onDidChangeTreeData.event;

  /** controller fsPath → parsed routes */
  private cache = new Map<string, RouteCacheEntry>();

  /** Current in-memory filter (lowercased). */
  private filterText = "";
  get filterValue(): string {
    return this.filterText;
  }

  private saveListener: vscode.Disposable;
  private watchListener: vscode.Disposable;
  private debouncedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith(".controller.ts")) {
        this.invalidateFile(doc.uri);
        this.debouncedRefresh();
      }
    });
    this.watchListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.cache.clear();
      this.debouncedRefresh();
    });
  }

  dispose(): void {
    this.saveListener.dispose();
    this.watchListener.dispose();
    if (this.debouncedTimer) clearTimeout(this.debouncedTimer);
    this._onDidChangeTreeData.dispose();
  }

  /** Re-parse a single controller file's cache entry on next paint. */
  invalidateFile(uri: vscode.Uri): void {
    this.cache.delete(uri.fsPath);
    this.refresh();
  }

  /** Drop the entire cache (e.g. workspace folders changed). */
  invalidateAll(): void {
    this.cache.clear();
    this.refresh();
  }

  /** Live filter — in-memory matching over cached parses. */
  setFilter(value: string): void {
    this.filterText = value;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /** Coalesce bursts of saves into a single repaint. */
  private debouncedRefresh(delayMs = 300): void {
    if (this.debouncedTimer) clearTimeout(this.debouncedTimer);
    this.debouncedTimer = setTimeout(() => {
      this.debouncedTimer = undefined;
      this.refresh();
    }, delayMs);
  }

  getTreeItem(element: RouteTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RouteTreeItem): Promise<RouteTreeItem[]> {
    if (!element) {
      return this.getControllers();
    }
    if (element.type === "controller") {
      return this.getRoutesForController(element.controllerPath!);
    }
    return [];
  }

  private async getControllers(): Promise<RouteTreeItem[]> {
    const controllerFiles = await vscode.workspace.findFiles(
      "**/*.controller.ts",
      "**/node_modules/**",
    );

    const sortedFiles = controllerFiles.sort((a, b) =>
      path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)),
    );

    const filter = this.filterText.trim().toLowerCase();
    if (!filter) {
      return sortedFiles.map(
        (uri) => new RouteTreeItem(uri, "controller", undefined, uri.fsPath),
      );
    }

    // Filter active: hide controllers with no matching routes.
    // Parse results come from the per-file cache, so this stays cheap.
    const items: RouteTreeItem[] = [];
    for (const uri of sortedFiles) {
      const routes = await this.routesFor(uri.fsPath);
      if (routes.some((r) => routeMatchesFilter(r, filter))) {
        items.push(new RouteTreeItem(uri, "controller", undefined, uri.fsPath));
      }
    }
    return items.length > 0
      ? items
      : [new RouteTreeItem(undefined, "empty", undefined, undefined, `No routes matching "${this.filterText.trim()}"`)];
  }

  /** Cache-or-parse a controller's routes. */
  private async routesFor(controllerPath: string): Promise<RouteInfo[]> {
    let entry = this.cache.get(controllerPath);
    if (!entry) {
      try {
        const doc = await vscode.workspace.openTextDocument(controllerPath);
        const routes = extractRoutes(
          vscode.Uri.file(controllerPath),
          doc.getText(),
        );
        entry = { routes };
      } catch {
        entry = { routes: [] };
      }
      this.cache.set(controllerPath, entry);
    }
    return entry.routes;
  }

  private async getRoutesForController(
    controllerPath: string,
  ): Promise<RouteTreeItem[]> {
    const routes = await this.routesFor(controllerPath);

    const filter = this.filterText.trim().toLowerCase();
    const visible = filter
      ? routes.filter((r) => routeMatchesFilter(r, filter))
      : routes;

    if (visible.length === 0) {
      return [new RouteTreeItem(undefined, "empty", undefined, undefined, filter ? `No routes matching "${this.filterText.trim()}"` : undefined)];
    }

    const sorted = [...visible].sort((a, b) => {
      const idxA = HTTP_METHOD_ORDER.indexOf(a.httpMethod);
      const idxB = HTTP_METHOD_ORDER.indexOf(b.httpMethod);
      if (idxA !== idxB) return idxA - idxB;
      return a.fullPath.localeCompare(b.fullPath);
    });

    return sorted.map(
      (route) => new RouteTreeItem(undefined, "route", route),
    );
  }
}

/** Filter matching: path, method name, verb, or swagger summary. */
function routeMatchesFilter(route: RouteInfo, filter: string): boolean {
  return (
    route.fullPath.toLowerCase().includes(filter) ||
    route.methodName.toLowerCase().includes(filter) ||
    route.httpMethod.toLowerCase() === filter ||
    (route.summary ?? "").toLowerCase().includes(filter)
  );
}

export class RouteTreeItem extends vscode.TreeItem {
  constructor(
    uri: vscode.Uri | undefined,
    public readonly type: TreeItemType,
    public readonly route?: RouteInfo,
    public readonly controllerPath?: string,
    /** Label used for "no match" placeholder items. */
    private readonly filterLabel?: string,
  ) {
    super("", vscode.TreeItemCollapsibleState.None);

    if (type === "controller" && uri) {
      const base = path.basename(uri.fsPath, ".controller.ts");
      this.label = base;
      this.resourceUri = uri;
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.contextValue = "nestController";
      this.tooltip = vscode.workspace.asRelativePath(uri);
      return;
    }

    if (type === "route" && route) {
      this.label = `${route.httpMethod}  ${route.fullPath}  —  ${route.methodName}()`;
      this.description = route.summary ?? "no docs";
      this.tooltip = new vscode.MarkdownString(
        [
          `**${route.httpMethod} ${route.fullPath}**`,
          route.summary ? `\n\n${route.summary}` : "",
          `\n\n${route.methodName}() · L${route.line + 1} · ${route.controllerFile}`,
        ].join(""),
      );
      this.iconPath = httpMethodIcon(route.httpMethod);
      this.contextValue = "nestRoute";
      this.command = {
        command: "nestjs-log-helper.openRoute",
        title: "Open Route Method",
        arguments: [route.uri, route.line],
      };
      return;
    }

    // empty
    this.label = filterLabel ?? "No routes found";
    this.contextValue = "empty";
  }
}
