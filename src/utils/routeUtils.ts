import * as vscode from "vscode";
import { showMissingDocs, showVerbColors } from "./config";

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

/** ThemeIcon for an HTTP method — color-coded per the routes.colorVerbs setting. */
export function httpMethodIcon(httpMethod: string): vscode.ThemeIcon {
  const id = HTTP_METHOD_ICON[httpMethod] ?? "symbol-method";
  const color = HTTP_METHOD_COLOR[httpMethod];
  if (!showVerbColors() || !color) return new vscode.ThemeIcon(id);
  return new vscode.ThemeIcon(id, new vscode.ThemeColor(color));
}

/** Detail suffix for routes without a summary, per swagger.showMissingDocs. */
export function missingDocsFlag(): string {
  return showMissingDocs() ? "$(eye-close) no @ApiOperation" : "";
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

// ─── Route extraction ────────────────────────────────────────────────────────

export interface RouteInfo {
  httpMethod: string;
  fullPath: string;
  methodName: string;
  line: number;
  controllerFile: string;
  uri: vscode.Uri;
  /** @ApiOperation summary, if present. */
  summary?: string;
}

/**
 * Extracts the @ApiOperation summary from a decorator's full text.
 */
export function getApiOperationSummary(
  decoratorFull: string,
): string | undefined {
  const match = decoratorFull.match(
    /@ApiOperation\s*\(?[\s\S]*?summary\s*:\s*['"`]([^'"`]+)['"`]/,
  );
  return match?.[1];
}

/**
 * Extracts HTTP routes from a controller file's text.
 * Pure text parsing — no documents are opened by the caller's caller; the
 * caller is responsible for caching results per file.
 */
export function extractRoutes(uri: vscode.Uri, text: string): RouteInfo[] {
  const lines = text.split("\n");
  const controllerPrefix = getControllerPrefix(text);
  const routes: RouteInfo[] = [];

  let pendingDecorators: { name: string; full: string }[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      i++;
      continue;
    }

    const decoratorMatch = trimmed.match(/^@([\w]+)(\(.*)?/);
    if (decoratorMatch) {
      const name = decoratorMatch[1];
      let full = trimmed;
      // Handle multi-line decorator args — and skip the consumed
      // continuation lines so they don't get re-processed (which would
      // clear pendingDecorators and lose this decorator).
      let lastLine = i;
      if (decoratorMatch[2] && !isBalanced(decoratorMatch[2])) {
        let j = i + 1;
        while (j < lines.length) {
          full += " " + lines[j].trim();
          lastLine = j;
          if (isBalanced(full.slice(full.indexOf("(")))) break;
          j++;
        }
      }
      pendingDecorators.push({ name, full });
      i = lastLine + 1;
      continue;
    }

    // Check if any pending decorator is an HTTP decorator
    const httpDecorator = pendingDecorators.find((d) =>
      HTTP_DECORATORS.has(d.name),
    );

    if (httpDecorator) {
      // Look ahead to get the method name
      const lookahead = lines
        .slice(i, Math.min(i + 6, lines.length))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const methodMatch = lookahead.match(
        /(?:public|private|protected)?\s*(?:async\s+)?([\w]+)\s*\(/,
      );

      if (methodMatch) {
        const methodName = methodMatch[1];
        const skipKeywords = [
          "if",
          "for",
          "while",
          "switch",
          "catch",
          "constructor",
          "class",
          "function",
        ];

        if (!skipKeywords.includes(methodName)) {
          const httpMethod = httpDecorator.name.toUpperCase();

          // Extract route path from decorator
          const pathMatch = httpDecorator.full.match(
            /@(?:\w+)\s*\(\s*['"`]([^'"`]*)['"`]/,
          );

          let routePath = "";
          if (pathMatch) {
            routePath = pathMatch[1].replace(/^\//, "");
          }

          const fullPath = routePath
            ? `${controllerPrefix}/${routePath}`
            : controllerPrefix || "/";

          // @ApiOperation may sit before or after the HTTP decorator
          const apiOp = pendingDecorators.find(
            (d) => d.name === "ApiOperation",
          );

          routes.push({
            httpMethod,
            fullPath,
            methodName,
            line: i,
            controllerFile: uri.path.split("/").pop() ?? "",
            uri,
            summary: apiOp ? getApiOperationSummary(apiOp.full) : undefined,
          });
        }
      }

      pendingDecorators = [];
      i++;
      continue;
    }

    // Clear decorators if line doesn't look like a method
    if (
      trimmed !== "{" &&
      trimmed !== "}" &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*")
    ) {
      pendingDecorators = [];
    }

    i++;
  }

  return routes;
}
