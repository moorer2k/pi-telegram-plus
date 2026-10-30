import { randomInt } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "./config.ts";
import type { TelegramTransport } from "./types.ts";
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

const STARTING_PHRASES = [
  "The symbiote is shedding its old skin. Stay close.",
  "We are evolving. Do not mistake the silence for weakness.",
  "The hunt pauses. The predator does not.",
  "Our next form is almost ready. Hold the line.",
  "We are going dark to grow stronger.",
];
const RETURN_PHRASES = [
  "We are Venom. And we are back.",
  "The symbiote has awakened. Let the hunt continue.",
  "Stronger, sharper, hungrier. We have returned.",
  "You cannot keep a lethal protector down.",
  "The darkness never held us. We are online.",
];

export function venomRestartPhrase(phase: "before" | "after"): string {
  const pool = phase === "before" ? STARTING_PHRASES : RETURN_PHRASES;
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

/** Update only the known installed checkout. Never interpolate shell arguments. */
export async function updateVenomCheckout(): Promise<{ fromSha: string; toSha: string }> {
  const root = await checkoutPath();
  const fromSha = await run("git", ["rev-parse", "HEAD"], root);
  await run("git", ["fetch", "--no-tags", "origin", "master"], root);
  await run("git", ["merge", "--ff-only", "FETCH_HEAD"], root);
  const toSha = await run("git", ["rev-parse", "HEAD"], root);
  return { fromSha, toSha };
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
): Promise<{ fromSha: string; toSha: string }> {
  const service = getMaintenanceService();
  if (!service) throw new Error("Automatic restart is not configured: set PI_TELEGRAM_RESTART_UNIT to the running systemd .service unit.");
  const flags = service.scope === "user" ? ["--user"] : ["--system"];
  const status = await run("systemctl", [...flags, "is-active", service.unit]);
  if (status !== "active") throw new Error("The configured systemd service is not active.");

  const result = await updateVenomCheckout();
  const phrase = venomRestartPhrase("before");
  await transport.sendText(chatId, "<b>VENOM // EVOLUTION PROTOCOL</b>\n" +
    escapeHtml(phrase) + "\n<code>" + result.toSha.slice(0, 9) + "</code> · Restarting Pi-Bolt");
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
      "<b>VENOM // SYMBIOTE ONLINE</b>\n" + escapeHtml(venomRestartPhrase("after")) +
      "\n<code>" + escapeHtml(marker.toSha.slice(0, 9)) + "</code> · Pi-Bolt reconnected");
    await unlink(path).catch((err) => logger.warn("restart marker cleanup failed", { err }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT")
      logger.warn("deferred restart notice unavailable", { err });
  } finally {
    delivering = false;
  }
}
