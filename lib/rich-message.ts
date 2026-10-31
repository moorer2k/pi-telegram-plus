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
 * Rich Markdown is not Telegram HTML parse mode. Escaping ampersands and
 * angle brackets as HTML entities makes them appear literally in code and
 * prose (e.g. `&lt;` instead of `<`). Preserve source text verbatim.
 */
export function escapeRichMarkdown(text: string): string {
  return text;
}

/**
 * Normalize TeX display/inline delimiters for Telegram's Rich Markdown math
 * dialect. Do not touch fenced code or inline code spans. Preserve escaped
 * backslashes and only rewrite paired delimiters.
 */
export function normalizeRichMathDelimiters(markdown: string): string {
  let fence: { marker: string; width: number } | undefined;
  let inDisplay = false;
  let inInline = false;
  return markdown.split("\n").map((line) => {
    const fm = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fm) {
      const token = fm[1];
      if (!fence && !(token[0] === "`" && fm[2].includes("`"))) {
        fence = { marker: token[0], width: token.length };
        return line;
      }
      if (fence && token[0] === fence.marker && token.length >= fence.width && !fm[2].trim()) {
        fence = undefined;
        return line;
      }
    }
    if (fence) return line;
    // Protect inline backtick spans from delimiter conversion.
    const segments = line.split(/(`+[^`\n]*`+)/g);
    return segments.map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment.replace(/(?<!\\)\\(\[|\]|\(|\))/g, (match, delimiter) => {
        if (delimiter === "[") {
          if (inInline || inDisplay) return match;
          inDisplay = true;
          return "$$";
        }
        if (delimiter === "]") {
          if (!inDisplay) return match;
          inDisplay = false;
          return "$$";
        }
        if (delimiter === "(") {
          if (inDisplay || inInline) return match;
          inInline = true;
          return "$";
        }
        if (!inInline) return match;
        inInline = false;
        return "$";
      });
    }).join("");
  }).join("\n");
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
  const rich = escapeRichMarkdown(normalizeRichMathDelimiters(protectPseudoTables(normalized)));
  if (Array.from(rich).length > TELEGRAM_RICH_TEXT_LIMIT) return undefined;
  return rich;
}

/**
 * Native Rich Markdown delivery for complete responses, including LaTeX.
 * Inspired by the rich-first approach of Pi Telegram bridges. Never mutate
 * fenced code or attempt a rich edit with unbalanced fences.
 * Unsupported API servers use the existing HTML fallback.
 */
/** Truncate streaming text before unfinished inline constructs.
 * Full answers are never truncated: the normal HTML fallback remains available.
 */
function safeInlinePrefix(text: string): string {
  const lines = text.split("\n");
  const last = lines[lines.length - 1] ?? "";
  // Streaming lines without a terminating newline may contain an incomplete
  // link target, image, inline code span, or math delimiter.
  const unfinishedLink = /!?\[[^\]\n]*\]\([^)]*$/.test(last);
  const unfinishedBracket = /!?\[[^\]\n]*$/.test(last);
  const ticks = (last.match(/(?<!`)`(?!`)/g) ?? []).length;
  const unfinishedMath = (last.match(/(?<!\\)\$/g) ?? []).length % 2 !== 0;
  if (unfinishedLink || unfinishedBracket || ticks % 2 !== 0 || unfinishedMath) {
    lines.pop();
    return lines.join("\n");
  }
  return text;
}

/** Streaming drafts expose only completed lines with balanced code fences. */
export function richMarkdownForDraft(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  // Avoid publishing an unfinished final line (links, inline code, tables,
  // math delimiters and fence openers can all be mid-token).
  if (lines.length > 1 && lines[lines.length - 1] !== "") lines.pop();
  let safe = safeInlinePrefix(lines.join("\n"));
  // Remove the actual unmatched opener, not merely the last fence-like
  // line: a closing delimiter with trailing text is not a valid closer.
  let opener: number | undefined;
  let marker = "";
  let width = 0;
  for (const match of safe.matchAll(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/gm)) {
    const token = match[1];
    if (opener === undefined) {
      if (token[0] === "`" && match[2].includes("`")) continue;
      opener = match.index;
      marker = token[0];
      width = token.length;
    } else if (token[0] === marker && token.length >= width && !match[2].trim()) {
      opener = undefined;
      marker = "";
      width = 0;
    }
  }
  if (opener !== undefined) safe = safe.slice(0, opener).trimEnd();
  if (!hasBalancedFences(safe)) return undefined;
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
