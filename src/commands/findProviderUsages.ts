import * as vscode from "vscode";

interface UsageItem extends vscode.QuickPickItem {
  location?: vscode.Location;
}

function getExportedClassName(document: vscode.TextDocument): string | null {
  const match = document
    .getText()
    .match(/export\s+(?:abstract\s+)?class\s+([A-Za-z_]\w*)/);
  return match ? match[1] : null;
}

/**
 * Looks like a DI injection:  constructor(private readonly usersService: UsersService)
 */
function looksLikeInjection(text: string, className: string): boolean {
  const escaped = className.replace(/\$/g, "\\$");
  const injectionPattern = new RegExp(
    `(?:private|protected|public)?\\s*(?:readonly\\s+)?[\\w$]+\\s*:\\s*(?:${escaped}\\b)`,
  );
  return injectionPattern.test(text);
}

/**
 * "Find Usages of this provider" — resolves the active file's exported class
 * through the TS language service (symbols + references), so we never scan
 * the workspace ourselves.
 */
export async function findProviderUsagesCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const document = editor.document;
  const className = getExportedClassName(document);
  if (!className) {
    vscode.window.showInformationMessage(
      "❌ No exported class found in this file",
    );
    return;
  }

  const symbols = (await vscode.commands.executeCommand(
    "vscode.executeWorkspaceSymbolProvider",
    className,
  )) as vscode.SymbolInformation[];

  const definition = symbols.find(
    (s) =>
      s.name === className &&
      s.kind === vscode.SymbolKind.Class &&
      s.location.uri.fsPath === document.uri.fsPath,
  );

  if (!definition) {
    vscode.window.showInformationMessage(
      `❌ Couldn't resolve class "${className}" — is the TS server ready?`,
    );
    return;
  }

  const defUri = definition.location.uri;
  const references = (await vscode.commands.executeCommand(
    "vscode.executeReferenceProvider",
    defUri,
    definition.location.range.start,
  )) as vscode.Location[];

  if (!references || references.length === 0) {
    vscode.window.showInformationMessage(`📭 No usages found for ${className}`);
    return;
  }

  // Group references by file, annotate DI injection sites.
  // One openTextDocument per file (cached by VS Code), preview computed once.
  const byFile = new Map<
    string,
    { location: vscode.Location; injection: boolean; preview: string }[]
  >();
  for (const ref of references) {
    // Skip the class declaration itself
    if (
      ref.uri.fsPath === defUri.fsPath &&
      ref.range.start.line === definition.location.range.start.line
    ) {
      continue;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(ref.uri);
      const lineIdx = ref.range.start.line;
      const text = doc.lineAt(lineIdx).text;
      const injection = looksLikeInjection(text, className);
      const trimmed = text.trim();
      const preview = trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
      const key = ref.uri.fsPath;
      const list = byFile.get(key) ?? [];
      list.push({ location: ref, injection, preview });
      byFile.set(key, list);
    } catch {
      // skip unreadable
    }
  }

  if (byFile.size === 0) {
    vscode.window.showInformationMessage(`📭 No usages found for ${className}`);
    return;
  }

  const injectionCount = [...byFile.values()]
    .flat()
    .filter((r) => r.injection).length;

  const items: UsageItem[] = [];
  for (const [fsPath, refs] of [...byFile.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const uri = refs[0].location.uri;
    items.push({
      label: vscode.workspace.asRelativePath(uri),
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const ref of refs) {
      items.push({
        label: ref.injection
          ? `$(link) ${ref.preview}`
          : `$(symbol-reference) ${ref.preview}`,
        description: `L${ref.location.range.start.line + 1}`,
        detail: ref.injection ? "injected via constructor" : undefined,
        location: ref.location,
      });
    }
  }

  const titleParts = [`${byFile.size} file${byFile.size === 1 ? "" : "s"}`];
  if (injectionCount > 0) {
    titleParts.push(`${injectionCount} injected`);
  }

  const quickPick = vscode.window.createQuickPick<UsageItem>();
  quickPick.title = `Usages of ${className}  ·  ${titleParts.join("  ·  ")}`;
  quickPick.placeholder = "Filter by file or code line…";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.items = items;
  quickPick.show();

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      quickPick.dispose();
      resolve();
    };

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      finish();
      if (selected?.location) {
        vscode.window.showTextDocument(selected.location.uri, {
          selection: selected.location.range,
        });
      }
    });

    quickPick.onDidHide(() => finish());
  });
}
