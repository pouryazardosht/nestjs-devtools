import * as path from "path";
import * as vscode from "vscode";
import { NEST_TYPES } from "../constants";

// Custom QuickPickItem that holds the shortcut and URI
interface FileQuickPickItem extends vscode.QuickPickItem {
  shortcut: string;
  uri: vscode.Uri;
}

export async function moduleSearcherCommand() {
  // 1. Find all *.module.ts files
  const moduleFiles = await vscode.workspace.findFiles(
    "**/*.module.ts",
    "**/node_modules/**",
  );
  if (!moduleFiles.length) {
    vscode.window.showInformationMessage("📁 No NestJS modules found.");
    return;
  }

  // 2. Build module items (styled)
  const moduleItems = moduleFiles.map((file) => {
    const relativePath = vscode.workspace.asRelativePath(file);
    const base = path.basename(relativePath, ".module.ts");
    const dir = path.dirname(relativePath) || ".";
    return {
      label: `📦 ${base}`,
      description: dir,
      file,
      base,
    };
  });
  moduleItems.sort((a, b) => a.label.localeCompare(b.label));

  const selectedModule = await vscode.window.showQuickPick(moduleItems, {
    placeHolder: "Select a NestJS module…",
    matchOnDescription: true,
  });
  if (!selectedModule) return;

  // 3. Find related files with the same base name
  const base = selectedModule.base;
  const moduleDir = path.dirname(selectedModule.file.fsPath);
  const relatedFiles: {
    typeLabel: string;
    shortcut: string;
    emoji: string;
    uri: vscode.Uri;
    relativePath: string;
  }[] = [];

  for (const nestType of NEST_TYPES) {
    // Try same directory first
    const pattern = new vscode.RelativePattern(
      moduleDir,
      `${base}.${nestType.suffix}.ts`,
    );
    const found = await vscode.workspace.findFiles(pattern, null, 1);
    if (found.length > 0) {
      relatedFiles.push({
        ...nestType,
        uri: found[0],
        relativePath: vscode.workspace.asRelativePath(found[0]),
      });
    } else {
      // Fallback: search entire workspace
      const globalPattern = `**/${base}.${nestType.suffix}.ts`;
      const globalFound = await vscode.workspace.findFiles(
        globalPattern,
        "**/node_modules/**",
        1,
      );
      if (globalFound.length > 0) {
        relatedFiles.push({
          ...nestType,
          uri: globalFound[0],
          relativePath: vscode.workspace.asRelativePath(globalFound[0]),
        });
      }
    }
  }

  if (!relatedFiles.length) {
    vscode.window.showInformationMessage(
      `📁 No related files found for "${base}".`,
    );
    return;
  }

  // 4. Build QuickPick items for files (beautiful UI)
  const fileItems: FileQuickPickItem[] = relatedFiles.map((f) => ({
    label: `${f.emoji}  (${f.shortcut.toUpperCase()}) ${f.typeLabel}`,
    description: f.relativePath,
    shortcut: f.shortcut,
    uri: f.uri,
  }));

  // 5. Custom QuickPick with instant shortcut handling
  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.items = fileItems;
  quickPick.placeholder = `Files of "${base}". Type a shortcut (e.g. S for Service) to open instantly…`;
  quickPick.matchOnDescription = true;

  // Show the pick and wait for user action
  quickPick.show();

  // We'll resolve the URI once the user chooses a file
  const selectedUri = await new Promise<vscode.Uri | undefined>((resolve) => {
    // Handle normal selection (Enter / click)
    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      resolve(selected?.uri);
      quickPick.hide();
    });

    // Handle shortcut keypress (instant open)
    quickPick.onDidChangeValue((value) => {
      const trimmed = value.trim().toLowerCase();
      if (trimmed.length === 0) return;

      // Find the item whose shortcut matches the current input
      const match = fileItems.find(
        (item) => item.shortcut.toLowerCase() === trimmed,
      );
      if (match) {
        resolve(match.uri);
        quickPick.hide();
      }
      // If no match yet, the user might still be typing (e.g. "gw" for gateway)
      // so we do nothing and let the filter continue
    });

    // If the user closes the pick without choosing
    quickPick.onDidHide(() => {
      resolve(undefined);
    });
  });

  quickPick.dispose();

  // 6. Open the selected file
  if (selectedUri) {
    const doc = await vscode.workspace.openTextDocument(selectedUri);
    await vscode.window.showTextDocument(doc);
  }
}
