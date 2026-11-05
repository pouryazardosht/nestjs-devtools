import * as path from "path";
import * as vscode from "vscode";
import {
  buildRelativeImport,
  hasImport,
  importInsertionPosition,
} from "../utils/imports";
import { findProviderClasses } from "../utils/nestIndex";

const ORPHAN_MESSAGE = "is not registered in any module";
const MAX_CANDIDATES = 3;

interface TextPos {
  line: number;
  col: number;
}

/**
 * Locates `providers: [` / `controllers: [` in module text and returns the
 * open/close bracket positions (bracket-balanced, multi-line safe).
 */
function findArrayRange(
  document: vscode.TextDocument,
  key: string,
): { open: TextPos; close: TextPos } | undefined {
  const text = document.getText();
  const match = text.match(new RegExp(`${key}\\s*:\\s*\\[`));
  if (!match || match.index === undefined) return undefined;

  // Convert an absolute offset into (line, col)
  const toPos = (offset: number): TextPos => {
    const before = text.slice(0, offset);
    const line = before.split("\n").length - 1;
    const col = offset - (before.lastIndexOf("\n") + 1);
    return { line, col };
  };

  const openOffset = match.index + match[0].length - 1; // the `[`
  let depth = 0;
  for (let i = openOffset; i < text.length; i++) {
    if (text[i] === "[") depth++;
    if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        return { open: toPos(openOffset), close: toPos(i) };
      }
    }
  }
  return undefined;
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

      for (const candidate of await this.candidateModules(document.uri)) {
        const action = new vscode.CodeAction(
          `Add ${className} to ${candidate.label} (${arrayKey})`,
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = await this.buildEdit(
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

  /** Modules sorted by folder proximity: same dir first, then ancestors. */
  private async candidateModules(
    providerUri: vscode.Uri,
  ): Promise<{ label: string; uri: vscode.Uri; distance: number }[]> {
    const providerDir = path.dirname(providerUri.fsPath);
    const moduleFiles = await vscode.workspace.findFiles(
      "**/*.module.ts",
      "**/node_modules/**",
    );

    const scored = moduleFiles.map((uri) => {
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
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.label.localeCompare(b.label),
      )
      .slice(0, MAX_CANDIDATES);
  }

  private async buildEdit(
    moduleUri: vscode.Uri,
    className: string,
    arrayKey: string,
    providerUri: vscode.Uri,
  ): Promise<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();
    const moduleDoc = await vscode.workspace.openTextDocument(moduleUri);

    const array = findArrayRange(moduleDoc, arrayKey);
    if (array) {
      const { open, close } = array;
      if (close.line === open.line) {
        // Single-line array: providers: [Foo] → [Foo, ClassName]
        const line = moduleDoc.lineAt(open.line).text;
        const beforeClose = line.slice(open.col + 1, close.col).trimEnd();
        const sep = beforeClose.endsWith(",") ? " " : ", ";
        edit.insert(moduleUri, new vscode.Position(close.line, close.col), `${sep}${className}`);
      } else {
        // Multi-line array: append after the last item line
        let lastContent = close.line - 1;
        for (let i = close.line - 1; i > open.line; i--) {
          if (moduleDoc.lineAt(i).text.trim().length > 0) {
            lastContent = i;
            break;
          }
        }
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
    } else {
      // No providers array at all — add one to the @Module options
      const optionsMatch = moduleDoc.getText().match(/@Module\s*\(\s*\{/);
      if (optionsMatch && optionsMatch.index !== undefined) {
        const braceOffset = optionsMatch.index + optionsMatch[0].length - 1;
        const before = moduleDoc.getText().slice(0, braceOffset);
        const line = before.split("\n").length - 1;
        const col = braceOffset - (before.lastIndexOf("\n") + 1);
        edit.insert(moduleUri, new vscode.Position(line, col + 1), `\n  ${arrayKey}: [${className}],`);
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
}
