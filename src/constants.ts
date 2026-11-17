import * as vscode from "vscode";

export const LOGGER_METHODS: Record<string, string> = {
  debug: "🔍",
  log: "📝",
  warn: "⚠️",
  error: "❌",
  verbose: "🔊",
};

export interface NestType {
  suffix: string;
  typeLabel: string;
  shortcut: string;
  category: string;
  /** Optional codicon id (e.g. "shield"); only used by custom types. */
  icon?: string;
}

export const NEST_TYPES: NestType[] = [
  // --- Core NestJS ---
  {
    suffix: "service",
    typeLabel: "Service",
    shortcut: "s",
    category: "Core NestJS",
  },
  {
    suffix: "controller",
    typeLabel: "Controller",
    shortcut: "c",
    category: "Core NestJS",
  },
  {
    suffix: "module",
    typeLabel: "Module",
    shortcut: "m",
    category: "Core NestJS",
  },
  {
    suffix: "guard",
    typeLabel: "Guard",
    shortcut: "g",
    category: "Core NestJS",
  },
  {
    suffix: "gateway",
    typeLabel: "Gateway",
    shortcut: "gw",
    category: "Core NestJS",
  },
  {
    suffix: "interceptor",
    typeLabel: "Interceptor",
    shortcut: "i",
    category: "Core NestJS",
  },
  { suffix: "pipe", typeLabel: "Pipe", shortcut: "p", category: "Core NestJS" },
  {
    suffix: "filter",
    typeLabel: "Filter",
    shortcut: "f",
    category: "Core NestJS",
  },
  {
    suffix: "resolver",
    typeLabel: "Resolver",
    shortcut: "r",
    category: "Core NestJS",
  },
  {
    suffix: "decorator",
    typeLabel: "Decorator",
    shortcut: "d",
    category: "Core NestJS",
  },
  // --- Entities ---
  {
    suffix: "entity",
    typeLabel: "Entity",
    shortcut: "e",
    category: "Entities",
  },
  // --- DTOs ---
  { suffix: "dto", typeLabel: "DTO", shortcut: "dt", category: "DTOs" },
  // --- Enums ---
  { suffix: "enum", typeLabel: "Enum", shortcut: "en", category: "Enums" },
  // --- Interfaces ---
  {
    suffix: "interface",
    typeLabel: "Interface",
    shortcut: "if",
    category: "Interfaces",
  },
  // --- Other ---
  {
    suffix: "repository",
    typeLabel: "Repository",
    shortcut: "rp",
    category: "Other",
  },
  {
    suffix: "middleware",
    typeLabel: "Middleware",
    shortcut: "mw",
    category: "Other",
  },
  {
    suffix: "strategy",
    typeLabel: "Strategy",
    shortcut: "st",
    category: "Other",
  },
  { suffix: "spec", typeLabel: "Test", shortcut: "t", category: "Other" },
];

/**
 * Returns NEST_TYPES merged with any custom types the user has
 * configured under nestjs-devtools.customTypes in their settings.
 * Custom types with the same suffix as a built-in type — or as another
 * custom type — are ignored to prevent duplicate matches.
 */
export function getEffectiveNestTypes(): NestType[] {
  const config = vscode.workspace.getConfiguration("nestjs-devtools");
  const customTypes = config.get<NestType[]>("customTypes") ?? [];

  const seen = new Set(NEST_TYPES.map((t) => t.suffix));

  const validCustomTypes = customTypes.filter((t) => {
    if (!t.suffix || !t.typeLabel || !t.shortcut || !t.category) {
      return false; // skip malformed entries
    }
    if (seen.has(t.suffix)) {
      return false; // don't override built-ins or earlier custom types
    }
    seen.add(t.suffix);
    return true;
  });

  return [...NEST_TYPES, ...validCustomTypes];
}

/**
 * Real plural for each suffix — the old naive `suffix + "s"` produced
 * "strategys"/"repositorys" and missed the common `entities`/`dtos`.
 * Unknown (custom) suffixes fall back to the naive form.
 */
const PLURAL_SUFFIXES: Record<string, string> = {
  service: "services",
  controller: "controllers",
  module: "modules",
  guard: "guards",
  gateway: "gateways",
  interceptor: "interceptors",
  pipe: "pipes",
  filter: "filters",
  resolver: "resolvers",
  decorator: "decorators",
  entity: "entities",
  dto: "dtos",
  enum: "enums",
  interface: "interfaces",
  repository: "repositories",
  middleware: "middleware",
  strategy: "strategies",
  spec: "specs",
};

/**
 * Matches a file name against the Nest types (singular or plural suffix,
 * e.g. ".guard.ts" / ".guards.ts"). Returns undefined for plain files.
 */
export function matchNestType(
  fileName: string,
  nestTypes: NestType[],
): NestType | undefined {
  for (const t of nestTypes) {
    const plural = PLURAL_SUFFIXES[t.suffix] ?? `${t.suffix}s`;
    const suffixes =
      plural === t.suffix ? [t.suffix] : [t.suffix, plural];
    if (suffixes.some((s) => fileName.endsWith(`.${s}.ts`))) {
      return t;
    }
  }
  return undefined;
}
