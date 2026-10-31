import { describe, expect, it } from "vitest";
import { buildVenomRichPanel, renderVenomBlocks, shortenVenomCommand } from "../venom-rich-doc.ts";

const meta = { title: "VENOM // LETHAL PROTECTOR", status: "HUNT ACTIVE",
  pulse: "▰".repeat(6) + "▱".repeat(6), section: "SYMBIOTE ACTIVITY",
  transmission: "NEURAL LINK", objective: "Inspecting target",
  model: "qwen", metrics: "CTX 20% · 12s" };
describe("Venom typed Rich document builder", () => {
  it("builds the same panel slots before and during tool execution", () => {
    const empty = buildVenomRichPanel([], { visibleOperations: 3 }, meta);
    const live = buildVenomRichPanel([{ id: "a", tag: "EXEC", tool: "bash",
      detail: "bash: git status", state: "running", startedAt: 0 }], { visibleOperations: 3 }, meta);
    expect(empty).not.toContain("━━━━━━━━");
    expect(live).not.toContain("━━━━━━━━");
    expect(empty).toContain("## SYMBIOTE ACTIVITY");
    expect(empty).toContain("<summary>Earlier traces</summary>");
    expect(live).toContain("◈ EXEC · RUNNING");
    expect(live).toContain("◈ EXEC · RUNNING `git status`");
    expect(live).not.toContain("**◈ EXEC · RUNNING**");
    expect(live).not.toContain("◈ EXEC · RUNNING\\n\\n`git status`");
    expect((empty.match(/TRACE · IDLE/g) ?? []).length).toBe(3);
    expect((live.match(/TRACE · IDLE/g) ?? []).length).toBe(2);
    expect(live).toContain("◈ TRACE · IDLE `awaiting operation`");
  });
  it("preserves intent while dropping URL queries and repeated tool prefixes", () => {
    expect(shortenVenomCommand("bash: curl https://example.com/weather?secret=value"))
      .not.toContain("secret=value");
    expect(shortenVenomCommand("terminal: git status")).toBe("git status");
    expect(shortenVenomCommand("bash: cat /home/user/some/very/deep/file.ts")).toContain("file.ts");
  });
  it("uses safe Rich markup for text and never turns tool details into raw HTML", () => {
    const out = renderVenomBlocks([{ kind: "heading", value: "A < B" },
      { kind: "code", value: "echo <secret> & hello" },
      { kind: "details", title: "Earlier traces", lines: ["danger <script>"] }]);
    expect(out).toContain("&lt;secret&gt; &amp; hello");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });
  it("keeps the native details widget while reducing oversized history", () => {
    const op = (i: number) => ({ id: String(i), tag: "READ", tool: "read",
      detail: "src/" + i + " " + "x".repeat(80), state: "done" as const,
      startedAt: 0, finishedAt: 100 });
    const rich = buildVenomRichPanel(Array.from({ length: 100 }, (_, i) => op(i)),
      { visibleOperations: 3, collapseOperations: "expandable" }, meta);
    expect(rich).toContain("<details>");
    expect(rich).toContain("## NEURAL LINK");
    expect(rich).not.toContain("━━━━━━━━");
    expect(rich.length).toBeLessThan(6501);
  });
});
