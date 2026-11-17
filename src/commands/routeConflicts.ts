import * as vscode from "vscode";
import { noNestProjectMessage } from "../utils/nestProject";
import { brandedTitle } from "../utils/quickPickHelpers";
import { collectAllRoutes } from "./searchAllModules";
import { routeConflictsEnabled } from "../utils/config";
import {
  computeRouteConflicts,
  RouteConflict,
} from "../utils/routeConflicts";

const KIND_ICON: Record<RouteConflict["kind"], string> = {
  duplicate: "error",
  shadowed: "eye",
  "verb-overlap": "sync",
  "versioned-twin": "versions",
};

/**
 * Recomputes route conflicts and syncs the Problems-panel entries — no
 * UI. Called by the command AND by extension.ts on controller saves, so
 * warnings stay accurate as routes change (once the user has opted in by
 * running the command at least once — an empty collection stays empty).
 *
 * Returns the number of actionable (non-info) conflicts.
 */
export async function refreshRouteConflictDiagnostics(
  diagnostics: vscode.DiagnosticCollection,
): Promise<number> {
  diagnostics.clear();
  if (!routeConflictsEnabled()) return 0;

  const routes = await collectAllRoutes();
  if (routes.length === 0) return 0;

  const actionable = computeRouteConflicts(routes).filter(
    (c) => c.confidence !== "info",
  );

  for (const conflict of actionable) {
    for (const route of conflict.routes) {
      const diag = new vscode.Diagnostic(
        new vscode.Range(route.line, 0, route.line, 120),
        conflict.message +
          (conflict.knownLimits ? ` (${conflict.knownLimits})` : ""),
        vscode.DiagnosticSeverity.Warning,
      );
      diag.source = "NestJS DevTools";
      diagnostics.set(route.uri, [
        ...(diagnostics.get(route.uri) ?? []),
        diag,
      ]);
    }
  }
  return actionable.length;
}

/**
 * "Diagnose · Route Conflicts" — statically finds duplicate, shadowed and
 * overlapping routes across the workspace (the same class of bug NestJS 12
 * warns about at runtime), as Problems-panel warnings plus a jumpable
 * report grouped per conflict with both handler locations.
 */
export async function routeConflictsCommand(
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  const routes = await collectAllRoutes();
  if (routes.length === 0) {
    diagnostics.clear();
    vscode.window.showInformationMessage(await noNestProjectMessage());
    return;
  }

  if (!routeConflictsEnabled()) {
    diagnostics.clear();
    vscode.window.showInformationMessage(
      "Route conflict detection is disabled — enable nestjs-devtools.diagnostics.routeConflicts to use it.",
    );
    return;
  }

  const actionable = computeRouteConflicts(routes).filter(
    (c) => c.confidence !== "info",
  );

  // Keep the Problems entries in sync with what the report shows
  await refreshRouteConflictDiagnostics(diagnostics);

  if (actionable.length === 0) {
    vscode.window.showInformationMessage(
      `🎉 No route conflicts across ${routes.length} routes`,
    );
    return;
  }

  // Jumpable report, grouped per conflict
  const items: (vscode.QuickPickItem & {
    uri?: vscode.Uri;
    line?: number;
  })[] = [
    {
      label: `$(mirror) ${actionable.length} route conflict${actionable.length === 1 ? "" : "s"} across ${routes.length} routes`,
      description: "shown as warnings in the Problems panel — refresh as you edit",
    },
  ];

  for (const conflict of actionable) {
    const first = conflict.routes[0];
    items.push({
      label: `$(${KIND_ICON[conflict.kind]})  ${first.httpMethod}  ${first.fullPath}`,
      description: `${conflict.kind} · ${conflict.confidence}`,
      detail: conflict.message,
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const route of conflict.routes) {
      items.push({
        label: `${route.httpMethod}  ${route.fullPath}  —  ${route.methodName}()`,
        description: `L${route.line + 1}`,
        detail: vscode.workspace.asRelativePath(route.uri),
        iconPath: new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("editorWarning.foreground"),
        ),
        uri: route.uri,
        line: route.line,
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: brandedTitle("Route Conflicts"),
    placeHolder: "Colliding routes — pick one to open its handler",
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
