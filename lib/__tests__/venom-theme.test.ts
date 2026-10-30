import { describe, expect, it } from "vitest";
import { VENOM_PULSE_FRAMES, venomActivity, venomPulse, venomStatusLabel, formatHuntDuration, formatConsoleActivity } from "../venom-theme.ts";

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
    expect(entries.split("\\n")).toHaveLength(3);
    expect(entries).not.toContain("•");
    expect(formatConsoleActivity([], value => value)).toContain("awaiting target");
  });

  it("uses Lethal Protector state language", () => {
    expect(venomStatusLabel("hunting")).toBe("On the Hunt");
    expect(venomStatusLabel("examining")).toBe("Examining the Target");
    expect(venomStatusLabel("testing")).toBe("Testing the Prey");
  });
});
