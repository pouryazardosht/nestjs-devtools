import * as vscode from "vscode";

/**
 * Central accessor for every nestjs-devtools setting. All values are read
 * at use time, so changes apply instantly without reloading the window.
 */

const SECTION = "nestjs-devtools";

function get<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(SECTION).get<T>(key) ?? fallback;
}

/**
 * Glob(s) excluded from every workspace scan. node_modules is always
 * excluded; user entries from `nestjs-devtools.exclude` are appended.
 * Multiple globs are combined into the brace form findFiles expects.
 */
export function getExcludeGlob(): string {
  const extra = get<string[]>("exclude", []).filter(Boolean);
  const globs = ["**/node_modules/**", ...extra];
  return globs.length === 1 ? globs[0] : `{${globs.join(",")}}`;
}

/** Color-coded HTTP verb icons (GET blue, POST green, …). */
export function showVerbColors(): boolean {
  return get<boolean>("routes.colorVerbs", true);
}

/** `no @ApiOperation` flags on routes lacking a summary. */
export function showMissingDocs(): boolean {
  return get<boolean>("swagger.showMissingDocs", true);
}

/** Per-row counts and view-header badges in the trees. */
export function showCounts(): boolean {
  return get<boolean>("tree.showCounts", true);
}

/** Whether the selected variable is appended as the log's 2nd argument. */
export function logIncludeValue(): boolean {
  return get<boolean>("logIncludeValue", true);
}

/** When the generator offers a matching .spec.ts after creating a file. */
export type GenerateSpecMode = "ask" | "always" | "never";

export function generateSpecMode(): GenerateSpecMode {
  const value = get<string>("generate.spec", "ask");
  return value === "always" || value === "never" ? value : "ask";
}

/**
 * Template for the auto-declared logger property; {Class} is replaced
 * with the enclosing class name.
 */
export function loggerDeclarationTemplate(): string {
  return get<string>(
    "logger.declaration",
    "private readonly logger = new Logger({Class}.name);",
  );
}
