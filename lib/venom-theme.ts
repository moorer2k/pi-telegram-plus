import type { VenomThemeOptions } from "./types.ts";
/** Telegram-friendly Lethal Protector visual identity.
 * Frames are activity pulses, not estimates of task completion.
 * No HTML escaping here; the renderer owns escaping of untrusted tool text.
 */
export const VENOM_PULSE_FRAMES = [
  { eye: "◐", pulse: "▱▱▱▱▱▱" },
  { eye: "◓", pulse: "▰▱▱▱▱▱" },
  { eye: "◑", pulse: "▰▰▱▱▱▱" },
  { eye: "◒", pulse: "▰▰▰▱▱▱" },
  { eye: "◐", pulse: "▰▰▰▰▱▱" },
  { eye: "◓", pulse: "▰▰▰▰▰▱" },
  { eye: "◑", pulse: "▰▰▰▰▰▰" },
] as const;

export type VenomActivity = "awakening" | "tracking" | "examining" | "testing" | "adapting" | "hunting";

export function venomActivity(toolName: string, args: unknown): VenomActivity {
  const name = toolName.toLowerCase();
  const obj = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const command = typeof obj.command === "string" ? obj.command : "";
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|typecheck)\b|\b(?:pytest|vitest|jest|go test|cargo test|phpunit)\b/i.test(command)) return "testing";
  if (name === "read" || name === "edit" || name === "write") return "examining";
  if (/\b(?:grep|rg|find|git log|git grep)\b/i.test(command) || name === "grep" || name === "search") return "tracking";
  if (/\b(?:retry|rebuild|restart|fix|patch)\b/i.test(command)) return "adapting";
  return "hunting";
}

export function venomStatusLabel(activity: VenomActivity): string {
  const labels: Record<VenomActivity, string> = {
    awakening: "Awakening",
    tracking: "Tracking",
    examining: "Examining the Target",
    testing: "Testing the Prey",
    adapting: "Adapting",
    hunting: "On the Hunt",
  };
  return labels[activity];
}

export function venomPulse(index: number) {
  return VENOM_PULSE_FRAMES[((index % VENOM_PULSE_FRAMES.length) + VENOM_PULSE_FRAMES.length) % VENOM_PULSE_FRAMES.length];
}

/** Elapsed hunt time is wall-clock duration, not an estimate of completion. */
export function formatHuntDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(elapsedMs) ? elapsedMs / 1000 : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0 ? `${minutes}m ${seconds}s`
    : `${seconds}s`;
}

/** Actual tool summaries remain intact, rendered as compact terminal entries. */
export function formatConsoleActivity(lines: readonly string[], escape: (value: string) => string): string {
  if (lines.length === 0) return "<code>&gt; awaiting target…</code>";
  return lines.slice(-3).map(line => "<code>&gt; " + escape(line) + "</code>").join("\n");
}

export const VENOM_DEFAULTS = {
  title: "VENOM // LETHAL PROTECTOR",
  sectionTitle: "THE HUNT // TERMINAL",
  transmissionTitle: "SYMBIOTE TRANSMISSION",
  footerLabel: "hunting",
  consolePrefix: ">",
  divider: "━━━━━━━━━━━━",
  awaitingText: "awaiting target…",
} as const;

export function venomThemeText(value: unknown, fallback: string, max = 72): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\x00-\x1f\x7f<>]/g, " ").trim().slice(0, max);
  return clean || fallback;
}

export function venomThemeNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

export type VenomThemePreset = NonNullable<VenomThemeOptions["preset"]>;

