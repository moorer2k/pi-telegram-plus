import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGroupMentionAllowed, stripBotMention } from "../group-mentions.ts";
import { notifyNewGroupOnce } from "../group-notices.ts";

describe("public group mentions", () => {
  const msg = (text: string, username = "pi3090_bot") => ({
    message_id: 1, text, chat: { id: -1001, type: "supergroup" },
    from: { id: 27, is_bot: false },
    entities: [{ type: "mention", offset: 0, length: username.length + 1 }],
  });
  it("allows a proper mention by an unpaired user", () => {
    expect(isGroupMentionAllowed(msg("@pi3090_bot hello"), "pi3090_bot")).toBe(true);
  });
  it("rejects other bots, no entities and private chats", () => {
    expect(isGroupMentionAllowed(msg("@other_bot hello", "other_bot"), "pi3090_bot")).toBe(false);
    expect(isGroupMentionAllowed({ ...msg("@pi3090_bot hi"), entities: [] }, "pi3090_bot")).toBe(false);
    expect(isGroupMentionAllowed({ ...msg("@pi3090_bot hi"), chat: { id: 1, type: "private" } }, "pi3090_bot")).toBe(false);
  });
  it("recognizes explicit commands addressed to this bot, not another bot", () => {
    const command = {
      ...msg("/help@pi3090_bot", "pi3090_bot"),
      entities: [{ type: "bot_command", offset: 0, length: "/help@pi3090_bot".length }],
    };
    expect(isGroupMentionAllowed(command, "pi3090_bot")).toBe(true);
    expect(isGroupMentionAllowed(command, "other_bot")).toBe(false);
    expect(stripBotMention("/help@pi3090_bot", "pi3090_bot")).toBe("/help");
  });
  it("accepts bot replies but rejects forged/non-bot replies", () => {
    const replied = {
      ...msg("What about this?", "pi3090_bot"),
      entities: [],
      reply_to_message: { message_id: 22, from: { id: 999, username: "pi3090_bot", is_bot: true } },
    };
    expect(isGroupMentionAllowed(replied, "pi3090_bot")).toBe(true);
    expect(isGroupMentionAllowed({ ...replied, reply_to_message: { ...replied.reply_to_message, from: { id: 999, username: "pi3090_bot", is_bot: false } } }, "pi3090_bot")).toBe(false);
    expect(isGroupMentionAllowed(replied, "other_bot")).toBe(false);
  });
  it("supports text_mention only when Telegram identifies this bot", () => {
    const m = {
      ...msg("Venom explain", "pi3090_bot"),
      entities: [{ type: "text_mention", offset: 0, length: 5, user: { id: 999, username: "pi3090_bot", is_bot: true } }],
    };
    expect(isGroupMentionAllowed(m, "pi3090_bot")).toBe(true);
    expect(isGroupMentionAllowed({ ...m, entities: [{ ...m.entities[0], user: { ...m.entities[0].user, username: "somebody_else" } }] }, "pi3090_bot")).toBe(false);
  });
  it("recognizes caption mentions while excluding bot messages", () => {
    const m = { ...msg("", "pi3090_bot"), text: undefined, caption: "@pi3090_bot see this", caption_entities: [{ type: "mention", offset: 0, length: 12 }] };
    expect(isGroupMentionAllowed(m, "pi3090_bot")).toBe(true);
    expect(isGroupMentionAllowed({ ...m, from: { id: 44, is_bot: true } }, "pi3090_bot")).toBe(false);
  });
  it("removes only bot mention, preserves remaining request", () => {
    expect(stripBotMention("@pi3090_bot check this", "pi3090_bot")).toBe("check this");
  });
});

describe("one-time Telegram group notifications", () => {
  it("sends only once per bot and group across calls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-group-test-"));
    const prior = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      const sendNotice = vi.fn(async () => {});
      const update = {
        chat: { id: -12345, type: "supergroup", title: "Test Group" },
        new_chat_member: { status: "member" },
        old_chat_member: { status: "left" },
      };
      const deps = { ownerId: 42, botId: "bot1", sendNotice };
      expect(await notifyNewGroupOnce(update, deps)).toBe(true);
      expect(await notifyNewGroupOnce(update, deps)).toBe(false);
      expect(sendNotice).toHaveBeenCalledTimes(1);
    } finally {
      if (prior === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prior;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
