import * as vscode from "vscode";
import { showMissingDocs, showVerbColors } from "./config";
import { stripCode, stripComments } from "./insertionPoint";

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
 *   @Controller({ path: 'users' })       — options object, ANY key order
 *   @Controller({ version: '1', path: 'users' })
 *   @Controller() / @Controller          — no prefix
 *
 * Runs on string/comment-stripped text, so a `@Controller(...)` mentioned
 * in a comment or string above the real decorator can't hijack the
 * prefix (the old whole-text first-match did exactly that).
 */
export function getControllerPrefix(text: string): string {
  // Comments-only stripping: string literals must SURVIVE (the prefix is
  // one), while a `@Controller(...)` inside a comment must not hijack it
  const state = { inStr: null as string | null, inBlock: false };
  const stripped = text
    .split("\n")
    .map((l) => stripComments(l, state))
    .join("\n");

  const start = stripped.search(/@Controller\s*\(/);
  if (start === -1) return "";
  const openParen = stripped.indexOf("(", start);

  // Balance the argument list (may span lines)
  let depth = 0;
  let end = -1;
  for (let i = openParen; i < stripped.length; i++) {
    if (stripped[i] === "(") depth++;
    else if (stripped[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return "";
  const args = stripped.slice(openParen + 1, end);

  const strMatch = args.match(/^\s*['"`]([^'"`]*)['"`]/);
  const objMatch = args.match(/\bpath\s*:\s*['"`]([^'"`]*)['"`]/);
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

/**
 * Prepends the app's global prefix (`setGlobalPrefix('api')`) to a route
 * path. `/` stays a bare prefix (`/api`, not `/api/`).
 */
export function withGlobalPrefix(prefix: string, routePath: string): string {
  if (!prefix) return routePath;
  if (routePath === "/" || routePath === "") return prefix;
  return prefix + routePath;
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
  /** Method-level @Version value (e.g. "2" for @Version('2')), if any. */
  version?: string;
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

/** Words that can follow an HTTP decorator without being its handler. */
const SKIP_METHOD_NAMES = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "constructor",
  "class",
  "function",
  "return",
]);

/**
 * Extracts HTTP routes from a controller file's text.
 * Pure text parsing — no documents are opened by the caller's caller; the
 * caller is responsible for caching results per file.
 *
 * Robustness notes over the old scanner:
 *  - decorator balancing runs over string/comment-stripped text, so a
 *    `)` inside a decorator string (`@Get(':id)')`) no longer ends the
 *    accumulation early;
 *  - a member on the SAME line as its decorator (`@Get('x') async foo() {}`)
 *    is now captured — the old scanner consumed the whole line as a
 *    decorator and the route was silently dropped;
 *  - the handler name regex is anchored and understands modifiers,
 *    `get`/`set`, generics (`findAll<T>(…)`) and arrow properties
 *    (`findAll = async (…)` — previously named "async");
 *  - `@Version('1')` contributes a `/v1` segment (NestJS URI versioning).
 */
export function extractRoutes(uri: vscode.Uri, text: string): RouteInfo[] {
  const lines = text.split("\n");
  // One strip pass with threaded state — bracket balancing and decorator
  // detection see code only; RAW lines are still used to extract the
  // string literals (route paths, summaries) from inside decorators
  const stripState = { inStr: null as string | null, inBlock: false };
  const strippedLines = lines.map((l) => stripCode(l, stripState));
  const controllerPrefix = getControllerPrefix(text);
  const routes: RouteInfo[] = [];

  let pendingDecorators: { name: string; full: string }[] = [];
  /** Same-line tail after a decorator (`@Get('x') async foo() {}`). */
  let carryTail: string | undefined;
  let i = 0;

  while (i < lines.length) {
    const rawTrimmed = lines[i].trim();
    const carryLine = carryTail !== undefined;
    const trimmed = carryTail ?? strippedLines[i].trim();
    carryTail = undefined;

    if (trimmed === "") {
      if (!carryLine) i++;
      continue; // blank, comment-only, or string-only line
    }

    if (!carryLine) {
      const decoratorMatch = trimmed.match(/^@([\w]+)\s*(\(.*)?$/);
      if (decoratorMatch) {
        const name = decoratorMatch[1];
        let rawFull = rawTrimmed;
        let strippedFull = trimmed;
        let lastLine = i;
        // Handle multi-line decorator args — skip the consumed
        // continuation lines so they don't get re-processed
        const parenIdx = strippedFull.indexOf("(");
        if (parenIdx !== -1 && !isBalanced(strippedFull.slice(parenIdx))) {
          let j = i + 1;
          while (j < lines.length) {
            rawFull += " " + lines[j].trim();
            strippedFull += " " + strippedLines[j].trim();
            lastLine = j;
            if (isBalanced(strippedFull.slice(strippedFull.indexOf("(")))) {
              break;
            }
            j++;
          }
        }
        pendingDecorators.push({ name, full: rawFull });

        // Tail after the decorator's closing paren (stripped coords)
        let remainder = "";
        const from = strippedFull.indexOf("(");
        if (from !== -1) {
          let depth = 0;
          for (let c = from; c < strippedFull.length; c++) {
            if (strippedFull[c] === "(") depth++;
            else if (strippedFull[c] === ")") {
              depth--;
              if (depth === 0) {
                remainder = strippedFull.slice(c + 1).trim();
                break;
              }
            }
          }
        }

        if (remainder && !/^[{};]/.test(remainder)) {
          // A member follows on the same line — process its tail now,
          // attributed to this decorator's line
          carryTail = remainder;
          i = lastLine;
        } else {
          i = lastLine + 1;
        }
        continue;
      }
    }

    // A pending HTTP decorator turns the current line into a route
    const httpDecorator = pendingDecorators.find((d) =>
      HTTP_DECORATORS.has(d.name),
    );

    if (httpDecorator) {
      // Lookahead: current line (or carried tail) plus the next few
      // non-comment lines, for signatures that span lines
      const window: string[] = [trimmed];
      for (
        let j = i + 1;
        j < Math.min(i + 6, lines.length) && window.length < 6;
        j++
      ) {
        const s = strippedLines[j].trim();
        if (s === "" || s.startsWith("*") || s.startsWith("/*")) continue;
        window.push(s);
      }
      const lookahead = window.join(" ").replace(/\s+/g, " ").trim();

      // Arrow-property handler first: `findAll = async (req, res) =>`
      const arrowMatch = lookahead.match(
        /^(?:(?:public|private|protected)\s+)?(?:async\s+)?(?:readonly\s+)?([\w$]+)\s*=\s*(?:async\s*)?\(/,
      );
      const methodMatch = arrowMatch
        ? undefined
        : lookahead.match(
            /^(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([\w$]+)\s*[(<]/,
          );
      const nameCandidate = arrowMatch?.[1] ?? methodMatch?.[1];

      if (nameCandidate && !SKIP_METHOD_NAMES.has(nameCandidate)) {
        const httpMethod = httpDecorator.name.toUpperCase();

        // Extract route path from the decorator
        const pathMatch = httpDecorator.full.match(
          /@(?:\w+)\s*\(\s*['"`]([^'"`]*)['"`]/,
        );
        const routePath = pathMatch
          ? pathMatch[1].replace(/^\//, "")
          : "";

        // @Version('1') → /v1 (NestJS default URI version prefix)
        const versionDeco = pendingDecorators.find(
          (d) => d.name === "Version",
        );
        let versionPrefix = "";
        let version: string | undefined;
        if (versionDeco) {
          const v = versionDeco.full.match(
            /@Version\s*\(\s*['"]([^'"]+)['"]/,
          )?.[1];
          if (v) {
            version = v;
            versionPrefix = `/${v.toLowerCase().startsWith("v") ? v : `v${v}`}`;
          }
        }

        const base = versionPrefix + controllerPrefix;
        const fullPath = routePath ? `${base}/${routePath}` : base || "/";

        // @ApiOperation may sit before or after the HTTP decorator
        const apiOp = pendingDecorators.find(
          (d) => d.name === "ApiOperation",
        );

        routes.push({
          httpMethod,
          fullPath,
          methodName: nameCandidate,
          line: i,
          controllerFile: uri.path.split("/").pop() ?? "",
          uri,
          summary: apiOp ? getApiOperationSummary(apiOp.full) : undefined,
          version,
        });
      }

      pendingDecorators = [];
      i++;
      continue;
    }

    // Clear decorators if this line isn't a member continuation
    if (trimmed !== "{" && trimmed !== "}") {
      pendingDecorators = [];
    }

    i++;
  }

  return routes;
}
