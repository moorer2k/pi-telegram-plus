/**
 * Per-target session lifecycle. A factory must create a genuinely independent
 * Pi session; this registry never aliases the owner's active session.
 */
export type SessionTarget = { chatId: number; messageThreadId?: number };
export type SessionLease<T> = { target: SessionTarget; session: T };

export class IsolatedSessionRegistry<T> {
  private readonly sessions = new Map<string, Promise<T>>();
  private readonly keys = new Map<string, SessionTarget>();
  private closed = false;

  constructor(
    private readonly create: (target: SessionTarget) => Promise<T>,
    private readonly disposeSession: (session: T) => Promise<void>,
  ) {}

  static key(target: SessionTarget): string {
    return JSON.stringify([target.chatId, target.messageThreadId ?? null]);
  }

  async get(target: SessionTarget): Promise<SessionLease<T>> {
    if (this.closed) throw new Error("Session registry is closed");
    const key = IsolatedSessionRegistry.key(target);
    let pending = this.sessions.get(key);
    if (!pending) {
      const ownTarget = { ...target };
      pending = Promise.resolve().then(() => this.create(ownTarget));
      this.sessions.set(key, pending);
      this.keys.set(key, ownTarget);
      // A failed initialization must be retryable, not cached forever.
      void pending.catch(() => {
        if (this.sessions.get(key) === pending) {
          this.sessions.delete(key);
          this.keys.delete(key);
        }
      });
    }
    const session = await pending;
    if (this.closed || this.sessions.get(key) !== pending) {
      await this.disposeSession(session);
      throw new Error("Session was released during initialization");
    }
    return { target: { ...target }, session };
  }

  async release(target: SessionTarget): Promise<void> {
    const key = IsolatedSessionRegistry.key(target);
    const pending = this.sessions.get(key);
    if (!pending) return;
    this.sessions.delete(key);
    this.keys.delete(key);
    try { await this.disposeSession(await pending); }
    catch (err) {
      // Initialization failures have nothing to dispose.
      if (this.closed) throw err;
    }
  }

  list(): SessionTarget[] {
    return [...this.keys.values()].map((target) => ({ ...target }));
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const targets = this.list();
    await Promise.all(targets.map((target) => this.release(target)));
  }
}
