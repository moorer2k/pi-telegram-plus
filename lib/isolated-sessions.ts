/**
 * Lifecycle manager for genuinely independent Pi sessions.
 *
 * Factories must never return the shared owner session. Each chat/topic has a
 * distinct key and can be disposed without affecting another target.
 */
export type SessionTarget = { chatId: number; messageThreadId?: number };
export type SessionLease<T> = { target: SessionTarget; session: T };

type Entry<T> = {
  target: SessionTarget;
  pending: Promise<T>;
  retired: boolean;
  disposeOnce: Promise<void> | undefined;
};

export class IsolatedSessionRegistry<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private closed = false;
  private readonly owned = new Map<T, string>();

  constructor(
    private readonly create: (target: SessionTarget) => Promise<T>,
    private readonly disposeSession: (session: T) => Promise<void>,
    private readonly maxSessions = 32,
  ) {
    if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error("Invalid session limit");
  }

  static key(target: SessionTarget): string {
    if (!Number.isSafeInteger(target.chatId)) throw new Error("Invalid Telegram chat ID");
    if (target.messageThreadId !== undefined &&
      (!Number.isSafeInteger(target.messageThreadId) || target.messageThreadId <= 0)) {
      throw new Error("Invalid Telegram topic ID");
    }
    return JSON.stringify([target.chatId, target.messageThreadId ?? null]);
  }

  private retire(entry: Entry<T>): Promise<void> {
    if (entry.disposeOnce) return entry.disposeOnce;
    entry.retired = true;
    const key = IsolatedSessionRegistry.key(entry.target);
    if (this.entries.get(key) === entry) this.entries.delete(key);
    entry.disposeOnce = entry.pending.then(
      async (session) => {
        if (this.owned.get(session) === key) this.owned.delete(session);
        if (this.owned.has(session)) return;
        await this.disposeSession(session);
      },
      () => undefined, // A rejected factory produced no session to dispose.
    );
    return entry.disposeOnce;
  }

  async get(target: SessionTarget): Promise<SessionLease<T>> {
    if (this.closed) throw new Error("Session registry is closed");
    const key = IsolatedSessionRegistry.key(target);
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxSessions) throw new Error("Isolated session limit reached");
      const ownTarget = { ...target };
      entry = {
        target: ownTarget,
        pending: Promise.resolve().then(() => this.create(ownTarget)),
        retired: false,
        disposeOnce: undefined,
      };
      this.entries.set(key, entry);
      const created = entry;
      // A failed initialization must be retryable.
      void created.pending.catch(() => {
        if (this.entries.get(key) === created) {
          this.entries.delete(key);
          created.retired = true;
        }
      });
    }
    const session = await entry.pending;
    if (session === null || (typeof session !== "object" && typeof session !== "function")) {
      await this.retire(entry);
      throw new Error("Isolated session factory must return a unique session object");
    }
    const existingOwner = this.owned.get(session);
    if (existingOwner && existingOwner !== key) {
      // Do not dispose an aliased session: another target still owns it.
      entry.retired = true;
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw new Error("Isolated session factory returned a session already owned by another target");
    }
    if (this.closed || entry.retired || this.entries.get(key) !== entry) {
      // The releasing caller owns disposal. Never dispose a shared
      // initialization result twice when multiple get() calls are waiting.
      throw new Error("Session was released during initialization");
    }
    this.owned.set(session, key);
    return { target: { ...entry.target }, session };
  }

  async release(target: SessionTarget): Promise<void> {
    const entry = this.entries.get(IsolatedSessionRegistry.key(target));
    if (entry) await this.retire(entry);
  }

  has(target: SessionTarget): boolean {
    return this.entries.has(IsolatedSessionRegistry.key(target));
  }

  size(): number {
    return this.entries.size;
  }

  list(): SessionTarget[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.target }));
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.entries.values()].map((entry) => this.retire(entry)));
  }
}