export const VENOM_PRESETS = {
  "lethal-protector": {
    sectionTitle: "THE HUNT // TERMINAL",
    transmissionTitle: "SYMBIOTE TRANSMISSION",
    labels: {
      awakening: "Awakening",
      tracking: "Tracking",
      examining: "Examining the Target",
      testing: "Testing the Prey",
      adapting: "Adapting",
      hunting: "On the Hunt",
    },
  },
  blacksite: {
    sectionTitle: "[ SYMBIOTE TERMINAL ]",
    transmissionTitle: "[ NEURAL LINK ]",
    labels: {
      awakening: "SYMBIOTE ONLINE",
      tracking: "TARGET ACQUIRED",
      examining: "DEEP RECON",
      testing: "VALIDATING TARGET",
      adapting: "SYMBIOTE ADAPTING",
      hunting: "ACTIVE HUNT",
    },
  },
  "symbiote-hud": {
    sectionTitle: "SYMBIOTE ACTIVITY",
    transmissionTitle: "NEURAL LINK",
    labels: {
      awakening: "LINK ESTABLISHED", tracking: "ACQUIRING TARGET",
      examining: "ANALYZING TARGET", testing: "VERIFYING TARGET",
      adapting: "SYMBIOTE ADAPTING", hunting: "HUNT ACTIVE",
    },
  },
  "predator-terminal": {
    sectionTitle: "TERMINAL",
    transmissionTitle: "OUTPUT",
    labels: {
      awakening: "INITIALIZING", tracking: "RECON",
      examining: "READING", testing: "VERIFYING",
      adapting: "RECOVERING", hunting: "EXECUTING",
    },
  },
  classified: {
    sectionTitle: "ACTIVITY LOG",
    transmissionTitle: "INTELLIGENCE REPORT",
    labels: {
      awakening: "ACCESS GRANTED", tracking: "TARGET ACQUIRED",
      examining: "DEEP ANALYSIS", testing: "VERIFICATION",
      adapting: "COUNTERMEASURES", hunting: "OPERATION ACTIVE",
    },
  },
  "minimal-terminal": {
    sectionTitle: "TERMINAL",
    transmissionTitle: "RESPONSE",
    labels: {
      awakening: "Starting",
      tracking: "Searching",
      examining: "Reading",
      testing: "Testing",
      adapting: "Retrying",
      hunting: "Working",
    },
  },
} satisfies Record<VenomThemePreset, { sectionTitle: string; transmissionTitle: string; labels: Record<VenomActivity, string> }>;

export function venomPreset(options?: VenomThemeOptions): VenomThemePreset {
  const key = options?.preset;
  return key && Object.prototype.hasOwnProperty.call(VENOM_PRESETS, key) ? key : "lethal-protector";
}

export function venomSectionTitle(options?: VenomThemeOptions): string {
  return venomThemeText(options?.sectionTitle, VENOM_PRESETS[venomPreset(options)].sectionTitle);
}

export function venomTransmissionTitle(options?: VenomThemeOptions): string {
  return venomThemeText(options?.transmissionTitle, VENOM_PRESETS[venomPreset(options)].transmissionTitle);
}

export function venomToolTag(toolName: string, args: unknown, isError = false): string {
  if (isError) return "ERROR";
  const name = toolName.toLowerCase();
  const data = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const command = typeof data.command === "string" ? data.command : "";
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|typecheck)\b|\b(?:pytest|vitest|jest|go test|cargo test|phpunit)\b/i.test(command)) return "VERIFY";
  if (/\b(?:rg|grep|find|git log|git grep)\b/i.test(command) || name === "grep" || name === "search") return "RECON";
  if (name === "read" || name === "view") return "READ";
  if (name === "edit" || name === "write" || name === "apply_patch") return "PATCH";
  if (name === "bash" || name === "exec" || name === "terminal") return "EXEC";
  return "TRACE";
}

/** Tag only the observed operation; never claim a scan, patch, or test that did not happen. */
export function venomToolLine(toolName: string, args: unknown, brief: string, options?: VenomThemeOptions, isError = false): string {
  if (venomPreset(options) === "lethal-protector") return brief;
  const tag = venomToolTag(toolName, args, isError);
  const source = brief.replace(/^❌\s*/, "").replace(/^\S+\s*:\s*/, "").trim();
  return "[" + tag + "] " + source;
}

export function venomCompletionLabel(verified: boolean, options?: VenomThemeOptions): string {
  if (venomPreset(options) === "blacksite") return verified ? "HUNT COMPLETE // VERIFIED" : "HUNT COMPLETE // UNVERIFIED";
  if (venomPreset(options) === "minimal-terminal") return verified ? "Completed // verified" : "Completed // unverified";
  return "Standing Down";
}

export function venomThemeLabel(activity: VenomActivity, options?: VenomThemeOptions): string {
  return venomThemeText(options?.labels?.[activity], VENOM_PRESETS[venomPreset(options)].labels[activity], 48);
}

export function venomThemeFrame(index: number, options?: VenomThemeOptions) {
  if (options?.animation === "static") return { eye: "◆", pulse: "" };
  const frame = venomPulse(index);
  if (options?.animation === "spinner") return { eye: frame.eye, pulse: "" };
  return frame;
}

export function formatVenomConsole(
  lines: readonly string[],
  escape: (value: string) => string,
  options?: VenomThemeOptions,
): string {
  const prefix = venomThemeText(options?.consolePrefix, VENOM_DEFAULTS.consolePrefix, 8);
  const maxLines = venomThemeNumber(options?.visibleOperations, 3, 1, 8);
  const selected = lines.slice(-maxLines);
  if (selected.length === 0) return "<code>" + escape(prefix + " " + venomThemeText(options?.awaitingText, VENOM_DEFAULTS.awaitingText)) + "</code>";
  return selected.map(line => "<code>" + escape(prefix + " " + line) + "</code>").join("\n");
}

