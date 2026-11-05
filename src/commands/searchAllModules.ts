import * as path from "path";
import * as vscode from "vscode";
import {
  FileQuickPickItem,
  iconForFileName,
  ModuleFile,
} from "../utils/quickPickHelpers";
import {
  getControllerPrefix,
  HTTP_DECORATORS,
  HTTP_METHOD_ORDER,
  httpMethodIcon,
  isBalanced,
} from "../utils/routeUtils";
import { findAllModuleFiles } from "./searchModuleFiles";

// ─── Route extraction ────────────────────────────────────────────────────────

interface RouteInfo {
  httpMethod: string;
  fullPath: string;
  methodName: string;
  line: number;
  controllerFile: string;
  uri: vscode.Uri;
}

function extractRoutes(uri: vscode.Uri, text: string): RouteInfo[] {
  const lines = text.split("\n");
  const controllerPrefix = getControllerPrefix(text);
  const routes: RouteInfo[] = [];

  let pendingDecorators: { name: string; full: string }[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      i++;
      continue;
    }

    const decoratorMatch = trimmed.match(/^@([\w]+)(\(.*)?/);
    if (decoratorMatch) {
      const name = decoratorMatch[1];
      let full = trimmed;
      // Handle multi-line decorator args
      if (decoratorMatch[2] && !isBalanced(decoratorMatch[2])) {
        let j = i + 1;
        while (j < lines.length) {
          full += " " + lines[j].trim();
          if (isBalanced(full.slice(full.indexOf("(")))) break;
          j++;
        }
      }
      pendingDecorators.push({ name, full });
      i++;
      continue;
    }

    // Check if any pending decorator is an HTTP decorator
    const httpDecorator = pendingDecorators.find((d) =>
      HTTP_DECORATORS.has(d.name),
    );

    if (httpDecorator) {
      // Look ahead to get the method name
      const lookahead = lines
        .slice(i, Math.min(i + 6, lines.length))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const methodMatch = lookahead.match(
        /(?:public|private|protected)?\s*(?:async\s+)?([\w]+)\s*\(/,
      );

      if (methodMatch) {
        const methodName = methodMatch[1];
        const skipKeywords = [
          "if",
          "for",
          "while",
          "switch",
          "catch",
          "constructor",
          "class",
          "function",
        ];

        if (!skipKeywords.includes(methodName)) {
          const httpMethod = httpDecorator.name.toUpperCase();

          // Extract route path from decorator
          const pathMatch = httpDecorator.full.match(
            /@(?:\w+)\s*\(\s*['"`]([^'"`]*)['"`]/,
          );
          const noArgMatch = httpDecorator.full.match(/@(?:\w+)\s*\(\s*\)/);

          let routePath = "";
          if (pathMatch) {
            routePath = pathMatch[1].replace(/^\//, "");
          }

          const fullPath = routePath
            ? `${controllerPrefix}/${routePath}`
            : controllerPrefix || "/";

          routes.push({
            httpMethod,
            fullPath,
            methodName,
            line: i,
            controllerFile: path.basename(uri.fsPath),
            uri,
          });
        }
      }

      pendingDecorators = [];
      i++;
      continue;
    }

    // Clear decorators if line doesn't look like a method
    if (
      trimmed !== "{" &&
      trimmed !== "}" &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*")
    ) {
      pendingDecorators = [];
    }

    i++;
  }

  return routes;
}

async function collectAllRoutes(): Promise<RouteInfo[]> {
  const controllerFiles = await vscode.workspace.findFiles(
    "**/*.controller.ts",
    "**/node_modules/**",
  );

  const routes: RouteInfo[] = [];

  for (const uri of controllerFiles) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fileRoutes = extractRoutes(uri, doc.getText());
      routes.push(...fileRoutes);
    } catch {
      // skip unreadable files
    }
  }

  return routes;
}

// ─── File collection (existing logic) ────────────────────────────────────────

interface AggregatedFile extends ModuleFile {
  moduleName: string;
}

async function collectAllFiles(): Promise<AggregatedFile[]> {
  const moduleFiles = await vscode.workspace.findFiles(
    "**/*.module.ts",
    "**/node_modules/**",
  );

  const results: AggregatedFile[] = [];
  const seenPaths = new Set<string>();

  for (const moduleFile of moduleFiles) {
    const moduleDir = path.dirname(moduleFile.fsPath);
    const moduleName = path.basename(moduleFile.fsPath, ".module.ts");
    const files = await findAllModuleFiles(moduleDir);

    for (const file of files) {
      if (seenPaths.has(file.uri.fsPath)) continue;
      seenPaths.add(file.uri.fsPath);
      results.push({ ...file, moduleName });
    }
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
      items.push({
        label: `${route.httpMethod}  ${route.fullPath}   ${route.methodName}()`,
        description: controller,
        detail: `L${route.line + 1}`,
        iconPath: httpMethodIcon(route.httpMethod),
        uri: route.uri,
        line: route.line,
        routePath: route.fullPath,
        httpMethod: route.httpMethod,
        buttons: [
          {
            iconPath: new vscode.ThemeIcon("copy"),
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
    vscode.window.showInformationMessage("📁 No NestJS module files found.");
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
  quickPick.title = `Search All  ·  ${titleParts.join("  ·  ")}`;
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
