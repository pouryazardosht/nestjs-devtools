import * as path from "path";
import * as vscode from "vscode";
import { noNestProjectMessage } from "../utils/nestProject";
import { brandIcon, brandedTitle } from "../utils/quickPickHelpers";
import {
  BreadcrumbEntry,
  buildGroupedItems,
  NestedModuleInfo,
  showQuickPickWithShortcuts,
} from "../utils/quickPickHelpers";
import { getExcludeGlob } from "../utils/config";
import { findFilesSafe } from "../utils/scan";
import { findDirectNestedModules } from "../utils/moduleDirs";
import { findAllModuleFiles } from "./searchModuleFiles";

async function findNestedModules(
  moduleDir: string,
): Promise<NestedModuleInfo[]> {
  // The nested-module discovery itself is shared (utils/moduleDirs) so the
  // picker, the tree and the CodeLens counts agree; only the per-subtree
  // file counts are picker-specific. One scan pair for the whole subtree.
  const [nestedDirs, allTsFiles] = await Promise.all([
    findDirectNestedModules(moduleDir),
    findFilesSafe(
      new vscode.RelativePattern(moduleDir, "**/*.ts"),
      getExcludeGlob(),
    ),
  ]);

  const underDir = (dir: string): number =>
    allTsFiles.filter((f) => {
      const d = path.dirname(f.fsPath);
      return d === dir || d.startsWith(dir + path.sep);
    }).length;

  return nestedDirs.map((mod) => ({
    uri: mod.uri,
    dir: mod.dir,
    base: mod.base,
    fileCount: underDir(mod.dir),
  }));
}

function buildBreadcrumbTitle(
  stack: BreadcrumbEntry[],
  current: string,
): string {
  const trail = [...stack.map((s) => s.label), current];
  return brandedTitle(trail.join("  ›  "));
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
    // Use the module FILE's base name for the breadcrumb — the directory
    // name can differ (e.g. admin/ containing settings.module.ts)
    const moduleBase = selection.moduleBase ?? path.basename(selection.moduleDir);
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
  const moduleFiles = await findFilesSafe("**/*.module.ts", getExcludeGlob());
  if (!moduleFiles.length) {
    vscode.window.showInformationMessage(await noNestProjectMessage());
    return;
  }

  const moduleItems = moduleFiles.map((file) => {
    const relativePath = vscode.workspace.asRelativePath(file);
    const base = path.basename(relativePath, ".module.ts");
    const dir = path.dirname(relativePath) || ".";
    return {
      label: base, // no emoji prefix
      description: dir,
      iconPath: brandIcon("package"),
      file,
      base,
    };
  });
  moduleItems.sort((a, b) => a.label.localeCompare(b.label));

  const selectedModule = await vscode.window.showQuickPick(moduleItems, {
    title: brandedTitle("NestJS Modules"),
    placeHolder: "Select a module to browse…",
    matchOnDescription: true,
  });
  if (!selectedModule) return;

  const moduleDir = path.dirname(selectedModule.file.fsPath);
  await exploreModule(moduleDir, selectedModule.base, []);
}
