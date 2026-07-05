import * as vscode from "vscode";

interface MethodInfo {
  name: string;
  line: number;
  type: "method" | "getter" | "setter" | "constructor" | "arrow";
  modifier: "public" | "private" | "protected" | "none";
  isAsync: boolean;
  isStatic: boolean;
  decorators: string[];
  decoratorDetails: string[];
  params: string;
  returnType: string;
}

interface MethodQuickPickItem extends vscode.QuickPickItem {
  line?: number;
}

const METHOD_ICON: Record<MethodInfo["type"], string> = {
  method: "symbol-method",
  getter: "symbol-property",
  setter: "symbol-property",
  constructor: "symbol-constructor",
  arrow: "symbol-method",
};

const HTTP_DECORATORS = new Set([
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

const GUARD_DECORATORS = new Set([
  "UseGuards",
  "UseInterceptors",
  "UsePipes",
  "UseFilters",
]);

const HTTP_METHOD_ICON: Record<string, string> = {
  GET: "$(arrow-down)",
  POST: "$(add)",
  PUT: "$(edit)",
  PATCH: "$(diff-modified)",
  DELETE: "$(trash)",
  OPTIONS: "$(info)",
  HEAD: "$(eye)",
  ALL: "$(globe)",
  SSE: "$(radio-tower)",
};

function isBalanced(str: string): boolean {
  let depth = 0;
  for (const ch of str) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
  }
  return depth <= 0;
}

function normalizeParams(raw: string): string {
  if (!raw.trim()) return "";
  const params = raw
    .split(",")
    .map((p) =>
      p
        .trim()
        .split(":")[0]
        .trim()
        .replace(/^@\w+\s*/, "")
        .replace(/^\.\.\./, "…"),
    )
    .filter(Boolean);

  if (params.length === 0) return "";
  if (params.length <= 3) return params.join(", ");
  return `${params.slice(0, 3).join(", ")}, +${params.length - 3}`;
}

function cleanReturnType(raw: string): string {
  if (!raw) return "";
  const promiseMatch = raw.match(/^Promise<(.+)>$/);
  if (promiseMatch) return promiseMatch[1].trim();
  return raw;
}

function getControllerPrefix(document: vscode.TextDocument): string {
  const text = document.getText();
  const match = text.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
  if (!match) return "";
  const prefix = match[1].replace(/^\//, "");
  return prefix ? `/${prefix}` : "";
}

function getHttpMethod(decorators: string[]): string {
  for (const d of decorators) {
    const name = d.replace("@", "");
    if (HTTP_DECORATORS.has(name)) return name.toUpperCase();
  }
  return "";
}

function getRoute(
  decoratorDetails: string[],
  controllerPrefix: string,
): string {
  for (const d of decoratorDetails) {
    // Decorator with string argument: @Get('/path') or @Get(":id")
    const match = d.match(
      /@(?:Get|Post|Put|Patch|Delete|Options|Head|All|Sse)\s*\(\s*['"`]([^'"`]*)['"`]/i,
    );
    if (match) {
      const routePath = match[1].replace(/^\//, "");
      const full = routePath
        ? `${controllerPrefix}/${routePath}`
        : controllerPrefix || "/";
      return full;
    }

    // Decorator with empty parens: @Get()
    const noArgMatch = d.match(
      /@(?:Get|Post|Put|Patch|Delete|Options|Head|All|Sse)\s*\(\s*\)/i,
    );
    if (noArgMatch) {
      return controllerPrefix || "/";
    }

    // Decorator with no parens: @Get
    const noParen = d.match(
      /@(?:Get|Post|Put|Patch|Delete|Options|Head|All|Sse)\s*$/i,
    );
    if (noParen) {
      return controllerPrefix || "/";
    }
  }
  return "";
}

function extractMethods(document: vscode.TextDocument): MethodInfo[] {
  const results: MethodInfo[] = [];
  const lines = document.getText().split("\n");

  let pendingDecorators: string[] = [];
  let pendingDecoratorDetails: string[] = [];
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

    // Collect decorators — handle multi-line decorator args
    const decoratorMatch = trimmed.match(/^@([\w]+)(\(.*)?/);
    if (decoratorMatch) {
      const decoratorName = decoratorMatch[1];
      let fullDecorator = trimmed;
      if (decoratorMatch[2] && !isBalanced(decoratorMatch[2])) {
        let j = i + 1;
        while (j < lines.length) {
          fullDecorator += " " + lines[j].trim();
          if (isBalanced(fullDecorator.slice(fullDecorator.indexOf("(")))) {
            break;
          }
          j++;
        }
      }
      pendingDecorators.push(`@${decoratorName}`);
      pendingDecoratorDetails.push(fullDecorator);
      i++;
      continue;
    }

    // Join up to 6 lines for multi-line signature matching
    const lookahead = lines
      .slice(i, Math.min(i + 6, lines.length))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Constructor
    const ctorMatch = lookahead.match(
      /^(public|private|protected)?\s*constructor\s*\(([^)]*)\)/,
    );
    if (ctorMatch) {
      results.push({
        name: "constructor",
        line: i,
        type: "constructor",
        modifier: (ctorMatch[1] as MethodInfo["modifier"]) || "none",
        isAsync: false,
        isStatic: false,
        decorators: [...pendingDecorators],
        decoratorDetails: [...pendingDecoratorDetails],
        params: normalizeParams(ctorMatch[2]),
        returnType: "",
      });
      pendingDecorators = [];
      pendingDecoratorDetails = [];
      i++;
      continue;
    }

    // Getter
    const getterMatch = lookahead.match(
      /^(public|private|protected)?\s*(static\s+)?get\s+([\w]+)\s*\(\s*\)(?:\s*:\s*([\w<>\[\]|&\s,.?]+?))?[\s{]/,
    );
    if (getterMatch) {
      results.push({
        name: getterMatch[3],
        line: i,
        type: "getter",
        modifier: (getterMatch[1] as MethodInfo["modifier"]) || "none",
        isAsync: false,
        isStatic: !!getterMatch[2],
        decorators: [...pendingDecorators],
        decoratorDetails: [...pendingDecoratorDetails],
        params: "",
        returnType: getterMatch[4]?.trim() || "",
      });
      pendingDecorators = [];
      pendingDecoratorDetails = [];
      i++;
      continue;
    }

    // Setter
    const setterMatch = lookahead.match(
      /^(public|private|protected)?\s*(static\s+)?set\s+([\w]+)\s*\(([^)]*)\)/,
    );
    if (setterMatch) {
      results.push({
        name: setterMatch[3],
        line: i,
        type: "setter",
        modifier: (setterMatch[1] as MethodInfo["modifier"]) || "none",
        isAsync: false,
        isStatic: !!setterMatch[2],
        decorators: [...pendingDecorators],
        decoratorDetails: [...pendingDecoratorDetails],
        params: normalizeParams(setterMatch[4]),
        returnType: "",
      });
      pendingDecorators = [];
      pendingDecoratorDetails = [];
      i++;
      continue;
    }

    // Arrow function property
    const arrowMatch = lookahead.match(
      /^(public|private|protected)?\s*(static\s+)?(readonly\s+)?(async\s+)?([\w]+)\s*=\s*(async\s+)?\([^)]*\)\s*(?::\s*[\w<>\[\]|&\s,.?]+)?\s*=>/,
    );
    if (arrowMatch) {
      results.push({
        name: arrowMatch[5],
        line: i,
        type: "arrow",
        modifier: (arrowMatch[1] as MethodInfo["modifier"]) || "none",
        isAsync: !!(arrowMatch[4] || arrowMatch[6]),
        isStatic: !!arrowMatch[2],
        decorators: [...pendingDecorators],
        decoratorDetails: [...pendingDecoratorDetails],
        params: "",
        returnType: "",
      });
      pendingDecorators = [];
      pendingDecoratorDetails = [];
      i++;
      continue;
    }

    // Regular class method — no { required on same line
    const methodMatch = lookahead.match(
      /^(public|private|protected)?\s*(static\s+)?(async\s+)?([\w]+)\s*\(([^)]*)\)(?:\s*:\s*([\w<>\[\]|&\s,.?Promise<>]+?))?[\s{(]/,
    );
    if (methodMatch) {
      const name = methodMatch[4];
      const skipKeywords = [
        "if",
        "for",
        "while",
        "switch",
        "catch",
        "class",
        "function",
        "return",
        "import",
        "export",
        "const",
        "let",
        "var",
        "new",
        "throw",
      ];
      if (!skipKeywords.includes(name) && /^[a-z][\w]*$/.test(name)) {
        results.push({
          name,
          line: i,
          type: "method",
          modifier: (methodMatch[1] as MethodInfo["modifier"]) || "none",
          isAsync: !!methodMatch[3],
          isStatic: !!methodMatch[2],
          decorators: [...pendingDecorators],
          decoratorDetails: [...pendingDecoratorDetails],
          params: normalizeParams(methodMatch[5]),
          returnType: cleanReturnType(methodMatch[6]?.trim() || ""),
        });
        pendingDecorators = [];
        pendingDecoratorDetails = [];
        i++;
        continue;
      }
    }

    if (
      trimmed !== "{" &&
      trimmed !== "}" &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*")
    ) {
      pendingDecorators = [];
      pendingDecoratorDetails = [];
    }

    i++;
  }

  return results;
}

function buildRouteItem(
  m: MethodInfo,
  controllerPrefix: string,
): MethodQuickPickItem {
  const httpMethod = getHttpMethod(m.decorators);
  const route = getRoute(m.decoratorDetails, controllerPrefix);
  const icon = HTTP_METHOD_ICON[httpMethod] ?? "$(symbol-method)";
  const asyncLabel = m.isAsync ? " ~" : "";

  const guardDecorators = m.decorators
    .filter((d) => GUARD_DECORATORS.has(d.replace("@", "")))
    .map((d) => d.replace("@", ""))
    .join(", ");
  const guardSuffix = guardDecorators ? `  · ${guardDecorators}` : "";
  const returnSuffix = m.returnType ? `  · ${m.returnType}` : "";

  return {
    label: `${icon} ${httpMethod}  ${route}   ${m.name}${asyncLabel}`,
    description: `L${m.line + 1}${guardSuffix}${returnSuffix}`,
    iconPath: new vscode.ThemeIcon("symbol-method"),
    line: m.line,
  };
}

function buildItem(m: MethodInfo): MethodQuickPickItem {
  const modifierIcon =
    m.modifier === "private" || m.modifier === "protected" ? "$(lock) " : "";
  const asyncIcon = m.isAsync ? " ~" : "";
  const staticIcon = m.isStatic ? " *" : "";
  const typeLabel =
    m.type === "getter"
      ? " [g]"
      : m.type === "setter"
        ? " [s]"
        : m.type === "arrow"
          ? " [=>]"
          : m.type === "constructor"
            ? " [ctor]"
            : "";

  const paramsLabel = m.params ? `(${m.params})` : "()";
  const returnLabel = m.returnType ? `  · ${m.returnType}` : "";
  const nonHttpDecorators = m.decorators
    .filter((d) => !HTTP_DECORATORS.has(d.replace("@", "")))
    .map((d) => d.replace("@", ""))
    .join(", ");
  const decoratorSuffix = nonHttpDecorators ? `  · ${nonHttpDecorators}` : "";

  return {
    label: `${modifierIcon}${m.name}${paramsLabel}${asyncIcon}${staticIcon}${typeLabel}`,
    description: `L${m.line + 1}${decoratorSuffix}${returnLabel}`,
    iconPath: new vscode.ThemeIcon(
      METHOD_ICON[m.type],
      m.modifier === "private" || m.modifier === "protected"
        ? new vscode.ThemeColor("symbolIcon.fieldForeground")
        : new vscode.ThemeColor("symbolIcon.methodForeground"),
    ),
    line: m.line,
  };
}

function buildMethodItems(
  methods: MethodInfo[],
  controllerPrefix: string,
): MethodQuickPickItem[] {
  const items: MethodQuickPickItem[] = [];
  if (methods.length === 0) return items;

  const httpMethods = methods.filter((m) =>
    m.decorators.some((d) => HTTP_DECORATORS.has(d.replace("@", ""))),
  );
  const otherDecorated = methods.filter(
    (m) =>
      m.decorators.length > 0 &&
      !m.decorators.some((d) => HTTP_DECORATORS.has(d.replace("@", ""))),
  );
  const plain = methods.filter((m) => m.decorators.length === 0);

  if (httpMethods.length > 0) {
    items.push({
      label: `Routes (${httpMethods.length})`,
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const m of httpMethods) {
      items.push(buildRouteItem(m, controllerPrefix));
    }
  }

  if (otherDecorated.length > 0) {
    items.push({
      label: `Decorated (${otherDecorated.length})`,
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const m of otherDecorated) {
      items.push(buildItem(m));
    }
  }

  if (plain.length > 0) {
    items.push({
      label: `Methods (${plain.length})`,
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const m of plain) {
      items.push(buildItem(m));
    }
  }

  return items;
}

export async function methodSearcherCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("❌ No active editor");
    return;
  }

  const document = editor.document;
  if (
    document.languageId !== "typescript" &&
    document.languageId !== "javascript"
  ) {
    vscode.window.showInformationMessage(
      "❌ Method searcher only works in TypeScript/JavaScript files",
    );
    return;
  }

  const methods = extractMethods(document);
  if (methods.length === 0) {
    vscode.window.showInformationMessage("📭 No methods found in this file");
    return;
  }

  const controllerPrefix = getControllerPrefix(document);
  const currentLine = editor.selection.active.line;
  const currentMethod = [...methods]
    .reverse()
    .find((m) => m.line <= currentLine);

  const fileName = document.fileName.split("/").pop() ?? "";
  const routeCount = methods.filter((m) =>
    m.decorators.some((d) => HTTP_DECORATORS.has(d.replace("@", ""))),
  ).length;

  const titleSuffix =
    routeCount > 0
      ? `${methods.length} methods  ·  ${routeCount} routes`
      : `${methods.length} methods`;

  const allItems = buildMethodItems(methods, controllerPrefix);

  const quickPick = vscode.window.createQuickPick<MethodQuickPickItem>();
  quickPick.title = `${fileName}  ·  ${titleSuffix}`;
  quickPick.placeholder = "Filter by method name, route path, or decorator…";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = false;
  quickPick.keepScrollPosition = true;
  quickPick.items = allItems;

  if (currentMethod) {
    const activeItem = allItems.find((i) => i.line === currentMethod.line);
    if (activeItem) {
      quickPick.activeItems = [activeItem];
    }
  }

  quickPick.show();

  await new Promise<void>((resolve) => {
    quickPick.onDidChangeActive((active) => {
      const item = active[0];
      if (item?.line !== undefined) {
        const pos = new vscode.Position(item.line, 0);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
      }
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected?.line !== undefined) {
        const pos = new vscode.Position(selected.line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );
      }
      quickPick.dispose();
      resolve();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve();
    });
  });
}
