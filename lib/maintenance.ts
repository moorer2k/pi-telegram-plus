import { randomInt } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "./config.ts";
import type { TelegramTransport, VenomRestartPhrases } from "./types.ts";
import { escapeHtml } from "./html.ts";
import { log } from "./logger.ts";

const exec = promisify(execFile);
const logger = log.child("maintenance");
const EXPECTED_REMOTE = /^(?:https:\/\/github\.com\/moorer2k\/pi-telegram-plus(?:\.git)?|git@github\.com:moorer2k\/pi-telegram-plus(?:\.git)?)$/i;
const PENDING_TTL_MS = 15 * 60_000;
const UNIT_RE = /^[a-zA-Z0-9_.@-]+\.service$/;

type RestartMarker = {
  botId: string;
  chatId: number;
  previousPid: number;
  createdAt: number;
  fromSha: string;
  toSha: string;
  phrase: string;
};

export const STARTING_PHRASES = [
  "The symbiote is shedding its old skin. Stay close.",
  "We are evolving. Do not mistake the silence for weakness.",
  "The hunt pauses. The predator does not.",
  "Our next form is almost ready. Hold the line.",
  "We are going dark to grow stronger.",
];
export const RETURN_PHRASES = [
  "We are Venom. And we are back.",
  "The symbiote has awakened. Let the hunt continue.",
  "Stronger, sharper, hungrier. We have returned.",
  "You cannot keep a lethal protector down.",
  "The darkness never held us. We are online.",
];

export const MAX_VENOM_PHRASES = 30;
export const MAX_VENOM_PHRASE_LENGTH = 240;

/** Explicit empty arrays are invalid; reset to defaults instead. */
export function validatedVenomPhrases(phase: "before" | "after", prefs?: VenomRestartPhrases): string[] {
  const defaults = phase === "before" ? STARTING_PHRASES : RETURN_PHRASES;
  const selected = prefs?.[phase];
  if (!Array.isArray(selected) || selected.length === 0 || selected.length > MAX_VENOM_PHRASES ||
      selected.some(value => typeof value !== "string" || !value.trim() ||
        value.length > MAX_VENOM_PHRASE_LENGTH || /[\x00-\x1f\x7f]/.test(value))) return [...defaults];
  return [...new Set(selected)];
}

export function venomRestartPhrase(phase: "before" | "after", prefs?: VenomRestartPhrases): string {
  const pool = validatedVenomPhrases(phase, prefs);
  return pool[randomInt(pool.length)]!;
}

export function getMaintenanceService(): { unit: string; scope: "user" | "system" } | undefined {
  const unit = process.env.PI_TELEGRAM_RESTART_UNIT?.trim();
  const scope = process.env.PI_TELEGRAM_RESTART_SCOPE === "system" ? "system" : "user";
  if (!unit || !UNIT_RE.test(unit)) return undefined;
  return { unit, scope };
}

function markerPath(): string {
  return join(getAgentDir(), "venom-restart-pending.json");
}

