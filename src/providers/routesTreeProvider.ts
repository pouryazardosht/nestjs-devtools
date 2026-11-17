import * as path from "path";
import * as vscode from "vscode";
import {
  HTTP_METHOD_ORDER,
  httpMethodIcon,
  RouteInfo,
  extractRoutes,
  withGlobalPrefix,
} from "../utils/routeUtils";
import { showCounts, routeConflictsEnabled } from "../utils/config";
import { brandIcon } from "../utils/quickPickHelpers";
import { missingDocsFlag } from "../utils/routeUtils";
import { getExcludeGlob } from "../utils/config";
import {
  findFilesSafe,
  mapWithConcurrency,
  readTextFile,
  SCAN_CONCURRENCY,
} from "../utils/scan";
import { getGlobalPrefix } from "../utils/globalPrefix";
import { computeRouteConflicts, RouteConflict } from "../utils/routeConflicts";

type TreeItemType = "controller" | "route" | "conflictGroup" | "conflict" | "empty";

interface RouteCacheEntry {
  routes: RouteInfo[];
  /** First @ApiTags value on the controller class, if any. */
  tag?: string;
}

/** Stable key for a route row (conflict lookups). */
export function routeKey(route: RouteInfo): string {
  return `${route.uri.fsPath}:${route.line}:${route.httpMethod}:${route.fullPath}`;
}

