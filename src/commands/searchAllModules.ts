import * as path from "path";
import * as vscode from "vscode";
import {
  brandIcon,
  FileQuickPickItem,
  iconForFileName,
  ModuleFile,
} from "../utils/quickPickHelpers";
import { brandedTitle } from "../utils/quickPickHelpers";
import { noNestProjectMessage } from "../utils/nestProject";
import {
  extractRoutes,
  HTTP_METHOD_ORDER,
  httpMethodIcon,
  missingDocsFlag,
  RouteInfo,
  withGlobalPrefix,
} from "../utils/routeUtils";
import { getGlobalPrefix } from "../utils/globalPrefix";
import { getEffectiveNestTypes, matchNestType } from "../constants";
import { getExcludeGlob } from "../utils/config";
import {
  findFilesSafe,
  mapWithConcurrency,
  readTextFile,
  SCAN_CONCURRENCY,
} from "../utils/scan";

// ─── Route collection (shared parser lives in utils/routeUtils) ──────────────

export async function collectAllRoutes(): Promise<RouteInfo[]> {
  const controllerFiles = await findFilesSafe(
    "**/*.controller.ts",
    getExcludeGlob(),
  );

  const [perFile, prefix] = await Promise.all([
    mapWithConcurrency(
      controllerFiles,
      SCAN_CONCURRENCY,
      async (uri): Promise<RouteInfo[]> => {
        const text = await readTextFile(uri);
        return text === undefined ? [] : extractRoutes(uri, text);
      },
    ),
    getGlobalPrefix(),
  ]);

  // Show the paths the app actually serves — setGlobalPrefix('api') makes
  // `/users` live at `/api/users`, and conflict detection must compare
  // those real paths
  return perFile.flat().map((r) => ({
    ...r,
    fullPath: withGlobalPrefix(prefix, r.fullPath),
  }));
}

// ─── File collection (existing logic) ────────────────────────────────────────

interface AggregatedFile extends ModuleFile {
  moduleName: string;
}

/**
 * Aggregates every file under any module with ONE workspace scan instead
 * of a subtree scan per module (overlapping nested modules used to rescan
 * the same directories repeatedly). Each file is attributed to its
 * nearest enclosing module directory — deterministic, where the old
 * per-module scan order made the grouping arbitrary for nested modules.
 */
