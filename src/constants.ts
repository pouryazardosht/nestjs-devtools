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
  emoji: string;
  category: string;
}

export const NEST_TYPES: NestType[] = [
  // --- Core NestJS ---
  {
    suffix: "service",
    typeLabel: "Service",
    shortcut: "s",
    emoji: "🛠️",
    category: "Core NestJS",
  },
  {
    suffix: "controller",
    typeLabel: "Controller",
    shortcut: "c",
    emoji: "🎮",
    category: "Core NestJS",
  },
  {
    suffix: "module",
    typeLabel: "Module",
    shortcut: "m",
    emoji: "📦",
    category: "Core NestJS",
  },
  {
    suffix: "guard",
    typeLabel: "Guard",
    shortcut: "g",
    emoji: "🛡️",
    category: "Core NestJS",
  },
  {
    suffix: "gateway",
    typeLabel: "Gateway",
    shortcut: "gw",
    emoji: "🌐",
    category: "Core NestJS",
  },
  {
    suffix: "interceptor",
    typeLabel: "Interceptor",
    shortcut: "i",
    emoji: "🚧",
    category: "Core NestJS",
  },
  {
    suffix: "pipe",
    typeLabel: "Pipe",
    shortcut: "p",
    emoji: "🔧",
    category: "Core NestJS",
  },
  {
    suffix: "filter",
    typeLabel: "Filter",
    shortcut: "f",
    emoji: "🧹",
    category: "Core NestJS",
  },
  {
    suffix: "resolver",
    typeLabel: "Resolver",
    shortcut: "r",
    emoji: "🧬",
    category: "Core NestJS",
  },
  {
    suffix: "decorator",
    typeLabel: "Decorator",
    shortcut: "d",
    emoji: "🎨",
    category: "Core NestJS",
  },

  // --- Entities ---
  {
    suffix: "entity",
    typeLabel: "Entity",
    shortcut: "e",
    emoji: "🗃️",
    category: "Entities",
  },

  // --- DTOs ---
  {
    suffix: "dto",
    typeLabel: "DTO",
    shortcut: "dt",
    emoji: "📋",
    category: "DTOs",
  },

  // --- Enums ---
  {
    suffix: "enum",
    typeLabel: "Enum",
    shortcut: "en",
    emoji: "🎛️",
    category: "Enums",
  },

  // --- Interfaces ---
  {
    suffix: "interface",
    typeLabel: "Interface",
    shortcut: "if",
    emoji: "🔗",
    category: "Interfaces",
  },

  // --- Other common NestJS files ---
  {
    suffix: "repository",
    typeLabel: "Repository",
    shortcut: "rp",
    emoji: "🗄️",
    category: "Other",
  },
  {
    suffix: "middleware",
    typeLabel: "Middleware",
    shortcut: "mw",
    emoji: "⚙️",
    category: "Other",
  },
  {
    suffix: "strategy",
    typeLabel: "Strategy",
    shortcut: "st",
    emoji: "🧠",
    category: "Other",
  },
  {
    suffix: "spec",
    typeLabel: "Test",
    shortcut: "t",
    emoji: "🧪",
    category: "Other",
  },
];
