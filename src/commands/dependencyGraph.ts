import * as path from "path";
import * as vscode from "vscode";

interface GraphNode {
  id: string; // module base name, e.g. "users"
  label: string; // e.g. "UsersModule"
  level: number;
  external: boolean;
  uri?: string; // fsPath of the .module.ts for local modules
}

interface GraphEdge {
  from: string; // importer module id
  to: string; // imported module id
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const MODULE_FILE_PATTERN = "**/*.module.ts";
const MODULE_NAME_PATTERN = /^([A-Za-z_]\w*)Module$/;

/**
 * Parses `imports: [...]` from a module file's text and returns the
 * imported module identifiers. Pure text parsing, no TS compilation.
 */
function parseImportedModules(text: string): string[] {
  const results = new Set<string>();

  // Match the imports array (may span lines). Simple approach: find
  // `imports : [` then scan forward with bracket balancing.
  const startMatch = text.match(/imports\s*:\s*\[/);
  if (!startMatch || startMatch.index === undefined) return [];

  let i = startMatch.index + startMatch[0].length;
  let depth = 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    i++;
  }
  const body = text.slice(startMatch.index + startMatch[0].length, i - 1);

  // Collect PascalCase identifiers ending in "Module" — covers plain
  // entries, .forRoot()/forRootAsync() calls and conditional spreads.
  for (const m of body.matchAll(/\b([A-Za-z_]\w*Module)\b/g)) {
    results.add(m[1]);
  }

  return [...results];
}

/**
 * Builds the module dependency graph. Resource-friendly:
 *  - Result is cached and only rebuilt when a module file is saved.
 *  - Each file is opened once per build via openTextDocument (VS Code's
 *    document cache makes this cheap for already-open files).
 */
export class ModuleGraphService implements vscode.Disposable {
  private cache: GraphData | undefined;
  private saveListener: vscode.Disposable;
  private debouncedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith(".module.ts")) {
        this.cache = undefined; // rebuild lazily on next open
        if (this.debouncedTimer) clearTimeout(this.debouncedTimer);
        this.debouncedTimer = setTimeout(() => {
          this.debouncedTimer = undefined;
          this.onGraphInvalidated?.();
        }, 300);
      }
    });
  }

  /** Called (from extension.ts) when the graph may be stale and a panel is open. */
  onGraphInvalidated: (() => void) | undefined;

  async getGraph(): Promise<GraphData> {
    if (this.cache) return this.cache;

    const moduleFiles = await vscode.workspace.findFiles(
      MODULE_FILE_PATTERN,
      "**/node_modules/**",
    );

    // Resolve module base names to files: "UsersModule" → users.module.ts
    const fileByBase = new Map<string, vscode.Uri>();
    const importsByBase = new Map<string, string[]>();
    // external module label → importer base names
    const externalImports = new Map<string, Set<string>>();

    for (const uri of moduleFiles) {
      const base = path.basename(uri.fsPath, ".module.ts");
      fileByBase.set(base, uri);
    }

    for (const uri of moduleFiles) {
      const base = path.basename(uri.fsPath, ".module.ts");
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        for (const imported of parseImportedModules(doc.getText())) {
          const nameMatch = imported.match(MODULE_NAME_PATTERN);
          if (!nameMatch) continue;
          const importedBase = imported.slice(0, -"Module".length);
          if (fileByBase.has(importedBase)) {
            const list = importsByBase.get(base) ?? [];
            if (!list.includes(importedBase)) list.push(importedBase);
            importsByBase.set(base, list);
          } else {
            const importers = externalImports.get(imported) ?? new Set();
            importers.add(base);
            externalImports.set(imported, importers);
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    // Level = longest path from a root (a module nobody imports locally).
    const importedByOthers = new Set<string>();
    for (const list of importsByBase.values()) {
      for (const target of list) importedByOthers.add(target);
    }

    const levels = new Map<string, number>();
    const edges: GraphEdge[] = [];

    for (const [from, list] of importsByBase) {
      for (const to of list) edges.push({ from, to });
    }

    // Iterate to fixpoint (graph sizes are small; worst case O(n²))
    const bases = [...fileByBase.keys()];
    for (const b of bases) levels.set(b, 0);
    let changed = true;
    let guard = 0;
    while (changed && guard++ < bases.length) {
      changed = false;
      for (const edge of edges) {
        const next = (levels.get(edge.from) ?? 0) + 1;
        if (next > (levels.get(edge.to) ?? 0)) {
          levels.set(edge.to, next);
          changed = true;
        }
      }
    }

    const nodes: GraphNode[] = bases.map((base) => ({
      id: base,
      label: `${base.charAt(0).toUpperCase() + base.slice(1)}Module`,
      level: levels.get(base) ?? 0,
      external: false,
      uri: fileByBase.get(base)?.fsPath,
    }));

    // Externals (TypeOrmModule, ConfigModule from node_modules, …) hang off
    // their importers one level below the deepest importer.
    for (const [ext, importers] of externalImports) {
      const minLevel = Math.min(
        ...[...importers].map((b) => levels.get(b) ?? 0),
      );
      nodes.push({
        id: ext,
        label: ext,
        level: minLevel + 1,
        external: true,
      });
      for (const importer of importers) {
        edges.push({ from: importer, to: ext });
      }
    }

    this.cache = { nodes, edges };
    return this.cache;
  }

  dispose(): void {
    this.saveListener.dispose();
    if (this.debouncedTimer) clearTimeout(this.debouncedTimer);
  }
}

// ─── Webview ──────────────────────────────────────────────────────────────────

function renderGraphHtml(data: GraphData): string {
  const nonce =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  const NODE_W = 150;
  const NODE_H = 34;
  const COL_GAP = 46;
  const ROW_GAP = 24;
  const PAD = 40;

  // Layout: column per level, rows stacked inside a column
  const maxLevel = Math.max(0, ...data.nodes.map((n) => n.level));
  const columns: GraphNode[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const n of [...data.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    columns[n.level].push(n);
  }

  const maxRows = Math.max(1, ...columns.map((c) => c.length));
  const width = PAD * 2 + (maxLevel + 1) * NODE_W + maxLevel * COL_GAP;
  const height = PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;

  const nodePos = new Map<string, { x: number; y: number }>();
  columns.forEach((col, level) => {
    const x = PAD + level * (NODE_W + COL_GAP);
    const colHeight = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const startY = (height - colHeight) / 2;
    col.forEach((n, row) => {
      nodePos.set(n.id, { x, y: startY + row * (NODE_H + ROW_GAP) });
    });
  });

  const edgesSvg = data.edges
    .map((e) => {
      const from = nodePos.get(e.from);
      const to = nodePos.get(e.to);
      if (!from || !to) return "";
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      return `<path class="edge" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" data-from="${e.from}" data-to="${e.to}"/>`;
    })
    .join("\n");

  const nodesSvg = [...nodePos.entries()]
    .map(([id, pos]) => {
      const node = data.nodes.find((n) => n.id === id)!;
      const uriAttr = node.uri ? ` data-uri="${node.uri}"` : "";
      return `<g class="node${node.external ? " external" : ""}" data-id="${id}"${uriAttr}>
      <rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" rx="8"/>
      <text x="${pos.x + NODE_W / 2}" y="${pos.y + NODE_H / 2 + 4}">${node.label}</text>
    </g>`;
    })
    .join("\n");

  const legend = `
  <div class="legend">
    <span><span class="swatch local"></span> local module — click to open</span>
    <span><span class="swatch ext"></span> external (node_modules / not found in workspace)</span>
    <span>arrows point from importer → imported</span>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { --fg: var(--vscode-foreground); --border: var(--vscode-panel-border); --bg: var(--vscode-editor-background); }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); overflow: auto; }
  .wrap { min-width: fit-content; padding: 8px 16px 16px; }
  svg { display: block; }
  .node rect { fill: var(--vscode-sideBar-background); stroke: var(--vscode-focusBorder); stroke-width: 1.5; cursor: pointer; }
  .node text { fill: var(--fg); text-anchor: middle; font-size: 11px; pointer-events: none; }
  .node:hover rect { stroke-width: 2.5; filter: brightness(1.15); }
  .node.external rect { stroke-dasharray: 4 3; stroke: var(--border); cursor: default; }
  .node.external text { opacity: 0.65; }
  .edge { fill: none; stroke: var(--border); stroke-width: 1.5; }
  .edge.hl { stroke: var(--vscode-focusBorder); stroke-width: 2.5; }
  .node.hl rect { stroke-width: 2.5; }
  .legend { display: flex; gap: 18px; align-items: center; color: var(--fg); opacity: .75; font-size: 11px; padding: 6px 0 10px; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .swatch.local { border: 1.5px solid var(--vscode-focusBorder); background: var(--vscode-sideBar-background); }
  .swatch.ext { border: 1.5px dashed var(--border); }
</style>
</head>
<body>
${legend}
<div class="wrap">
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${edgesSvg}
  ${nodesSvg}
</svg>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  // Highlight edges touching a hovered node
  document.querySelectorAll('.node').forEach((g) => {
    g.addEventListener('mouseenter', () => {
      const id = g.dataset.id;
      document.querySelectorAll('.edge').forEach((p) => {
        if (p.dataset.from === id || p.dataset.to === id) p.classList.add('hl');
      });
      g.classList.add('hl');
    });
    g.addEventListener('mouseleave', () => {
      document.querySelectorAll('.hl').forEach((el) => el.classList.remove('hl'));
    });
    g.addEventListener('click', () => {
      if (g.dataset.uri) vscode.postMessage({ type: 'openModule', uri: g.dataset.uri });
    });
  });
</script>
</body>
</html>`;
}

export async function showDependencyGraphCommand(
  graphService: ModuleGraphService,
): Promise<void> {
  const data = await graphService.getGraph();

  if (data.nodes.length === 0) {
    vscode.window.showInformationMessage("📁 No NestJS modules found.");
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "nestjsDependencyGraph",
    "Module Dependency Graph",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      // Only allow loading nothing — all markup is generated inline.
      localResourceRoots: [],
    },
  );

  panel.webview.html = renderGraphHtml(data);

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "openModule" && typeof msg.uri === "string") {
      void vscode.window.showTextDocument(vscode.Uri.file(msg.uri));
    }
  });

  // Keep the panel live when the graph goes stale: rebuild markup on save.
  graphService.onGraphInvalidated = () => {
    if (panel) {
      void graphService.getGraph().then((fresh) => {
        panel.webview.html = renderGraphHtml(fresh);
      });
    }
  };

  panel.onDidDispose(() => {
    graphService.onGraphInvalidated = undefined;
  });
}
