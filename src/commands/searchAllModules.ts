import * as path from "path";
import * as vscode from "vscode";
import {
  FileQuickPickItem,
  ModuleFile,
  showQuickPickWithShortcuts,
} from "../utils/quickPickHelpers";
import { findAllModuleFiles } from "./searchModuleFiles";

interface AggregatedFile extends ModuleFile {
  moduleName: string;
}

async function collectAllFiles(): Promise<AggregatedFile[]> {
  const moduleFiles = await vscode.workspace.findFiles(
    "**/*.module.ts",
    "**/node_modules/**",
  );

  const results: AggregatedFile[] = [];
  const seenPaths = new Set<string>();

  for (const moduleFile of moduleFiles) {
    const moduleDir = path.dirname(moduleFile.fsPath);
    const moduleName = path.basename(moduleFile.fsPath, ".module.ts");

    const files = await findAllModuleFiles(moduleDir);
    for (const file of files) {
      // A file can technically be reachable from more than one module dir
      // scan if module folders overlap; dedupe by absolute path.
      if (seenPaths.has(file.uri.fsPath)) continue;
      seenPaths.add(file.uri.fsPath);

      results.push({ ...file, moduleName });
    }
  }

  return results;
}

function buildFlatItems(files: AggregatedFile[]): FileQuickPickItem[] {
  const sorted = [...files].sort((a, b) => {
    const moduleCompare = a.moduleName.localeCompare(b.moduleName);
    if (moduleCompare !== 0) return moduleCompare;
    return a.fileName.localeCompare(b.fileName);
  });

  const items: FileQuickPickItem[] = [];
  let lastModule = "";

  for (const file of sorted) {
    if (file.moduleName !== lastModule) {
      items.push({
        label: file.moduleName,
        kind: vscode.QuickPickItemKind.Separator,
      });
      lastModule = file.moduleName;
    }

    items.push({
      label: file.fileName,
      description: file.typeLabel,
      uri: file.uri,
    });
  }

  return items;
}

export async function searchAllModulesCommand() {
  const files = await collectAllFiles();

  if (files.length === 0) {
    vscode.window.showInformationMessage("📁 No NestJS module files found.");
    return;
  }

  const items = buildFlatItems(files);

  const selection = await showQuickPickWithShortcuts(
    items,
    `${files.length} files across all modules · fuzzy search by typing`,
    "Search All Modules",
  );

  if (selection?.uri) {
    const doc = await vscode.workspace.openTextDocument(selection.uri);
    await vscode.window.showTextDocument(doc);
  }
}