async function collectAllFiles(): Promise<AggregatedFile[]> {
  const [moduleFiles, allTsFiles] = await Promise.all([
    findFilesSafe("**/*.module.ts", getExcludeGlob()),
    findFilesSafe("**/*.ts", getExcludeGlob()),
  ]);

  if (moduleFiles.length === 0) {
    return [];
  }

  const moduleDirs = new Map<string, string>();
  for (const moduleFile of [...moduleFiles].sort((a, b) =>
    a.fsPath.localeCompare(b.fsPath),
  )) {
    const dir = path.dirname(moduleFile.fsPath);
    // Two modules in the SAME directory would otherwise attribute files to
    // whichever the scan returned last — keep the first (deterministic)
    if (!moduleDirs.has(dir)) {
      moduleDirs.set(dir, path.basename(moduleFile.fsPath, ".module.ts"));
    }
  }

  const nestTypes = getEffectiveNestTypes();
  const results: AggregatedFile[] = [];

  for (const file of allTsFiles) {
    const fileName = path.basename(file.fsPath);

    // Walk up from the file's directory to the nearest module directory
    let dir = path.dirname(file.fsPath);
    let moduleName: string | undefined;
    for (;;) {
      const hit = moduleDirs.get(dir);
      if (hit) {
        moduleName = hit;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    if (!moduleName) {
      continue; // not under any module — same as before
    }

    const matchedType = matchNestType(fileName, nestTypes);
    results.push({
      ...(matchedType ?? {
        suffix: "",
        typeLabel: "File",
        shortcut: "",
        category: "Other Files",
      }),
      uri: file,
      relativePath: vscode.workspace.asRelativePath(file),
      fileName,
      moduleName,
    });
  }

  return results;
}

// ─── QuickPick item builders ──────────────────────────────────────────────────

function buildRouteItems(routes: RouteInfo[]): FileQuickPickItem[] {
  if (routes.length === 0) return [];

  // Group routes by controller file, controllers alphabetical
  const byController = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const list = byController.get(route.controllerFile) ?? [];
    list.push(route);
    byController.set(route.controllerFile, list);
  }

  const items: FileQuickPickItem[] = [
    {
      label: `Routes (${routes.length})`,
      kind: vscode.QuickPickItemKind.Separator,
    },
  ];

  for (const controller of [...byController.keys()].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const list = byController.get(controller)!;
    items.push({
      label: `${controller}  (${list.length})`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    // Sort by HTTP method then path within each controller
    const sorted = [...list].sort((a, b) => {
      const idxA = HTTP_METHOD_ORDER.indexOf(a.httpMethod);
      const idxB = HTTP_METHOD_ORDER.indexOf(b.httpMethod);
      if (idxA !== idxB) return idxA - idxB;
      return a.fullPath.localeCompare(b.fullPath);
    });

    for (const route of sorted) {
      const missingFlag = missingDocsFlag();
      const detail =
        route.summary !== undefined
          ? `L${route.line + 1}  ·  "${route.summary}"`
          : missingFlag
            ? `L${route.line + 1}  ·  ${missingFlag}`
            : `L${route.line + 1}`;
      items.push({
        label: `${route.httpMethod}  ${route.fullPath}   ${route.methodName}()`,
        description: controller,
        detail,
        iconPath: httpMethodIcon(route.httpMethod),
        uri: route.uri,
        line: route.line,
        routePath: route.fullPath,
        httpMethod: route.httpMethod,
        buttons: [
          {
            iconPath: brandIcon("copy"),
            tooltip: `Copy ${route.httpMethod} ${route.fullPath}`,
          },
        ],
      });
    }
  }

  return items;
}

function buildFileItems(files: AggregatedFile[]): FileQuickPickItem[] {
  if (files.length === 0) return [];

  const sorted = [...files].sort((a, b) => {
    const moduleCompare = a.moduleName.localeCompare(b.moduleName);
    if (moduleCompare !== 0) return moduleCompare;
    return a.fileName.localeCompare(b.fileName);
  });

  const items: FileQuickPickItem[] = [];
  let lastModule = "";

  for (const file of sorted) {
    if (file.moduleName !== lastModule) {
      items.push({
        label: file.moduleName,
        kind: vscode.QuickPickItemKind.Separator,
      });
      lastModule = file.moduleName;
    }
    items.push({
      label: file.fileName,
      description: file.typeLabel,
      iconPath: iconForFileName(file.fileName),
      uri: file.uri,
    });
  }

  return items;
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function searchAllModulesCommand() {
  // Fetch routes and files in parallel
  const [routes, files] = await Promise.all([
    collectAllRoutes(),
    collectAllFiles(),
  ]);

  if (routes.length === 0 && files.length === 0) {
    vscode.window.showInformationMessage(await noNestProjectMessage());
    return;
  }

  const routeItems = buildRouteItems(routes);
  const fileItems = buildFileItems(files);
  const allItems = [...routeItems, ...fileItems];

  const totalRoutes = routes.length;
  const totalFiles = files.length;
  const titleParts: string[] = [];
  if (totalRoutes > 0) titleParts.push(`${totalRoutes} routes`);
  if (totalFiles > 0) titleParts.push(`${totalFiles} files`);

  // Use createQuickPick directly so we can handle line-based navigation for routes
  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.items = allItems;
  quickPick.placeholder = `Search routes (e.g. users/:id) and files across all modules — ${routes.length} routes · ${files.length} files`;
  quickPick.title = brandedTitle(`Search All  ·  ${titleParts.join("  ·  ")}`);
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.show();

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      quickPick.dispose();
      resolve();
    };

    quickPick.onDidTriggerItemButton((event) => {
      const { routePath, httpMethod } = event.item;
      if (routePath) {
        const text = httpMethod ? `${httpMethod} ${routePath}` : routePath;
        void vscode.env.clipboard.writeText(text);
      }
    });

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      finish();

      if (!selected?.uri) return;

      const doc = await vscode.workspace.openTextDocument(selected.uri);
      const editor = await vscode.window.showTextDocument(doc);

      // If it's a route item, also navigate to the method line
      if (selected.line !== undefined) {
        const pos = new vscode.Position(selected.line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    });

    quickPick.onDidHide(() => finish());
  });
}
