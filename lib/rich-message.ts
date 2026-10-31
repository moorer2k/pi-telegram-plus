/**
 * Telegram Rich Messages — used to render Markdown tables natively.
 *
 * Telegram's regular message modes (the `HTML` parse mode this extension sends)
 * have no table element, so the renderer fakes tables as card / box-drawing /
 * transposed text (`lib/markdown.ts`). Bot API 10.1 added *Rich Messages*
 * (`sendRichMessage`, plus a `rich_message` field on `editMessageText`) whose
 * Markdown dialect renders GitHub-style pipe tables as real, bordered tables in
 * the client — the same mechanism `dsh-im` uses.
 *
 * This module is deliberately narrow: it decides *whether* an answer qualifies
 * for the rich path and converts it. Everything that does not qualify keeps the
 * existing HTML pipeline, so no content depends on the newer API.
 */
import { hasGfmTable, normalizeWrappedFlattenedTables, normalizeListParagraphSpacing, protectPseudoTables } from "./markdown.ts";

/**
 * Conservative Rich Message text budget. Telegram allows roughly 32k characters
 * (vs. 4096 for a regular message); staying at 30k keeps a safety margin.
 * Answers above it fall back to the HTML pipeline, which already splits safely.
 */
export const TELEGRAM_RICH_TEXT_LIMIT = 30_000;

/**
 * Escape the two characters that could make model output look like Telegram
 * Rich Markdown markup. Rich Markdown accepts HTML tags, so an unescaped `<`
 * from a tool result or a code sample would be interpreted as markup.
 *
 * `>` is deliberately left alone: it cannot open a tag on its own, and escaping
 * it would turn `> quoted line` into literal text instead of a blockquote.
 */
export function escapeRichMarkdown(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** Match fenced blocks by delimiter and minimum opening width. */
function hasBalancedFences(markdown: string): boolean {
  let fence: { marker: string; width: number } | undefined;
  for (const line of markdown.split("\n")) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const marker = match[1][0];
    if (!fence) {
      if (marker === "`" && match[2].includes("`")) continue;
      fence = { marker, width: match[1].length };
    } else if (marker === fence.marker && match[1].length >= fence.width && !match[2].trim()) {
      fence = undefined;
    }
  }
  return !fence;
}

/**
 * Convert `markdown` into a Telegram `rich_message.markdown` payload, or
 * `undefined` when the answer should stay on the HTML path.
 *
 * Qualifies only when the body contains a real GFM table, fits one Rich
 * Message, and has balanced code fences. Pseudo-tables (aligned pipes without a
 * separator row) are fenced first so they keep their monospace alignment.
 */
export function richMarkdownForTables(markdown: string): string | undefined {
  const normalized = normalizeWrappedFlattenedTables(normalizeListParagraphSpacing(markdown));
  if (!normalized.trim() || !hasGfmTable(normalized)) return undefined;
  if (!hasBalancedFences(normalized)) return undefined;
  const rich = escapeRichMarkdown(protectPseudoTables(normalized));
  if (Array.from(rich).length > TELEGRAM_RICH_TEXT_LIMIT) return undefined;
  return rich;
}

/**
 * Native Rich Markdown delivery for complete responses, including LaTeX.
 * Inspired by the rich-first approach of Pi Telegram bridges. Never mutate
 * fenced code or attempt a rich edit with unbalanced fences.
 * Unsupported API servers use the existing HTML fallback.
 */
/** Streaming drafts expose only completed lines with balanced code fences. */
export function richMarkdownForDraft(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  // Avoid publishing an unfinished final line (links, inline code, tables,
  // math delimiters and fence openers can all be mid-token).
  if (lines.length > 1 && lines[lines.length - 1] !== "") lines.pop();
  let safe = lines.join("\n");
  // Drop the incomplete fence block, but retain complete preceding content.
  while (safe && !hasBalancedFences(safe)) {
    const opening = [...safe.matchAll(/^ {0,3}(`{3,}|~{3,})[^\n]*$/gm)].pop();
    if (!opening || opening.index === undefined) return undefined;
    safe = safe.slice(0, opening.index).trimEnd();
  }
  if (!safe.trim()) return undefined;
  return richMarkdownForResponse(safe);
}

export function richMarkdownForResponse(markdown: string): string | undefined {
  if (!markdown.trim() || !hasBalancedFences(markdown)) return undefined;
  const normalized = normalizeWrappedFlattenedTables(normalizeListParagraphSpacing(markdown));
  const rich = escapeRichMarkdown(protectPseudoTables(normalized));
  if (Array.from(rich).length > TELEGRAM_RICH_TEXT_LIMIT) return undefined;
  return rich;
}
