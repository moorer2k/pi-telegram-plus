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
