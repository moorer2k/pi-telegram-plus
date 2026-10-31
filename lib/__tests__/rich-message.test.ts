import { describe, expect, it } from "vitest";
import { hasGfmTable, normalizeFlattenedTables, normalizeWrappedFlattenedTables, fallbackMalformedPipeTables, markdownToTelegramHtml } from "../markdown.ts";
import { escapeRichMarkdown, normalizeRichMathDelimiters, richMarkdownForTables, richMarkdownForDraft, richMarkdownForResponse, TELEGRAM_RICH_TEXT_LIMIT } from "../rich-message.ts";

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
describe("wrapped flattened GFM tables", () => {
  const source = [
    "Next 3 days | Date | Low / High | Outlook |",
    "|-----|----------|------------| | Today (Oct 30) | 39 / 52°F | Cloudy, cool |",
    "| Oct 31 | 37 / 55°F | Slightly warmer, dry | | Nov 1 | 39 / 54°F | Same band, dry |",
  ].join("\n");
  it("recovers header, separator and data split across source lines", () => {
    const recovered = normalizeWrappedFlattenedTables(source);
    expect(recovered).toContain("| Date | Low / High | Outlook |\n| ----- | ---------- | ------------ |");
    expect(recovered).toContain("| Today (Oct 30) | 39 / 52°F | Cloudy, cool |");
    expect(recovered).toContain("| Nov 1 | 39 / 54°F | Same band, dry |");
    expect(hasGfmTable(recovered)).toBe(true);
  });
  it("routes recovered rows to native Rich and renders structured HTML fallback", () => {
    const rich = richMarkdownForTables(source);
    expect(rich).toContain("| Oct 31 | 37 / 55°F | Slightly warmer, dry |");
    const html = markdownToTelegramHtml(source);
    expect(html).toContain("Today (Oct 30)");
    expect(html).not.toContain("|-----|");
  });
  it("does not join already valid tables or unrelated prose", () => {
    const table = "| Day | Hi |\n| --- | --- |\n| Fri | 53 |";
    expect(normalizeWrappedFlattenedTables(table)).toBe(table);
    const prose = "What | about | this?\nSomething else";
    expect(normalizeWrappedFlattenedTables(prose)).toBe(prose);
    const fenced = "```md\n" + source + "\n```";
    expect(normalizeWrappedFlattenedTables(fenced)).toBe(fenced);
  });
});
describe("final answer malformed table fallback", () => {
  const screenshot = "3-day outlook | Day | High / Low | Rain chance | Conditions | | --- | --- | --- | --- | | Today (Thu) | 48° / 45° | 42% | Light drizzle | | Fri | 51° / 48° | 27% | Light drizzle | | Sat | 51° / 41° | 0% | Mostly cloudy |";
  it("recovers the exact four-column screenshot table into native Rich formatting", () => {
    const rich = richMarkdownForTables(screenshot);
    expect(rich).toBeDefined();
    expect(rich).toContain("| Today (Thu) | 48° / 45° | 42% | Light drizzle |");
    expect(rich).toContain("| Sat | 51° / 41° | 0% | Mostly cloudy |");
  });
  it("keeps a native table in HTML fallback for the exact screenshot", () => {
    const html = markdownToTelegramHtml(screenshot);
    expect(html).not.toContain("| --- |");
    expect(html).toContain("Today (Thu)");
    expect(html).toContain("Light drizzle");
    expect(html).toContain("Mostly cloudy");
  });
  it("never leaves raw separator pipes when a data cell is missing", () => {
    const broken = "Outlook | Day | High | Rain | | --- | --- | --- | | Fri | 50° | 20% | | Sat | 52° |";
    expect(richMarkdownForTables(broken)).toBeUndefined();
    const html = markdownToTelegramHtml(broken);
    expect(html).not.toContain("| --- |");
    expect(html).toContain("Fri");
    expect(html).toContain("Sat");
    expect(html).toContain("Incomplete table data");
  });
  it("renders badly mismatched table headers as readable values", () => {
    const malformed = "Outlook | Day | High | Rain | Wrong header | | --- | --- | --- | | Fri | 50° | 20% |";
    const html = markdownToTelegramHtml(malformed);
    expect(html).not.toContain("| --- |");
    expect(html).toContain("Fri");
    expect(html).toContain("20%");
  });
  it("preserves unrelated prose and fenced code", () => {
    const prose = "foo | bar | baz";
    expect(fallbackMalformedPipeTables(prose)).toBe(prose);
    const fence = "```\n" + screenshot + "\n```";
    expect(fallbackMalformedPipeTables(fence)).toBe(fence);
  });
});
describe("escapeRichMarkdown", () => {
  it("escapes ampersands and angle brackets that could become markup", () => {
    expect(escapeRichMarkdown('<tg-spoiler>a & b')).toBe("<tg-spoiler>a & b");
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
    expect(rich).toContain("<script>alert(1)</script>");
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

describe("native rich markdown for complete responses", () => {
  it("keeps bullet lists and prose intact", () => {
    const source = "Extensions:\n\n- Pigram\n- Qusic\n\nDone.";
    const rich = richMarkdownForResponse(source);
    expect(rich).toContain("- Pigram");
    expect(rich).toContain("- Qusic");
    expect(rich).toContain("Done.");
  });
  it("preserves inline and display LaTeX syntax", () => {
    const source = String.raw`Inline \\(x^2 + y^2\\) and display \\[\\frac{a}{b}\\].`;
    const rich = richMarkdownForResponse(source);
    expect(rich).toContain(String.raw`\\frac{a}{b}`);
    expect(rich).toContain(String.raw`\\(x^2 + y^2\\)`);
  });
  it("fails back to HTML for incomplete fences and oversized replies", () => {
    expect(richMarkdownForResponse("```ts\nconst x = 1")).toBeUndefined();
    expect(richMarkdownForResponse("x".repeat(TELEGRAM_RICH_TEXT_LIMIT + 1))).toBeUndefined();
  });
});

describe("rich delivery content preservation", () => {
  it("keeps nested lists, links and code fences in native payload", () => {
    const source = ["## Tools", "- **First**", "  - nested", "- [Docs](https://example.org)", "", "```ts", "const value = 2;", "```"].join("\n");
    const rich = richMarkdownForResponse(source);
    expect(rich).toContain("nested");
    expect(rich).toContain("https://example.org");
    expect(rich).toContain("const value = 2;");
  });
  it("preserves literal comparison operators without exposing HTML tags", () => {
    const rich = richMarkdownForResponse("When a < b && b > c, show results.");
    expect(rich).toContain("<");
    expect(rich).toContain("&&");
  });
});

describe("streaming draft Markdown recovery", () => {
  it("does not publish incomplete trailing lines", () => {
    expect(richMarkdownForDraft("Complete paragraph.\n[unfinished](")).toBe("Complete paragraph.");
  });
  it("does not publish unterminated code fences", () => {
    expect(richMarkdownForDraft("Intro\n\n```ts\nconst x = 1;")).toBe("Intro");
  });
  it("preserves completed fenced code", () => {
    expect(richMarkdownForDraft("Intro\n\n```ts\nconst x = 1;\n```\n")).toContain("const x = 1;");
  });
  it("preserves LaTeX source in complete responses", () => {
    expect(richMarkdownForResponse(String.raw`\\(x^2 + y^2\\) and $$\\frac{1}{2}$$`)).toContain(String.raw`\\frac{1}{2}`);
  });
});

describe("fence parser regression", () => {
  it("rejects mismatched fence types", () => {
    expect(richMarkdownForResponse("~~~js\nconst a=1;\n```")).toBeUndefined();
  });
  it("rejects a shorter closing fence", () => {
    expect(richMarkdownForResponse("````js\nconst a=1;\n```")).toBeUndefined();
  });
  it("ignores fence-looking text inside an open fenced block", () => {
    expect(richMarkdownForResponse("```text\n~~~\n```")).toContain("~~~");
  });
  it("retains complete prose before an unfinished block", () => {
    expect(richMarkdownForDraft("Ready.\n\n~~~js\nconst a=1;")).toBe("Ready.");
  });
  it("accepts a longer valid closing fence", () => {
    expect(richMarkdownForResponse("```js\nconst a=1;\n````")).toContain("const a=1;");
  });
});

describe("incomplete inline Markdown recovery", () => {
  it("keeps completed text before a partial link", () => {
    expect(richMarkdownForDraft("Ready.\n[link](https://")).toBe("Ready.");
  });
  it("keeps completed text before unfinished inline code", () => {
    expect(richMarkdownForDraft("Ready.\n`unfinished")).toBe("Ready.");
  });
  it("keeps completed text before unfinished inline math", () => {
    expect(richMarkdownForDraft("Ready.\n$\\\\frac{1}{")).toBe("Ready.");
  });
  it("does not alter a complete mathematical final answer", () => {
    const input = String.raw`\\(x^2 + y^2\\)`;
    expect(richMarkdownForResponse(input)).toBeDefined();
  });
});

describe("native Markdown client regressions", () => {
  it("preserves TypeScript generics and ampersands in code", () => {
    const source = "```ts\ninterface FetchResult<T> { value: T & { ok: true } }\n```";
    expect(richMarkdownForResponse(source)).toContain("FetchResult<T>");
    expect(richMarkdownForResponse(source)).toContain("T & { ok:");
  });
  it("converts display and inline LaTeX outside code", () => {
    const source = String.raw`Inline \\(x^2\\) and display \\[\\frac{1}{2}\\]`;
    const actual = normalizeRichMathDelimiters(source);
    expect(actual).toContain("$x^2$");
    expect(actual).toContain("$$\\frac{1}{2}$$");
  });
  it("does not change TeX delimiters inside fenced or inline code", () => {
    const source = ["```md", String.raw`\\[literal\\]`, "```", "Use `\\\\(literal\\\\)` here."].join("\n");
    expect(normalizeRichMathDelimiters(source)).toBe(source);
  });
});

describe("multiline math client regressions", () => {
  const slash = String.fromCharCode(92);
  it("converts complete multiline display math", () => {
    const input = [slash + "[", slash + "int_0^" + slash + "infty e^{-x^2} dx", slash + "]"].join("\n");
    expect(normalizeRichMathDelimiters(input)).toBe(["$$", slash + "int_0^" + slash + "infty e^{-x^2} dx", "$$"].join("\n"));
  });
  it("leaves unmatched math delimiters unchanged", () => {
    const input = slash + "[unfinished";
    expect(normalizeRichMathDelimiters(input)).toBe(input);
  });
  it("preserves fenced math as literal source", () => {
    const input = ["```latex", slash + "[x" + slash + "]", "```"].join("\n");
    expect(normalizeRichMathDelimiters(input)).toBe(input);
  });
});
