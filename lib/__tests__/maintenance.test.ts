import { afterEach, describe, expect, it } from "vitest";
import { getMaintenanceService, venomRestartPhrase } from "../maintenance.ts";

const previous = {
  unit: process.env.PI_TELEGRAM_RESTART_UNIT,
  scope: process.env.PI_TELEGRAM_RESTART_SCOPE,
};
afterEach(() => {
  if (previous.unit === undefined) delete process.env.PI_TELEGRAM_RESTART_UNIT;
  else process.env.PI_TELEGRAM_RESTART_UNIT = previous.unit;
  if (previous.scope === undefined) delete process.env.PI_TELEGRAM_RESTART_SCOPE;
  else process.env.PI_TELEGRAM_RESTART_SCOPE = previous.scope;
});

describe("Venom maintenance safety", () => {
  it("requires an explicit service unit; arbitrary commands are not accepted", () => {
    delete process.env.PI_TELEGRAM_RESTART_UNIT;
    expect(getMaintenanceService()).toBeUndefined();
    for (const invalid of ["pi-bolt; rm -rf /", "bash -c reboot", "../pi-bolt.service", "pi-bolt.service --now", ""]) {
      process.env.PI_TELEGRAM_RESTART_UNIT = invalid;
      expect(getMaintenanceService()).toBeUndefined();
    }
  });
  it("supports a validated systemd user or system unit", () => {
    process.env.PI_TELEGRAM_RESTART_UNIT = "pi-bolt@3090.service";
    delete process.env.PI_TELEGRAM_RESTART_SCOPE;
    expect(getMaintenanceService()).toEqual({ unit: "pi-bolt@3090.service", scope: "user" });
    process.env.PI_TELEGRAM_RESTART_SCOPE = "system";
    expect(getMaintenanceService()).toEqual({ unit: "pi-bolt@3090.service", scope: "system" });
  });
  it("uses a randomized phrase for both phases without claims of a successful update", () => {
    for (let i = 0; i < 20; i++) {
      expect(venomRestartPhrase("before").length).toBeGreaterThan(10);
      expect(venomRestartPhrase("after").length).toBeGreaterThan(10);
    }
  });
});
