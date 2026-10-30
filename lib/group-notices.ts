import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "./config.ts";
import { escapeHtml } from "./html.ts";

type Membership = {
  chat: { id: number; type: string; title?: string; username?: string };
  new_chat_member: { status: string; user?: { id?: number; username?: string } };
  old_chat_member?: { status: string };
};

/**
 * A bot-owned, durable sent-marker prevents repeats after restarts/rejoins.
 * Exclusive file creation avoids duplicate sends from competing runtimes.
 * Failed sends release the marker, allowing retry on the next join update.
 */
export async function notifyNewGroupOnce(
  update: Membership,
  deps: { ownerId?: number; botId?: string; sendNotice: (ownerId: number, html: string) => Promise<void> },
): Promise<boolean> {
  if (typeof deps.ownerId !== "number" || !deps.botId) return false;
  const chat = update.chat;
  if (!Number.isSafeInteger(chat.id) || !["group", "supergroup"].includes(chat.type)) return false;
  const next = update.new_chat_member.status;
  const previous = update.old_chat_member?.status;
  if (!["member", "administrator", "creator"].includes(next)) return false;
  if (previous && ["member", "administrator", "creator"].includes(previous)) return false;

  const dir = join(getAgentDir(), "telegram-group-notices");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const safeBot = deps.botId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const marker = join(dir, safeBot + "-" + String(chat.id) + ".sent");
  let handle;
  try {
    handle = await open(marker, "wx", 0o600);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
  await handle.close();
  try {
    const title = escapeHtml(chat.title?.trim() || "Unnamed group");
    const username = chat.username ? "\n@" + escapeHtml(chat.username) : "";
    await deps.sendNotice(
      deps.ownerId,
      "<b>Venom joined a Telegram group</b>\n" +
      "<b>" + title + "</b>" + username + "\n" +
      "Group ID: <code>" + chat.id + "</code>\n" +
      "This is a one-time notification for this group.",
    );
    return true;
  } catch (error) {
    await rm(marker, { force: true });
    throw error;
  }
}
