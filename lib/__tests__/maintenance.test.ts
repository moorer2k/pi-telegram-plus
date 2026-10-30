import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getMaintenanceService, venomRestartPhrase, deliverVenomRestartNotice } from "../maintenance.ts";

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

describe("one-time post-restart Venom notices", () => {
  it("persists across processes and delivers only after a new PID becomes active", async () => {
    const dir = await mkdtemp(join(tmpdir(), "venom-maintenance-"));
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    const file = join(dir, "venom-restart-pending.json");
    const sendText = vi.fn(async () => [{ message_id: 1 }]);
    try {
      const marker = {
        botId: "test-bot", chatId: 123, previousPid: process.pid + 1,
        createdAt: Date.now(), fromSha: "a".repeat(40), toSha: "b".repeat(40), phrase: "Before",
      };
      await writeFile(file, JSON.stringify(marker));
      await deliverVenomRestartNotice("test-bot", { sendText } as any);
      expect(sendText).toHaveBeenCalledOnce();
      expect(sendText.mock.calls[0]?.[0]).toBe(123);
      expect(sendText.mock.calls[0]?.[1]).toContain("SYMBIOTE ONLINE");
      await deliverVenomRestartNotice("test-bot", { sendText } as any);
      expect(sendText).toHaveBeenCalledOnce();
      await writeFile(file, JSON.stringify({ ...marker, previousPid: process.pid }));
      await deliverVenomRestartNotice("test-bot", { sendText } as any);
      expect(sendText).toHaveBeenCalledOnce();
      expect((await readFile(file, "utf8")).length).toBeGreaterThan(1);
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("expires stale restarts without sending a success message", async () => {
    const dir = await mkdtemp(join(tmpdir(), "venom-maintenance-stale-"));
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    const sendText = vi.fn(async () => [{ message_id: 1 }]);
    try {
      await writeFile(join(dir, "venom-restart-pending.json"), JSON.stringify({
        botId: "test-bot", chatId: 123, previousPid: process.pid + 1,
        createdAt: Date.now() - 30 * 60_000, fromSha: "a", toSha: "b", phrase: "Before",
      }));
      await deliverVenomRestartNotice("test-bot", { sendText } as any);
      expect(sendText).not.toHaveBeenCalled();
    } finally {
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
