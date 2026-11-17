import * as vscode from "vscode";

/**
 * Central accessor for every nestjs-devtools setting. All values are read
 * at use time, so changes apply instantly without reloading the window.
 */

const SECTION = "nestjs-devtools";

function get<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(SECTION).get<T>(key) ?? fallback;
}

/** Invalid exclude entries already warned about (once per session). */
const warnedExcludeEntries = new Set<string>();

/**
 * Glob(s) excluded from every workspace scan. node_modules is always
 * excluded; user entries from `nestjs-devtools.exclude` are appended.
 * Multiple globs are combined into the brace form findFiles expects.
 *
 * Entries are sanitized so one bad setting can't break every scan:
 *  - bare folder names (`dist`, `.nx`, `coverage`) are expanded to match
 *    at every directory level — they previously only matched the
 *    workspace root, contradicting the documented monorepo-wide behavior
 *  - entries containing commas/braces are skipped (they'd corrupt the
 *    combined brace glob and make every findFiles call throw), with a
 *    one-time warning per entry
 */
export function getExcludeGlob(): string {
  const globs = ["**/node_modules/**"];
  for (const raw of get<string[]>("exclude", [])) {
    const entry = raw.trim();
    if (!entry) continue;
    if (/[,{}]/.test(entry)) {
      if (!warnedExcludeEntries.has(entry)) {
        warnedExcludeEntries.add(entry);
        void vscode.window.showWarningMessage(
          `NestJS DevTools: skipping invalid exclude pattern "${entry}" — it must not contain commas or braces.`,
        );
      }
      continue;
    }
    const glob = /^[\w.@-]+$/.test(entry) ? `**/${entry}/**` : entry;
    globs.push(glob);
  }
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

/** Message template for inserted log statements ({emoji}/{class}/{variable}). */
export function logTemplate(): string {
  return get<string>("logTemplate", "{emoji} {class} ~ {variable}");
}

/** Route conflict & shadow detection (Diagnose command + Routes tree icons). */
export function routeConflictsEnabled(): boolean {
  return get<boolean>("diagnostics.routeConflicts", true);
}

/**
 * Base URL for "Copy Full URL" / "Copy as cURL" in the Routes tree —
 * combined with the detected global prefix and @Version. Defaults to the
 * NestJS development default (http://localhost:3000) when empty.
 */
export function routesBaseUrl(): string {
  const base = get<string>("routes.baseUrl", "").trim();
  return base || "http://localhost:3000";
}
