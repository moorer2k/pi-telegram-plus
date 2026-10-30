# Venom live progress (experimental)

This feature draws on the grouped tool breadcrumbs and live preview approaches documented by [Qusic/pi-telegram](https://github.com/Qusic/pi-telegram) and the throttled working-message design of [pi-telegram-connect](https://github.com/artyom-ivanov/pi-telegram-connect).

## Enable

Set `"tool": "progress"` in the active project's `.pi/telegram.json` binding. This is separate from model thinking visibility (`"thinking": "hidden"`, `"brief"`, or `"full"`).

For a project with a registered bot, the existing binding may be extended:

```json
{
  "botId": "pi3090",
  "tool": "progress",
  "thinking": "hidden"
}
```

Do not replace an existing binding without preserving its other fields.

## Behavior

- Reuses the Telegram turn's placeholder message.
- Shows actual tool names and short, redacted argument summaries.
- Keeps the last four operations visible; deduplicates consecutive identical entries.
- Intermediate assistant prose appears as a live preview in the same placeholder.
- The latest assistant prose replaces the placeholder on `agent_end`; otherwise a completion marker is displayed.
- Edits are event-driven and throttled to no more than once every two seconds for routine tool changes. Errors and previews can force an edit.
- Progress is restricted to the active Telegram turn's chat, topic, and placeholder message ID. This does **not** provide per-chat Pi session isolation.

## Known limitations

- This is an experimental first integration, **not** native `sendRichMessageDraft` streaming or an animated timer.
- The upstream `/tg` configuration menu has not yet been extended to expose `progress`; configure it in the project binding.
- No inline Details/Hide/Stop buttons have been added in this branch.
- Intermediate responses are buffered as the latest preview, not streamed token-by-token.
- Rich HTML does not guarantee custom button colors or Telegram client appearance.
- Use private-chat testing before group deployments. The underlying Pi session can still be shared across chats.

## Validation

Run `npm ci && npm test && npm run typecheck` on a host with network access and Node >=22.19.0 before enabling this branch in production.
