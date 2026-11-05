import * as vscode from "vscode";
import { brandIcon } from "../utils/quickPickHelpers";
import { brandedTitle } from "../utils/quickPickHelpers";

interface HubItem extends vscode.QuickPickItem {
  command?: string;
}

const IS_MAC = process.platform === "darwin";

/** Platform-aware shortcut hint, e.g. "⌘L ⌘M". */
function key(chordSecond: string): string {
  return IS_MAC ? `⌘L ⌘${chordSecond}` : `Ctrl+L Ctrl+${chordSecond}`;
}

/**
 * "NestJS DevTools hub" — every feature in one QuickPick, grouped by type
 * with icons and shortcut hints. Opened from the status bar lion button.
 */
export async function showHubCommand(): Promise<void> {
  const items: HubItem[] = [];

  const add = (group: string, entries: [string, string, string, string][]) => {
    items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
    for (const [label, icon, command, hint] of entries) {
      items.push({
        label,
        description: hint,
        iconPath: brandIcon(icon.replace("$(", "").replace(")", "")),
        command,
      });
    }
  };

  add("Navigate", [
    ["Browse Modules", "$(package)", "nestjs-log-helper.moduleSearcher", key("M")],
    ["Current Module Files", "$(folder-active)", "nestjs-log-helper.searchModuleFiles", key("K")],
    ["Search All Modules & Routes", "$(search)", "nestjs-log-helper.searchAllModules", key("A")],
    ["Methods in File", "$(symbol-method)", "nestjs-log-helper.methodSearcher", key("J")],
    ["Find Provider Usages", "$(references)", "nestjs-log-helper.findProviderUsages", key("U")],
    ["Providing Module", "$(type-hierarchy)", "nestjs-log-helper.goToProvidingModule", ""],
  ]);

  add("Insert", [
    ["Debug Log", "$(bug)", "nestjs-log-helper.insertDebugLog", key("D")],
    ["Info Log", "$(output)", "nestjs-log-helper.insertLogLog", key("L")],
    ["Warn Log", "$(warning)", "nestjs-log-helper.insertWarnLog", key("W")],
    ["Error Log", "$(error)", "nestjs-log-helper.insertErrorLog", key("E")],
    ["Verbose Log", "$(radio-tower)", "nestjs-log-helper.insertVerboseLog", key("V")],
    ["Injected Provider", "$(symbol-parameter)", "nestjs-log-helper.injectProvider", key("I")],
  ]);

  add("Generate", [
    ["NestJS File (+ optional spec)", "$(new-file)", "nestjs-log-helper.generateNestFile", key("N")],
  ]);

  add("Diagnose", [
    ["Provider Health", "$(checklist)", "nestjs-log-helper.checkProviderHealth", ""],
    ["API Docs Coverage", "$(book)", "nestjs-log-helper.apiDocsCoverage", ""],
  ]);

  add("Logs", [
    ["Remove Logs in This File", "$(trash)", "nestjs-log-helper.removeLogs", ""],
  ]);

  const picked = await vscode.window.showQuickPick(items, {
    title: brandedTitle("NestJS DevTools"),
    placeHolder: "Pick a command — or type to filter by name",
    matchOnDescription: true,
  });

  if (picked?.command) {
    await vscode.commands.executeCommand(picked.command);
  }
}
