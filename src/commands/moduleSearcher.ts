import * as path from "path";
import * as vscode from "vscode";
import {
  BreadcrumbEntry,
  buildGroupedItems,
  NestedModuleInfo,
  showQuickPickWithShortcuts,
} from "../utils/quickPickHelpers";
import { findAllModuleFiles } from "./searchModuleFiles";

async function findNestedModules(
  moduleDir: string,
): Promise<NestedModuleInfo[]> {
  const allModuleFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(moduleDir, "**/*.module.ts"),
    "**/node_modules/**",
  );

  const nestedDirs: { uri: vscode.Uri; dir: string }[] = [];
  const sorted = [...allModuleFiles]
    .filter((file) => path.dirname(file.fsPath) !== moduleDir)
    .sort((a, b) => a.fsPath.length - b.fsPath.length);

  for (const file of sorted) {
    const dir = path.dirname(file.fsPath);
    const isInsideExisting = nestedDirs.some((m) =>
      dir.startsWith(m.dir + path.sep),
    );
    if (isInsideExisting) continue;
    nestedDirs.push({ uri: file, dir });
  }

  const result: NestedModuleInfo[] = [];
  for (const mod of nestedDirs) {
    const files = await findAllModuleFiles(mod.dir);
    result.push({
      uri: mod.uri,
      dir: mod.dir,
      base: path.basename(mod.uri.fsPath, ".module.ts"),
      fileCount: files.length,
    });
  }

  return result;
}

function buildBreadcrumbTitle(
  stack: BreadcrumbEntry[],
  current: string,
): string {
  const trail = [...stack.map((s) => s.label), current];
  return trail.join("  ›  ");
}

async function exploreModule(
  moduleDir: string,
  label: string,
  stack: BreadcrumbEntry[],
): Promise<void> {
  const [allFiles, nestedModules] = await Promise.all([
    findAllModuleFiles(moduleDir),
    findNestedModules(moduleDir),
  ]);

  const ownFiles = allFiles.filter((file) => {
    const fileDir = path.dirname(file.uri.fsPath);
    return !nestedModules.some(
      (mod) => fileDir === mod.dir || fileDir.startsWith(mod.dir + path.sep),
    );
  });

  const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;

  if (ownFiles.length === 0 && nestedModules.length === 0 && !parent) {
    vscode.window.showInformationMessage("📁 No files found in this module.");
    return;
  }

  const items = buildGroupedItems(ownFiles, nestedModules, parent);
  const totalCount = ownFiles.length + nestedModules.length;

  const selection = await showQuickPickWithShortcuts(
    items,
    `${totalCount} item${totalCount === 1 ? "" : "s"} · type a shortcut to jump straight to a file`,
    buildBreadcrumbTitle(stack, label),
  );

  if (!selection) return;

  if (selection.isBack) {
    const newStack = stack.slice(0, -1);
    const target = stack[stack.length - 1];
    await exploreModule(target.dir, target.label, newStack);
    return;
  }

  if (selection.isModule && selection.moduleDir) {
    const moduleBase = path.basename(selection.moduleDir);
    await exploreModule(selection.moduleDir, moduleBase, [
      ...stack,
      { dir: moduleDir, label },
    ]);
    return;
  }

  if (selection.uri) {
    const doc = await vscode.workspace.openTextDocument(selection.uri);
    await vscode.window.showTextDocument(doc);
  }
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
      label: base,
      description: dir,
      iconPath: new vscode.ThemeIcon("package"),
      file,
      base,
    };
  });
  moduleItems.sort((a, b) => a.label.localeCompare(b.label));

  const selectedModule = await vscode.window.showQuickPick(moduleItems, {
    title: "NestJS Modules",
    placeHolder: "Select a module to browse…",
    matchOnDescription: true,
  });
  if (!selectedModule) return;

  const moduleDir = path.dirname(selectedModule.file.fsPath);
  await exploreModule(moduleDir, selectedModule.base, []);
}
