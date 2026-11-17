import * as path from "path";
import * as vscode from "vscode";
import {
  buildRelativeImport,
  hasImport,
  importInsertionPosition,
} from "../utils/imports";
import { findProviderClasses, getRegistrationIndex } from "../utils/nestIndex";
import { getExcludeGlob } from "../utils/config";
import { stripCodeMapped } from "../utils/insertionPoint";
import { findFilesSafe } from "../utils/scan";
import { getTargetEditor } from "../utils/targetEditor";

const ORPHAN_MESSAGE = "is not registered in any module";
const MAX_CANDIDATES = 3;

/**
 * Cached list of all module.ts files in the workspace. Code actions are
 * requested on every cursor movement in a file with diagnostics —
 * re-running findFiles per request turned each caret move into a
 * workspace scan. Invalidated by the file watcher and exclude-setting
 * changes (invalidateModuleFilesCache).
 */
let moduleFilesCache: vscode.Uri[] | undefined;

export function invalidateModuleFilesCache(): void {
  moduleFilesCache = undefined;
}

interface TextPos {
  line: number;
  col: number;
}

/** Whole-document stripped view with per-line stripped→raw column maps. */
interface StrippedDoc {
  text: string;
  maps: number[][];
}

function stripDocument(document: vscode.TextDocument): StrippedDoc {
  const state = { inStr: null as string | null, inBlock: false };
  const maps: number[][] = [];
  const parts: string[] = [];
  for (const line of document.getText().split("\n")) {
    const r = stripCodeMapped(line, state);
    parts.push(r.text);
    maps.push(r.map);
  }
  return { text: parts.join("\n"), maps };
}

/**
 * Converts a stripped-text offset that refers to a specific EMITTED
 * character (e.g. the `[` or `]` of an array) into a raw (line, col).
 */
function toRawPos(doc: StrippedDoc, offset: number): TextPos {
  const before = doc.text.slice(0, offset);
  const line = before.split("\n").length - 1;
  const lineStart = offset - (before.lastIndexOf("\n") + 1);
  const map = doc.maps[line] ?? [];
  return { line, col: map[lineStart] ?? 0 };
}

/**
 * Locates `providers: [` / `controllers: [` INSIDE the @Module decorator
 * and returns the open/close bracket positions (bracket-balanced,
 * multi-line safe, string/comment-proof).
 *
 * The old scanner matched the first `key: [` anywhere in the raw text — a
 * dynamic-module `return { providers: [...] }` above the decorator hijacked
 * it, and `]` inside a string terminated the array early.
 */
function findArrayRange(
  doc: StrippedDoc,
  key: string,
): { open: TextPos; close: TextPos } | undefined {
  const stripped = doc.text;

  // Anchor inside the @Module decorator (first occurrence in the file)
  const moduleStart = stripped.search(/@Module\s*\(/);
  const searchFrom = moduleStart === -1 ? 0 : moduleStart;

  const match = stripped
    .slice(searchFrom)
    .match(new RegExp(`${key}\\s*:\\s*\\[`));
  if (!match || match.index === undefined) return undefined;
  const openOffset = searchFrom + match.index + match[0].length - 1; // the `[`

  let depth = 0;
  let closeOffset = -1;
  for (let i = openOffset; i < stripped.length; i++) {
    if (stripped[i] === "[") depth++;
    else if (stripped[i] === "]") {
      depth--;
      if (depth === 0) {
        closeOffset = i;
        break;
      }
    }
  }
  if (closeOffset === -1) return undefined;

  return { open: toRawPos(doc, openOffset), close: toRawPos(doc, closeOffset) };
}

/**
 * Position of the `{` opening the @Module options object (for the
 * "no array at all — create one" fallback).
 */
function findModuleOptionsBrace(doc: StrippedDoc): TextPos | undefined {
  const modIdx = doc.text.search(/@Module\s*\(/);
  if (modIdx === -1) return undefined;
  const parenIdx = doc.text.indexOf("(", modIdx);
  let k = parenIdx + 1;
  while (k < doc.text.length && /\s/.test(doc.text[k])) k++;
  if (doc.text[k] !== "{") return undefined;
  return toRawPos(doc, k);
}

/**
 * "Register-provider quick fix" — a Code Action on the Provider Health
 * warning that inserts the class into the chosen module's
 * `providers`/`controllers` array (module by folder proximity) and adds
 * the import if missing.
 */
export class RegisterProviderCodeActionProvider
  implements vscode.CodeActionProvider
{
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== "NestJS DevTools") continue;
      if (!diag.message.includes(ORPHAN_MESSAGE)) continue;

      const className = document
        .lineAt(diag.range.start.line)
        .text.match(/class\s+([A-Za-z_$][\w$]*)/)?.[1];
      if (!className) continue;

      // @Controller classes belong in `controllers`, everything else in
      // `providers` (decorator comes from the cached workspace index)
      const decorator = (await findProviderClasses()).find(
        (p) =>
          p.className === className &&
          p.uri.fsPath === document.uri.fsPath,
      )?.decorator;
      const arrayKey = decorator === "Controller" ? "controllers" : "providers";

      for (const candidate of await candidateModulesFor(document.uri)) {
        const action = new vscode.CodeAction(
          `Add ${className} to ${candidate.label} (${arrayKey})`,
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = await buildRegisterProviderEdit(
          candidate.uri,
          className,
          arrayKey,
          document.uri,
        );
        action.diagnostics = [diag];
        action.isPreferred = candidate.distance === 0;
        actions.push(action);
      }
    }

    return actions;
  }
}

