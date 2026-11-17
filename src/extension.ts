import * as path from "path";
import * as vscode from "vscode";
import { apiDocsCoverageCommand } from "./commands/apiDocsCoverage";
import { findProviderUsagesCommand } from "./commands/findProviderUsages";
import { generateNestFileCommand } from "./commands/generateNestFile";
import { showHubCommand } from "./commands/hub";
import { injectProviderCommand } from "./commands/injectProvider";
import { insertLoggerStatement } from "./commands/insertLogger";
import { methodSearcherCommand } from "./commands/methodSearcher";
import { moduleSearcherCommand } from "./commands/moduleSearcher";
import {
  checkProviderHealthCommand,
  goToProvidingModuleCommand,
} from "./commands/providerHealth";
import { removeLogsCommand } from "./commands/removeLogs";
import {
  invalidateModuleFilesCache,
  registerInModuleCommand,
  RegisterProviderCodeActionProvider,
} from "./commands/registerProviderFix";
import {
  copyControllerRoutesCommand,
  copyRouteCurlCommand,
  copyRouteCommand,
  copyRouteUrlCommand,
} from "./commands/routeTreeActions";
import { searchAllModulesCommand } from "./commands/searchAllModules";
import { searchModuleFilesCommand } from "./commands/searchModuleFiles";
import {
  refreshRouteConflictDiagnostics,
  routeConflictsCommand,
} from "./commands/routeConflicts";
import { LOGGER_METHODS } from "./constants";
import { ModuleCodeLensProvider } from "./providers/moduleCodeLensProvider";
import { ModuleTreeProvider } from "./providers/moduleTreeProvider";
import { RoutesTreeProvider } from "./providers/routesTreeProvider";
import {
  invalidateNestIndex,
  removeNestIndexEntry,
  updateNestIndexForSave,
} from "./utils/nestIndex";
import { invalidateGlobalPrefixCache } from "./utils/globalPrefix";
import { trackActiveEditor } from "./utils/targetEditor";
import { createModuleSearcherStatusBarItem } from "./statusBar";

/** Pending debounced watcher refresh — cleared on deactivation. */
let watcherRefreshTimer: ReturnType<typeof setTimeout> | undefined;
/** Pending debounced route-conflict diagnostic refresh — cleared on deactivation. */
let conflictRefreshTimer: ReturnType<typeof setTimeout> | undefined;
/** True once the user has run "Diagnose · Route Conflicts" — then the Problems entries auto-refresh on controller changes. */
let conflictWatchActive = false;