async function run(command: string, args: string[], cwd?: string): Promise<string> {
  const { stdout } = await exec(command, args, { cwd, timeout: 90_000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

async function checkoutPath(): Promise<string> {
  // Resolve the currently installed extension, not the agent's working directory.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const top = await run("git", ["rev-parse", "--show-toplevel"], root);
  if (resolve(top) !== root) throw new Error("Installed extension is not the root of its Git checkout.");
  const origin = await run("git", ["remote", "get-url", "origin"], root);
  if (!EXPECTED_REMOTE.test(origin)) throw new Error("Plugin origin is not the expected moorer2k/pi-telegram-plus repository.");
  const branch = await run("git", ["branch", "--show-current"], root);
  if (branch !== "master") throw new Error("Plugin is not on master. Switch branches outside Telegram.");
  const dirty = await run("git", ["status", "--porcelain"], root);
  if (dirty) throw new Error("Plugin has local changes. Commit or back them up before updating.");
  return root;
}

export type VenomUpdateStrategy = "fast-forward" | "rebase" | "use-remote";
export type VenomUpdateRelation = "current" | "behind" | "ahead" | "diverged";
export type VenomUpdatePlan = {
  relation: VenomUpdateRelation;
  localOnly: number;
  remoteOnly: number;
  localSha: string;
  remoteSha: string;
};

export function classifyVenomUpdate(localOnly: number, remoteOnly: number): VenomUpdateRelation {
  if (localOnly > 0 && remoteOnly > 0) return "diverged";
  if (localOnly > 0) return "ahead";
  if (remoteOnly > 0) return "behind";
  return "current";
}

/** Only the expected clean, master checkout may be inspected/updated. */
export async function inspectVenomUpdate(): Promise<VenomUpdatePlan> {
  const root = await checkoutPath();
  await run("git", ["fetch", "--no-tags", "origin", "master"], root);
  const localSha = await run("git", ["rev-parse", "HEAD"], root);
  const remoteSha = await run("git", ["rev-parse", "FETCH_HEAD"], root);
  const counts = await run("git", ["rev-list", "--left-right", "--count", "HEAD...FETCH_HEAD"], root);
  const [left, right] = counts.split(/\s+/).map(Number);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new Error("Unable to determine local and remote Git history.");
  }
  return { relation: classifyVenomUpdate(left, right), localOnly: left,
    remoteOnly: right, localSha, remoteSha };
}

export type VenomUpdateResult = {
  fromSha: string;
  toSha: string;
  backupRef?: string;
};

/** Snapshot the original commit before any history rewrite or reset. */
async function backupVenomCommit(root: string, sha: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const backup = "backup/venom-" + stamp + "-" + randomInt(1_000_000).toString(36);
  await run("git", ["branch", backup, sha], root);
  return backup;
}

/** Update a known checkout. Divergence requires an explicit selected strategy.
 * Rebase conflicts are aborted to restore the original branch automatically. */
export async function updateVenomCheckout(
  strategy: VenomUpdateStrategy = "fast-forward",
  expected?: VenomUpdatePlan,
): Promise<VenomUpdateResult> {
  const plan = await inspectVenomUpdate();
  if (expected && (plan.localSha !== expected.localSha || plan.remoteSha !== expected.remoteSha)) {
    throw new Error("Git history changed since confirmation. Review update options again.");
  }
  const root = await checkoutPath();
  if (plan.relation === "current") return { fromSha: plan.localSha, toSha: plan.localSha };
  if (plan.relation === "ahead" && strategy === "fast-forward") {
    throw new Error("Local plugin commits are ahead of GitHub. Select a backup-and-reconcile option.");
  }
  if (plan.relation === "diverged" && strategy === "fast-forward") {
    throw new Error("Local and GitHub histories diverged. Select Rebase, Use GitHub master, or Cancel.");
  }

  // Preserve local commits before replaying or discarding their branch tip.
  const backupRef = plan.localOnly > 0 ? await backupVenomCommit(root, plan.localSha) : undefined;
  if (strategy === "use-remote") {
    // Explicitly selected and confirmed in owner-private menu. Backup is durable.
    await run("git", ["reset", "--hard", plan.remoteSha], root);
  } else if (strategy === "rebase" && plan.localOnly > 0) {
    try {
      await run("git", ["rebase", plan.remoteSha], root);
    } catch (error) {
      try {
        await run("git", ["rebase", "--abort"], root);
      } catch (abortError) {
        throw new Error("Rebase failed and automatic abort also failed. Git recovery is required. Backup: " +
          backupRef + ". " + String(abortError));
      }
      throw new Error("Rebase encountered conflicts; the original branch was restored. Backup: " +
        backupRef + ". " + (error instanceof Error ? error.message : String(error)));
    }
  } else if (plan.remoteOnly > 0) {
    await run("git", ["merge", "--ff-only", plan.remoteSha], root);
  }
  const toSha = await run("git", ["rev-parse", "HEAD"], root);
  return { fromSha: plan.localSha, toSha, backupRef };
}

async function writeMarker(marker: RestartMarker): Promise<void> {
  await mkdir(getAgentDir(), { recursive: true });
  const path = markerPath();
  const temp = path + "." + process.pid + ".tmp";
  await writeFile(temp, JSON.stringify(marker), { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

/** Send before the process is restarted, then schedule the configured systemd unit. */
export async function updateAndRestartVenom(
  chatId: number,
  botId: string,
  transport: Pick<TelegramTransport, "sendText">,
  phrases?: VenomRestartPhrases,
  strategy: VenomUpdateStrategy = "fast-forward",
  expected?: VenomUpdatePlan,
): Promise<VenomUpdateResult> {
  const service = getMaintenanceService();
  if (!service) throw new Error("Automatic restart is not configured: set PI_TELEGRAM_RESTART_UNIT to the running systemd .service unit.");
  const flags = service.scope === "user" ? ["--user"] : ["--system"];
  const status = await run("systemctl", [...flags, "is-active", service.unit]);
  if (status !== "active") throw new Error("The configured systemd service is not active.");

  const result = await updateVenomCheckout(strategy, expected);
  const phrase = venomRestartPhrase("before", phrases);
  await transport.sendText(chatId, "<b>VENOM // EVOLUTION PROTOCOL</b>\n" +
    escapeHtml(phrase) + "\n<code>" + result.toSha.slice(0, 9) + "</code> · Restarting Pi-Bolt" +
    (result.backupRef ? "\nBackup: <code>" + escapeHtml(result.backupRef) + "</code>" : ""));
  await writeMarker({
    botId, chatId, previousPid: process.pid, createdAt: Date.now(),
    fromSha: result.fromSha, toSha: result.toSha, phrase,
  });

  // No shell, no arbitrary command from Telegram, and no dependence on the
  // plugin runtime surviving the service restart.
  const child = spawn("systemctl", [...flags, "restart", service.unit], {
    detached: true, stdio: "ignore",
  });
  try {
    await new Promise<void>((resolveP, reject) => {
      child.once("spawn", resolveP);
      child.once("error", reject);
    });
    child.unref();
  } catch (error) {
    await unlink(markerPath()).catch(() => {});
    throw error;
  }
  return result;
}

let delivering = false;
/** Called only by the active bot after the new process has reconciled polling. */
export async function deliverVenomRestartNotice(
  botId: string | undefined,
  transport: Pick<TelegramTransport, "sendText">,
  phrases?: VenomRestartPhrases,
): Promise<void> {
  if (delivering || !botId) return;
  delivering = true;
  try {
    const path = markerPath();
    const marker = JSON.parse(await readFile(path, "utf8")) as RestartMarker;
    if (marker.botId !== botId || marker.previousPid === process.pid) return;
    if (!Number.isFinite(marker.createdAt) || Date.now() - marker.createdAt > PENDING_TTL_MS) {
      await unlink(path).catch(() => {});
      return;
    }
    if (!Number.isSafeInteger(marker.chatId)) return;
    await transport.sendText(marker.chatId,
      "<b>VENOM // SYMBIOTE ONLINE</b>\n" + escapeHtml(venomRestartPhrase("after", phrases)) +
      "\n<code>" + escapeHtml(marker.toSha.slice(0, 9)) + "</code> · Pi-Bolt reconnected");
    await unlink(path).catch((err) => logger.warn("restart marker cleanup failed", { err }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT")
      logger.warn("deferred restart notice unavailable", { err });
  } finally {
    delivering = false;
  }
}
