import type { VenomThemeOptions } from "./types.ts";
import type { VenomLiveOperation } from "./venom-theme.ts";

/** Typed blocks keep Telegram markup separate from tool content. */
export type VenomBlock =
  | { kind: "heading"; value: string }
  | { kind: "text"; value: string; bold?: boolean }
  | { kind: "code"; value: string }
  | { kind: "operation"; status: string; command: string }
  | { kind: "details"; title: string; lines: string[] };

const escapeRich = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/([\\*_~`#[\]()!|])/g, "\\$1");
const clean = (value: string): string => String(value || "").replace(/\s+/g, " ").trim();
export function shortenVenomCommand(raw: string, max = 36): string {
  let text = clean(raw).replace(/^(?:bash|terminal|exec):\s*/i, "");
  text = text.replace(/(https?:\/\/[^\s"\x27?#]+)[^\s"\x27]*/gi, "$1…");
  text = text.replace(/((?:--password|--token|--secret|--api-key)(?:=|\s+))\S+/gi, "$1[redacted]");
  text = text.replace(/(?:\/[^\s/"\x27]+){3,}/g, path => {
    const parts = path.split("/").filter(Boolean);
    return parts.length > 2 ? "…/" + parts.slice(-2).join("/") : path;
  });
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}
function code(value: string): string {
  return "`" + clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`/g, "\x27") + "`";
}
export function renderVenomBlocks(blocks: readonly VenomBlock[]): string {
  return blocks.map(block => {
    if (block.kind === "heading") return "## " + escapeRich(block.value);
    if (block.kind === "code") return code(block.value);
    if (block.kind === "operation") return escapeRich(block.status) + " " + code(block.command);
    if (block.kind === "text") {
      const value = escapeRich(block.value);
      return block.bold ? "**" + value + "**" : value;
    }
    return "<details>\n<summary>" + escapeRich(block.title) + "</summary>\n\n" +
      (block.lines.length ? block.lines.map(x => "- " + escapeRich(x)).join("\n") : "No earlier traces") +
      "\n\n</details>";
  }).join("\n\n");
}
export type VenomPanelMeta = { title: string; status: string; pulse: string; section: string;
  transmission: string; objective: string; model: string; metrics: string };
export function buildVenomRichPanel(ops: readonly VenomLiveOperation[],
  opts: VenomThemeOptions | undefined, meta: VenomPanelMeta): string {
  const count = typeof opts?.visibleOperations === "number" && Number.isFinite(opts.visibleOperations)
    ? Math.max(1, Math.min(12, Math.floor(opts.visibleOperations))) : 3;
  const commandLength = Math.max(24, Math.min(240, Math.floor(opts?.commandLength ?? 72)));
  const historyCommandLength = Math.max(24, Math.min(240, Math.floor(opts?.historyCommandLength ?? 96)));
  const historyOperations = Math.max(0, Math.min(40, Math.floor(opts?.historyOperations ?? 16)));
  const blocks: VenomBlock[] = [
    { kind: "text", value: meta.title, bold: true },
    { kind: "text", value: "◈ " + meta.status, bold: true },
  ];
  if (opts?.showPulse !== false) blocks.push({ kind: "code", value: meta.pulse || "▱".repeat(12) });
  blocks.push({ kind: "heading", value: meta.section });
  const recent = ops.slice(-count);
  for (const op of recent) {
    const glyph = op.state === "failed" ? "×" : op.state === "done" ? "◆" : "◈";
    const tag = op.tag.replace(/[^A-Z0-9_-]/gi, "").slice(0, 10).toUpperCase() || "TRACE";
    const elapsed = op.state !== "running" && op.finishedAt !== undefined
      ? " " + (Math.max(0, op.finishedAt - op.startedAt) / 1000).toFixed(1) + "s" : "";
    const state = opts?.showOperationStates === false ? "" : " · " + op.state.toUpperCase() + elapsed;
    blocks.push({ kind: "operation", status: glyph + " " + tag + state, command: shortenVenomCommand(op.detail || op.tool, commandLength) });
  }
  if (opts?.fixedOperationRows !== false) for (let i = recent.length; i < count; i++) {
    blocks.push({ kind: "operation", status: "◈ TRACE · IDLE", command: "awaiting operation" });
  }
  if (opts?.collapseOperations !== "off") blocks.push({ kind: "details", title: "Earlier traces",
    lines: ops.slice(0, -count).slice(-historyOperations).map(op => op.tag + " · " + op.state + " · " + shortenVenomCommand(op.detail, historyCommandLength)) });
  if (opts?.showObjective !== false) {
    blocks.push({ kind: "heading", value: meta.transmission });
    blocks.push({ kind: "text", value: meta.objective });
  }
  blocks.push({ kind: "text", value: meta.model });
  blocks.push({ kind: "text", value: meta.metrics });
  // Rich budget: reduce old hidden details first, never truncate live markup.
  let out = renderVenomBlocks(blocks);
  if (out.length > 6500) {
    const slim = blocks.map(b => b.kind === "details" ? { ...b, lines: b.lines.slice(-4) } : b);
    out = renderVenomBlocks(slim);
  }
  return out;
}
