import * as path from "path";
import * as vscode from "vscode";
import { getTargetEditor } from "../utils/targetEditor";
import { matchNestType, getEffectiveNestTypes } from "../constants";
import {
  brandedTitle,
  buildGroupedItems,
  ModuleFile,
  showQuickPickWithShortcuts,
} from "../utils/quickPickHelpers";
import { getExcludeGlob } from "../utils/config";
import { findFilesSafe } from "../utils/scan";
import { findDirectNestedModules, isInsideAnyDir } from "../utils/moduleDirs";

export async function findAllModuleFiles(
  moduleRoot: string,
): Promise<ModuleFile[]> {
  const allTsFiles = await findFilesSafe(
    new vscode.RelativePattern(moduleRoot, "**/*.ts"),
    getExcludeGlob(),
  );

  // Read effective types fresh each call so settings changes apply
  // immediately without reloading the extension.
  const nestTypes = getEffectiveNestTypes();
  const results: ModuleFile[] = [];

  for (const file of allTsFiles) {
    const relativePath = vscode.workspace.asRelativePath(file);
    const fileName = path.basename(file.fsPath);
    const matchedType = matchNestType(fileName, nestTypes);

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
  // Falls back to the last focused editor when a sidebar view has focus.
  // With no editor at all (e.g. launched from the hub), browse all modules.
  const editor = getTargetEditor();
  if (!editor) {
    await vscode.commands.executeCommand("nestjs-log-helper.moduleSearcher");
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
      const found = await findFilesSafe(pattern, null, 1);
      if (found.length > 0) {
        moduleRoot = dir;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
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

  // Show only the module's OWN files — files inside nested modules belong
  // to the nested module (matches the tree and the CodeLens counts; the
  // 0.1.2 changelog promised this but only Browse Modules honored it)
  const nestedModuleDirs = await findDirectNestedModules(moduleRoot);
  const ownFiles = allFiles.filter((file) => {
    const fileDir = path.dirname(file.uri.fsPath);
    return !isInsideAnyDir(fileDir, nestedModuleDirs);
  });

  if (ownFiles.length === 0) {
    vscode.window.showInformationMessage(
      "📁 No TypeScript files found in this module.",
    );
    return;
  }

  const fileItems = buildGroupedItems(ownFiles);

  // Header shows which module's files are being browsed
  const moduleFile = await findFilesSafe(
    new vscode.RelativePattern(moduleRoot, "*.module.ts"),
    null,
    1,
  );
  const moduleName = moduleFile[0]
    ? path.basename(moduleFile[0].fsPath, ".module.ts")
    : "module";

  const selection = await showQuickPickWithShortcuts(
    fileItems,
    "All files in this module. Type shortcut to open instantly.",
    brandedTitle(`${moduleName} · module files`),
  );

  if (selection?.uri) {
    const doc = await vscode.workspace.openTextDocument(selection.uri);
    await vscode.window.showTextDocument(doc);
  }
}
