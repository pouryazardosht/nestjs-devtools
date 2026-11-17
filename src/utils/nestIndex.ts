import * as path from "path";
import * as vscode from "vscode";
import { getExcludeGlob } from "../utils/config";
import {
  findFilesSafe,
  mapWithConcurrency,
  readTextFile,
  SCAN_CONCURRENCY,
} from "../utils/scan";
import { stripCode } from "./insertionPoint";

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

/**
 * Class declaration line — also matches decorators and `export default`
 * sharing the line, which the old anchored regex missed
 * (`@Injectable() export class Foo` was never indexed).
 */
const CLASS_DECL_REGEX =
  /^\s*(?:@[\w$]+(?:\s*\([^)]*\))?\s*)*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;

export interface ProviderClassInfo {
  className: string;
  uri: vscode.Uri;
  /** 0-based line of the class declaration. */
  line: number;
  decorator: string;
}

type ClassCache = Map<string, ProviderClassInfo[]>;
type RegistrationIndex = Map<string, { moduleName: string; uri: vscode.Uri }>;

/** One registration: a class name under a specific @Module array. */
export interface RegistrationEntry {
  name: string;
  /** Which @Module array it came from: providers / controllers / exports. */
  key: string;
  moduleName: string;
  uri: vscode.Uri;
}

let classCache: ClassCache | undefined;
let registrationCache: RegistrationIndex | undefined;
let registrationEntriesCache: RegistrationEntry[] | undefined;

/** In-flight index builds — deduped so concurrent commands don't double-scan. */
let classIndexPromise: Promise<void> | undefined;
let registrationPromise: Promise<void> | undefined;

/** Saves arriving while the class index is being built (re-parsed after). */
let scanningClassIndex = false;
const savedDuringClassScan = new Set<string>();

export function invalidateNestIndex(): void {
  classCache = undefined;
  registrationCache = undefined;
  registrationEntriesCache = undefined;
  classIndexPromise = undefined;
  registrationPromise = undefined;
  scanningClassIndex = false;
  savedDuringClassScan.clear();
}

/**
 * Incremental update on save: re-extracts classes for the saved file only,
 * leaving every other file's entry untouched. Saves of non-indexed files
 * (spec/d.ts, non-TS) keep the cache valid for the rest of the workspace.
 *
 * While the index is being built the save can't be applied to a cache that
 * doesn't exist yet — it's recorded and reconciled right after the build
 * finishes (the old code silently dropped it, leaving stale pre-save
 * content indexed until the NEXT save).
 *
 * Module-file saves drop just the registration cache — it maps class →
 * *first* registering module across all module files, so a single module
 * can't be merged in isolation; rebuilding it is cheap (module files are
 * few) and lazy (next use).
 */
