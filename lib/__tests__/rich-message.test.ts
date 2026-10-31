import { describe, expect, it } from "vitest";
import { hasGfmTable, normalizeFlattenedTables, markdownToTelegramHtml } from "../markdown.ts";
import { escapeRichMarkdown, richMarkdownForTables, TELEGRAM_RICH_TEXT_LIMIT } from "../rich-message.ts";

const TABLE = [
  "| Project | Status | Count |",
  "| --- | :---: | ---: |",
  "| dsh-im plugin | Installed | 1 |",
  "| Current branch | master | 1 |",
].join("\n");

describe("hasGfmTable", () => {
  it("detects a real GFM pipe table", () => {
    expect(hasGfmTable(TABLE)).toBe(true);
    expect(hasGfmTable(`intro\n\n${TABLE}\n\noutro`)).toBe(true);
  });

  it("ignores pipe text that is not a table", () => {
    expect(hasGfmTable("a | b\nc | d")).toBe(false);
    expect(hasGfmTable("| a | b |\n| c | d |")).toBe(false);
    expect(hasGfmTable("---")).toBe(false);
  });

  it("ignores tables inside fenced code blocks", () => {
    expect(hasGfmTable(`\`\`\`md\n${TABLE}\n\`\`\``)).toBe(false);
  });
});

const FLATTENED_FORECAST = "Next 3 days: | Date | High / Low | Rain chance | |-----|----------|------------| | Thu 10/30 | 52 / 39°F | 14% | | Fri 10/31 | 55 / 37°F | 12% | | Sat 11/01 | 54 / 39°F | 4% |";

describe("flattened table recovery", () => {
  it("restores an inline forecast into real GFM table rows", () => {
    const normal = normalizeFlattenedTables(FLATTENED_FORECAST);
    expect(normal).toContain("Next 3 days:\n\n| Date | High / Low | Rain chance |");
    expect(normal).toContain("| ----- | ---------- | ------------ |");
    expect(normal).toContain("| Thu 10/30 | 52 / 39°F | 14% |");
    expect(normal).toContain("| Sat 11/01 | 54 / 39°F | 4% |");
    expect(hasGfmTable(normal)).toBe(true);
  });
  it("selects native Rich table delivery after recovery", () => {
    const rich = richMarkdownForTables(FLATTENED_FORECAST);
    expect(rich).toBeDefined();
    expect(rich).toContain("| Fri 10/31 | 55 / 37°F | 12% |");
  });
  it("repairs HTML fallback rather than displaying raw pipes", () => {
    const html = markdownToTelegramHtml(FLATTENED_FORECAST);
    expect(html).not.toContain("|-----|");
    expect(html).toContain("Thu 10/30");
    expect(html).toContain("Fri 10/31");
  });
  it("leaves ordinary pipe prose and code fences unchanged", () => {
    expect(normalizeFlattenedTables("alpha | beta | gamma")).toBe("alpha | beta | gamma");
    const fenced = "```md\n" + FLATTENED_FORECAST + "\n```";
    expect(normalizeFlattenedTables(fenced)).toBe(fenced);
    expect(richMarkdownForTables(fenced)).toBeUndefined();
  });
  it("avoids inventing tables when no data row follows", () => {
    const incomplete = "Summary | Name | Count | | --- | --- |";
    expect(normalizeFlattenedTables(incomplete)).toBe(incomplete);
    expect(richMarkdownForTables(incomplete)).toBeUndefined();
  });
});
describe("escapeRichMarkdown", () => {
  it("escapes ampersands and angle brackets that could become markup", () => {
    expect(escapeRichMarkdown('<tg-spoiler>a & b')).toBe("&lt;tg-spoiler>a &amp; b");
  });

  it("leaves `>` alone so blockquotes keep working", () => {
    expect(escapeRichMarkdown("> quoted")).toBe("> quoted");
  });
});

describe("richMarkdownForTables", () => {
  it("returns the table markdown unchanged", () => {
    expect(richMarkdownForTables(TABLE)).toBe(TABLE);
  });

  it("returns undefined when the answer has no real table", () => {
    expect(richMarkdownForTables("just prose")).toBeUndefined();
    expect(richMarkdownForTables("| pseudo | table |\n| no | separator |")).toBeUndefined();
  });

  it("fences pseudo-tables so they keep monospace alignment", () => {
    const source = `${TABLE}\n\n\`ls -la\` style output:\n\naaa | bbb | ccc\n111 | 222 | 333`;
    const rich = richMarkdownForTables(source);
    expect(rich).toContain(TABLE);
    expect(rich).toContain("```\naaa | bbb | ccc\n111 | 222 | 333\n```");
  });

  it("escapes raw HTML in the body", () => {
    const rich = richMarkdownForTables(`${TABLE}\n\n<script>alert(1)</script>`);
    expect(rich).toContain("&lt;script>alert(1)&lt;/script>");
    expect(rich).not.toContain("<script>");
  });

  it("falls back to HTML for an unterminated code fence", () => {
    expect(richMarkdownForTables(`${TABLE}\n\n\`\`\`ts\nconst a = 1;`)).toBeUndefined();
  });

  it("falls back to HTML when the answer exceeds one Rich Message", () => {
    const huge = `${TABLE}\n\n${"x".repeat(TELEGRAM_RICH_TEXT_LIMIT)}`;
    expect(richMarkdownForTables(huge)).toBeUndefined();
    expect(richMarkdownForTables(huge.slice(0, TELEGRAM_RICH_TEXT_LIMIT - 100))).toBeDefined();
  });
});
