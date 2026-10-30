# Telegram access and session controls

Open Telegram bot DM: `/tg` → **Config**.

| Setting | Choices | Default |
|---|---|---|
| Tool rendering | hidden / brief / progress / full | brief |
| Group access | disabled / owner-mentions / public-mentions | **owner-mentions** |
| Chat sessions | shared / per-chat | **shared** |
| Group join alerts | on / off | on |

## Group access

- `disabled`: ignore all group and supergroup messages.
- `owner-mentions`: only paired owner messages containing an actual Telegram @bot mention entity are processed.
- `public-mentions`: other group members can send text prompts to the current Pi session by mentioning the bot. They cannot invoke direct slash/shell controls. **This is still unsafe in untrusted groups** because prompts can influence the session and its tools.

Changing settings from the menu persists them in the active project's `.pi/telegram.json`, with no need to manually edit JSON.

## Session isolation limitation

The host provides one active Pi AgentSession to this extension. The existing per-chat turn map and topic routing do **not** isolate session history, memory, filesystem access, or agent tools.

The `per-chat` selection is currently a **fail-closed isolation gate**, not a functioning independent per-chat Pi session: while selected, group prompts are refused instead of silently being run in the shared owner session. Private owner chats continue normally. This distinction is intentional.

Actual isolated chat sessions will require a session manager/factory, per-chat session persistence, safe dispatch and lifecycle, tool permissions, and cross-session reply/event ownership. Do not advertise this selection as completed isolation.

## One-time group join notices

`groupJoinAlerts` toggles notifications from Telegram `my_chat_member` updates. The existing persistent sent-marker store prevents repeat notices for the same bot and group across restarts/rejoins. Disabling and re-enabling alerts does not clear those markers.

## Suggested safe configuration

```json
{
  "groupAccess": "owner-mentions",
  "sessionIsolation": "shared",
  "groupJoinAlerts": true,
  "tool": "progress"
}
```

For a bot intended to accept messages from untrusted groups, keep `groupAccess: "disabled"` until genuine independent sessions and restricted tool capabilities are implemented.

## Validation

```sh
npm ci
npm test
npm run typecheck
```

All changes are currently on the draft pull request, not `master`.
