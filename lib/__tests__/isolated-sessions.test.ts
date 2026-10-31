import { describe, expect, it, vi } from "vitest";
import { IsolatedSessionRegistry } from "../isolated-sessions.js";

describe("isolated session lifecycle", () => {
  it("creates distinct sessions for chats and topics and reuses a target", async () => {
    let next = 0;
    const registry = new IsolatedSessionRegistry(async () => ({ id: ++next }), async () => {});
    const a = await registry.get({ chatId: 1 });
    const same = await registry.get({ chatId: 1 });
    const topic = await registry.get({ chatId: 1, messageThreadId: 2 });
    const other = await registry.get({ chatId: 2 });
    expect(same.session).toBe(a.session);
    expect(new Set([a.session, topic.session, other.session]).size).toBe(3);
    await registry.dispose();
  });

  it("deduplicates concurrent initialization and retries failed creation", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("startup")).mockResolvedValue({ id: 2 });
    const registry = new IsolatedSessionRegistry(create, async () => {});
    await expect(registry.get({ chatId: 1 })).rejects.toThrow("startup");
    await Promise.resolve();
    const [a, b] = await Promise.all([registry.get({ chatId: 1 }), registry.get({ chatId: 1 })]);
    expect(a.session).toBe(b.session);
    expect(create).toHaveBeenCalledTimes(2);
    await registry.dispose();
  });

  it("releases only the selected target and rejects access after shutdown", async () => {
    const disposed: number[] = [];
    const registry = new IsolatedSessionRegistry(async ({ chatId }) => ({ id: chatId }), async ({ id }) => { disposed.push(id); });
    await registry.get({ chatId: 1 });
    await registry.get({ chatId: 2 });
    await registry.release({ chatId: 1 });
    expect(disposed).toEqual([1]);
    expect(registry.list()).toEqual([{ chatId: 2 }]);
    await registry.dispose();
    expect(disposed).toEqual([1, 2]);
    await expect(registry.get({ chatId: 2 })).rejects.toThrow("closed");
  });
  it("disposes a pending session exactly once when released during initialization", async () => {
    let resolveCreate!: (session: { id: number }) => void;
    const create = vi.fn(() => new Promise<{ id: number }>((resolve) => { resolveCreate = resolve; }));
    const disposeSession = vi.fn(async () => {});
    const registry = new IsolatedSessionRegistry(create, disposeSession);
    const first = registry.get({ chatId: 10 });
    const second = registry.get({ chatId: 10 });
    await Promise.resolve();
    const release = registry.release({ chatId: 10 });
    resolveCreate({ id: 10 });
    await expect(first).rejects.toThrow("released");
    await expect(second).rejects.toThrow("released");
    await release;
    expect(disposeSession).toHaveBeenCalledTimes(1);
  });

  it("does not dispose the replacement session after an earlier release", async () => {
    const disposeSession = vi.fn(async () => {});
    let next = 0;
    const registry = new IsolatedSessionRegistry(async () => ({ id: ++next }), disposeSession);
    const first = await registry.get({ chatId: 1 });
    await registry.release({ chatId: 1 });
    const second = await registry.get({ chatId: 1 });
    expect(first.session).not.toBe(second.session);
    expect(disposeSession).toHaveBeenCalledTimes(1);
    await registry.dispose();
    expect(disposeSession).toHaveBeenCalledTimes(2);
  });

});
