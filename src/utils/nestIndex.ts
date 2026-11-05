import * as path from "path";
import * as vscode from "vscode";
import { getExcludeGlob } from "../utils/config";

/**
 * A workspace-wide index of NestJS classes and module registrations.
 * Built on demand, cached per session, invalidated by file saves — no
 * filesystem watchers, no background scans (resource-friendly).
 */

const CLASS_DECORATORS = new Set([
  "Injectable",
  "Controller",
  "Component",
  "Gateway",
  "Resolver",
  "Pipe",
  "Filter",
  "Catch",
]);

export interface ProviderClassInfo {
  className: string;
  uri: vscode.Uri;
  /** 0-based line of the class declaration. */
  line: number;
  decorator: string;
}

type ClassCache = Map<string, ProviderClassInfo[]>;
type RegistrationIndex = Map<string, { moduleName: string; uri: vscode.Uri }>;

let classCache: ClassCache | undefined;
let registrationCache: RegistrationIndex | undefined;

export function invalidateNestIndex(): void {
  classCache = undefined;
  registrationCache = undefined;
}

/** Extracts `export class X` declarations with a Nest class decorator above. */
function extractProviderClasses(doc: vscode.TextDocument): ProviderClassInfo[] {
  const results: ProviderClassInfo[] = [];
  const lines = doc.getText().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    );
    if (!m) continue;

    // Scan up through the decorator stack (blank lines allowed between
    // decorators); stop at the first non-decorator code line
    let decorator: string | undefined;
    for (let j = i - 1; j >= Math.max(0, i - 14); j--) {
      const t = lines[j].trim();
      if (!t) continue;
      const dm = t.match(/^@(\w+)/);
      if (dm) {
        if (CLASS_DECORATORS.has(dm[1])) decorator = dm[1];
        continue; // keep walking up through more decorators
      }
      break;
    }

    if (decorator) {
      results.push({
        className: m[1],
        uri: doc.uri,
        line: i,
        decorator,
      });
    }
  }
  return results;
}

/** All NestJS-decorated classes in the workspace (cached). */
export async function findProviderClasses(): Promise<ProviderClassInfo[]> {
  if (!classCache) {
    classCache = new Map();
    const files = await vscode.workspace.findFiles(
      "**/*.ts",
      getExcludeGlob(),
    );
    for (const uri of files) {
      const base = path.basename(uri.fsPath);
      if (base.endsWith(".spec.ts") || base.endsWith(".d.ts")) continue;
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const classes = extractProviderClasses(doc);
        if (classes.length > 0) classCache.set(uri.fsPath, classes);
      } catch {
        // skip unreadable files
      }
    }
  }
  return [...classCache.values()].flat();
}

/** Extracts identifier names from a `key: [...]` array in module text. */
function parseModuleArray(text: string, key: string): string[] {
  const m = text.match(new RegExp(`${key}\\s*:\\s*\\[`));
  if (!m || m.index === undefined) return [];

  let i = m.index + m[0].length;
  let depth = 1;
  while (i < text.length && depth > 0) {
    if (text[i] === "[") depth++;
    if (text[i] === "]") depth--;
    i++;
  }
  const body = text.slice(m.index + m[0].length, i - 1);
  return [...body.matchAll(/\b([A-Z][\w$]*)\b/g)].map((x) => x[1]);
}

/**
 * Maps className → the first module registering it in providers,
 * controllers, or exports (cached). Note: classes registered only via
 * spread expressions (`...sharedProviders`) can't be resolved textually
 * and will appear unregistered.
 */
export async function getRegistrationIndex(): Promise<RegistrationIndex> {
  if (!registrationCache) {
    registrationCache = new Map();
    const moduleFiles = await vscode.workspace.findFiles(
      "**/*.module.ts",
      getExcludeGlob(),
    );

    for (const uri of [...moduleFiles].sort(
      (a, b) => a.fsPath.length - b.fsPath.length,
    )) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const names = [
          ...parseModuleArray(text, "providers"),
          ...parseModuleArray(text, "controllers"),
          ...parseModuleArray(text, "exports"),
        ];
        for (const name of names) {
          if (!registrationCache.has(name)) {
            registrationCache.set(name, {
              moduleName: path.basename(uri.fsPath, ".module.ts"),
              uri,
            });
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return registrationCache;
}
