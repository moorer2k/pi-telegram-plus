import { describe, expect, it, vi } from "vitest";
import { configVenomThemeFlow } from "../commands/tg-venom-theme.ts";
import type { MenuUi } from "../commands/telegram-commands.ts";
import type { TgConfigDeps } from "../commands/register.ts";
import type { TelegramConfig } from "../types.ts";

function setup(choices: string[]) {
  let config = { venomTheme: { preset: "blacksite" as const, showPulse: true } } as TelegramConfig;
  const menu = vi.fn(async () => choices.shift());
  const select = vi.fn(async () => { throw new Error("select() would send an extra Telegram message"); });
  const notify = vi.fn();
  const persistConfig = vi.fn(async (_next: TelegramConfig) => {});
  const ui = { menu, select, notify, input: vi.fn(), confirm: vi.fn() } as unknown as MenuUi;
  const deps = {
    getConfig: () => config,
    setConfig: (next: TelegramConfig) => { config = next; },
    persistConfig,
    getSession: () => undefined,
  } as TgConfigDeps;
  return { ui, deps, menu, select, notify, persistConfig, getConfig: () => config };
}

describe("Venom appearance menu in-place navigation", () => {
  it("reuses Telegram menu for a changed setting instead of sending duplicate select prompts", async () => {
    const state = setup(["Pulse visibility: on", "Back"]);
    await configVenomThemeFlow(state.ui, state.deps);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.menu).toHaveBeenCalledTimes(2);
    expect(state.persistConfig).toHaveBeenCalledTimes(1);
    expect(state.getConfig().venomTheme?.showPulse).toBe(false);
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("reuses the same menu for nested preset navigation and avoids redundant success notifications", async () => {
    const state = setup(["Preset: blacksite", "minimal-terminal", "Back"]);
    await configVenomThemeFlow(state.ui, state.deps);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.menu).toHaveBeenCalledTimes(3);
    expect(state.getConfig().venomTheme?.preset).toBe("minimal-terminal");
    expect(state.persistConfig).toHaveBeenCalledTimes(1);
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("falls back to select for non-Telegram UI contexts", async () => {
    const state = setup([]);
    const fallback = vi.fn(async () => "Back");
    const ui = { ...state.ui, menu: undefined, select: fallback };
    await configVenomThemeFlow(ui, state.deps);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