/** Telegram-native compact inline-code rows. Unlike <pre>, these avoid
 * large full-width copy-code cards for a handful of short operations. */
export function formatVenomCompactOperations(
  lines: readonly string[],
  escape: (text: string) => string,
  options?: VenomThemeOptions,
): string {
  const prefix = venomThemeText(options?.consolePrefix, VENOM_DEFAULTS.consolePrefix, 8);
  const size = venomThemeNumber(options?.visibleOperations, 3, 1, 8);
  const selected = lines.slice(-size);
  if (!selected.length) return "<i>" + escape(venomThemeText(options?.awaitingText, VENOM_DEFAULTS.awaitingText)) + "</i>";
  return selected.map(line => {
    const match = /^\[([A-Z]+)\]\s*(.*)$/.exec(line);
    const label = match?.[1];
    const detail = (match?.[2] ?? line).slice(0, 110);
    return label && /^(RECON|READ|PATCH|VERIFY|EXEC|TRACE|ERROR)$/.test(label)
      ? "<b>[" + label + "]</b> <code>" + escape(prefix + " " + detail) + "</code>"
      : "<code>" + escape(prefix + " " + detail) + "</code>";
  }).join("\n");
}

/** Render only measured context usage; never invent a percentage or limit. */
export function formatVenomContextUsage(
  usage: unknown,
  modelWindow?: unknown,
): string | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const data = usage as Record<string, unknown>;
  const limit = typeof data.contextWindow === "number" && Number.isFinite(data.contextWindow) && data.contextWindow > 0
    ? data.contextWindow
    : typeof modelWindow === "number" && Number.isFinite(modelWindow) && modelWindow > 0
      ? modelWindow : undefined;
  const tokens = typeof data.tokens === "number" && Number.isFinite(data.tokens) && data.tokens >= 0 ? data.tokens : undefined;
  if (!limit) return undefined;
  const percent = tokens !== undefined ? tokens / limit * 100
    : typeof data.percent === "number" && Number.isFinite(data.percent) && data.percent >= 0 && data.percent <= 100
      ? data.percent : undefined;
  if (percent === undefined) return undefined;
  const size = limit >= 1000 ? (limit / 1000).toFixed(limit % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(limit));
  return percent.toFixed(1) + "% / " + size;
}

/** Compact single-line information footer. Omit unavailable live metrics. */
export function formatVenomFooter(
  operations: number,
  elapsedMs: number,
  context: string | undefined,
  modelName: string | undefined,
  options?: VenomThemeOptions,
): string {
  const parts: string[] = [];
  if (options?.showOperations !== false) parts.push(Math.max(0, Math.floor(operations)) + " operations");
  if (context) parts.push(context);
  if (modelName) parts.push(venomThemeText(modelName, "", 55));
  if (options?.showElapsed !== false) {
    parts.push(venomThemeText(options?.footerLabel, VENOM_DEFAULTS.footerLabel, 24) + " " + formatHuntDuration(elapsedMs));
  }
  return parts.filter(Boolean).join(" · ");
}

/** Blacksite telemetry uses two complete lines, without decorative tail bars. */
export function formatVenomTelemetry(
  operations: number,
  elapsedMs: number,
  context: string | undefined,
  modelName: string | undefined,
  options?: VenomThemeOptions,
): string {
  if (venomPreset(options) !== "blacksite") return formatVenomFooter(operations, elapsedMs, context, modelName, options);
  const first = [
    options?.showOperations === false ? "" : Math.max(0, Math.floor(operations)) + " OPS",
    context,
    modelName ? venomThemeText(modelName, "", 55) : "",
  ].filter(Boolean).join(" · ");
  const second = options?.showElapsed === false ? "" :
    "HUNT TIME " + formatHuntDuration(elapsedMs);
  return [first, second].filter(Boolean).join("\n");
}

/** Wrap HTML-escaped console lines in one native Telegram code block. */
export function formatVenomTerminalBlock(escapedInlineCode: string): string {
  return "<pre>" + escapedInlineCode.replaceAll("<code>", "").replaceAll("</code>", "") + "</pre>";
}

/** A bounded, deterministic set of latest operations and optional older history.
 * The plain and expandable paths share one data source. */