/** First @ApiTags('…') string on the controller class. */
function parseApiTags(text: string): string | undefined {
  return text.match(/@ApiTags?\s*\(\s*['"`]([^'"`]+)['"`]/)?.[1];
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

  /**
   * Sink for the view-level badge (TreeView.badge), wired in extension.ts.
   * Shows the total route count (or the filtered match count while a
   * filter is active). The stable API has no per-item badge, so
   * controller counts use the item description instead.
   */
  badgeSink: ((badge: vscode.ViewBadge | undefined) => void) | undefined;

  /** Current in-memory filter (lowercased). */
  private filterText = "";
  get filterValue(): string {
    return this.filterText;
  }

  private saveListener: vscode.Disposable;
  private watchListener: vscode.Disposable;
  private debouncedTimer: ReturnType<typeof setTimeout> | undefined;

  /** Route keys currently in a (non-info) conflict — set on getControllers. */
  private conflictedKeys = new Set<string>();
  /** Number of actionable conflicts (certain/heuristic), for the badge. */
  private conflictCount = 0;
  /** All detected conflicts — rendered by the tree's Conflicts group. */
  private lastConflicts: RouteConflict[] = [];

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
    if (element.type === "conflictGroup") {
      return this.getConflictChildren();
    }
    if (element.type === "controller") {
      return this.getRoutesForController(element.controllerPath!);
    }
    return [];
  }

  private async getControllers(): Promise<RouteTreeItem[]> {
    const controllerFiles = await findFilesSafe(
      "**/*.controller.ts",
      getExcludeGlob(),
    );

    const sortedFiles = controllerFiles.sort((a, b) =>
      path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)),
    );

    // Same-named controllers in different modules are indistinguishable
    // in the tree — disambiguate their descriptions with the directory
    const nameCounts = new Map<string, number>();
    for (const f of sortedFiles) {
      const base = path.basename(f.fsPath);
      nameCounts.set(base, (nameCounts.get(base) ?? 0) + 1);
    }

    const filter = this.filterText.trim().toLowerCase();

    // First paint parses every controller — do it concurrently (bounded)
    // instead of one sequential open per controller
    const entries = await mapWithConcurrency(
      sortedFiles,
      SCAN_CONCURRENCY,
      (uri) => this.routesFor(uri.fsPath),
    );

    // Conflict detection over the freshly parsed (already prefixed) routes
    if (routeConflictsEnabled()) {
      const conflicts = computeRouteConflicts(entries.flatMap((e) => e.routes));
      this.lastConflicts = conflicts;
      this.conflictedKeys = new Set(
        conflicts
          .filter((c) => c.confidence !== "info")
          .flatMap((c) => c.routes.map(routeKey)),
      );
      this.conflictCount = conflicts.filter(
        (c) => c.confidence !== "info",
      ).length;
    } else {
      this.lastConflicts = [];
      this.conflictedKeys = new Set();
      this.conflictCount = 0;
    }

    if (!filter) {
      let total = 0;
      const items: RouteTreeItem[] = [];
      for (let i = 0; i < sortedFiles.length; i++) {
        const uri = sortedFiles[i];
        const { routes, tag } = entries[i];
        total += routes.length;
        const item = new RouteTreeItem(uri, "controller", undefined, uri.fsPath);
        const isDuplicateName =
          (nameCounts.get(path.basename(uri.fsPath)) ?? 0) > 1;
        item.description = [
          showCounts()
            ? `${routes.length} route${routes.length === 1 ? "" : "s"}`
            : undefined,
          tag,
          isDuplicateName
            ? vscode.workspace.asRelativePath(
                vscode.Uri.file(path.dirname(uri.fsPath)),
              )
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
        items.push(item);
      }
      // Pinned Conflicts group — conflicts glanceable without the command
      if (this.conflictCount > 0) {
        items.unshift(
          new RouteTreeItem(
            undefined,
            "conflictGroup",
            undefined,
            undefined,
            `Conflicts (${this.conflictCount})`,
          ),
        );
      }
      this.badgeSink?.(
        showCounts()
          ? {
              value: total,
              tooltip:
                `${total} route${total === 1 ? "" : "s"} in workspace` +
                (this.conflictCount > 0
                  ? ` · ${this.conflictCount} route conflict${this.conflictCount === 1 ? "" : "s"}`
                  : ""),
            }
          : undefined,
      );
      return items;
    }

    // Filter active: hide controllers with no matching routes.
    // Parse results come from the per-file cache, so this stays cheap.
    const items: RouteTreeItem[] = [];
    let matching = 0;
    for (let i = 0; i < sortedFiles.length; i++) {
      const uri = sortedFiles[i];
      const { routes } = entries[i];
      const matches = routes.filter((r) => routeMatchesFilter(r, filter));
      if (matches.length > 0) {
        matching += matches.length;
        const item = new RouteTreeItem(uri, "controller", undefined, uri.fsPath);
        if (showCounts()) {
          item.description = `${matches.length} match${matches.length === 1 ? "" : "es"}`;
        }
        items.push(item);
      }
    }
    this.badgeSink?.(
      showCounts()
        ? {
            value: matching,
            tooltip: `${matching} matching route${matching === 1 ? "" : "s"}`,
          }
        : undefined,
    );
    return items.length > 0
      ? items
      : [new RouteTreeItem(undefined, "empty", undefined, undefined, `No routes matching "${this.filterText.trim()}"`)];
  }

  /** Cache-or-parse a controller's routes (plus its @ApiTags tag). */
  private async routesFor(controllerPath: string): Promise<RouteCacheEntry> {
    let entry = this.cache.get(controllerPath);
    if (!entry) {
      const uri = vscode.Uri.file(controllerPath);
      const [text, prefix] = await Promise.all([
        readTextFile(uri),
        getGlobalPrefix(),
      ]);
      entry = {
        routes:
          text === undefined
            ? []
            : extractRoutes(uri, text).map((r) => ({
                ...r,
                fullPath: withGlobalPrefix(prefix, r.fullPath),
              })),
        tag: text ? parseApiTags(text) : undefined,
      };
      this.cache.set(controllerPath, entry);
    }
    return entry;
  }

  /** Children of the pinned Conflicts group: one row per participating route. */
  private getConflictChildren(): RouteTreeItem[] {
    const items: RouteTreeItem[] = [];
    for (const conflict of this.lastConflicts) {
      for (const route of conflict.routes) {
        items.push(
          new RouteTreeItem(
            undefined,
            "conflict",
            route,
            undefined,
            undefined,
            undefined,
            conflict,
          ),
        );
      }
    }
    return items;
  }

  private async getRoutesForController(
    controllerPath: string,
  ): Promise<RouteTreeItem[]> {
    const { routes } = await this.routesFor(controllerPath);

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
      (route) =>
        new RouteTreeItem(
          undefined,
          "route",
          route,
          undefined,
          undefined,
          this.conflictedKeys.has(routeKey(route)),
        ),
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
    /** Label used for "no match" placeholder items and the group label. */
    private readonly filterLabel?: string,
    /** Route participates in a (non-info) conflict — warning icon. */
    private readonly conflicted?: boolean,
    /** The conflict this row belongs to (inside the Conflicts group). */
    private readonly conflict?: RouteConflict,
  ) {
    super("", vscode.TreeItemCollapsibleState.None);

    if (type === "conflictGroup") {
      this.label = filterLabel ?? "Conflicts";
      this.iconPath = new vscode.ThemeIcon(
        "mirror",
        new vscode.ThemeColor("editorWarning.foreground"),
      );
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.contextValue = "nestConflicts";
      this.tooltip = "Duplicate, shadowed or overlapping routes — expand for details, or run Diagnose · Route Conflicts";
      return;
    }

    if (type === "conflict" && route && conflict) {
      this.label = `${route.httpMethod}  ${route.fullPath}  —  ${route.methodName}()`;
      this.description = `${conflict.kind} · ${conflict.confidence}`;
      this.tooltip = new vscode.MarkdownString(
        [
          `**${conflict.kind}** (${conflict.confidence})`,
          `\n\n${conflict.message}`,
          conflict.knownLimits ? `\n\n_${conflict.knownLimits}_` : "",
          `\n\n${route.methodName}() · L${route.line + 1} · ${route.controllerFile}`,
        ].join(""),
      );
      this.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("editorWarning.foreground"),
      );
      this.contextValue = "nestRoute";
      this.command = {
        command: "nestjs-log-helper.openRoute",
        title: "Open Route Method",
        arguments: [route.uri, route.line],
      };
      return;
    }

    if (type === "controller" && uri) {
      const base = path.basename(uri.fsPath, ".controller.ts");
      this.label = base;
      this.resourceUri = uri;
      // Explicit icon — otherwise the file theme renders a generic/folder
      // icon for the resourceUri
      this.iconPath = brandIcon("server");
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.contextValue = "nestController";
      this.tooltip = vscode.workspace.asRelativePath(uri);
      return;
    }

    if (type === "route" && route) {
      this.label = `${route.httpMethod}  ${route.fullPath}  —  ${route.methodName}()`;
      this.description = [
        conflicted ? "$(warning) conflict" : undefined,
        route.summary ?? (missingDocsFlag() ? "no docs" : undefined),
      ]
        .filter(Boolean)
        .join(" · ");
      this.tooltip = new vscode.MarkdownString(
        [
          `**${route.httpMethod} ${route.fullPath}**`,
          conflicted
            ? "\n\n⚠️ This route collides with another — run **Diagnose · Route Conflicts** for details."
            : "",
          route.summary ? `\n\n${route.summary}` : "",
          `\n\n${route.methodName}() · L${route.line + 1} · ${route.controllerFile}`,
        ].join(""),
      );
      this.iconPath = conflicted
        ? new vscode.ThemeIcon(
            "warning",
            new vscode.ThemeColor("editorWarning.foreground"),
          )
        : httpMethodIcon(route.httpMethod);
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
    this.iconPath = brandIcon(filterLabel ? "circle-slash" : "info");
    this.contextValue = "empty";
  }
}
