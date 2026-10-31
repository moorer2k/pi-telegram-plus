import { marked } from "marked";
import type { Tokens } from "marked";
import { escapeHtml } from "./html.ts";

interface TelegramRendererContext {
  parser: {
    parse(tokens: unknown[]): string;
    parseInline(tokens: unknown[]): string;
  };
}

function inlineFromTokens(this: TelegramRendererContext, tokens?: unknown[], fallback = ""): string {
  if (Array.isArray(tokens) && tokens.length > 0) {
    // Temporarily disable \\n appending since this is inline context
    const prev = _textAppendNewline;
    _textAppendNewline = false;
    try {
      return this.parser.parseInline(tokens as unknown[]);
    } finally {
      _textAppendNewline = prev;
    }
  }
  return escapeHtml(fallback);
}

function blockFromTokens(this: TelegramRendererContext, tokens?: unknown[], fallback = ""): string {
  if (Array.isArray(tokens) && tokens.length > 0) {
    return this.parser.parse(tokens as unknown[]);
  }
  return escapeHtml(fallback);
}

/**
 * Calculate visible width of text in a monospace environment.
 * ASCII = 1, CJK / fullwidth / emoji = 2.
 */
function visibleWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    if (
      (code >= 0x2e80 && code <= 0x9fff) ||   // CJK, Yi, Hangul syllables
      (code >= 0xac00 && code <= 0xd7af) ||   // Hangul
      (code >= 0xf900 && code <= 0xfaff) ||   // CJK compatibility
      (code >= 0xfe30 && code <= 0xfe6f) ||   // CJK compat forms
      (code >= 0xff01 && code <= 0xff60) ||   // fullwidth forms
      (code >= 0xffe0 && code <= 0xffe6) ||   // fullwidth signs
      (code >= 0x1f000 && code <= 0x1f9ff) || // emoji
      code >= 0x20000                          // CJK extension B
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/** Strip HTML tags for visible width calculation. */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/**
 * Pad cell text (which may contain HTML tags) to the given visible width.
 * Optionally wraps the whole cell in <b> for header styling.
 */
function padCell(text: string, width: number, bold = false): string {
  const currentWidth = visibleWidth(stripHtmlTags(text));
  const padding = Math.max(0, width - currentWidth);
  // Only wrap in <b> if the text doesn't already start with <b>
  const cell = bold && !text.startsWith("<b>") ? `<b>${text}</b>` : text;
  return cell + " ".repeat(padding);
}

/** True if text contains only printable ASCII (width is unambiguous = 1/char). */
function isAscii(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

/** Collapse newlines inside a table cell so each row renders as one line. */
function sanitizeCellHtml(html: string): string {
  return html.replace(/\n+/g, " ").trim();
}

/** Wrap inline HTML in <b> unless it already starts with one (avoids <b><b>). */
function wrapBold(html: string): string {
  return html && !html.startsWith("<b>") ? `<b>${html}</b>` : html;
}

// ── Table strategies (mobile-first) ─────────────────────────────────────────
// Telegram has no <table>; these three layouts trade off density vs. mobile
// readability. See PR-1c plan: card (default) / box (narrow ASCII) / transpose (wide).

/** Box-drawing grid in <pre> — plain text only (no inline tags inside <pre>). */
function renderBoxTable(headerText: string[], rowsText: string[][], colWidths: number[]): string {
  const lines: string[] = [];
  lines.push(`┌─${colWidths.map((w) => "─".repeat(w)).join("─┬─")}─┐`);
  lines.push(`│ ${headerText.map((h, i) => padCell(h, colWidths[i])).join(" │ ")} │`);
  lines.push(`├─${colWidths.map((w) => "─".repeat(w)).join("─┼─")}─┤`);
  for (const row of rowsText) {
    const cells = colWidths.map((_, i) => padCell(i < row.length ? row[i] : "", colWidths[i]));
    lines.push(`│ ${cells.join(" │ ")} │`);
  }
  lines.push(`└─${colWidths.map((w) => "─".repeat(w)).join("─┴─")}─┘`);
  return `<pre>${lines.join("\n")}</pre>\n`;
}

/** Card-style: bold header row, bold first column (primary key), 2-space sep. */
function renderCardTable(headerHtml: string[], rowsHtml: string[][]): string {
  const lines: string[] = [];
  lines.push(headerHtml.map((h) => wrapBold(h)).join("  "));
  lines.push("──");
  for (const row of rowsHtml) {
    const cells = headerHtml.map((_, i) => (i < row.length ? row[i] : ""));
    const first = cells[0] ? wrapBold(cells[0]) : "";
    const rest = cells.slice(1).filter((c) => c.length > 0).join("  ");
    lines.push([first, rest].filter(Boolean).join("  "));
  }
  return lines.join("\n") + "\n\n";
}

/** Transposed: each row becomes a block (first col = bold title, rest = H: v). */
function renderTransposedTable(headerHtml: string[], rowsHtml: string[][]): string {
  // Each data row becomes a block of `label: value` lines (all columns
  // included, labels bolded), blocks separated by a blank line. No orphaned
  // title / no indent / no heavy separator — the most mobile-readable layout
  // for wide tables (many columns, few rows).
  const blocks: string[] = [];
  for (const row of rowsHtml) {
    const cells = headerHtml.map((_, i) => (i < row.length ? row[i] : ""));
    const lines: string[] = [];
    for (let i = 0; i < headerHtml.length; i++) {
      const label = wrapBold(headerHtml[i]) || `col${i + 1}`;
      lines.push(`${label}: ${cells[i]}`);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n") + "\n\n";
}

// ── Pseudo-table protection ──────────────────────────────────────────────────
// Detects aligned pipe text that looks like a markdown table but has no
// `| --- |` separator row (e.g. raw `ls`/SQL/CSV-style output an agent pasted
// as prose). marked would tokenize such text as a paragraph and the pipes /
// column alignment would be lost in Telegram's proportional font. We wrap the
// run in a fenced code block so it renders as <pre><code> (monospace, aligned).

function isTableSeparator(line: string): boolean {
  // A markdown table separator row: only spaces, dashes, colons, pipes; must
  // contain at least one dash.
  return /^\s*\|?[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

/** A markdown table row/header line: starts with a pipe (our agent always emits `| ... |`). */
function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line);
}

function isPseudoTableRow(line: string): boolean {
  if (!line.includes("|")) return false;
  const pipeCount = (line.match(/\|/g) || []).length;
  if (pipeCount < 2) return false;
  // Must have some real content (not a separator-only line).
  return line.replace(/[\s|:-]/g, "").length > 0;
}

/** Count consecutive pseudo-table rows at `start`; 0 if it's a real table. */
function pseudoTableRun(lines: string[], start: number, inRealTable: Uint8Array): number {
  if (inRealTable[start]) return 0;
  if (!isPseudoTableRow(lines[start])) return 0;
  // If the next line is a markdown table separator, this is a real table —
  // leave it for marked's table tokenizer.
  if (start + 1 < lines.length && isTableSeparator(lines[start + 1])) return 0;
  let n = 1;
  while (start + n < lines.length && inRealTable[start + n] === 0 && isPseudoTableRow(lines[start + n])) n++;
  return n >= 2 ? n : 0;
}

/**
 * Mark every line that belongs to a real markdown table (header + separator +
 * its consecutive data rows). These must be left for marked's table tokenizer;
 * otherwise the data rows after the first would be mis-detected as a
 * pseudo-table (their preceding line is a data row, not a separator).
 */
function markRealTableLines(lines: string[]): Uint8Array {
  const flags = new Uint8Array(lines.length);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (isTableRow(lines[i]) && isTableSeparator(lines[i + 1])) {
      flags[i] = 1;        // header
      flags[i + 1] = 1;     // separator
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) { flags[j] = 1; j++; }
    }
  }
  return flags;
}

/** Fence character of a line (``` or ~~~), or "" when the line is not a fence. */
function fenceMarker(line: string): string {
  const match = /^\s*(`{3,}|~{3,})/.exec(line);
  return match ? match[1][0] : "";
}

/**
 * Recover a GFM table that an LLM compressed onto one logical line.
 *
 * Example: "Forecast: | Day | High | | --- | --- | | Fri | 52 |"
 * becomes a regular three-line table after the prefix. Do not invent tables:
 * require >=2 columns, a full separator row of matching width and >=1 data
 * row with exactly the same number of cells. Never modify fenced code.
 */
export function normalizeFlattenedTables(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inFence = false;
  let fenceChar = "";
  for (const line of lines) {
    const fence = fenceMarker(line);
    if (fence) {
      if (!inFence) { inFence = true; fenceChar = fence; }
      else if (fence === fenceChar) { inFence = false; fenceChar = ""; }
      output.push(line);
      continue;
    }
    if (inFence || !line.includes("|")) { output.push(line); continue; }
    const firstPipe = line.indexOf("|");
    const prefix = line.slice(0, firstPipe).trim();
    // Avoid interpreting ordinary prose containing several pipes as a table.
    if (prefix.length > 160 || prefix.includes("\`")) { output.push(line); continue; }
    const cells = line.slice(firstPipe + 1).split("|").map(cell => cell.trim()).filter(Boolean);
    let width = 0;
    for (let n = 2; n <= 6; n++) {
      const separator = cells.slice(n, 2 * n);
      const remaining = cells.length - 2 * n;
      if (remaining < n || remaining % n !== 0 || separator.length !== n) continue;
      if (cells.slice(0, n).some(cell => /^:?-{3,}:?$/.test(cell))) continue;
      if (separator.every(cell => /^:?-{3,}:?$/.test(cell))) { width = n; break; }
    }
    if (!width) { output.push(line); continue; }
    if (prefix) output.push(prefix, "");
    const row = (items: string[]) => "| " + items.join(" | ") + " |";
    output.push(row(cells.slice(0, width)));
    output.push(row(cells.slice(width, width * 2)));
    for (let at = width * 2; at < cells.length; at += width) {
      output.push(row(cells.slice(at, at + width)));
    }
  }
  return output.join("\n");
}

/** Recover flattened tables even when the source itself has line breaks
 * between the compressed header, separator, and data rows. */
export function normalizeWrappedFlattenedTables(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const marker = fenceMarker(line);
    if (marker) {
      if (!inFence) { inFence = true; fenceChar = marker; }
      else if (fenceChar === marker) { inFence = false; fenceChar = ""; }
      out.push(line); i++; continue;
    }
    if (inFence || !line.includes("|")) { out.push(line); i++; continue; }
    const direct = normalizeFlattenedTables(line);
    if (direct !== line) { out.push(direct); i++; continue; }
    let recovered: string | undefined;
    let consumed = 0;
    for (let n = 2; n <= 4 && i + n <= lines.length; n++) {
      const group = lines.slice(i, i + n);
      if (group.some(part => !part.trim() || !part.includes("|") || fenceMarker(part))) break;
      const joined = group.join(" ");
      const normalized = normalizeFlattenedTables(joined);
      if (normalized !== joined && hasGfmTable(normalized)) {
        recovered = normalized; consumed = n; break;
      }
    }
    if (recovered) { out.push(recovered); i += consumed; }
    else { out.push(line); i++; }
  }
  return out.join("\n");
}
/** Last-resort readable cards for table-like pipe output that cannot be
 * recovered into valid GFM. Never invent missing cells or modify code fences.
 * This is an output safety net, not a replacement for native Rich tables. */
export function fallbackMalformedPipeTables(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  for (const line of lines) {
    const fence = fenceMarker(line);
    if (fence) {
      if (!inFence) { inFence = true; fenceChar = fence; }
      else if (fence === fenceChar) { inFence = false; fenceChar = ""; }
      out.push(line);
      continue;
    }
    if (inFence || !line.includes("|")) { out.push(line); continue; }
    const firstPipe = line.indexOf("|");
    const prefix = line.slice(0, firstPipe).trim();
    const cells = line.slice(firstPipe + 1).split("|").map(x => x.trim()).filter(Boolean);
    const isSep = (cell: string) => /^:?-{2,}:?$/.test(cell);
    // Require at least two adjacent separators. Without them this might be
    // code, prose with pipes, a URL, or an ordinary aligned data fragment.
    const sep = cells.findIndex((cell, i) => i >= 2 && isSep(cell) && isSep(cells[i + 1] ?? ""));
    if (sep < 2 || sep > 6) {
      // A badly broken table can have too many/missing header cells. If it
      // still contains an obvious separator run, show a readable sequence,
      // never raw Markdown separator syntax to the Telegram user.
      if (cells.some((cell, i) => isSep(cell) && isSep(cells[i + 1] ?? ""))) {
        const data = cells.filter(cell => !isSep(cell));
        out.push([...(prefix ? [prefix, ""] : []), ...data.map(value => "- " + value)].join("\n"));
      } else {
        out.push(line);
      }
      continue;
    }
    let sepEnd = sep;
    while (sepEnd < cells.length && isSep(cells[sepEnd])) sepEnd++;
    const width = sepEnd - sep;
    if (width < 2 || width > 6 || sep !== width || cells.length <= sepEnd) {
      const visible = cells.filter(cell => !isSep(cell));
      out.push([...(prefix ? [prefix, ""] : []), ...visible.map(value => "- " + value)].join("\n"));
      continue;
    }
    const headers = cells.slice(0, width);
    const values = cells.slice(sepEnd);
    if (!headers.every(Boolean) || !values.length) { out.push(line); continue; }
    const newLines: string[] = prefix ? [prefix, ""] : [];
    // Missing pipe delimiters make column attribution ambiguous. Keep every
    // original value in order rather than attaching data to the wrong header.
    if (values.length % width !== 0) {
      newLines.push("**Incomplete table data**", values.join(" · "));
      out.push(newLines.join("\n").trimEnd());
      continue;
    }
    // Vertical key/value cards are guaranteed readable even if a model
    // drops a pipe or a row. Do not pad missing values with made-up data.
    for (let index = 0; index < values.length; index += width) {
      const row = values.slice(index, index + width);
      newLines.push("**" + headers[0] + ": " + row[0] + "**");
      for (let col = 1; col < row.length; col++) {
        newLines.push("- **" + headers[col] + ":** " + row[col]);
      }
      newLines.push("");
    }
    out.push(newLines.join("\n").trimEnd());
  }
  return out.join("\n");
}
/** Separate a tight bullet group from trailing prose even when the model
 * omitted the blank line. Require at least two consecutive top-level bullets
 * to avoid turning an intentional single-item continuation into a paragraph.
 * Never rewrite fenced code or indented list continuations. */
export function normalizeListParagraphSpacing(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let consecutiveBullets = 0;
  for (const line of lines) {
    const fence = fenceMarker(line);
    if (fence) {
      if (!inFence) { inFence = true; fenceChar = fence; }
      else if (fenceChar === fence) { inFence = false; fenceChar = ""; }
      consecutiveBullets = 0;
      out.push(line);
      continue;
    }
    if (inFence) { out.push(line); continue; }
    if (!line.trim()) { consecutiveBullets = 0; out.push(line); continue; }
    const bullet = /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
    if (bullet) {
      consecutiveBullets++;
      out.push(line);
      continue;
    }
    // Unindented prose after two or more list items is generally a new
    // paragraph. Do not touch nested content, headings, quotes or tables.
    if (consecutiveBullets >= 2 && !/^\s/.test(line) &&
        !/^(?:[#>|]|-{3,}|\*{3,}|_{3,})/.test(line)) {
      out.push("");
    }
    consecutiveBullets = 0;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * True when `markdown` contains a real GFM table — a row containing a pipe
 * followed by a `| --- |` separator — outside code fences.
 *
 * Only real tables qualify: aligned pipe text without a separator row is a
 * pseudo-table and keeps the monospace treatment (`protectPseudoTables`).
 */
export function hasGfmTable(markdown: string): boolean {
  const lines = markdown.split("\n");
  let inFence = false;
  let fenceChar = "";
  for (let i = 0; i + 1 < lines.length; i++) {
    const marker = fenceMarker(lines[i]);
    if (marker) {
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence || !lines[i].includes("|")) continue;
    const separator = lines[i + 1];
    if (separator.includes("|") && isTableSeparator(separator)) return true;
  }
  return false;
}

/**
 * Wrap pseudo-table runs (outside code fences) in fenced code blocks.
 * Code-fence state is tracked so content already inside ``` is untouched.
 *
 * Exported for the Rich Message path, which bypasses marked and therefore has
 * to apply the same protection to the markdown source itself.
 */
export function protectPseudoTables(md: string): string {
  const lines = md.split("\n");
  const inRealTable = markRealTableLines(lines);
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) { inFence = true; fenceChar = ch; }
      else if (ch === fenceChar) { inFence = false; fenceChar = ""; }
      out.push(line);
      i++;
      continue;
    }
    if (inFence) { out.push(line); i++; continue; }
    const run = pseudoTableRun(lines, i, inRealTable);
    if (run > 1) {
      out.push("```");
      for (let j = i; j < i + run; j++) out.push(lines[j]);
      out.push("```");
      i += run;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/**
 * Track list nesting depth for proper indentation.
 * Resets per top-level markdownToTelegramHtml call.
 */
let _listDepth = 0;

/**
 * Flag: when true, the text renderer appends \\n after content.
 * True during block-level parse (parser.parse), false during inline
 * (parser.parseInline) so inline text tokens don't get spurious newlines.
 */
let _textAppendNewline = true;

const renderer = {
  text(this: TelegramRendererContext, token: Tokens.Text | Tokens.Escape): string {
    if ('tokens' in token && token.tokens && token.tokens.length > 0) {
      // Text with nested inline tokens — parse inline (disable \\n for nested),
      // then add \\n only if we are at block level
      const prev = _textAppendNewline;
      _textAppendNewline = false;
      try {
        return this.parser.parseInline(token.tokens as unknown[]) + (prev ? '\n' : '');
      } finally {
        _textAppendNewline = prev;
      }
    }
    // Plain text / escape token
    return escapeHtml(token.text) + (_textAppendNewline ? '\n' : '');
  },

  checkbox(this: TelegramRendererContext): string {
    // Suppress default <input> rendering; custom [x]/[ ] marker is added by list renderer
    return "";
  },


  heading(this: TelegramRendererContext, token: Tokens.Heading): string {
    const content = inlineFromTokens.call(this, token.tokens);
    // Telegram has a single font/size, so hierarchy is conveyed by bold + a
    // blank line. Drop the pi-tui `###` prefix (noise on mobile) and <u>
    // (which reads like a link). Uniform <b> + trailing blank line for all depths.
    return `<b>${content}</b>\n\n`;
  },

  paragraph(this: TelegramRendererContext, { tokens }: Tokens.Paragraph): string {
    // Double newline after each paragraph so mobile readers get visual
    // breathing room between paragraphs (single \n reads as run-together).
    return `${inlineFromTokens.call(this, tokens)}\n\n`;
  },

  strong(this: TelegramRendererContext, { tokens }: Tokens.Strong): string {
    return `<b>${inlineFromTokens.call(this, tokens)}</b>`;
  },

  em(this: TelegramRendererContext, { tokens }: Tokens.Em): string {
    return `<i>${inlineFromTokens.call(this, tokens)}</i>`;
  },

  del(this: TelegramRendererContext, { tokens }: Tokens.Del): string {
    return `<s>${inlineFromTokens.call(this, tokens)}</s>`;
  },

  codespan(this: TelegramRendererContext, { text }: Tokens.Codespan): string {
    return `<code>${escapeHtml(text)}</code>`;
  },

  code(this: TelegramRendererContext, { text, lang }: Tokens.Code): string {
    // Drop the literal ``` fences (visual noise + wasted bytes) and emit the
    // language as a Telegram-recognized `class="language-xxx"` attribute.
    // Telegram validates the class value against [a-zA-Z][a-zA-Z0-9_-]*.
    const codeContent = escapeHtml(text.replace(/\n+$/, ""));
    const safeLang = (lang || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const langAttr = safeLang ? ` class="language-${safeLang}"` : "";
    return `<pre><code${langAttr}>${codeContent}\n</code></pre>\n`;
  },

  table(this: TelegramRendererContext, token: Tokens.Table): string {
    const numCols = token.header.length;
    if (numCols === 0) return "";

    // Pre-render every cell to inline HTML (card / transpose strategies).
    // Multi-line cell content is collapsed to a single line so each table
    // row stays one visual line that wraps naturally on mobile.
    const headerHtml = token.header.map((c) =>
      sanitizeCellHtml(inlineFromTokens.call(this, c.tokens, c.text)));
    const rowsHtml = token.rows.map((row) =>
      row.map((c) => sanitizeCellHtml(inlineFromTokens.call(this, c.tokens, c.text))),
    );
    // Plain escaped text for box-drawing (Telegram rejects <b>/<code> nested
    // inside <pre>, so box cells must be tag-free).
    const headerText = token.header.map((c) => escapeHtml(c.text));
    const rowsText = token.rows.map((row) => row.map((c) => escapeHtml(c.text)));

    // Natural column widths for strategy selection + box layout.
    const colWidths: number[] = [];
    let allAscii = true;
    for (let i = 0; i < numCols; i++) {
      let maxW = Math.max(1, visibleWidth(stripHtmlTags(headerHtml[i])));
      for (const row of rowsHtml) {
        if (i < row.length) {
          const w = visibleWidth(stripHtmlTags(row[i]));
          if (w > maxW) maxW = w;
          if (!isAscii(stripHtmlTags(row[i]))) allAscii = false;
        }
      }
      if (!isAscii(stripHtmlTags(headerHtml[i]))) allAscii = false;
      colWidths.push(maxW);
    }
    const naturalWidth = colWidths.reduce((a, b) => a + b, 0) + 3 * numCols + 1;

    // T4: narrow 2-column all-ASCII table that fits a mobile screen -> box-drawing.
    // ASCII width is unambiguous (1 char = 1 cell) in Telegram's monospace font,
    // so the <pre> grid aligns reliably. Bound by total natural width (~40
    // chars fits an iPhone portrait <pre>) so normal command/desc tables qualify;
    // longer cells fall through to card which wraps naturally.
    if (numCols === 2 && allAscii && naturalWidth <= 40) {
      return renderBoxTable(headerText, rowsText, colWidths);
    }
    // T5: wide table -> transpose to vertical cards (one block per row), so a
    //    many-column table never forces horizontal scroll on mobile.
    if (numCols > 4 || naturalWidth > 60) {
      return renderTransposedTable(headerHtml, rowsHtml);
    }
    // T1 default: card-style - bold header + bold first column (primary key),
    // 2-space column separator, wraps naturally, never overflows.
    return renderCardTable(headerHtml, rowsHtml);
  },

  list(this: TelegramRendererContext, token: Tokens.List): string {
    _listDepth++;
    try {
      const start = typeof token.start === "number" ? token.start : 1;
      // Cap indent growth at depth 2: deeper levels add no base indent of
      // their own and switch to a `› ` bullet (unordered), so deep nesting
      // grows only ~2 cols/level (parent continuation indent) instead of 4.
      // Ordered lists keep their numbering at every depth.
      const baseIndent = _listDepth <= 2
        ? "  ".repeat(Math.max(0, _listDepth - 1))
        : "";
      const lines = token.items.map((item, index) => {
        const bullet = token.ordered
          ? `${start + index}. `
          : (_listDepth >= 3 ? "› " : "- ");
        const taskMarker = item.task ? `[${item.checked ? "x" : " "}] ` : "";
        const marker = bullet + taskMarker;
        const content = blockFromTokens.call(this, item.tokens, item.text);
        const contentLines = content.trimEnd().split("\n");
        const contIndent = " ".repeat(visibleWidth(marker));
        return contentLines.map((line, i) => {
          const prefix = i === 0 ? baseIndent + marker : baseIndent + contIndent;
          return prefix + line;
        }).join("\n");
      });
      // Match paragraph spacing: leave a blank line after the list.\n      return lines.join("\n") + "\n\n";
    } finally {
      _listDepth--;
    }
  },

  listitem(this: TelegramRendererContext, token: Tokens.ListItem): string {
    // Used when a list item contains block-level children (e.g. nested lists).
    // blockFromTokens will re-enter `list` for nested lists via parser.parse().
    return blockFromTokens.call(this, token.tokens, token.text);
  },

  blockquote(this: TelegramRendererContext, { tokens }: Tokens.Blockquote): string {
    const content = this.parser.parse(tokens as unknown[]).trim();
    // Only wrap in <i> if content doesn't start with a block-level / inline-format
    // tag. Wrapping `<b>`/`<pre>`/`<blockquote>` in `<i>` produces nesting that
    // Telegram rejects (bad request), which forces a plain-text fallback for the
    // ENTIRE message chunk — silently dropping all formatting.
    const shouldItalic = !/^<blockquote|^<pre|^<ul|^<ol|^<table|^<b|^<i|^<a/i.test(content);
    const wrapped = shouldItalic ? `<i>${content}</i>` : content;
    return `<blockquote>${wrapped}</blockquote>\n`;
  },

  hr(this: TelegramRendererContext): string {
    // Slim separator: 3 fullwidth dashes, no <pre> (avoids the heavy
    // monospace block that eats a full line on mobile).
    return "━━━\n\n";
  },

  image(this: TelegramRendererContext, { href, text, title }: Tokens.Image): string {
    const alt = text || "image";
    if (href) return `🖼 <a href="${escapeAttr(href)}">${escapeHtml(alt)}</a>`;
    if (title) return `🖼 ${escapeHtml(alt)}: ${escapeHtml(title)}`;
    return `🖼 ${escapeHtml(alt)}`;
  },

  // ── Inline / passthrough tokens previously left to marked's default ──
  // marked's default renderers emit attributes/constructs Telegram's HTML
  // parser rejects (`title=` on <a>, `<br>`, raw HTML, unescaped `&` in href),
  // which causes the whole message chunk to fall back to plain text.
  // Override each so the output is always valid Telegram HTML.

  link(this: TelegramRendererContext, { href, tokens }: Tokens.Link): string {
    const safeHref = escapeAttr(href);
    if (!safeHref) return inlineFromTokens.call(this, tokens);
    return `<a href="${safeHref}">${inlineFromTokens.call(this, tokens)}</a>`;
  },

  html(this: TelegramRendererContext, token: Tokens.HTML | Tokens.Tag): string {
    // pi-tui renders raw HTML as plain text; mirror that here instead of
    // letting it pass through and trip Telegram's parser.
    const raw = "raw" in token && typeof token.raw === "string" ? token.raw : "";
    return escapeHtml(raw.trim());
  },

  br(this: TelegramRendererContext): string {
    // Telegram HTML has no <br>; a literal newline is the line break.
    return "\n";
  },
};

marked.use({ renderer });

/**
 * Convert Markdown to Telegram-compatible HTML.
 * Handles tables, lists, code blocks, blockquotes, and all inline
 * formatting within the Telegram supported subset.
 */
export function markdownToTelegramHtml(markdown: string): string {
  _listDepth = 0;
  _textAppendNewline = true;
  // Pre-scan: wrap "pseudo-tables" (aligned pipe text that looks like a
  // markdown table but lacks the `| --- |` separator row) in fenced code so
  // marked renders them as <pre><code> — preserving column alignment in
  // Telegram's monospace font instead of mangling pipes in a proportional-font
  // paragraph. Real markdown tables (with a separator) are left for marked.
  const protected_ = protectPseudoTables(fallbackMalformedPipeTables(normalizeWrappedFlattenedTables(normalizeListParagraphSpacing(markdown))));
  return (marked.parse(protected_, { async: false }) as string).replace(/\n+$/, "");
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

/**
 * Convert inline Markdown to Telegram HTML.
 * Kept for backward compatibility with single-line / simple conversions.
 */
export function inlineMarkdownToHtml(text: string): string {
  const links: Array<{ label: string; url: string }> = [];
  let processed = text.replace(/\[([^\]\n]+)]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    const idx = links.length;
    links.push({ label, url });
    return `\x00LINK${idx}\x00`;
  });

  let html = escapeHtml(processed);

  html = html.replace(/\x00LINK(\d+)\x00/g, (_m, idxStr) => {
    const idx = parseInt(idxStr, 10);
    const link = links[idx];
    if (!link) return "";
    return `<a href="${escapeAttr(link.url)}">${escapeHtml(link.label)}</a>`;
  });

  html = html.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${code}</code>`);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, (_m, bold) => `<b>${bold}</b>`);
  html = html.replace(/__([^_\n]+)__/g, (_m, bold) => `<b>${bold}</b>`);
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_m, italic) => `<i>${italic}</i>`);
  html = html.replace(/_([^_\n]+)_/g, (_m, italic) => `<i>${italic}</i>`);
  return html;
}
