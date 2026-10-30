/** Telegram-friendly Lethal Protector visual identity.
 * Frames are activity pulses, not estimates of task completion.
 * No HTML escaping here; the renderer owns escaping of untrusted tool text.
 */
export const VENOM_PULSE_FRAMES = [
  { eye: "◐", pulse: "▰▱▱▱▱▱" },
  { eye: "◓", pulse: "▰▰▱▱▱▱" },
  { eye: "◑", pulse: "▰▰▰▱▱▱" },
  { eye: "◒", pulse: "▰▰▰▰▱▱" },
  { eye: "◐", pulse: "▰▰▰▰▰▱" },
  { eye: "◓", pulse: "▰▰▰▰▰▰" },
  { eye: "◑", pulse: "▰▰▰▰▱▱" },
  { eye: "◒", pulse: "▰▰▱▱▱▱" },
] as const;

export type VenomActivity = "awakening" | "tracking" | "examining" | "testing" | "adapting" | "hunting";

export function venomActivity(toolName: string, args: unknown): VenomActivity {
  const name = toolName.toLowerCase();
  const obj = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const command = typeof obj.command === "string" ? obj.command : "";
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|typecheck)\b|\b(?:pytest|vitest|jest|go test|cargo test|phpunit)\b/i.test(command)) return "testing";
  if (name === "read" || name === "edit" || name === "write") return "examining";
  if (/\b(?:grep|rg|find|git log|git grep)\b/i.test(command) || name === "grep" || name === "search") return "tracking";
  if (/\b(?:retry|rebuild|restart|fix|patch)\b/i.test(command)) return "adapting";
  return "hunting";
}

export function venomStatusLabel(activity: VenomActivity): string {
  const labels: Record<VenomActivity, string> = {
    awakening: "Awakening",
    tracking: "Tracking",
    examining: "Examining the Target",
    testing: "Testing the Prey",
    adapting: "Adapting",
    hunting: "On the Hunt",
  };
  return labels[activity];
}

export function venomPulse(index: number) {
  return VENOM_PULSE_FRAMES[((index % VENOM_PULSE_FRAMES.length) + VENOM_PULSE_FRAMES.length) % VENOM_PULSE_FRAMES.length];
}

/** Elapsed hunt time is wall-clock duration, not an estimate of completion. */
export function formatHuntDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(elapsedMs) ? elapsedMs / 1000 : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0 ? `${minutes}m ${seconds}s`
    : `${seconds}s`;
}

/** Actual tool summaries remain intact, rendered as compact terminal entries. */
export function formatConsoleActivity(lines: readonly string[], escape: (value: string) => string): string {
  if (lines.length === 0) return "<code>&gt; awaiting target…</code>";
  return lines.slice(-3).map(line => "<code>&gt; " + escape(line) + "</code>").join("\n");
}
