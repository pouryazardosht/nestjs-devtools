import * as vscode from "vscode";
import { noNestProjectMessage } from "../utils/nestProject";
import { brandedTitle } from "../utils/quickPickHelpers";
import { httpMethodIcon, RouteInfo } from "../utils/routeUtils";
import { collectAllRoutes } from "./searchAllModules";

/**
 * "Diagnose · API Docs Coverage" — lists every route that is missing an
 * @ApiOperation summary, grouped by controller, with jump-to-line.
 */
export async function apiDocsCoverageCommand(): Promise<void> {
  const routes = await collectAllRoutes();
  if (routes.length === 0) {
    vscode.window.showInformationMessage(await noNestProjectMessage());
    return;
  }

  const missing = routes.filter((r) => r.summary === undefined);
  if (missing.length === 0) {
    vscode.window.showInformationMessage(
      `🎉 All ${routes.length} routes have an @ApiOperation summary`,
    );
    return;
  }

  const documented = routes.length - missing.length;
  const percent = Math.round((documented / routes.length) * 100);

  // Group by controller, alphabetical
  const byController = new Map<string, RouteInfo[]>();
  for (const route of missing) {
    const list = byController.get(route.controllerFile) ?? [];
    list.push(route);
    byController.set(route.controllerFile, list);
  }

  interface MissingItem extends vscode.QuickPickItem {
    uri?: vscode.Uri;
    line?: number;
  }

  const items: MissingItem[] = [
    {
      label: `${missing.length} of ${routes.length} routes missing @ApiOperation (${percent}% documented)`,
      description: "pick a route to jump to its handler",
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
    for (const route of list) {
      items.push({
        label: `${route.httpMethod}  ${route.fullPath}  —  ${route.methodName}()`,
        description: `L${route.line + 1}`,
        iconPath: httpMethodIcon(route.httpMethod),
        uri: route.uri,
        line: route.line,
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: brandedTitle("API Docs Coverage"),
    placeHolder: "Routes missing @ApiOperation — pick one to open the handler",
  });

  if (picked?.uri && picked.line !== undefined) {
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    const editor = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(picked.line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenter,
    );
  }
}
