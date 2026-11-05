import * as path from "path";
import * as vscode from "vscode";
import { findConstructor, findEnclosingClassLine } from "../utils/classBody";
import {
  findProviderClasses,
  ProviderClassInfo,
} from "../utils/nestIndex";
import {
  buildRelativeImport,
  hasImport,
  importInsertionPosition,
} from "../utils/imports";
import { brandedTitle, iconForFileName } from "../utils/quickPickHelpers";
import { getTargetEditor } from "../utils/targetEditor";

function toCamelCase(className: string): string {
  return className.charAt(0).toLowerCase() + className.slice(1);
}

/**
 * "Insert · Injected Provider" — pick a provider class, and the command
 * appends `private readonly xService: XService` to the enclosing class's
 * constructor (creating nothing if there's no constructor) and adds the
 * import if missing.
 */
export async function injectProviderCommand(): Promise<void> {
  const editor = getTargetEditor();
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const document = editor.document;
  if (
    document.languageId !== "typescript" &&
    document.languageId !== "javascript"
  ) {
    vscode.window.showInformationMessage(
      "❌ Only works in TypeScript/JavaScript files",
    );
    return;
  }

  const classLine = findEnclosingClassLine(
    document,
    editor.selection.active.line,
  );
  if (classLine === undefined) {
    vscode.window.showInformationMessage(
      "❌ Place the cursor inside a class first",
    );
    return;
  }

  const ctor = findConstructor(document, classLine);
  if (!ctor) {
    vscode.window.showInformationMessage(
      "❌ No constructor found in this class — add one first (e.g. generate the file with NestJS DevTools)",
    );
    return;
  }

  // ── Step 1: pick the provider ──────────────────────────────────────────────
  const currentClassName = document
    .lineAt(classLine)
    .text.match(/class\s+([A-Za-z_$][\w$]*)/)?.[1];

  const providers = await findProviderClasses();
  const candidates = providers.filter(
    (p) => p.className !== currentClassName,
  );
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(
      "📭 No injectable classes found in the workspace",
    );
    return;
  }

  const items = candidates
    .sort((a, b) => a.className.localeCompare(b.className))
    .map((p: ProviderClassInfo) => ({
      label: p.className,
      description: path.basename(p.uri.fsPath),
      detail: vscode.workspace.asRelativePath(
        path.dirname(p.uri.fsPath),
      ),
      iconPath: iconForFileName(path.basename(p.uri.fsPath)),
      provider: p,
    }));

  const picked = await vscode.window.showQuickPick(items, {
    title: brandedTitle("Inject Provider"),
    placeHolder: "Pick the class to inject into the constructor…",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;

  const { className, uri } = picked.provider;
  const instanceName = toCamelCase(className);
  const param = `private readonly ${instanceName}: ${className}`;

  // ── Step 2: build edits (param + import) ───────────────────────────────────
  const importEdit = hasImport(document, className)
    ? undefined
    : {
        position: importInsertionPosition(document),
        text: buildRelativeImport(document.uri, uri, className),
      };

  // Param insertion strategy depends on the constructor's shape
  let paramEdits: { position: vscode.Position; text: string }[];
  if (ctor.isEmptyParams) {
    // constructor() → constructor(private readonly x: X)
    paramEdits = [
      { position: ctor.openParen.translate(0, 1), text: param },
    ];
  } else if (ctor.closeParen.line === ctor.openParen.line) {
    // single-line: constructor(a, b) → constructor(a, b, private readonly x: X)
    paramEdits = [{ position: ctor.closeParen, text: `, ${param}` }];
  } else {
    // multi-line: append after the last parameter line
    const lastText = document.lineAt(ctor.lastParamLine).text;
    const trimmedEnd = lastText.trimEnd().length;
    if (lastText.trimEnd().endsWith(",")) {
      paramEdits = [
        {
          position: new vscode.Position(ctor.lastParamLine + 1, 0),
          text: `${lastText.match(/^\s*/)?.[0] ?? ""}${param},\n`,
        },
      ];
    } else {
      // No-trailing-comma style: add the comma to the old last param and
      // leave the new one without one
      paramEdits = [
        {
          position: new vscode.Position(ctor.lastParamLine, trimmedEnd),
          text: ",",
        },
        {
          position: new vscode.Position(ctor.lastParamLine + 1, 0),
          text: `${lastText.match(/^\s*/)?.[0] ?? ""}${param}\n`,
        },
      ];
    }
  }

  // ── Step 3: apply ──────────────────────────────────────────────────────────
  const ok = await editor.edit((builder) => {
    for (const e of paramEdits) builder.insert(e.position, e.text);
    if (importEdit) builder.insert(importEdit.position, importEdit.text);
  });

  if (ok) {
    vscode.window.setStatusBarMessage(
      `✅ Injected ${className} → ${instanceName}`,
      3000,
    );
  }
}
