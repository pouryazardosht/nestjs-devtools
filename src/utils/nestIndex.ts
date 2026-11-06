import * as path from "path";
import * as vscode from "vscode";
import { getExcludeGlob } from "../utils/config";
import {
  mapWithConcurrency,
  readTextFile,
  SCAN_CONCURRENCY,
} from "../utils/scan";

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

/**
 * Incremental update on save: re-extracts classes for the saved file only,
 * leaving every other file's entry untouched. Saves of non-indexed files
 * (spec/d.ts, non-TS) keep the cache valid for the rest of the workspace.
 *
 * Module-file saves drop just the registration cache — it maps class →
 * *first* registering module across all module files, so a single module
 * can't be merged in isolation; rebuilding it is cheap (module files are
 * few) and lazy (next use).
 */
export function updateNestIndexForSave(doc: vscode.TextDocument): void {
  const fsPath = doc.uri.fsPath;
  if (!fsPath.endsWith(".ts")) return;

  if (classCache) {
    const base = path.basename(fsPath);
    if (base.endsWith(".spec.ts") || base.endsWith(".d.ts")) {
      classCache.delete(fsPath);
    } else {
      const classes = extractProviderClasses(doc.uri, doc.getText());
      if (classes.length > 0) {
        classCache.set(fsPath, classes);
      } else {
        classCache.delete(fsPath);
      }
    }
  }

  if (registrationCache && path.basename(fsPath).endsWith(".module.ts")) {
    registrationCache = undefined;
  }
}

/** Drops one file's index entries (file deleted). */
export function removeNestIndexEntry(uri: vscode.Uri): void {
  classCache?.delete(uri.fsPath);
  if (registrationCache && path.basename(uri.fsPath).endsWith(".module.ts")) {
    registrationCache = undefined;
  }
}

/** Extracts `export class X` declarations with a Nest class decorator above. */
function extractProviderClasses(
  uri: vscode.Uri,
  text: string,
): ProviderClassInfo[] {
  const results: ProviderClassInfo[] = [];
  const lines = text.split("\n");

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
        uri,
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
    const files = await vscode.workspace.findFiles(
      "**/*.ts",
      getExcludeGlob(),
    );
    const candidates = files.filter((uri) => {
      const base = path.basename(uri.fsPath);
      return !base.endsWith(".spec.ts") && !base.endsWith(".d.ts");
    });

    const entries = await mapWithConcurrency(
      candidates,
      SCAN_CONCURRENCY,
      async (
        uri,
      ): Promise<[string, ProviderClassInfo[]] | undefined> => {
        const text = await readTextFile(uri);
        if (text === undefined) {
          return undefined; // skip unreadable files
        }
        const classes = extractProviderClasses(uri, text);
        if (classes.length === 0) {
          return undefined;
        }
        return [uri.fsPath, classes];
      },
    );

    classCache = new Map();
    for (const entry of entries) {
      if (entry) {
        classCache.set(entry[0], entry[1]);
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
    const moduleFiles = await vscode.workspace.findFiles(
      "**/*.module.ts",
      getExcludeGlob(),
    );
    const sorted = [...moduleFiles].sort(
      (a, b) => a.fsPath.length - b.fsPath.length,
    );

    // Read in parallel, then insert in path-length order so the "first
    // module to register a class wins" rule matches the sequential scan
    const texts = await mapWithConcurrency(sorted, SCAN_CONCURRENCY, (uri) =>
      readTextFile(uri),
    );

    registrationCache = new Map();
    for (let i = 0; i < sorted.length; i++) {
      const text = texts[i];
      if (text === undefined) {
        continue; // skip unreadable files
      }
      const uri = sorted[i];
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
    }
  }
  return registrationCache;
}
