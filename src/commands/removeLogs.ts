import * as vscode from "vscode";
import { netDelta, stripCode } from "../utils/insertionPoint";
import { getTargetEditor } from "../utils/targetEditor";
import { brandIcon, brandedTitle } from "../utils/quickPickHelpers";

const LOGGER_CALL = /^\s*(?:this\.)?logger\s*\.\s*\w+\s*\(/;
const MAX_SCAN_LINES = 40;

interface LogStatement {
  startLine: number;
  endLine: number;
  lineCount: number;
  preview: string;
}

/**
 * Finds every `logger.*()` / `this.logger.*()` call in the document,
 * including multi-line calls (paren depth over string/comment-stripped
 * text, same engine as the insertion scanner).
 */
function findLogStatements(document: vscode.TextDocument): LogStatement[] {
  const statements: LogStatement[] = [];
  const state = { inStr: null as string | null, inBlock: false };

  const stripped: string[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    stripped.push(stripCode(document.lineAt(i).text, state));
  }

  let i = 0;
  while (i < document.lineCount) {
    const trimmed = stripped[i].trim();
    if (!LOGGER_CALL.test(document.lineAt(i).text) || !trimmed) {
      i++;
      continue;
    }

    // Find the end of the call: paren depth back to 0 and a `;` or `)`
    let depth = 0;
    let end = i;
    for (let j = i; j < Math.min(i + MAX_SCAN_LINES, document.lineCount); j++) {
      depth += netDelta(stripped[j]);
      const t = stripped[j].trim();
      if (depth <= 0 && (t.endsWith(";") || t.endsWith(")"))) {
        end = j;
        break;
      }
    }

    const firstLine = document.lineAt(i).text.trim();
    statements.push({
      startLine: i,
      endLine: end,
      lineCount: end - i + 1,
      preview: firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine,
    });

    i = end + 1; // don't re-match continuation lines
  }

  return statements;
}

/**
 * "Log · Remove in This File" — the inverse of log insertion. Statements
 * are previewed and multi-selected in a QuickPick before anything is
 * deleted; removal is a single edit pass of whole-line deletions.
 */
export async function removeLogsCommand(): Promise<void> {
  const editor = getTargetEditor();
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const document = editor.document;
  if (document.languageId !== "typescript" && document.languageId !== "javascript") {
    vscode.window.showInformationMessage(
      "❌ Only works in TypeScript/JavaScript files",
    );
    return;
  }

  const statements = findLogStatements(document);
  if (statements.length === 0) {
    vscode.window.showInformationMessage(
      "📭 No logger statements found in this file",
    );
    return;
  }

  // Step 1: pick a mode
  const totalLines = statements.reduce((sum, s) => sum + s.lineCount, 0);
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: `$(trash) Remove all ${statements.length} logger statement${statements.length === 1 ? "" : "s"}`,
        detail: `${totalLines} line${totalLines === 1 ? "" : "s"} total`,
        mode: "all",
      },
      {
        label: "$(list-selection) Choose which ones…",
        detail: "Pre-selected — uncheck the ones to keep",
        mode: "choose",
      },
    ],
    { title: brandedTitle(`Clean up logs in ${document.fileName.split("/").pop()}`) },
  );
  if (!mode) return;

  let selected = statements;
  if (mode.mode === "choose") {
    const items = statements.map((s) => ({
      label: s.preview,
      description: `L${s.startLine + 1}`,
      detail: s.lineCount > 1 ? `${s.lineCount} lines` : undefined,
      picked: true, // pre-select everything; user unchecks what to keep
      statement: s,
    }));
    const chosen = await vscode.window.showQuickPick(
      items.map((it) => ({
        ...it,
        iconPath: brandIcon("output"),
      })),
      {
        title: brandedTitle("Select logger statements to remove"),
        placeHolder:
          "Type to filter · Space toggles · Enter removes the checked ones",
        canPickMany: true,
      },
    );
    if (!chosen || chosen.length === 0) return;
    selected = chosen.map((c) => c.statement);
  }

  // Step 2: one edit pass, whole lines (bottom-up; a single edit builder
  // applies ranges simultaneously so no offset bookkeeping is needed)
  const ok = await editor.edit((builder) => {
    for (const s of [...selected].sort((a, b) => b.startLine - a.startLine)) {
      if (s.endLine < document.lineCount - 1) {
        // Delete the lines and their trailing newline
        builder.delete(new vscode.Range(s.startLine, 0, s.endLine + 1, 0));
      } else if (s.startLine > 0) {
        // Statement ends at EOF — remove the preceding newline instead
        const prev = document.lineAt(s.startLine - 1);
        builder.delete(
          new vscode.Range(
            s.startLine - 1,
            prev.text.length,
            s.endLine,
            document.lineAt(s.endLine).text.length,
          ),
        );
      } else {
        // Whole document is a single statement
        builder.delete(
          new vscode.Range(
            0,
            0,
            document.lineCount - 1,
            document.lineAt(document.lineCount - 1).text.length,
          ),
        );
      }
    }
  });

  if (ok) {
    vscode.window.setStatusBarMessage(
      `🧹 Removed ${selected.length} logger statement${selected.length === 1 ? "" : "s"}`,
      3000,
    );
  }
}
