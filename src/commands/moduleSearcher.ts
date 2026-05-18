import * as path from "path";
import * as vscode from "vscode";
import { NestType } from "../constants";
import { findAllModuleFiles } from "./searchModuleFiles";

interface FileQuickPickItem extends vscode.QuickPickItem {
  shortcut?: string;
  uri?: vscode.Uri;
}

function buildGroupedItems(
  files: (NestType & {
    uri: vscode.Uri;
    relativePath: string;
    fileName: string;
  })[],
): FileQuickPickItem[] {
  const categoryOrder = [
    "Core NestJS",
    "Entities",
    "DTOs",
    "Enums",
    "Interfaces",
    "Other",
    "Other Files",
  ];

  const sorted = files.sort((a, b) => {
    const idxA = categoryOrder.indexOf(a.category);
    const idxB = categoryOrder.indexOf(b.category);
    if (idxA === -1) {
      return 1;
    }
    if (idxB === -1) {
      return -1;
    }
    return idxA - idxB;
  });

  const items: FileQuickPickItem[] = [];
  let lastCategory = "";

  for (const file of sorted) {
    if (file.category !== lastCategory) {
      items.push({
        label: `── ${file.category} ──`,
        kind: vscode.QuickPickItemKind.Separator,
      });
      lastCategory = file.category;
    }

    const shortcutHint = file.shortcut
      ? ` (${file.shortcut.toUpperCase()})`
      : "";
    items.push({
      label: `${file.emoji}  ${file.fileName}`,
      description: `${file.typeLabel}${shortcutHint}  |  ${file.relativePath}`,
      shortcut: file.shortcut || undefined,
      uri: file.uri,
    });
  }

  return items;
}

export async function moduleSearcherCommand() {
  const moduleFiles = await vscode.workspace.findFiles(
    "**/*.module.ts",
    "**/node_modules/**",
  );
  if (!moduleFiles.length) {
    vscode.window.showInformationMessage("📁 No NestJS modules found.");
    return;
  }

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
  if (!selectedModule) {
    return;
  }

  const moduleDir = path.dirname(selectedModule.file.fsPath);
  const allFiles = await findAllModuleFiles(moduleDir);

  if (allFiles.length === 0) {
    vscode.window.showInformationMessage("📁 No files found in this module.");
    return;
  }

  const fileItems = buildGroupedItems(allFiles);

  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.items = fileItems;
  quickPick.placeholder = `All files in "${selectedModule.base}". Type shortcut to open instantly.`;
  quickPick.matchOnDescription = true;
  quickPick.show();

  const selectedUri = await new Promise<vscode.Uri | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      resolve(selected.uri);
      quickPick.hide();
    });

    quickPick.onDidChangeValue((value) => {
      const trimmed = value.trim().toLowerCase();
      if (trimmed.length === 0) {
        return;
      }
      const match = fileItems.find(
        (item) => item.shortcut && item.shortcut.toLowerCase() === trimmed,
      );
      if (match) {
        resolve(match.uri);
        quickPick.hide();
      }
    });

    quickPick.onDidHide(() => resolve(undefined));
  });

  quickPick.dispose();

  if (selectedUri) {
    const doc = await vscode.workspace.openTextDocument(selectedUri);
    await vscode.window.showTextDocument(doc);
  }
}
