import * as vscode from "vscode";

export const HTTP_DECORATORS = new Set([
  "Get",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "Options",
  "Head",
  "All",
  "Sse",
]);

export const HTTP_METHOD_ORDER = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "ALL",
  "SSE",
];

const HTTP_METHOD_ICON: Record<string, string> = {
  GET: "arrow-down",
  POST: "add",
  PUT: "edit",
  PATCH: "diff-modified",
  DELETE: "trash",
  OPTIONS: "info",
  HEAD: "eye",
  ALL: "globe",
  SSE: "radio-tower",
};

const HTTP_METHOD_COLOR: Record<string, string> = {
  GET: "charts.blue",
  POST: "charts.green",
  PUT: "charts.orange",
  PATCH: "charts.yellow",
  DELETE: "charts.red",
  ALL: "charts.purple",
};

/** ThemeIcon for an HTTP method, color-coded per method. */
export function httpMethodIcon(httpMethod: string): vscode.ThemeIcon {
  const id = HTTP_METHOD_ICON[httpMethod] ?? "symbol-method";
  const color = HTTP_METHOD_COLOR[httpMethod];
  return color
    ? new vscode.ThemeIcon(id, new vscode.ThemeColor(color))
    : new vscode.ThemeIcon(id);
}

/**
 * Extracts the @Controller route prefix, handling all common forms:
 *   @Controller('users')
 *   @Controller('users', JwtAuthGuard)   — extra decorator args
 *   @Controller({ path: 'users' })       — options-object form
 *   @Controller() / @Controller          — no prefix
 */
export function getControllerPrefix(text: string): string {
  const strMatch = text.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]/);
  const objMatch = text.match(
    /@Controller\s*\(\s*\{\s*path\s*:\s*['"`]([^'"`]*)['"`]/,
  );
  const raw = strMatch?.[1] ?? objMatch?.[1];
  if (raw === undefined) return "";
  const prefix = raw.replace(/^\/+|\/+$/g, "");
  return prefix ? `/${prefix}` : "";
}

export function isBalanced(str: string): boolean {
  let depth = 0;
  for (const ch of str) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
  }
  return depth <= 0;
}
