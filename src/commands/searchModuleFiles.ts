import * as path from "path";
import * as vscode from "vscode";
import { NEST_TYPES, NestType } from "../constants";
import {
  buildGroupedItems,
  ModuleFile,
  showQuickPickWithShortcuts,
} from "../utils/quickPickHelpers";

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
): Promise<ModuleFile[]> {
  const allTsFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(moduleRoot, "**/*.ts"),
    "**/node_modules/**",
  );

  const results: ModuleFile[] = [];

  for (const file of allTsFiles) {
    const relativePath = vscode.workspace.asRelativePath(file);
    const fileName = path.basename(file.fsPath);

    let matchedType: NestType | undefined;

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

export async function searchModuleFilesCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const currentFilePath = editor.document.uri.fsPath;
  let currentDir = path.dirname(currentFilePath);

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

  const allFiles = await findAllModuleFiles(moduleRoot);

  if (allFiles.length === 0) {
    vscode.window.showInformationMessage(
      "📁 No TypeScript files found in this module.",
    );
    return;
  }

  const fileItems = buildGroupedItems(allFiles);

  const selection = await showQuickPickWithShortcuts(
    fileItems,
    "All files in this module. Type shortcut to open instantly.",
  );

  if (selection?.uri) {
    const doc = await vscode.workspace.openTextDocument(selection.uri);
    await vscode.window.showTextDocument(doc);
  }
}