export function activate(context: vscode.ExtensionContext) {
  // Logger commands
  const loggerSubs = Object.keys(LOGGER_METHODS).map((method) => {
    const commandId = `nestjs-log-helper.insert${capitalize(method)}Log`;
    return vscode.commands.registerCommand(commandId, () =>
      insertLoggerStatement(method),
    );
  });

  // Module searcher (from all modules)
  const moduleSearcherSub = vscode.commands.registerCommand(
    "nestjs-log-helper.moduleSearcher",
    moduleSearcherCommand,
  );

  // File searcher (from current file)
  const searchFilesSub = vscode.commands.registerCommand(
    "nestjs-log-helper.searchModuleFiles",
    searchModuleFilesCommand,
  );

  // Search all modules
  const searchAllSub = vscode.commands.registerCommand(
    "nestjs-log-helper.searchAllModules",
    searchAllModulesCommand,
  );

  // Method searcher (current file)
  const methodSearcherSub = vscode.commands.registerCommand(
    "nestjs-log-helper.methodSearcher",
    methodSearcherCommand,
  );

  // Remove logger statements in the active file
  const removeLogsSub = vscode.commands.registerCommand(
    "nestjs-log-helper.removeLogs",
    () => void removeLogsCommand(),
  );

  // Insert an injected provider into the constructor (Cmd+L Cmd+I)
  const injectProviderSub = vscode.commands.registerCommand(
    "nestjs-log-helper.injectProvider",
    () => void injectProviderCommand(),
  );

  // Provider health: unregistered @Injectable classes as diagnostics
  const providerDiagnostics =
    vscode.languages.createDiagnosticCollection("nestjs-devtools");
  const providerHealthSub = vscode.commands.registerCommand(
    "nestjs-log-helper.checkProviderHealth",
    () => void checkProviderHealthCommand(providerDiagnostics),
  );

  // Jump from a provider to the module that registers it
  const goToProvidingModuleSub = vscode.commands.registerCommand(
    "nestjs-log-helper.goToProvidingModule",
    () => void goToProvidingModuleCommand(),
  );

  // API docs coverage: routes missing @ApiOperation
  const apiDocsCoverageSub = vscode.commands.registerCommand(
    "nestjs-log-helper.apiDocsCoverage",
    () => void apiDocsCoverageCommand(),
  );

  // Route conflicts: duplicate/shadowed/overlapping routes, statically
  const routeConflictDiagnostics = vscode.languages.createDiagnosticCollection(
    "nestjs-devtools-routes",
  );
  const routeConflictsSub = vscode.commands.registerCommand(
    "nestjs-log-helper.routeConflicts",
    async () => {
      await routeConflictsCommand(routeConflictDiagnostics);
      conflictWatchActive = true;
    },
  );

  // Quick fixes on Provider Health warnings (register in module)
  const codeActionsSub = vscode.languages.registerCodeActionsProvider(
    { language: "typescript" },
    new RegisterProviderCodeActionProvider(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );

  // The Nest index (classes + module registrations) caches per file — a
  // save reparses only that file; the next command never rescans the
  // workspace (except exclude-setting changes, which drop the whole cache)
  // Route-conflict Problems entries stay accurate as routes change —
  // silently refreshed (debounced) on controller changes, but ONLY once
  // the user has run the command (a non-empty collection = opted in)
  const scheduleConflictRefresh = (): void => {
    if (!conflictWatchActive) return;
    if (conflictRefreshTimer) clearTimeout(conflictRefreshTimer);
    conflictRefreshTimer = setTimeout(() => {
      conflictRefreshTimer = undefined;
      void refreshRouteConflictDiagnostics(routeConflictDiagnostics);
    }, 400);
  };

  const indexInvalidationSub = vscode.workspace.onDidSaveTextDocument((doc) => {
    // The global prefix lives in main/bootstrap — a save can add, change
    // or remove it, which changes every route's served path
    const base = path.basename(doc.uri.fsPath);
    if (base === "main.ts" || base === "bootstrap.ts") {
      invalidateGlobalPrefixCache();
      routesProvider.invalidateAll();
    }
    if (base.endsWith(".controller.ts")) {
      scheduleConflictRefresh();
    }
    updateNestIndexForSave(doc);
  });

  // Settings that affect scans/trees take effect instantly: drop caches
  // and repaint. exclude affects scans; showCounts/colorVerbs/showMissingDocs
  // and customTypes change what the trees render (the old code only
  // watched exclude, so those settings needed a manual refresh despite
  // being documented as instant).
  const REPAINT_SETTINGS = [
    "exclude",
    "tree.showCounts",
    "routes.colorVerbs",
    "swagger.showMissingDocs",
    "customTypes",
    "diagnostics.routeConflicts",
    "routes.baseUrl",
  ];
  const settingsSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      REPAINT_SETTINGS.some((s) =>
        e.affectsConfiguration(`nestjs-devtools.${s}`),
      )
    ) {
      invalidateNestIndex();
      invalidateModuleFilesCache();
      treeProvider.refresh();
      routesProvider.invalidateAll();
      codeLensProvider.refresh();
    }
  });

  // Find usages of the active file's provider (TS language service) —
  // also reachable by right-clicking a file in the Modules tree
  const findUsagesSub = vscode.commands.registerCommand(
    "nestjs-log-helper.findProviderUsages",
    (arg?: unknown) => void findProviderUsagesCommand(arg),
  );

  // Routes tree context menu: copy route / full URL / cURL, controller routes
  const copyRouteSub = vscode.commands.registerCommand(
    "nestjs-log-helper.copyRoute",
    (arg?: unknown) => copyRouteCommand(arg),
  );
  const copyRouteUrlSub = vscode.commands.registerCommand(
    "nestjs-log-helper.copyRouteUrl",
    (arg?: unknown) => copyRouteUrlCommand(arg),
  );
  const copyRouteCurlSub = vscode.commands.registerCommand(
    "nestjs-log-helper.copyRouteCurl",
    (arg?: unknown) => copyRouteCurlCommand(arg),
  );
  const copyControllerRoutesSub = vscode.commands.registerCommand(
    "nestjs-log-helper.copyControllerRoutes",
    (arg?: unknown) => void copyControllerRoutesCommand(arg),
  );

  // Modules tree context menu: register an orphan provider in its module
  const registerInModuleSub = vscode.commands.registerCommand(
    "nestjs-log-helper.registerInModule",
    (arg?: unknown) => void registerInModuleCommand(arg),
  );

  // Generate NestJS file (from command palette or tree view right-click)
  const generateFileSub = vscode.commands.registerCommand(
    "nestjs-log-helper.generateNestFile",
    (item?) => generateNestFileCommand(item),
  );

  // Status bar hub: every feature, no keybindings needed
  const hubSub = vscode.commands.registerCommand(
    "nestjs-log-helper.hub",
    () => void showHubCommand(),
  );

  // Status bar hub button (hidden in non-NestJS workspaces)
  void createModuleSearcherStatusBarItem(context);

  // CodeLens on .module.ts files
  const codeLensProvider = new ModuleCodeLensProvider();
  const codeLensSub = vscode.languages.registerCodeLensProvider(
    { language: "typescript", pattern: "**/*.module.ts" },
    codeLensProvider,
  );

  // Sidebar Tree Views (createTreeView adds the native collapse-all button)
  const treeProvider = new ModuleTreeProvider();
  const moduleTreeView = vscode.window.createTreeView("nestjsModuleTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const routesProvider = new RoutesTreeProvider();
  const routesTreeView = vscode.window.createTreeView("nestjsRoutesTree", {
    treeDataProvider: routesProvider,
    showCollapseAll: true,
  });

  // View-level badges (TreeView.badge): module count / route count,
  // updated by the providers whenever the trees are rebuilt
  treeProvider.badgeSink = (badge) => (moduleTreeView.badge = badge);
  routesProvider.badgeSink = (badge) => (routesTreeView.badge = badge);

  // Refresh tree + CodeLens when .ts files are created or deleted.
  // Builds (nest g, tsc --watch, git checkout) emit bursts of events —
  // coalesce them into a single refresh instead of one full rescan per
  // event file (each full refresh rescans every module dir).
  const debouncedWatcherRefresh = (): void => {
    if (watcherRefreshTimer) {
      clearTimeout(watcherRefreshTimer);
    }
    watcherRefreshTimer = setTimeout(() => {
      watcherRefreshTimer = undefined;
      codeLensProvider.refresh();
      treeProvider.refresh();
    }, 300);
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
  // npm install / build tool bursts inside node_modules shouldn't trigger
  // refreshes (user excludes are honored at scan time anyway — these
  // events would only cause wasted repaints)
  const isExcludedEvent = (fsPath: string): boolean =>
    fsPath.includes(`${path.sep}node_modules${path.sep}`);
  watcher.onDidCreate((uri) => {
    if (isExcludedEvent(uri.fsPath)) return;
    invalidateModuleFilesCache();
    // A newly created controller's routes appear without a manual
    // refresh — symmetric with the delete branch below
    if (uri.fsPath.endsWith(".controller.ts")) {
      routesProvider.invalidateFile(uri);
      scheduleConflictRefresh();
    }
    const base = path.basename(uri.fsPath);
    if (base === "main.ts" || base === "bootstrap.ts") {
      invalidateGlobalPrefixCache();
      routesProvider.invalidateAll();
    }
    debouncedWatcherRefresh();
  });
  watcher.onDidDelete((uri) => {
    if (isExcludedEvent(uri.fsPath)) return;
    removeNestIndexEntry(uri);
    invalidateModuleFilesCache();
    // Only a deleted controller's own parse entry goes stale — routes of
    // every other controller stay valid (was: full cache clear per delete)
    if (uri.fsPath.endsWith(".controller.ts")) {
      routesProvider.invalidateFile(uri);
      scheduleConflictRefresh();
    }
    const base = path.basename(uri.fsPath);
    if (base === "main.ts" || base === "bootstrap.ts") {
      invalidateGlobalPrefixCache();
      routesProvider.invalidateAll();
    }
    debouncedWatcherRefresh();
  });

  // Refresh tree command (the inline button in the view title bar)
  const refreshTreeSub = vscode.commands.registerCommand(
    "nestjs-log-helper.refreshModuleTree",
    () => treeProvider.refresh(),
  );

  const refreshRoutesSub = vscode.commands.registerCommand(
    "nestjs-log-helper.refreshRoutesTree",
    () => routesProvider.invalidateAll(),
  );

  // Live in-view filter boxes for both trees. createInputBox streams
  // onDidChangeValue, so the trees repaint as the user types — matching is
  // purely in-memory over cached parses, no workspace re-scans.
  const openFilterBox = (
    input: vscode.InputBox,
    apply: (value: string) => void,
    onMessage: (value: string) => void,
  ): void => {
    input.onDidChangeValue((value) => {
      apply(value);
      onMessage(value);
    });
    input.onDidAccept(() => input.hide());
    input.onDidHide(() => input.dispose());
    input.show();
  };

  // A fresh InputBox per invocation — openFilterBox disposes the box when
  // hidden, so a cached one could never be re-shown (disposed QuickInputs
  // silently no-op). The current filter value is seeded from the provider,
  // which persists it between sessions.
  const filterModuleTreeSub = vscode.commands.registerCommand(
    "nestjs-log-helper.filterModuleTree",
    () => {
      const box = vscode.window.createInputBox();
      box.value = treeProvider.filterValue;
      box.title = "Filter module files";
      box.placeholder = "e.g. service, auth, dto";
      box.prompt =
        "Type to filter live — matches file and module names. Clear the text and press Enter to reset.";
      openFilterBox(
        box,
        (value) => treeProvider.setFilter(value),
        (value) =>
          (moduleTreeView.message = value.trim()
            ? `Filter: ${value.trim()}`
            : undefined),
      );
    },
  );

  const filterRoutesTreeSub = vscode.commands.registerCommand(
    "nestjs-log-helper.filterRoutesTree",
    () => {
      const box = vscode.window.createInputBox();
      box.value = routesProvider.filterValue;
      box.title = "Filter routes";
      box.placeholder = "e.g. /users, GET, findOne";
      box.prompt =
        "Type to filter live — matches path, method name, verb, or @ApiOperation summary. Clear the text and press Enter to reset.";
      openFilterBox(
        box,
        (value) => routesProvider.setFilter(value),
        (value) =>
          (routesTreeView.message = value.trim()
            ? `Filter: ${value.trim()}`
            : undefined),
      );
    },
  );

  // Open a route from the routes tree at its method line
  const openRouteSub = vscode.commands.registerCommand(
    "nestjs-log-helper.openRoute",
    async (uri: vscode.Uri, line: number) => {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );
      } catch {
        void vscode.window.showErrorMessage(
          "Route file no longer exists — refresh the Routes tree.",
        );
      }
    },
  );

  context.subscriptions.push(
    ...loggerSubs,
    moduleSearcherSub,
    searchFilesSub,
    searchAllSub,
    generateFileSub,
    methodSearcherSub,
    hubSub,
    removeLogsSub,
    injectProviderSub,
    providerHealthSub,
    goToProvidingModuleSub,
    apiDocsCoverageSub,
    routeConflictsSub,
    codeActionsSub,
    providerDiagnostics,
    routeConflictDiagnostics,
    indexInvalidationSub,
    settingsSub,
    findUsagesSub,
    copyRouteSub,
    copyRouteUrlSub,
    copyRouteCurlSub,
    copyControllerRoutesSub,
    registerInModuleSub,
    codeLensSub,
    moduleTreeView,
    routesTreeView,
    routesProvider,
    refreshTreeSub,
    refreshRoutesSub,
    filterModuleTreeSub,
    filterRoutesTreeSub,
    openRouteSub,
    trackActiveEditor(),
    watcher,
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {
  if (watcherRefreshTimer) {
    clearTimeout(watcherRefreshTimer);
  }
  if (conflictRefreshTimer) {
    clearTimeout(conflictRefreshTimer);
  }
}
