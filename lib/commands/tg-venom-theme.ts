import type { TgConfigDeps } from "./register.ts";
import type { MenuUi } from "./telegram-commands.ts";
import type { VenomThemeOptions } from "../types.ts";
import { VENOM_DEFAULTS, venomStatusLabel, venomThemeNumber, venomThemeText, venomThemeLabel, venomPreset, venomSectionTitle, venomTransmissionTitle, VENOM_PRESETS, type VenomThemePreset, type VenomActivity } from "../venom-theme.ts";

type TextKey = "title" | "sectionTitle" | "transmissionTitle" | "footerLabel" | "consolePrefix" | "awaitingText";
const textFields: Array<[TextKey, string, number]> = [
  ["title", "Bot title", 72],
  ["sectionTitle", "Console heading", 72],
  ["transmissionTitle", "Transmission heading", 72],
  ["footerLabel", "Elapsed-time label", 24],
  ["consolePrefix", "Terminal prompt", 8],
  ["awaitingText", "Waiting text", 72],
];
const activities: VenomActivity[] = ["awakening", "tracking", "examining", "testing", "adapting", "hunting"];
const BACK = "Back";
const defaults = VENOM_DEFAULTS;

/** Reuse the live /tg menu message instead of sending new selection messages. */
function pick(ui: MenuUi, title: string, options: string[]): Promise<string | undefined> {
  return ui.menu ? ui.menu(title, options) : ui.select(title, options);
}

async function save(deps: TgConfigDeps, theme: VenomThemeOptions): Promise<void> {
  const next = { ...deps.getConfig(), venomTheme: theme };
  deps.setConfig(next);
  await deps.persistConfig(next);
}

function valueLabel(label: string, value: string): string {
  return label + ": " + (value.length > 38 ? value.slice(0, 37) + "…" : value);
}

export async function configVenomThemeFlow(ui: MenuUi, deps: TgConfigDeps): Promise<void> {
  while (true) {
    const theme = deps.getConfig().venomTheme ?? {};
    const entries = textFields.map(([key, label]) => valueLabel(label, key === "sectionTitle" ? venomSectionTitle(theme) : key === "transmissionTitle" ? venomTransmissionTitle(theme) : venomThemeText(theme[key], defaults[key])));
    const statuses = activities.map(key => valueLabel(venomStatusLabel(key), venomThemeLabel(key, theme)));
    const options = [
      "Preset: " + venomPreset(theme),
      "Text and headings",
      "Activity names",
      "Animation: " + (theme.animation ?? "symbiote"),
      "Pulse visibility: " + (theme.showPulse === false ? "off" : "on"),
      "Animation interval: " + venomThemeNumber(theme.animationIntervalMs, 2600, 1800, 15000) + "ms",
      "Console entries: " + venomThemeNumber(theme.visibleOperations, 3, 1, 8),
      "Preview characters: " + venomThemeNumber(theme.previewLength, 500, 100, 1500),
      "Show operation count: " + (theme.showOperations === false ? "off" : "on"),
      "Show hunting time: " + (theme.showElapsed === false ? "off" : "on"),
      "Reset Venom appearance",
      BACK,
    ];
    const choice = await pick(ui, "Venom appearance", options);
    if (!choice || choice === BACK) return;
    if (choice === options[0]) {
      const presets: VenomThemePreset[] = ["blacksite", "lethal-protector", "minimal-terminal"];
      const selected = await pick(ui, "Venom presentation preset (replaces preset headings and labels)", presets);
      if (!selected || !presets.includes(selected as VenomThemePreset)) continue;
      const preset = selected as VenomThemePreset;
      const updated = { ...theme, preset, sectionTitle: VENOM_PRESETS[preset].sectionTitle,
        transmissionTitle: VENOM_PRESETS[preset].transmissionTitle, labels: { ...VENOM_PRESETS[preset].labels } };
      await save(deps, updated);
    } else if (choice === options[1]) {
      const selected = await pick(ui, "Edit Venom text", [...entries, BACK]);
      if (!selected || selected === BACK) continue;
      const idx = entries.indexOf(selected);
      if (idx < 0) continue;
      const [key, label, max] = textFields[idx];
      const current = key === "sectionTitle" ? venomSectionTitle(theme) : key === "transmissionTitle" ? venomTransmissionTitle(theme) : venomThemeText(theme[key], defaults[key]);
      const input = await ui.input(label + " (max " + max + " characters; blank resets)", current);
      if (input === undefined) continue;
      const updated = { ...theme };
      if (!input.trim()) delete updated[key];
      else updated[key] = venomThemeText(input, defaults[key], max);
      await save(deps, updated);
    } else if (choice === options[2]) {
      const selected = await pick(ui, "Edit activity wording", [...statuses, BACK]);
      if (!selected || selected === BACK) continue;
      const idx = statuses.indexOf(selected);
      if (idx < 0) continue;
      const key = activities[idx];
      const current = venomThemeLabel(key, theme);
      const input = await ui.input("Activity label (blank resets)", current);
      if (input === undefined) continue;
      const labels = { ...theme.labels };
      if (!input.trim()) delete labels[key];
      else labels[key] = venomThemeText(input, venomStatusLabel(key), 48);
      await save(deps, { ...theme, labels });
    } else if (choice === options[3]) {
      const choices = ["symbiote", "spinner", "static"] as const;
      const selected = await pick(ui, "Animation style", [...choices]);
      if (selected && choices.some(v => v === selected)) {
        await save(deps, { ...theme, animation: selected as typeof choices[number] });
      }
    } else if (choice === options[4]) {
      await save(deps, { ...theme, showPulse: theme.showPulse === false });
    } else if (choice === options[5] || choice === options[6] || choice === options[7]) {
      const isInterval = choice === options[5];
      const isCount = choice === options[6];
      const key = isInterval ? "animationIntervalMs" : isCount ? "visibleOperations" : "previewLength";
      const [min, max, initial] = isInterval ? [1800, 15000, 2600] : isCount ? [1, 8, 3] : [100, 1500, 500];
      const input = await ui.input(key + " (" + min + " to " + max + ")", String(venomThemeNumber(theme[key], initial, min, max)));
      if (input === undefined) continue;
      const n = Number(input.trim());
      if (!Number.isInteger(n) || n < min || n > max) {
        ui.notify("Enter an integer between " + min + " and " + max, "error");
        continue;
      }
      await save(deps, { ...theme, [key]: n });
    } else if (choice === options[8]) {
      await save(deps, { ...theme, showOperations: theme.showOperations === false });
    } else if (choice === options[9]) {
      await save(deps, { ...theme, showElapsed: theme.showElapsed === false });
    } else if (choice === options[10]) {
      if (await ui.confirm("Reset Venom appearance?", "Restore all default theme labels, animations and layout settings?")) {
        await save(deps, {});
      }
    }
  }
}
