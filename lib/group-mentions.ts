import type { TelegramMessage } from "./types.ts";

/**
 * Allow public participation only for messages explicitly addressing this bot.
 * Telegram entity offsets are UTF-16, matching JavaScript string.slice().
 * Never interpret a bare textual @mention without an entity as authorization.
 */
export function isGroupMentionAllowed(message: TelegramMessage, botUsername?: string): boolean {
  if (message.chat?.type !== "group" && message.chat?.type !== "supergroup") return false;
  if (message.from?.is_bot || typeof message.from?.id !== "number") return false;
  const name = botUsername?.replace(/^@/, "").toLowerCase();
  if (!name) return false;
  const text = message.text ?? message.caption ?? "";
  const entities = message.text !== undefined ? message.entities : message.caption_entities;
  return (entities ?? []).some(entity =>
    entity.type === "mention" &&
    text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === "@" + name
  );
}

/** Strip the addressed bot's own @mention, not arbitrary other usernames. */
export function stripBotMention(text: string, botUsername?: string): string {
  const name = botUsername?.replace(/^@/, "");
  if (!name) return text.trim();
  return text.replace(new RegExp("@" + name.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9_])", "gi"), "").trim();
}