export function formatVenomActivityHistory(
  lines: readonly string[],
  escape: (text: string) => string,
  options?: VenomThemeOptions,
): string {
  const count = venomThemeNumber(options?.visibleOperations, 3, 1, 12);
  const newest = lines.slice(-count);
  const older = lines.slice(0, Math.max(0, lines.length - count));
  const prefix = venomThemeText(options?.consolePrefix, VENOM_DEFAULTS.consolePrefix, 8);
  const fixedRows = options?.fixedOperationRows !== false;
  const formatLine = (line: string): string => {
    const match = /^\[([A-Z]+)\]\s*(.*)$/.exec(line);
    const tag = match?.[1];
    const raw = match?.[2] ?? line;
    // A one-line activity row keeps Telegram's bubble from growing unpredictably.
    const clean = raw.replace(/\s+/g, " ").trim();
    const detailLimit = fixedRows ? 36 : options?.operationDetail === "full" ? 100 : 66;
    const detail = clean.slice(0, detailLimit);
    return tag && /^(RECON|READ|PATCH|VERIFY|EXEC|TRACE|ERROR)$/.test(tag)
      ? "<b>[" + tag + "]</b> <code>" + escape(prefix + " " + detail) + "</code>"
      : "<code>" + escape(prefix + " " + detail) + "</code>";
  };
  const placeholders = fixedRows ? Array.from({ length: Math.max(0, count - newest.length) },
    () => "<code>" + escape("· awaiting operation") + "</code>") : [];
  const rows = [...placeholders, ...newest.map(formatLine)];
  if (rows.length === 0) rows.push("<i>" + escape(venomThemeText(options?.awaitingText, VENOM_DEFAULTS.awaitingText)) + "</i>");
  const current = rows.join("\n");
  if (options?.collapseOperations !== "expandable" || !older.length) return current;
  // A native Telegram HTML expandable blockquote: older actions can be tapped
  // open, without a new message or a custom callback button.
  const history = older.slice(-20).map(line => escape(line.replace(/\s+/g, " ").slice(0, 105))).join("\n");
  const omitted = Math.max(0, older.length - 20);
  return current + "\n<blockquote expandable>" + older.length + " earlier operations · tap to expand\n" +
    (omitted ? omitted + " older entries omitted\n" : "") + history + "</blockquote>";
}

/** Live progress is an event model, not a sequence of unstructured console lines. */
export type VenomLiveOperation = {
  id: string;
  tag: string;
  tool: string;
  detail: string;
  state: "running" | "done" | "failed";
  startedAt: number;
  finishedAt?: number;
};

export function formatVenomLiveOperations(
  operations: readonly VenomLiveOperation[],
  escape: (text: string) => string,
  options?: VenomThemeOptions,
): string {
  const count = venomThemeNumber(options?.visibleOperations, 3, 1, 12);
  const fixed = options?.fixedOperationRows !== false;
  const recent = operations.slice(-count);
  const older = operations.slice(0, -count);
  const truncate = (value: string, max: number): string => {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
  };
  const statusText = (op: VenomLiveOperation): string => {
    if (options?.showOperationStates === false) return "";
    if (op.state === "running") return " · ACTIVE";
    if (op.state === "failed") return " · FAILED";
    const elapsed = op.finishedAt === undefined ? "" : " " + ((Math.max(0, op.finishedAt - op.startedAt)) / 1000).toFixed(1) + "s";
    return " · DONE" + elapsed;
  };
  const row = (op: VenomLiveOperation): string => {
    const label = truncate(op.tag.toUpperCase().replace(/[^A-Z0-9_-]/g, ""), 10) || "TRACE";
    const detail = truncate(op.detail || op.tool, fixed ? 38 : options?.operationDetail === "full" ? 96 : 60);
    return "<code>" + escape("› " + label + statusText(op)) + "</code>\n" +
      "<code>" + escape("  " + detail) + "</code>";
  };
  // Two fixed lines per slot: a lifecycle header and a command/target excerpt.
  // This is the same geometry whether no tool has started or all slots are busy.
  const blanks = fixed ? Array.from({ length: count - recent.length }, () =>
    "<code>› TRACE · IDLE</code>\n<code>  awaiting operation</code>") : [];
  const rows = [...recent.map(row), ...blanks];
  const visible = rows.length ? rows.join("\n") : "<i>Awaiting target</i>";
  if (options?.collapseOperations === "off" || older.length === 0) return visible;
  const history = older.slice(-16).map(op =>
    escape(truncate(op.tag + " " + op.state + " " + op.detail, 84))).join("\n");
  const omitted = Math.max(0, older.length - 16);
  return visible + "\n<blockquote expandable>" +
    escape(older.length + " EARLIER TRACES · tap to expand") + "\n" +
    (omitted ? escape(omitted + " older traces omitted") + "\n" : "") +
    history + "</blockquote>";
}

