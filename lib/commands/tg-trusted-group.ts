import type { MenuUi } from "./telegram-commands.ts";
import type { TgConfigDeps } from "./register.ts";
import type { TelegramTrustedGroupMember } from "../types.ts";
import { MAX_TRUSTED_GROUP_MEMBERS, MAX_TRUSTED_NAME_LENGTH, safeTelegramDisplayName, validTelegramUserId } from "../group-trust.ts";

const BACK = "Back";

function pick(ui: MenuUi, title: string, options: string[]): Promise<string | undefined> {
  return ui.menu ? ui.menu(title, options) : ui.select(title, options);
}

async function save(deps: TgConfigDeps, entries: TelegramTrustedGroupMember[]): Promise<void> {
  const next = { ...deps.getConfig(), trustedGroupMembers: entries };
  await deps.persistConfig(next);
  deps.setConfig(next);
}

/** Owner-invoked menu only. Trust affects identified mentions, never command authority. */
export async function configTrustedGroupMembersFlow(ui: MenuUi, deps: TgConfigDeps): Promise<void> {
  while (true) {
    const members = deps.getConfig().trustedGroupMembers ?? [];
    const labels = members.map(m => m.name + " (ID: " + m.id + ")");
    const selection = await pick(ui,
      "Trusted group participants (" + members.length + ") · group mentions only",
      [...labels, "Add participant", BACK]);
    if (!selection || selection === BACK) return;
    if (selection === "Add participant") {
      if (members.length >= MAX_TRUSTED_GROUP_MEMBERS) {
        ui.notify("Maximum " + MAX_TRUSTED_GROUP_MEMBERS + " trusted group participants.", "error");
        continue;
      }
      const idText = await ui.input("Telegram numerical user ID");
      if (idText === undefined) continue;
      if (!/^[1-9][0-9]{0,15}$/.test(idText.trim())) {
        ui.notify("Enter a valid positive Telegram numerical user ID.", "error");
        continue;
      }
      const id = Number(idText.trim());
      if (!validTelegramUserId(id) || members.some(member => member.id === id) ||
          deps.getConfig().allowedUserId === id) {
        ui.notify("Invalid, duplicate or owner ID. Use a different participant ID.", "error");
        continue;
      }
      const nameText = await ui.input("Participant display name (max " + MAX_TRUSTED_NAME_LENGTH + " characters)");
      if (nameText === undefined) continue;
      const name = safeTelegramDisplayName(nameText);
      if (!name) {
        ui.notify("Participant display name cannot be blank.", "error");
        continue;
      }
      const confirm = await ui.confirm("Trust " + name + "?", "Allow Telegram ID " + id +
        " to mention the bot in groups without owner privileges? They still share the underlying Pi session. Do not use in untrusted groups.");
      if (!confirm) continue;
      await save(deps, [...members, { id, name }]);
      continue;
    }
    const index = labels.indexOf(selection);
    if (index < 0) continue;
    const member = members[index];
    const action = await pick(ui, "Participant: " + member.name + " (" + member.id + ")",
      ["Remove participant", BACK]);
    if (action !== "Remove participant") continue;
    if (!await ui.confirm("Remove trusted group participant?", member.name + " (ID: " + member.id + ")")) continue;
    await save(deps, members.filter(entry => entry.id !== member.id));
  }
}
