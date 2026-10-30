# Public group mentions and owner DM alerts

## Public group mentions

Anyone in a Telegram group or supergroup can address `@pi3090_bot` (or the bot's configured username) without being individually added to the bot's owner allowlist.

- Telegram's actual `mention` entity must match the configured bot username; ordinary group chatter is ignored.
- Even the owner must explicitly mention the bot in a group.
- Users other than the paired owner may submit only text prompts. Shell commands, slash commands, media attachments, and UI dialog interactions are not routed through this path.
- Private chats and inline callback commands still require the paired owner.
- Message routing maintains chat and forum topic IDs.

**Security warning:** These mentions still use the underlying Pi agent session and its available tools. A public group member can influence that session, and the agent may access private state or execute tools. The injected warning is only a prompt instruction, not an enforceable sandbox. **Do not deploy this feature in untrusted groups until per-chat session isolation and tool permissions are implemented.** The current implementation is experimental.

## One-time new-group alerts

The Telegram polling subscription now includes `my_chat_member` updates. When Telegram reports that the bot joined a group, the extension sends the paired owner a DM with the group's name and numeric ID.

- Successful notifications are recorded under `~/.pi/agent/telegram-group-notices/`, keyed by bot ID and group ID.
- Rejoining a previously reported group does not send another DM.
- Atomic exclusive marker creation prevents concurrent duplicate sends.
- A failed DM send removes the marker so a future join update can retry.
- Group permission changes (member to administrator) do not cause a new alert.
- Telegram does not retroactively send membership updates for groups the bot joined before this change.

The bot owner must have opened the bot's private chat previously; Telegram bots cannot initiate conversations with users who have never started the bot.

## Verification

```sh
npm ci
npm test
npm run typecheck
```

Test with a private group and a second Telegram user before production deployment. Use the feature branch, not `master`.