/** Telegram Rich Messages render actual level-2 headings and native <details>.
 * The ordinary HTML HUD remains the fallback for Bot API servers without Rich.
 * Never interpolate unescaped tool contents into Markdown or HTML.
 */
/** Constant visual floor to discourage Telegram from shrinking the bubble.
 * Twenty-six monospace cells fit typical phone widths with a reply quote gutter.
 * Not a guarantee: Telegram owns the final bubble sizing. */
export const VENOM_RICH_WIDTH_ANCHOR = "━".repeat(26);
const VENOM_RICH_DETAIL_WIDTH = 30;
const VENOM_RICH_META_WIDTH = 32;

function venomRichShort(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return Array.from(clean).length > max
    ? Array.from(clean).slice(0, max - 1).join("") + "…"
    : clean;
}

/** A native Rich card with predictable section geometry across every edit.
 * Use a fixed anchor and consistently bounded text instead of relying on
 * whatever length the latest command happens to be. */
export function formatVenomRichLivePanel(
  operations: readonly VenomLiveOperation[],
  options: VenomThemeOptions | undefined,
  meta: { title: string; status: string; pulse: string; section: string; transmission: string; objective: string; model: string; metrics: string },
): string {
  const escaped = (input: string): string => input.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/([\\*_~\`#[\]()!|])/g, "\\$1").replace(/\r?\n/g, " ");
  const count = venomThemeNumber(options?.visibleOperations, 3, 1, 12);
  const recent = operations.slice(-count);
  const older = operations.slice(0, -count);
  const line = (op: VenomLiveOperation): string => {
    const tag = op.tag.replace(/[^A-Z0-9_-]/gi, "").slice(0, 10).toUpperCase() || "TRACE";
    const duration = op.state !== "running" && op.finishedAt !== undefined
      ? " " + (Math.max(0, op.finishedAt - op.startedAt) / 1000).toFixed(1) + "s" : "";
    const state = options?.showOperationStates === false ? "" : " · " + op.state.toUpperCase() + duration;
    const detail = venomRichShort(op.detail || op.tool, VENOM_RICH_DETAIL_WIDTH);
    return "- **" + tag + escaped(state) + "**\n  " + escaped(detail);
  };
  const slots = [...recent.map(line)];
  if (options?.fixedOperationRows !== false) {
    for (let i = slots.length; i < count; i++) slots.push("- **TRACE · IDLE**\n  awaiting operation");
  }
  if (!slots.length) slots.push("- Awaiting target");

  // Always reserve the same collapsed history slot, so a fourth tool doesn't
  // suddenly insert a new section. Keep the summary short and constant;
  // historical commands are hidden until the user expands the details.
  const history = options?.collapseOperations === "off" ? "" :
    "\n\n<details>\n<summary>Earlier traces</summary>\n\n" +
    (older.length
      ? older.slice(-16).map(op => "- " + escaped(venomRichShort(
        op.tag + " · " + op.state + " · " + op.detail, 65))).join("\n")
      : "No earlier traces") +
    "\n\n</details>";

  // The anchor establishes the same minimum visible line width on every frame.
  // The animated six-segment pulse retains its independent line immediately
  // below; it does not attempt to communicate percent task completion.
  return "**" + escaped(venomRichShort(meta.title, 38)) + "**\n\n" +
    "\`" + VENOM_RICH_WIDTH_ANCHOR + "\`\n\n" +
    escaped(venomRichShort(meta.status, 36)) + "\n\n" +
    (options?.showPulse === false ? "" : "\`" + (meta.pulse || "▱▱▱▱▱▱") + "\`\n\n") +
    "## " + escaped(meta.section) + "\n\n" + slots.join("\n") + history +
    (options?.showObjective === false ? "" :
      "\n\n## " + escaped(meta.transmission) + "\n\n" + escaped(venomRichShort(meta.objective, VENOM_RICH_META_WIDTH))) +
    "\n\n" + escaped(venomRichShort(meta.model, VENOM_RICH_META_WIDTH)) +
    "\n\n" + escaped(venomRichShort(meta.metrics, VENOM_RICH_META_WIDTH));
}

export function formatVenomOperationState(completed: number, running: number, failed: number): string {
  return [completed + " done", running + " running", failed + " failed"].join(" · ");
}

export function isVenomHud(preset?: string): boolean {
  return preset === "symbiote-hud" || preset === "predator-terminal" || preset === "classified";
}