/** Modules sorted by folder proximity: same dir first, then ancestors. */
export async function candidateModulesFor(
  providerUri: vscode.Uri,
): Promise<{ label: string; uri: vscode.Uri; distance: number }[]> {
  const providerDir = path.dirname(providerUri.fsPath);

  if (!moduleFilesCache) {
    moduleFilesCache = await findFilesSafe("**/*.module.ts", getExcludeGlob());
  }

  const scored = moduleFilesCache.map((uri) => {
    const rel = path.relative(path.dirname(uri.fsPath), providerDir);
    const isAncestor = !rel.startsWith("..");
    const depth = rel === "" ? 0 : rel.split(path.sep).length;
    return {
      uri,
      label: path.basename(uri.fsPath),
      distance: (isAncestor ? 0 : 1000) + depth,
    };
  });

  return scored
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label))
    .slice(0, MAX_CANDIDATES);
}

export async function buildRegisterProviderEdit(
  moduleUri: vscode.Uri,
  className: string,
  arrayKey: string,
  providerUri: vscode.Uri,
): Promise<vscode.WorkspaceEdit> {
  const edit = new vscode.WorkspaceEdit();
  const moduleDoc = await vscode.workspace.openTextDocument(moduleUri);
  const doc = stripDocument(moduleDoc);

  const array = findArrayRange(doc, arrayKey);
  if (array) {
    const { open, close } = array;
    if (close.line === open.line) {
      // Single-line array: providers: [Foo] → [Foo, ClassName]
      const line = moduleDoc.lineAt(open.line).text;
      const beforeClose = line.slice(open.col + 1, close.col).trimEnd();
      // An empty array must not get a separator — ", Foo" after "[" would
      // create an elision hole ([undefined, Foo]) that breaks DI
      const sep =
        beforeClose.length === 0
          ? ""
          : beforeClose.endsWith(",")
            ? " "
            : ", ";
      edit.insert(moduleUri, new vscode.Position(close.line, close.col), `${sep}${className}`);
    } else {
      // Multi-line array: append after the last item line
      let lastContent = -1;
      for (let i = close.line - 1; i > open.line; i--) {
        if (moduleDoc.lineAt(i).text.trim().length > 0) {
          lastContent = i;
          break;
        }
      }
      if (lastContent === -1) {
        // Empty multi-line array (providers: [\n]) — insert the first
        // item inside the brackets; a "," appended to the "[" line would
        // create an elision hole
        const openIndent =
          moduleDoc.lineAt(open.line).text.match(/^\s*/)?.[0] ?? "";
        edit.insert(
          moduleUri,
          new vscode.Position(open.line, open.col + 1),
          `\n${openIndent}  ${className},`,
        );
      } else {
        const lastText = moduleDoc.lineAt(lastContent).text;
        const indent = lastText.match(/^\s*/)?.[0] ?? "  ";
        const contentEnd = lastText.trimEnd().length;
        if (lastText.trimEnd().endsWith(",")) {
          edit.insert(
            moduleUri,
            new vscode.Position(lastContent + 1, 0),
            `${indent}${className},\n`,
          );
        } else {
          edit.insert(moduleUri, new vscode.Position(lastContent, contentEnd), ",");
          edit.insert(
            moduleUri,
            new vscode.Position(lastContent + 1, 0),
            `${indent}${className}\n`,
          );
        }
      }
    }
  } else {
    // No providers array at all — add one to the @Module options object
    const brace = findModuleOptionsBrace(doc);
    if (brace) {
      edit.insert(
        moduleUri,
        new vscode.Position(brace.line, brace.col + 1),
        `\n  ${arrayKey}: [${className}],`,
      );
    }
  }

  if (!hasImport(moduleDoc, className)) {
    edit.insert(
      moduleUri,
      importInsertionPosition(moduleDoc),
      buildRelativeImport(moduleUri, providerUri, className),
    );
  }

  return edit;
}

