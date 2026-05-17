export const LOGGER_METHODS: Record<string, string> = {
  debug: "🔍",
  log: "📝",
  warn: "⚠️",
  error: "❌",
  verbose: "🔊",
};

// NestJS file types with emojis and shortcuts
export const NEST_TYPES: {
  suffix: string;
  typeLabel: string;
  shortcut: string;
  emoji: string;
}[] = [
  { suffix: "service", typeLabel: "Service", shortcut: "s", emoji: "🛠️" },
  { suffix: "controller", typeLabel: "Controller", shortcut: "c", emoji: "🎮" },
  { suffix: "module", typeLabel: "Module", shortcut: "m", emoji: "📦" },
  { suffix: "guard", typeLabel: "Guard", shortcut: "g", emoji: "🛡️" },
  { suffix: "gateway", typeLabel: "Gateway", shortcut: "gw", emoji: "🌐" },
  {
    suffix: "interceptor",
    typeLabel: "Interceptor",
    shortcut: "i",
    emoji: "🚧",
  },
  { suffix: "pipe", typeLabel: "Pipe", shortcut: "p", emoji: "🔧" },
  { suffix: "filter", typeLabel: "Filter", shortcut: "f", emoji: "🧹" },
  { suffix: "resolver", typeLabel: "Resolver", shortcut: "r", emoji: "🧬" },
  { suffix: "decorator", typeLabel: "Decorator", shortcut: "d", emoji: "🎨" },
];
