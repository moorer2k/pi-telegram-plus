import { describe, expect, it, vi } from "vitest";
import { configVenomPhrasesFlow } from "../commands/tg-venom-phrases.ts";
import { STARTING_PHRASES, RETURN_PHRASES, venomRestartPhrase, validatedVenomPhrases } from "../maintenance.ts";
import type { TelegramConfig } from "../types.ts";
import type { MenuUi } from "../commands/telegram-commands.ts";
import type { TgConfigDeps } from "../commands/register.ts";

function harness(choices: Array<string | undefined>, inputs: Array<string | undefined> = [], confirms: boolean[] = []) {
  let config: TelegramConfig = {};
  const menu = vi.fn(async () => choices.shift());
  const select = vi.fn(async () => { throw new Error("Telegram selection must edit the existing menu"); });
  const input = vi.fn(async () => inputs.shift());
  const confirm = vi.fn(async () => confirms.shift() ?? false);
  const notify = vi.fn();
  const persistConfig = vi.fn(async (_next: TelegramConfig) => {});
  const ui = { menu, select, input, confirm, notify } as unknown as MenuUi;
  const deps = {
    getConfig: () => config,
    setConfig: (next: TelegramConfig) => { config = next; },
    persistConfig,
    getSession: () => undefined,
  } as TgConfigDeps;
  return { ui, deps, menu, select, input, confirm, notify, persistConfig, getConfig: () => config };
}

describe("Venom restart phrase editor", () => {
  it("shows bundled defaults when no custom phrases are set", () => {
    expect(validatedVenomPhrases("before")).toEqual(STARTING_PHRASES);
    expect(validatedVenomPhrases("after")).toEqual(RETURN_PHRASES);
    expect(validatedVenomPhrases("before", { before: [] })).toEqual(STARTING_PHRASES);
  });

  it("uses custom phrase pools rather than hardcoded defaults", () => {
    for (let i = 0; i < 10; i++) {
      expect(venomRestartPhrase("before", { before: ["The suit is evolving."] })).toBe("The suit is evolving.");
      expect(venomRestartPhrase("after", { after: ["We are online."] })).toBe("We are online.");
    }
    expect(validatedVenomPhrases("before", { before: ["bad\nphrase"] })).toEqual(STARTING_PHRASES);
  });

  it("adds an original phrase and persists it to project settings", async () => {
    const h = harness(["Before restart", "Add phrase", "Back", "Back"], ["We rise again."]);
    await configVenomPhrasesFlow(h.ui, h.deps);
    expect(h.getConfig().venomRestartPhrases?.before).toContain("We rise again.");
    expect(h.getConfig().venomRestartPhrases?.before).toHaveLength(STARTING_PHRASES.length + 1);
    expect(h.persistConfig).toHaveBeenCalledOnce();
    expect(h.select).not.toHaveBeenCalled();
  });

  it("deletes a chosen phrase only after confirmation", async () => {
    const h = harness(["After restart", "1. " + RETURN_PHRASES[0], "Delete this phrase", "Back", "Back"], [], [true]);
    await configVenomPhrasesFlow(h.ui, h.deps);
    expect(h.getConfig().venomRestartPhrases?.after).not.toContain(RETURN_PHRASES[0]);
    expect(h.getConfig().venomRestartPhrases?.after).toHaveLength(RETURN_PHRASES.length - 1);
    expect(h.confirm).toHaveBeenCalledOnce();
  });

  it("restores default phrases and preserves the other phase", async () => {
    const h = harness(["Before restart", "Restore default phrases", "Back", "Back"], [], [true]);
    h.deps.setConfig({ venomRestartPhrases: { before: ["custom"], after: ["return custom"] } });
    await configVenomPhrasesFlow(h.ui, h.deps);
    expect(h.getConfig().venomRestartPhrases?.before).toEqual(STARTING_PHRASES);
    expect(h.getConfig().venomRestartPhrases?.after).toEqual(["return custom"]);
  });

  it("refuses to delete the only remaining phrase", async () => {
    const h = harness(["Before restart", "1. Last", "Delete this phrase", "Back", "Back"]);
    h.deps.setConfig({ venomRestartPhrases: { before: ["Last"] } });
    await configVenomPhrasesFlow(h.ui, h.deps);
    expect(h.persistConfig).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("At least one"), "error");
  });
});
