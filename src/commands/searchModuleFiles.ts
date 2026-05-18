import * as path from "path";
import * as vscode from "vscode";
import { NEST_TYPES, NestType } from "../constants";

/**
 * Returns possible file‑name suffixes for a NestJS type.
 * For types that often appear in plural form, we add an 's' variant.
 */
function getPossibleSuffixes(nestType: NestType): string[] {
  const pluralTypes = [
    "guard",
    "gateway",
    "interceptor",
    "pipe",
    "filter",
    "decorator",
    "resolver",
    "middleware",
    "strategy",
  ];
  if (pluralTypes.includes(nestType.suffix)) {
    return [nestType.suffix, nestType.suffix + "s"];
  }
  return [nestType.suffix];
}

/**
 * Finds ALL .ts files under the module root directory,
 * categorises them by known NestJS suffixes.
 */
export async function findAllModuleFiles(
  moduleRoot: string,
): Promise<
  (NestType & { uri: vscode.Uri; relativePath: string; fileName: string })[]
> {
  const allTsFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(moduleRoot, "**/*.ts"),
    "**/node_modules/**",
  );

  const results: (NestType & {
    uri: vscode.Uri;
    relativePath: string;
    fileName: string;
  })[] = [];

  for (const file of allTsFiles) {
    const relativePath = vscode.workspace.asRelativePath(file);
    const fileName = path.basename(file.fsPath);

    let matchedType: NestType | undefined;

    // Try to match a known NestJS type by any of its possible suffixes
    for (const nestType of NEST_TYPES) {
      const suffixes = getPossibleSuffixes(nestType);
      if (suffixes.some((suffix) => fileName.endsWith(`.${suffix}.ts`))) {
        matchedType = nestType;
        break;
      }
    }

    if (matchedType) {
      results.push({
        ...matchedType,
        uri: file,
        relativePath,
        fileName,
      });
    } else {
      // Unknown type → "Other Files"
      results.push({
        suffix: "",
        typeLabel: "File",
        shortcut: "",
        emoji: "📄",
        category: "Other Files",
        uri: file,
        relativePath,
        fileName,
      });
    }
  }

  return results;
}

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

export async function searchModuleFilesCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const currentFilePath = editor.document.uri.fsPath;
  let currentDir = path.dirname(currentFilePath);

  // Walk up to find the module root (where the .module.ts lives)
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let moduleRoot = currentDir;
  if (workspaceRoot) {
    let dir = currentDir;
    while (dir.startsWith(workspaceRoot)) {
      const pattern = new vscode.RelativePattern(dir, "*.module.ts");
      const found = await vscode.workspace.findFiles(pattern, null, 1);
      if (found.length > 0) {
        moduleRoot = dir;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  // Find all files inside the module
  const allFiles = await findAllModuleFiles(moduleRoot);

  if (allFiles.length === 0) {
    vscode.window.showInformationMessage(
      "📁 No TypeScript files found in this module.",
    );
    return;
  }

  const fileItems = buildGroupedItems(allFiles);

  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.items = fileItems;
  quickPick.placeholder = `All files in this module. Type shortcut to open instantly.`;
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
