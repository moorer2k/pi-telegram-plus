import type { TelegramMessage } from "./types.ts";

/**
 * Only accept Telegram-authenticated mention entities, explicit bot-targeted
 * commands, or replies to an identifiable message from this bot. Ordinary
 * quoted @user text must not address the bot.
 * Entity offsets are UTF-16 offsets (native JavaScript string slicing).
 */
export function isGroupMentionAllowed(message: TelegramMessage, botUsername?: string): boolean {
  if (message.chat?.type !== "group" && message.chat?.type !== "supergroup") return false;
  if (message.from?.is_bot || typeof message.from?.id !== "number") return false;
  const botName = botUsername?.replace(/^@/, "").toLowerCase();
  if (!botName) return false;
  const text = message.text ?? message.caption ?? "";
  const entities = message.text !== undefined ? message.entities : message.caption_entities;
  if ((entities ?? []).some(entity => {
    const entityText = text.slice(entity.offset, entity.offset + entity.length).toLowerCase();
    if (entity.type === "mention") return entityText === "@" + botName;
    if (entity.type === "bot_command") {
      return /^\/[a-z0-9_]+@[a-z0-9_]+$/i.test(entityText) && entityText.endsWith("@" + botName);
    }
    if (entity.type === "text_mention") {
      return entity.user?.is_bot === true && entity.user.username?.toLowerCase() === botName;
    }
    return false;
  })) return true;

  // Telegram delivers a shallow reply_to_message with the original sender.
  // Do not trust mere references to a bot's name in the quoted text.
  const sender = message.reply_to_message?.from;
  return sender?.is_bot === true && sender.username?.toLowerCase() === botName;
}

/** Strip only the addressed bot's @username; preserve the actual user prompt. */
export function stripBotMention(text: string, botUsername?: string): string {
  const name = botUsername?.replace(/^@/, "");
  if (!name) return text.trim();
  const quoted = name.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp("@" + quoted + "(?![A-Za-z0-9_])", "gi"), "").trim();
}
