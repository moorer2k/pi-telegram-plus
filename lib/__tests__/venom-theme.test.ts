import { describe, expect, it } from "vitest";
import { VENOM_PULSE_FRAMES, venomActivity, venomPulse, venomStatusLabel, formatHuntDuration, formatConsoleActivity, formatVenomConsole, venomThemeFrame, venomThemeLabel, venomThemeText, venomThemeNumber, formatVenomContextUsage, formatVenomFooter, venomPreset, VENOM_PRESETS, venomSectionTitle, venomTransmissionTitle, venomToolLine, venomToolTag, formatVenomTelemetry, formatVenomTerminalBlock, formatVenomActivityHistory, formatVenomOperationState, isVenomHud, venomCompletionLabel } from "../venom-theme.ts";

describe("Venom Lethal Protector presentation", () => {
  it("cycles through symbiote pulse frames without reporting fictional completion", () => {
    expect(VENOM_PULSE_FRAMES.length).toBeGreaterThan(4);
    expect(venomPulse(0)).toEqual(venomPulse(VENOM_PULSE_FRAMES.length));
    expect(venomPulse(0)).not.toEqual(venomPulse(1));
    expect(VENOM_PULSE_FRAMES.every(frame => !frame.pulse.includes("%"))).toBe(true);
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

  it("reports only actual operation states", () => {
    expect(formatVenomOperationState(4, 1, 2)).toBe("4 done · 1 running · 2 failed");
  });

  it("uses Lethal Protector state language", () => {
    expect(venomStatusLabel("hunting")).toBe("On the Hunt");
    expect(venomStatusLabel("examining")).toBe("Examining the Target");
    expect(venomStatusLabel("testing")).toBe("Testing the Prey");
  });
});
