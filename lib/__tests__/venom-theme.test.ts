import { describe, expect, it } from "vitest";
import { VENOM_PULSE_FRAMES, venomActivity, venomPulse, venomStatusLabel, formatHuntDuration, formatConsoleActivity, formatVenomConsole, venomThemeFrame, venomThemeLabel, venomThemeText, venomThemeNumber, formatVenomContextUsage, formatVenomFooter, venomPreset, VENOM_PRESETS, venomSectionTitle, venomTransmissionTitle, venomToolLine, venomToolTag, formatVenomTelemetry, formatVenomTerminalBlock, formatVenomActivityHistory, formatVenomOperationState, formatVenomLiveOperations, formatVenomRichLivePanel, formatVenomRichInitialPanel, VENOM_PULSE_WIDTH, isVenomHud, venomCompletionLabel } from "../venom-theme.ts";

describe("Venom Lethal Protector presentation", () => {
  it("cycles through symbiote pulse frames without reporting fictional completion", () => {
    expect(VENOM_PULSE_FRAMES.length).toBeGreaterThan(4);
    expect(venomPulse(0)).toEqual(venomPulse(VENOM_PULSE_FRAMES.length));
    expect(venomPulse(0)).not.toEqual(venomPulse(1));
    expect(VENOM_PULSE_FRAMES.every(frame => !frame.pulse.includes("%"))).toBe(true);
  });

  it("sweeps from empty to full before resetting with no backwards steps", () => {
    const fills = VENOM_PULSE_FRAMES.map(frame => [...frame.pulse].filter(ch => ch === "▰").length);
    expect(fills).toEqual(Array.from({ length: VENOM_PULSE_WIDTH + 1 }, (_, i) => i));
    expect(venomPulse(VENOM_PULSE_FRAMES.length).pulse).toBe(VENOM_PULSE_FRAMES[0].pulse);
  });

  it("renders compact safe Blacksite operations without large preformatted cards", () => {
    const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const rendered = formatVenomCompactOperations(
      ["[RECON] rg foo lib/", "[READ] lib/a.ts", "[VERIFY] npm test <unsafe>"], escape, { visibleOperations: 2 },
    );
    expect(rendered).toContain("<b>[READ]</b> <code>&gt; lib/a.ts</code>");
    expect(rendered).toContain("<b>[VERIFY]</b> <code>&gt; npm test &lt;unsafe&gt;</code>");
    expect(rendered).not.toContain("<pre>");
    expect(rendered).not.toContain("[RECON]");
    expect(formatVenomCompactOperations([], escape)).toContain("awaiting target");
  });

  it("identifies meaningful activity from actual tool arguments", () => {
    expect(venomActivity("read", { path: "lib/renderer.ts" })).toBe("examining");
    expect(venomActivity("bash", { command: "rg 'agent_end' lib/renderer.ts" })).toBe("tracking");
    expect(venomActivity("bash", { command: "npm test" })).toBe("testing");
    expect(venomActivity("bash", { command: "git status" })).toBe("hunting");
    expect(venomActivity("bash", { command: "restart service" })).toBe("adapting");
  });

  it("formats elapsed hunt time across seconds, minutes and hours", () => {
    expect(formatHuntDuration(0)).toBe("0s");
    expect(formatHuntDuration(42_900)).toBe("42s");
    expect(formatHuntDuration(102_000)).toBe("1m 42s");
    expect(formatHuntDuration(3_661_000)).toBe("1h 1m 1s");
    expect(formatHuntDuration(-1_000)).toBe("0s");
  });

  it("renders real tool summaries in separate safe console-style lines", () => {
    const entries = formatConsoleActivity(["read: lib/a.ts", "bash: rg <private>", "bash: npm test"], value => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
    expect(entries).toContain("<code>&gt; read: lib/a.ts</code>");
    expect(entries).toContain("<code>&gt; bash: rg &lt;private&gt;</code>");
    expect(entries.split("\n")).toHaveLength(3);
    expect(entries).not.toContain("•");
    expect(formatConsoleActivity([], value => value)).toContain("awaiting target");
  });

  it("accepts custom names and display options while retaining safe defaults", () => {
    expect(venomThemeLabel("tracking", { labels: { tracking: "Following the Scent" } })).toBe("Following the Scent");
    expect(venomThemeLabel("tracking")).toBe("Tracking");
    expect(venomThemeFrame(0, { animation: "static" })).toEqual({ eye: "◆", pulse: "" });
    expect(venomThemeFrame(0, { animation: "spinner" }).pulse).toBe("");
    expect(venomThemeText("<b>Unsafe</b>", "Fallback")).toBe("b Unsafe /b");
    expect(venomThemeText("   ", "Fallback")).toBe("Fallback");
    expect(venomThemeNumber(100, 2600, 1800, 15000)).toBe(1800);
    expect(venomThemeNumber(18000, 2600, 1800, 15000)).toBe(15000);
  });

  it("configures terminal prefix and number of visible operations", () => {
    const lines = ["read /a", "read /b", "bash npm test"];
    const output = formatVenomConsole(lines, x => x, { consolePrefix: "$", visibleOperations: 2 });
    expect(output).toContain("$ read /b");
    expect(output).toContain("$ bash npm test");
    expect(output).not.toContain("read /a");
  });

  it("formats measured context usage as percentage and context window", () => {
    expect(formatVenomContextUsage({ tokens: 21_364, contextWindow: 98_000 })).toBe("21.8% / 98k");
    expect(formatVenomContextUsage({ percent: 21.8, contextWindow: 98_000 })).toBe("21.8% / 98k");
    expect(formatVenomContextUsage({ tokens: 2_000 }, 32_768)).toBe("6.1% / 32.8k");
    expect(formatVenomContextUsage({ tokens: 12_000 })).toBeUndefined();
    expect(formatVenomContextUsage(undefined, 98_000)).toBeUndefined();
  });

  it("keeps the footer self-contained with no trailing divider", () => {
    expect(formatVenomFooter(3, 90_000, "21.8% / 98k", "qwen3.5-27b"))
      .toBe("3 operations · 21.8% / 98k · qwen3.5-27b · hunting 1m 30s");
    expect(formatVenomFooter(0, 0, undefined, undefined, { showElapsed: false }))
      .toBe("0 operations");
    expect(formatVenomFooter(2, 0, undefined, undefined, { showOperations: false, showElapsed: false }))
      .toBe("");
  });


  it("selects Blacksite and Minimal Terminal without changing the existing default", () => {
    expect(venomPreset()).toBe("lethal-protector");
    expect(venomThemeLabel("tracking")).toBe("Tracking");
    expect(venomThemeLabel("tracking", { preset: "blacksite" })).toBe("TARGET ACQUIRED");
    expect(venomThemeLabel("testing", { preset: "blacksite" })).toBe("VALIDATING TARGET");
    expect(venomThemeLabel("testing", { preset: "blacksite", labels: { testing: "CHECKING" } })).toBe("CHECKING");
    expect(venomSectionTitle({ preset: "blacksite" })).toBe("[ SYMBIOTE TERMINAL ]");
    expect(venomTransmissionTitle({ preset: "blacksite" })).toBe("[ NEURAL LINK ]");
    expect(venomThemeLabel("tracking", { preset: "minimal-terminal" })).toBe("Searching");
    expect(VENOM_PRESETS.blacksite.labels.hunting).toBe("ACTIVE HUNT");
  });

  it("classifies real operations into accurate tactical tags", () => {
    expect(venomToolTag("bash", { command: "rg foo src" })).toBe("RECON");
    expect(venomToolTag("bash", { command: "npm test" })).toBe("VERIFY");
    expect(venomToolTag("read", { path: "a.ts" })).toBe("READ");
    expect(venomToolTag("edit", { path: "a.ts" })).toBe("PATCH");
    expect(venomToolTag("bash", { command: "echo hello" })).toBe("EXEC");
    expect(venomToolTag("read", {}, true)).toBe("ERROR");
    expect(venomToolLine("read", {}, "read: lib/renderer.ts", { preset: "blacksite" }))
      .toBe("[READ] lib/renderer.ts");
    expect(venomToolLine("read", {}, "read: lib/renderer.ts"))
      .toBe("read: lib/renderer.ts");
  });

  it("uses a complete two-line telemetry footer for Blacksite", () => {
    expect(formatVenomTelemetry(3, 90_000, "21.8% / 98k", "qwen3.5-27b", { preset: "blacksite" }))
      .toBe("3 OPS · 21.8% / 98k · qwen3.5-27b\nHUNT TIME 1m 30s");
    expect(formatVenomTelemetry(3, 90_000, undefined, undefined, { preset: "blacksite", showElapsed: false }))
      .toBe("3 OPS");
    expect(venomCompletionLabel(false, { preset: "blacksite" })).toBe("HUNT COMPLETE // UNVERIFIED");
  });

  it("wraps already escaped tactical logs in one Telegram native pre block", () => {
    const lines = "<code>&gt; [READ] lib/a.ts</code>\\n<code>&gt; [VERIFY] npm test &amp;&amp; echo ok</code>";
    expect(formatVenomTerminalBlock(lines))
      .toBe("<pre>&gt; [READ] lib/a.ts\\n&gt; [VERIFY] npm test &amp;&amp; echo ok</pre>");
    expect(formatVenomTerminalBlock("<code>safe</code>")).toBe("<pre>safe</pre>");
  });

  it("supports distinct HUD, Predator and Classified themes", () => {
    for (const preset of ["symbiote-hud", "predator-terminal", "classified"] as const) {
      expect(isVenomHud(preset)).toBe(true);
      expect(venomSectionTitle({ preset }).length).toBeGreaterThan(3);
      expect(venomThemeLabel("tracking", { preset }).length).toBeGreaterThan(3);
    }
    expect(isVenomHud("blacksite")).toBe(false);
  });

  it("reserves a constant row count while the live tool list grows", () => {
    const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const opts = { visibleOperations: 3, fixedOperationRows: true, collapseOperations: "off" } as const;
    const count = (lines: string[]) => formatVenomActivityHistory(lines, escape, opts).split("\n").length;
    expect(count([])).toBe(3);
    expect(count(["[READ] a"])).toBe(3);
    expect(count(["[READ] a", "[VERIFY] test"])).toBe(3);
    expect(count(["[READ] a", "[VERIFY] test", "[EXEC] done"])).toBe(3);
    expect(count(["[READ] a", "[VERIFY] test", "[EXEC] done", "[READ] b"])).toBe(3);
    expect(formatVenomActivityHistory([], escape, opts)).toContain("awaiting operation");
    expect(formatVenomActivityHistory(["[READ] a"], escape, { ...opts, fixedOperationRows: false })).not.toContain("awaiting operation");
  });

  it("only shows expandable history when explicitly enabled and items exceed X", () => {
    const esc = (text: string) => text;
    const lines = ["[READ] one", "[READ] two", "[VERIFY] three", "[EXEC] four"];
    const options = { visibleOperations: 2, collapseOperations: "expandable" } as const;
    const html = formatVenomActivityHistory(lines, esc, options);
    expect(html).toContain("<blockquote expandable>");
    expect(html).toContain("2 earlier operations");
    expect(html).toContain("tap to expand");
    expect(formatVenomActivityHistory(lines.slice(-2), esc, options)).not.toContain("<blockquote");
    expect(formatVenomActivityHistory(lines, esc, { ...options, collapseOperations: "off" })).not.toContain("<blockquote");
  });

  it("shows X recent lines and optional expandable history without losing errors", () => {
    const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const lines = ["[READ] one.ts", "[READ] two.ts", "[ERROR] tool failed", "[VERIFY] npm test", "[EXEC] done"];
    const recent = formatVenomActivityHistory(lines, esc, { visibleOperations: 2, collapseOperations: "off" });
    expect(recent).toContain("npm test");
    expect(recent).not.toContain("one.ts");
    expect(recent).not.toContain("<blockquote");
    const expanded = formatVenomActivityHistory(lines, esc, { visibleOperations: 2, collapseOperations: "expandable" });
    expect(expanded).toContain("<blockquote expandable>");
    expect(expanded).toContain("[ERROR] tool failed");
    expect(expanded).toContain("<b>[VERIFY]</b>");
    expect(expanded).not.toContain("<pre>");
    expect(formatVenomActivityHistory(["[READ] <secret>"], esc)).toContain("&lt;secret&gt;");
  });

  it("renders fixed lifecycle slots with a consistent height through start and completion", () => {
    const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const base = { id: "tool-1", tag: "EXEC", tool: "bash", detail: "git status", state: "running" as const, startedAt: 1000 };
    const opts = { visibleOperations: 3, fixedOperationRows: true, collapseOperations: "off" } as const;
    const countLines = (ops: typeof base[]) => formatVenomLiveOperations(ops, esc, opts).split("\n").length;
    expect(countLines([])).toBe(6);
    expect(countLines([base])).toBe(6);
    const running = formatVenomLiveOperations([base], esc, opts);
    expect(running).toContain("EXEC · ACTIVE");
    expect(running).toContain("git status");
    const done = formatVenomLiveOperations([{ ...base, state: "done", finishedAt: 2400 }], esc, opts);
    expect(done).toContain("EXEC · DONE 1.4s");
    expect(done.split("\n")).toHaveLength(6);
    expect(done).not.toContain("operations ·");
  });

  it("renders failures and collapses only older structured traces", () => {
    const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const ops = Array.from({ length: 4 }, (_, i) => ({
      id: String(i), tag: i === 1 ? "ERROR" : "READ", tool: "read",
      detail: i === 1 ? "<private>" : "src/" + i,
      state: i === 1 ? "failed" as const : "done" as const,
      startedAt: 1000, finishedAt: 2000,
    }));
    const opts = { visibleOperations: 2, collapseOperations: "expandable" } as const;
    const html = formatVenomLiveOperations(ops, esc, opts);
    expect(html).toContain("<blockquote expandable>");
    expect(html).toContain("2 EARLIER TRACES");
    expect(html).toContain("&lt;private&gt;");
    expect(html).not.toContain("<pre>");
    expect(formatVenomLiveOperations(ops.slice(-2), esc, opts)).not.toContain("<blockquote");
    expect(formatVenomLiveOperations(ops, esc, { ...opts, collapseOperations: "off" })).not.toContain("<blockquote");
  });

  it("clamps long command details without changing fixed-row count", () => {
    const op = { id: "1", tag: "EXEC", tool: "bash", detail: "a".repeat(400), state: "running" as const, startedAt: 0 };
    const result = formatVenomLiveOperations([op], x => x, { visibleOperations: 1 });
    expect(result.split("\n")).toHaveLength(2);
    expect(result.length).toBeLessThan(100);
    expect(result).toContain("…");
  });

  it("renders native Rich headings, stable pulse and a closed details history", () => {
    const operations = Array.from({ length: 4 }, (_, i) => ({
      id: String(i), tag: "EXEC", tool: "bash",
      detail: i === 0 ? "grep <secret> & token" : "git status",
      state: "done" as const, startedAt: 0, finishedAt: 500,
    }));
    const meta = {
      title: "VENOM // LETHAL PROTECTOR", status: "HUNT ACTIVE",
      pulse: "▰▰▱▱▱▱", section: "SYMBIOTE ACTIVITY",
      transmission: "NEURAL LINK", objective: "Checking service status",
      model: "qwen", metrics: "CTX 24% · 18s",
    };
    const rich = formatVenomRichLivePanel(operations, {
      visibleOperations: 3, collapseOperations: "expandable",
    }, meta);
    expect(rich).toContain("## SYMBIOTE ACTIVITY");
    expect(rich).toContain("## NEURAL LINK");
    expect(rich).toContain("`▰▰▱▱▱▱`");
    expect(rich).toContain("<details>");
    expect(rich).toContain("<summary>Earlier traces</summary>");
    expect(rich).toContain("&lt;secret&gt; &amp; token");
    expect(rich).not.toContain("<blockquote expandable>");
    expect(formatVenomRichLivePanel(operations, {
      visibleOperations: 3, collapseOperations: "off",
    }, meta)).not.toContain("<details>");
  });

  it("preserves twelve pulse cells and a stable width through tool updates", () => {
    expect(VENOM_PULSE_WIDTH).toBe(12);
    expect(VENOM_PULSE_FRAMES).toHaveLength(13);
    expect(VENOM_PULSE_FRAMES.every(frame => Array.from(frame.pulse).length === 12)).toBe(true);
    const meta = { title: "VENOM", status: "HUNT ACTIVE",
      pulse: venomPulse(6).pulse, section: "SYMBIOTE ACTIVITY", transmission: "NEURAL LINK",
      objective: "Working", model: "qwen", metrics: "CTX 10%" };
    const op = (i: number) => ({ id: String(i), tag: "EXEC", tool: "bash",
      detail: "a".repeat(120), state: "running" as const, startedAt: 1 });
    for (const count of [0, 1, 3, 4, 25]) {
      const rich = formatVenomRichLivePanel(Array.from({ length: count }, (_, i) => op(i)),
        { visibleOperations: 3, collapseOperations: "expandable" }, meta);
      expect(rich).not.toContain("━━━━━━━━");
      expect(rich).toContain("<summary>Earlier traces</summary>");
      expect(rich).not.toContain("a".repeat(40));
    }
    const initial = formatVenomRichInitialPanel({ visibleOperations: 3 });
    expect(initial).not.toContain("━━━━━━━━");
    expect(initial).toContain("<summary>Earlier traces</summary>");
    expect(initial).toContain("▱".repeat(12));
  });

  it("renders semantic shortened commands without URL query strings", () => {
    const rich = formatVenomRichLivePanel([{ id: "1", tag: "EXEC", tool: "bash",
      detail: 'bash: curl "https://example.com/weather?api_key=secret"',
      state: "running", startedAt: 0 }], { visibleOperations: 1 }, {
      title: "VENOM", status: "HUNT ACTIVE", pulse: "▰".repeat(6) + "▱".repeat(6),
      section: "SYMBIOTE ACTIVITY", transmission: "NEURAL LINK",
      objective: "Analyzing", model: "qwen", metrics: "CTX 10%",
    });
    expect(rich).toContain("curl");
    expect(rich).not.toContain("api_key=secret");
    expect(rich).not.toContain("━━━━━━━━");
    expect(rich).toContain("<details>");
    expect(rich).toContain("## SYMBIOTE ACTIVITY");
  });

  it("reports only actual operation states", () => {
    expect(formatVenomOperationState(4, 1, 2)).toBe("4 done · 1 running · 2 failed");
  });

  it("uses Lethal Protector state language", () => {
    expect(venomStatusLabel("hunting")).toBe("On the Hunt");
    expect(venomStatusLabel("examining")).toBe("Examining the Target");
    expect(venomStatusLabel("testing")).toBe("Testing the Prey");
  });
});
