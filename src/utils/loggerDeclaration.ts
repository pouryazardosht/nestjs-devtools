import * as vscode from "vscode";

/**
 * Checks whether the class already has a logger property declared.
 * Looks for any of the common patterns:
 *   private readonly logger = new Logger(...)
 *   private readonly logger: Logger = ...
 *   private logger = ...
 */
export function hasLoggerDeclaration(
  document: vscode.TextDocument,
  classLine: number,
): boolean {
  const loggerRegex = /private\s+(readonly\s+)?logger/;
  for (let i = classLine; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    // Stop searching once we leave the class body
    if (i > classLine && /^}/.test(text.trim())) break;
    if (loggerRegex.test(text)) return true;
  }
  return false;
}

/**
 * Finds the line number of the opening '{' of the class body.
 * Handles cases where the class declaration spans multiple lines
 * (e.g. long extends/implements chains).
 */
export function findClassOpeningBrace(
  document: vscode.TextDocument,
  classLine: number,
): number | undefined {
  for (
    let i = classLine;
    i < Math.min(classLine + 10, document.lineCount);
    i++
  ) {
    if (document.lineAt(i).text.includes("{")) return i;
  }
  return undefined;
}

/**
 * Checks whether @nestjs/common is already imported and whether
 * Logger is already in the import list.
 */
export function findLoggerImportState(document: vscode.TextDocument): {
  hasImport: boolean;
  importLine: number | undefined;
  importText: string | undefined;
} {
  const nestImportRegex =
    /^import\s+\{([^}]+)\}\s+from\s+['"]@nestjs\/common['"]/;
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const match = text.match(nestImportRegex);
    if (match) {
      const imports = match[1];
      return {
        hasImport: imports.includes("Logger"),
        importLine: i,
        importText: text,
      };
    }
  }
  return { hasImport: false, importLine: undefined, importText: undefined };
}