export function updateNestIndexForSave(doc: vscode.TextDocument): void {
  const fsPath = doc.uri.fsPath;
  if (!fsPath.endsWith(".ts")) return;

  if (scanningClassIndex) {
    savedDuringClassScan.add(fsPath);
  } else if (classCache) {
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

  if (
    (registrationCache || registrationEntriesCache || registrationPromise) &&
    path.basename(fsPath).endsWith(".module.ts")
  ) {
    registrationCache = undefined;
    registrationEntriesCache = undefined;
    registrationPromise = undefined;
  }
}

/** Drops one file's index entries (file deleted). */
export function removeNestIndexEntry(uri: vscode.Uri): void {
  classCache?.delete(uri.fsPath);
  if (path.basename(uri.fsPath).endsWith(".module.ts")) {
    registrationCache = undefined;
    registrationEntriesCache = undefined;
    registrationPromise = undefined;
  }
}

/** Extracts `export class X` declarations with a Nest class decorator above. */
function extractProviderClasses(
  uri: vscode.Uri,
  text: string,
): ProviderClassInfo[] {
  const results: ProviderClassInfo[] = [];
  const lines = text.split("\n");
  // String/comment-stripped view — decorator and class detection can't be
  // fooled by examples inside comments or strings
  const state = { inStr: null as string | null, inBlock: false };
  const strippedLines = lines.map((l) => stripCode(l, state));

  for (let i = 0; i < lines.length; i++) {
    const m = strippedLines[i].match(CLASS_DECL_REGEX);
    if (!m) continue;

    // Scan up through the decorator stack (blank lines allowed between
    // decorators); stop at the first non-decorator code line
    let decorator: string | undefined;
    for (let j = i - 1; j >= Math.max(0, i - 14); j--) {
      const t = strippedLines[j].trim();
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

async function buildClassIndex(): Promise<void> {
  const files = await findFilesSafe("**/*.ts", getExcludeGlob());
  const candidates = files.filter((uri) => {
    const base = path.basename(uri.fsPath);
    return !base.endsWith(".spec.ts") && !base.endsWith(".d.ts");
  });

  scanningClassIndex = true;
  savedDuringClassScan.clear();
  try {
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
  } finally {
    scanningClassIndex = false;
  }

  // Reconcile saves that landed while the bulk scan was running — each
  // saved file is re-extracted from disk so the index never keeps
  // pre-save content
  const stale = [...savedDuringClassScan];
  savedDuringClassScan.clear();
  for (const fsPath of stale) {
    if (!classCache) break;
    const base = path.basename(fsPath);
    if (base.endsWith(".spec.ts") || base.endsWith(".d.ts")) {
      classCache.delete(fsPath);
      continue;
    }
    const text = await readTextFile(vscode.Uri.file(fsPath));
    if (text === undefined) {
      classCache.delete(fsPath);
      continue;
    }
    const classes = extractProviderClasses(vscode.Uri.file(fsPath), text);
    if (classes.length > 0) {
      classCache.set(fsPath, classes);
    } else {
      classCache.delete(fsPath);
    }
  }
}

/** All NestJS-decorated classes in the workspace (cached, build deduped). */
export async function findProviderClasses(): Promise<ProviderClassInfo[]> {
  if (!classCache) {
    if (!classIndexPromise) {
      classIndexPromise = buildClassIndex().catch((err) => {
        classIndexPromise = undefined; // allow a retry on the next call
        throw err;
      });
    }
    await classIndexPromise;
  }
  return [...(classCache ?? new Map()).values()].flat();
}

/**
 * Extracts every class name registered under `providers`/`controllers`/
 * `exports` INSIDE the @Module decorator — together with WHICH array it
 * came from (needed for wrong-array diagnostics: a `@Controller` under
 * `providers` is a bug). Runs on string/comment-stripped text and scopes
 * the search to the decorator's balanced argument list — the old
 * first-match-anywhere scan was hijacked by e.g. a dynamic-module
 * `return { providers: [...] }` above the decorator, and treated `]`
 * inside strings as the array terminator.
 */
export function parseModuleRegistrationsDetailed(
  text: string,
): { name: string; key: string }[] {
  const state = { inStr: null as string | null, inBlock: false };
  const stripped = text
    .split("\n")
    .map((l) => stripCode(l, state))
    .join("\n");

  const moduleStart = stripped.search(/@Module\s*\(/);
  if (moduleStart === -1) return [];
  const openParen = stripped.indexOf("(", moduleStart);

  let depth = 0;
  let decoratorEnd = -1;
  for (let i = openParen; i < stripped.length; i++) {
    if (stripped[i] === "(") depth++;
    else if (stripped[i] === ")") {
      depth--;
      if (depth === 0) {
        decoratorEnd = i;
        break;
      }
    }
  }
  if (decoratorEnd === -1) return [];
  const decoratorBody = stripped.slice(openParen, decoratorEnd);

  const entries: { name: string; key: string }[] = [];
  for (const key of ["providers", "controllers", "exports"]) {
    const m = decoratorBody.match(new RegExp(`\\b${key}\\s*:\\s*\\[`));
    if (!m || m.index === undefined) continue;

    let i = m.index + m[0].length - 1; // at the `[`
    let arrDepth = 0;
    let arrEnd = -1;
    for (; i < decoratorBody.length; i++) {
      if (decoratorBody[i] === "[") arrDepth++;
      else if (decoratorBody[i] === "]") {
        arrDepth--;
        if (arrDepth === 0) {
          arrEnd = i;
          break;
        }
      }
    }
    if (arrEnd === -1) continue;
    const body = decoratorBody.slice(m.index + m[0].length, arrEnd);
    for (const match of body.matchAll(/\b([A-Z][\w$]*)\b/g)) {
      entries.push({ name: match[1], key });
    }
  }
  return entries;
}

/** Names-only view (kept for callers that don't care about the array). */
export function parseModuleRegistrations(text: string): string[] {
  return parseModuleRegistrationsDetailed(text).map((e) => e.name);
}

/**
 * Every registration across the workspace's module files — array key
 * included, no dedup (the same class may be registered in several
 * modules, possibly under different arrays). Cached, build deduped.
 */
export async function getRegistrationEntries(): Promise<RegistrationEntry[]> {
  if (!registrationEntriesCache) {
    if (!registrationPromise) {
      registrationPromise = buildRegistrationEntries().catch((err) => {
        registrationPromise = undefined; // allow a retry on the next call
        throw err;
      });
    }
    await registrationPromise;
  }
  return registrationEntriesCache ?? [];
}

async function buildRegistrationEntries(): Promise<void> {
  const moduleFiles = await findFilesSafe("**/*.module.ts", getExcludeGlob());
  const sorted = [...moduleFiles].sort(
    (a, b) => a.fsPath.length - b.fsPath.length,
  );

  // Read in parallel, then insert in path-length order so the "first
  // module to register a class wins" rule matches the sequential scan
  const texts = await mapWithConcurrency(sorted, SCAN_CONCURRENCY, (uri) =>
    readTextFile(uri),
  );

  const entries: RegistrationEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const text = texts[i];
    if (text === undefined) {
      continue; // skip unreadable files
    }
    const uri = sorted[i];
    const moduleName = path.basename(uri.fsPath, ".module.ts");
    for (const { name, key } of parseModuleRegistrationsDetailed(text)) {
      entries.push({ name, key, moduleName, uri });
    }
  }
  registrationEntriesCache = entries;
}

/**
 * Maps className → the first module registering it in providers,
 * controllers, or exports (derived from getRegistrationEntries, cached).
 * Note: classes registered only via spread expressions
 * (`...sharedProviders`) can't be resolved textually and will appear
 * unregistered.
 */
export async function getRegistrationIndex(): Promise<RegistrationIndex> {
  const entries = await getRegistrationEntries();
  const built: RegistrationIndex = new Map();
  for (const entry of entries) {
    if (!built.has(entry.name)) {
      built.set(entry.name, {
        moduleName: entry.moduleName,
        uri: entry.uri,
      });
    }
  }
  return built;
}
