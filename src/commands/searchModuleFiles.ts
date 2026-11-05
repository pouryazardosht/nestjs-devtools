import * as path from "path";
import * as vscode from "vscode";
import { getTargetEditor } from "../utils/targetEditor";
import { getEffectiveNestTypes, NestType } from "../constants";
import {
  brandedTitle,
  buildGroupedItems,
  ModuleFile,
  showQuickPickWithShortcuts,
} from "../utils/quickPickHelpers";

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

export async function findAllModuleFiles(
  moduleRoot: string,
): Promise<ModuleFile[]> {
  const allTsFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(moduleRoot, "**/*.ts"),
    "**/node_modules/**",
  );

  // Read effective types fresh each call so settings changes apply
  // immediately without reloading the extension.
  const nestTypes = getEffectiveNestTypes();
  const results: ModuleFile[] = [];

  for (const file of allTsFiles) {
    const relativePath = vscode.workspace.asRelativePath(file);
    const fileName = path.basename(file.fsPath);

    let matchedType: NestType | undefined;
    for (const nestType of nestTypes) {
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
      const found = await vscode.workspace.findFiles(pattern, null, 1);
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

  const fileItems = buildGroupedItems(allFiles);

  // Header shows which module's files are being browsed
  const moduleFile = await vscode.workspace.findFiles(
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
