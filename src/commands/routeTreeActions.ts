import * as path from "path";
import * as vscode from "vscode";
import { routesBaseUrl } from "../utils/config";
import { getGlobalPrefix } from "../utils/globalPrefix";
import {
  extractRoutes,
  HTTP_METHOD_ORDER,
  withGlobalPrefix,
} from "../utils/routeUtils";
import { readTextFile } from "../utils/scan";

/**
 * Copy actions for the Routes tree context menu. (Hover buttons on tree
 * rows are proposed-only API in the supported VS Code versions, so these
 * surface as right-click menu entries instead.)
 *
 * The tree passes its item as the command argument — the shape is read
 * duck-typed to avoid a dependency on the provider module.
 */
interface RouteTreeArgs {
  route?: {
    httpMethod: string;
    fullPath: string;
    methodName: string;
  };
  controllerPath?: string;
}

function routeOf(arg: unknown) {
  return (arg as RouteTreeArgs | undefined)?.route;
}

function fullUrl(route: { httpMethod: string; fullPath: string }): string {
  const base = routesBaseUrl().replace(/\/+$/, "");
  return base + route.fullPath;
}

function copy(text: string, what: string): void {
  void vscode.env.clipboard.writeText(text);
  vscode.window.setStatusBarMessage(`📋 Copied ${what}`, 2000);
}

/** "Copy Route" — e.g. `GET /api/v2/users/:id`. */
export function copyRouteCommand(arg?: unknown): void {
  const route = routeOf(arg);
  if (!route) return;
  copy(`${route.httpMethod} ${route.fullPath}`, "route");
}

/** "Copy Full URL" — baseUrl + global prefix + version + path. */
export function copyRouteUrlCommand(arg?: unknown): void {
  const route = routeOf(arg);
  if (!route) return;
  copy(fullUrl(route), "URL");
}

/** "Copy as cURL" — `curl -X GET 'url'` (+ JSON header for body verbs). */
export function copyRouteCurlCommand(arg?: unknown): void {
  const route = routeOf(arg);
  if (!route) return;
  const hasBody = route.httpMethod !== "GET" && route.httpMethod !== "HEAD";
  const parts = [`curl -X ${route.httpMethod} '${fullUrl(route)}'`];
  if (hasBody) {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '{}'`);
  }
  copy(parts.join(" "), "cURL");
}

/** "Copy All Routes" on a controller row — every route of that file. */
export async function copyControllerRoutesCommand(arg?: unknown): Promise<void> {
  const controllerPath = (arg as RouteTreeArgs | undefined)?.controllerPath;
  if (!controllerPath) return;

  const uri = vscode.Uri.file(controllerPath);
  const [text, prefix] = await Promise.all([
    readTextFile(uri),
    getGlobalPrefix(),
  ]);
  if (text === undefined) return;

  const routes = extractRoutes(uri, text)
    .map((r) => ({ ...r, fullPath: withGlobalPrefix(prefix, r.fullPath) }))
    .sort((a, b) => {
      const idxA = HTTP_METHOD_ORDER.indexOf(a.httpMethod);
      const idxB = HTTP_METHOD_ORDER.indexOf(b.httpMethod);
      if (idxA !== idxB) return idxA - idxB;
      return a.fullPath.localeCompare(b.fullPath);
    });

  if (routes.length === 0) {
    vscode.window.showInformationMessage(
      "📭 No routes found in this controller",
    );
    return;
  }

  const name = path.basename(controllerPath);
  copy(
    routes.map((r) => `${r.httpMethod} ${r.fullPath}`).join("\n"),
    `${routes.length} route${routes.length === 1 ? "" : "s"} from ${name}`,
  );
}
