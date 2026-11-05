import * as vscode from "vscode";
import { getEffectiveNestTypes, NestType } from "../constants";

export interface FileQuickPickItem extends vscode.QuickPickItem {
  shortcut?: string;
  uri?: vscode.Uri;
  isModule?: boolean;
  isBack?: boolean;
  moduleDir?: string;
  /** 0-based line to jump to after opening (route items). */
  line?: number;
  /** Full route path (route items), for the copy button. */
  routePath?: string;
  /** HTTP verb (route items), for the copy button. */
  httpMethod?: string;
}

// emoji field removed — icons now come entirely from TYPE_ICON_MAP
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
  // --- app entry ---
  main: "rocket",
  bootstrap: "rocket",
  // --- queue / event handlers ---
  subscriber: "broadcast",
  processor: "tools",
  consumer: "cloud-download",
  job: "zap",
  queue: "server",
  // --- scheduling ---
  cron: "watch",
  scheduler: "watch",
  task: "tasklist",
  // --- patterns / utilities ---
  serializer: "symbol-key",
  adapter: "combine",
  provider: "plug",
  factory: "clone",
  helper: "wrench",
  util: "wrench",
  constant: "json",
  constants: "json",
  config: "settings-gear",
  validation: "checklist",
  schema: "symbol-field",
  model: "symbol-class",
  dataloader: "loading",
  loader: "loading",
  e2e: "browser",
};

export function iconForFile(suffix: string): vscode.ThemeIcon {
  const custom = getEffectiveNestTypes().find((t) => t.suffix === suffix);
  const id = custom?.icon ?? TYPE_ICON_MAP[suffix] ?? "file";
  return new vscode.ThemeIcon(id);
}

/**
 * Extracts the file suffix from a file name, e.g. "user.helper.ts" → "helper".
 * Returns "" for files without a suffix (module.ts, index.ts, main.ts, …).
 */
export function fileSuffixOf(fileName: string): string {
  if (!fileName.endsWith(".ts")) return "";
  const stem = fileName.slice(0, -3);
  const lastDot = stem.lastIndexOf(".");
  return lastDot === -1 ? "" : stem.slice(lastDot + 1);
}

/**
 * Icon for a file based on its actual name suffix — works even for files
 * whose suffix isn't a recognized NestJS type (helper, util, …).
 */
export function iconForFileName(fileName: string): vscode.ThemeIcon {
  const suffix = fileSuffixOf(fileName);
  if (!suffix) return new vscode.ThemeIcon("file");

  const types = getEffectiveNestTypes();
  const matched = types.find(
    (t) => suffix === t.suffix || suffix === t.suffix + "s",
  );
  const singular = matched?.suffix ?? suffix.replace(/s$/, "");

  const id =
    matched?.icon ??
    TYPE_ICON_MAP[suffix] ??
    TYPE_ICON_MAP[singular] ??
    "file";
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
  for (const file of sorted) {
    if (file.category !== lastCategory) {
      const categoryCount = sorted.filter(
        (f) => f.category === file.category,
      ).length;
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
      iconPath: iconForFileName(file.fileName),
      shortcut: file.shortcut || undefined,
      uri: file.uri,
    });
  }

  return items;
}

export function showQuickPickWithShortcuts(
  items: FileQuickPickItem[],
  placeholder: string,
  title?: string,
): Promise<FileQuickPickItem | undefined> {
  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.items = items;
  quickPick.placeholder = placeholder;
  if (title) quickPick.title = title;
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

    quickPick.onDidTriggerItemButton((event) => {
      if (event.item.uri) finish({ ...event.item, isModule: false });
    });

    quickPick.onDidChangeValue((value) => {
      if (timeout) clearTimeout(timeout);
      const trimmed = value.trim().toLowerCase();
      if (trimmed.length === 0) return;
      timeout = setTimeout(() => {
        const match = items.find(
          (item) => item.shortcut && item.shortcut.toLowerCase() === trimmed,
        );
        if (match) finish(match);
      }, 200);
    });

    quickPick.onDidHide(() => finish(undefined));
  });
}
