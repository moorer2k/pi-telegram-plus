import { describe, expect, it } from "vitest";
import { VENOM_PULSE_FRAMES, venomActivity, venomPulse, venomStatusLabel } from "../venom-theme.ts";

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

  it("uses Lethal Protector state language", () => {
    expect(venomStatusLabel("hunting")).toBe("On the Hunt");
    expect(venomStatusLabel("examining")).toBe("Examining the Target");
    expect(venomStatusLabel("testing")).toBe("Testing the Prey");
  });
});