/**
 * "Register in Module" — right-click an unregistered provider file in the
 * sidebar Modules tree (orphan classes carry their own context value) to
 * place it in the nearest module's providers/controllers array with the
 * import added — the same edit the Provider Health quick fix performs,
 * without opening the file first.
 */
export async function registerInModuleCommand(arg?: unknown): Promise<void> {
  const treeUri =
    arg instanceof vscode.Uri
      ? arg
      : (arg as { uri?: vscode.Uri } | undefined)?.uri;
  const uri =
    treeUri ??
    getTargetEditor()?.document.uri ??
    vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    vscode.window.showInformationMessage("❌ No file to register");
    return;
  }

  const classes = await findProviderClasses();
  const fileClasses = classes.filter((p) => p.uri.fsPath === uri.fsPath);
  if (fileClasses.length === 0) {
    vscode.window.showInformationMessage(
      "📭 No NestJS-decorated class found in this file",
    );
    return;
  }

  let target = fileClasses[0];
  if (fileClasses.length > 1) {
    const picked = await vscode.window.showQuickPick(
      fileClasses.map((c) => ({
        label: c.className,
        description: `@${c.decorator}`,
        cls: c,
      })),
      {
        title: "Pick the class to register",
        placeHolder: "This file exports more than one decorated class",
      },
    );
    if (!picked) return;
    target = picked.cls;
  }

  const registrations = await getRegistrationIndex();
  const existing = registrations.get(target.className);
  if (existing) {
    vscode.window.showInformationMessage(
      `ℹ️ ${target.className} is already registered in ${existing.moduleName}`,
    );
    return;
  }

  const candidates = await candidateModulesFor(uri);
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(
      "📭 No *.module.ts found in this workspace",
    );
    return;
  }

  let module = candidates[0];
  if (candidates.length > 1) {
    const picked = await vscode.window.showQuickPick(
      candidates.map((c) => ({
        label: c.label,
        description: vscode.workspace.asRelativePath(c.uri),
        uri: c.uri,
      })),
      {
        title: `Register ${target.className} in which module?`,
        placeHolder: "Nearest module first",
      },
    );
    if (!picked) return;
    module = { label: picked.label, uri: picked.uri, distance: 0 };
  }

  const arrayKey = target.decorator === "Controller" ? "controllers" : "providers";
  const edit = await buildRegisterProviderEdit(
    module.uri,
    target.className,
    arrayKey,
    uri,
  );
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) return;

  const doc = await vscode.workspace.openTextDocument(module.uri);
  await vscode.window.showTextDocument(doc);
  vscode.window.setStatusBarMessage(
    `✅ Registered ${target.className} in ${module.label} (${arrayKey})`,
    4000,
  );
}
