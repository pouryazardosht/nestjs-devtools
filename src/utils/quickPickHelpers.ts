import * as vscode from "vscode";
import { NestType } from "../constants";

export interface FileQuickPickItem extends vscode.QuickPickItem {
  shortcut?: string;
  uri?: vscode.Uri;
  isModule?: boolean;
  isBack?: boolean;
  moduleDir?: string;
}

export type ModuleFile = NestType & {
  uri: vscode.Uri;
  relativePath: string;
  fileName: string;
};

export interface NestedModuleInfo {
  uri: vscode.Uri;
  dir: string;
  base: string;
  fileCount: number;
}

export interface BreadcrumbEntry {
  dir: string;
  label: string;
}

const CATEGORY_ORDER = [
  "Modules",
  "Core NestJS",
  "Entities",
  "DTOs",
  "Enums",
  "Interfaces",
  "Other",
  "Other Files",
];

// Maps NestJS suffixes to VS Code's built-in codicons so rows render
// using theme-aware icons instead of flat emoji.
const TYPE_ICON_MAP: Record<string, string> = {
  service: "gear",
  controller: "symbol-method",
  module: "package",
  guard: "shield",
  gateway: "radio-tower",
  interceptor: "filter",
  pipe: "symbol-ruler",
  filter: "filter",
  resolver: "type-hierarchy",
  decorator: "symbol-color",
  entity: "database",
  dto: "symbol-structure",
  enum: "symbol-enum",
  interface: "symbol-interface",
  repository: "archive",
  middleware: "layers",
  strategy: "compass",
  spec: "beaker",
};

function iconForFile(suffix: string): vscode.ThemeIcon {
  const id = TYPE_ICON_MAP[suffix] ?? "file";
  return new vscode.ThemeIcon(id);
}

export function buildGroupedItems(
  files: ModuleFile[],
  nestedModules: NestedModuleInfo[] = [],
  parent: BreadcrumbEntry | undefined = undefined,
): FileQuickPickItem[] {
  const items: FileQuickPickItem[] = [];

  if (parent) {
    items.push({
      label: "Back",
      description: parent.label,
      iconPath: new vscode.ThemeIcon("arrow-left"),
      isBack: true,
    });
  }

  if (nestedModules.length > 0) {
    items.push({
      label: `Nested Modules (${nestedModules.length})`,
      kind: vscode.QuickPickItemKind.Separator,
    });
    const sortedModules = [...nestedModules].sort((a, b) =>
      a.base.localeCompare(b.base),
    );
    for (const mod of sortedModules) {
      items.push({
        label: mod.base,
        description: `${mod.fileCount} file${mod.fileCount === 1 ? "" : "s"}`,
        iconPath: new vscode.ThemeIcon(
          "package",
          new vscode.ThemeColor("charts.purple"),
        ),
        isModule: true,
        moduleDir: mod.dir,
        uri: mod.uri,
        buttons: [
          {
            iconPath: new vscode.ThemeIcon("go-to-file"),
            tooltip: "Open module.ts directly",
          },
        ],
      });
    }
  }

  const sorted = [...files].sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a.category);
    const idxB = CATEGORY_ORDER.indexOf(b.category);
    if (idxA !== idxB) {
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    }
    return a.fileName.localeCompare(b.fileName);
  });

  let lastCategory = "";
  let categoryCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const file = sorted[i];
    if (file.category !== lastCategory) {
      categoryCount = sorted.filter((f) => f.category === file.category).length;
      items.push({
        label: `${file.category} (${categoryCount})`,
        kind: vscode.QuickPickItemKind.Separator,
      });
      lastCategory = file.category;
    }

    const shortcutHint = file.shortcut ? `  ·  ${file.shortcut}` : "";
    items.push({
      label: file.fileName,
      description: `${file.typeLabel}${shortcutHint}`,
      iconPath: iconForFile(file.suffix),
      shortcut: file.shortcut || undefined,
      uri: file.uri,
    });
  }

  return items;
}

/**
 * Shows a QuickPick with debounced shortcut-typing support and
 * button-click handling (e.g. "open file directly" on module rows).
 */
export function showQuickPickWithShortcuts(
  items: FileQuickPickItem[],
  placeholder: string,
  title?: string,
): Promise<FileQuickPickItem | undefined> {
  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.items = items;
  quickPick.placeholder = placeholder;
  if (title) {
    quickPick.title = title;
  }
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.show();

  return new Promise<FileQuickPickItem | undefined>((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (item: FileQuickPickItem | undefined) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      quickPick.dispose();
      resolve(item);
    };

    quickPick.onDidAccept(() => finish(quickPick.selectedItems[0]));

    // Button click (e.g. "open module.ts directly" without drilling in)
    quickPick.onDidTriggerItemButton((event) => {
      if (event.item.uri) {
        finish({ ...event.item, isModule: false });
      }
    });

    quickPick.onDidChangeValue((value) => {
      if (timeout) clearTimeout(timeout);

      const trimmed = value.trim().toLowerCase();
      if (trimmed.length === 0) return;

      timeout = setTimeout(() => {
        const match = items.find(
          (item) => item.shortcut && item.shortcut.toLowerCase() === trimmed,
        );
        if (match) {
          finish(match);
        }
      }, 200);
    });

    quickPick.onDidHide(() => finish(undefined));
  });
}
