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
import { RegisterProviderCodeActionProvider } from "./commands/registerProviderFix";
import { searchAllModulesCommand } from "./commands/searchAllModules";
import { searchModuleFilesCommand } from "./commands/searchModuleFiles";
import { LOGGER_METHODS } from "./constants";
import { ModuleCodeLensProvider } from "./providers/moduleCodeLensProvider";
import { ModuleTreeProvider } from "./providers/moduleTreeProvider";
import { RoutesTreeProvider } from "./providers/routesTreeProvider";
import { invalidateNestIndex } from "./utils/nestIndex";
import { trackActiveEditor } from "./utils/targetEditor";
import { createModuleSearcherStatusBarItem } from "./statusBar";

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

  // Quick fixes on Provider Health warnings (register in module)
  const codeActionsSub = vscode.languages.registerCodeActionsProvider(
    { language: "typescript" },
    new RegisterProviderCodeActionProvider(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );

  // The Nest index (classes + module registrations) only caches — file
  // saves just drop the cache; the next command rebuilds lazily
  const indexInvalidationSub = vscode.workspace.onDidSaveTextDocument(() =>
    invalidateNestIndex(),
  );

  // Settings that affect scans/trees take effect instantly: drop caches and
  // repaint when the exclude patterns change
  const settingsSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("nestjs-devtools.exclude")) {
      invalidateNestIndex();
      treeProvider.refresh();
      routesProvider.invalidateAll();
      codeLensProvider.refresh();
    }
  });

  // Find usages of the active file's provider (TS language service)
  const findUsagesSub = vscode.commands.registerCommand(
    "nestjs-log-helper.findProviderUsages",
    () => void findProviderUsagesCommand(),
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

  // Refresh tree + CodeLens when .ts files are created or deleted
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.ts");
  watcher.onDidCreate(() => {
    codeLensProvider.refresh();
    treeProvider.refresh();
  });
  watcher.onDidDelete(() => {
    codeLensProvider.refresh();
    treeProvider.refresh();
    routesProvider.invalidateAll();
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

  let moduleFilterBox: vscode.InputBox | undefined;
  const filterModuleTreeSub = vscode.commands.registerCommand(
    "nestjs-log-helper.filterModuleTree",
    () => {
      if (moduleFilterBox) {
        moduleFilterBox.value = treeProvider.filterValue;
        moduleFilterBox.show();
        return;
      }
      moduleFilterBox = vscode.window.createInputBox();
      moduleFilterBox.value = treeProvider.filterValue;
      moduleFilterBox.title = "Filter module files";
      moduleFilterBox.placeholder = "e.g. service, auth, dto";
      moduleFilterBox.prompt =
        "Type to filter live — matches file and module names. Clear the text and press Enter to reset.";
      openFilterBox(
        moduleFilterBox,
        (value) => treeProvider.setFilter(value),
        (value) =>
          (moduleTreeView.message = value.trim()
            ? `Filter: ${value.trim()}`
            : undefined),
      );
    },
  );

  let routesFilterBox: vscode.InputBox | undefined;
  const filterRoutesTreeSub = vscode.commands.registerCommand(
    "nestjs-log-helper.filterRoutesTree",
    () => {
      if (routesFilterBox) {
        routesFilterBox.value = routesProvider.filterValue;
        routesFilterBox.show();
        return;
      }
      routesFilterBox = vscode.window.createInputBox();
      routesFilterBox.value = routesProvider.filterValue;
      routesFilterBox.title = "Filter routes";
      routesFilterBox.placeholder = "e.g. /users, GET, findOne";
      routesFilterBox.prompt =
        "Type to filter live — matches path, method name, verb, or @ApiOperation summary. Clear the text and press Enter to reset.";
      openFilterBox(
        routesFilterBox,
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
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter,
      );
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
    codeActionsSub,
    providerDiagnostics,
    indexInvalidationSub,
    settingsSub,
    findUsagesSub,
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

export function deactivate() {}
