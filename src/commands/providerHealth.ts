import * as vscode from "vscode";
import {
  findProviderClasses,
  getRegistrationIndex,
} from "../utils/nestIndex";
import { getTargetEditor } from "../utils/targetEditor";
import { brandIcon, brandedTitle } from "../utils/quickPickHelpers";

/**
 * "Diagnose · Provider Health" — finds @Injectable/@Controller/... classes
 * that no module registers and surfaces them as workspace diagnostics
 * (Problems panel) plus a jumpable report.
 */
export async function checkProviderHealthCommand(
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  const [providers, registrations] = await Promise.all([
    findProviderClasses(),
    getRegistrationIndex(),
  ]);

  const orphans = providers.filter((p) => !registrations.has(p.className));

  diagnostics.clear();
  for (const orphan of orphans) {
    const range = new vscode.Range(orphan.line, 0, orphan.line, 120);
    const diag = new vscode.Diagnostic(
      range,
      `${orphan.className} (${orphan.decorator}) is not registered in any module's providers/controllers — it can't be injected.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.source = "NestJS DevTools";
    diagnostics.set(orphan.uri, [
      ...(diagnostics.get(orphan.uri) ?? []),
      diag,
    ]);
  }

  if (orphans.length === 0) {
    vscode.window.showInformationMessage(
      `🎉 All ${providers.length} decorated classes are registered in a module`,
    );
    return;
  }

  // Jumpable report
  const byFile = new Map<string, typeof orphans>();
  for (const o of orphans) {
    const list = byFile.get(o.uri.fsPath) ?? [];
    list.push(o);
    byFile.set(o.uri.fsPath, list);
  }

  const items: (vscode.QuickPickItem & { uri?: vscode.Uri; line?: number })[] =
    [
      {
        label: `$(checklist) ${orphans.length} unregistered provider${orphans.length === 1 ? "" : "s"} in ${byFile.size} file${byFile.size === 1 ? "" : "s"}`,
        description: "shown as warnings in the Problems panel",
        kind: vscode.QuickPickItemKind.Default,
      },
    ];
  for (const [, list] of [...byFile.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    items.push({
      label: vscode.workspace.asRelativePath(list[0].uri),
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const o of list) {
      items.push({
        label: `${o.className}`,
        description: `@${o.decorator}`,
        detail: `L${o.line + 1}`,
        iconPath: brandIcon("warning"),
        uri: o.uri,
        line: o.line,
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: brandedTitle("Provider Health"),
    placeHolder: "Classes no module registers — pick one to open it",
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

function getActiveClassName(document: vscode.TextDocument): string | null {
  const match = document
    .getText()
    .match(/export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
  return match ? match[1] : null;
}

/**
 * "Navigate · Providing Module" — from inside a provider file, jump to
 * the module that registers its class.
 */
export async function goToProvidingModuleCommand(): Promise<void> {
  const editor = getTargetEditor();
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const className = getActiveClassName(editor.document);
  if (!className) {
    vscode.window.showInformationMessage(
      "❌ No exported class found in this file",
    );
    return;
  }

  const registrations = await getRegistrationIndex();
  const targets = [...registrations.entries()].filter(
    ([name]) => name === className,
  );

  if (targets.length === 0) {
    vscode.window.showInformationMessage(
      `📭 No module registers ${className} — run "Diagnose · Provider Health" for details`,
    );
    return;
  }

  const picked =
    targets.length === 1
      ? targets[0]
      : (
          await vscode.window.showQuickPick(
            targets.map(([name, reg]) => ({
              label: reg.moduleName,
              description: vscode.workspace.asRelativePath(reg.uri),
              entry: [name, reg] as const,
            })),
            { title: brandedTitle(`${className} is registered in ${targets.length} modules`) },
          )
        )?.entry;

  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked[1].uri);
    await vscode.window.showTextDocument(doc);
  }
}
