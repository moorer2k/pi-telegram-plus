import type { MenuUi } from "./telegram-commands.ts";
import type { TgConfigDeps } from "./register.ts";
import type { VenomRestartPhrases } from "../types.ts";
import { STARTING_PHRASES, RETURN_PHRASES, MAX_VENOM_PHRASES, MAX_VENOM_PHRASE_LENGTH, validatedVenomPhrases } from "../maintenance.ts";

const BACK = "Back";
type Phase = "before" | "after";

function pick(ui: MenuUi, title: string, options: string[]): Promise<string | undefined> {
  return ui.menu ? ui.menu(title, options) : ui.select(title, options);
}

async function save(deps: TgConfigDeps, phrases: VenomRestartPhrases): Promise<void> {
  const next = { ...deps.getConfig(), venomRestartPhrases: phrases };
  await deps.persistConfig(next);
  deps.setConfig(next);
}

function phraseMenuLabel(value: string, index: number): string {
  return String(index + 1) + ". " + (value.length > 55 ? value.slice(0, 52) + "..." : value);
}

export async function configVenomPhrasesFlow(ui: MenuUi, deps: TgConfigDeps): Promise<void> {
  while (true) {
    const phaseChoice = await pick(ui, "Venom restart phrases", [
      "Before restart", "After restart", BACK,
    ]);
    if (!phaseChoice || phaseChoice === BACK) return;
    const phase: Phase = phaseChoice === "Before restart" ? "before" : "after";
    while (true) {
      const existing = deps.getConfig().venomRestartPhrases;
      const phrases = validatedVenomPhrases(phase, existing);
      const labels = phrases.map(phraseMenuLabel);
      const selection = await pick(ui, phaseChoice + " (" + phrases.length + " phrases)", [
        ...labels, "Add phrase", "Restore default phrases", BACK,
      ]);
      if (!selection || selection === BACK) break;
      if (selection === "Add phrase") {
        if (phrases.length >= MAX_VENOM_PHRASES) {
          ui.notify("Maximum " + MAX_VENOM_PHRASES + " phrases per phase.", "error");
          continue;
        }
        const input = await ui.input("New Venom phrase (max " + MAX_VENOM_PHRASE_LENGTH + " characters)");
        if (input === undefined) continue;
        const phrase = input.trim();
        if (!phrase || phrase.length > MAX_VENOM_PHRASE_LENGTH || /[\x00-\x1f\x7f]/.test(phrase)) {
          ui.notify("Enter a single-line phrase of 1–" + MAX_VENOM_PHRASE_LENGTH + " characters.", "error");
          continue;
        }
        if (phrases.includes(phrase)) {
          ui.notify("That phrase already exists.", "error");
          continue;
        }
        await save(deps, { ...existing, [phase]: [...phrases, phrase] });
        continue;
      }
      if (selection === "Restore default phrases") {
        if (await ui.confirm("Restore " + phaseChoice + " defaults?", "Replace this phrase list with the original Venom phrases?")) {
          const defaults = phase === "before" ? STARTING_PHRASES : RETURN_PHRASES;
          await save(deps, { ...existing, [phase]: [...defaults] });
        }
        continue;
      }
      const index = labels.indexOf(selection);
      if (index < 0) continue;
      const choice = await pick(ui, "Phrase " + String(index + 1) + ": " + phrases[index], [
        "Delete this phrase", BACK,
      ]);
      if (choice !== "Delete this phrase") continue;
      if (phrases.length <= 1) {
        ui.notify("At least one phrase is required. Add another before deleting the last one.", "error");
        continue;
      }
      if (!await ui.confirm("Delete Venom phrase?", phrases[index])) continue;
      await save(deps, { ...existing, [phase]: phrases.filter((_, i) => i !== index) });
    }
  }
}
