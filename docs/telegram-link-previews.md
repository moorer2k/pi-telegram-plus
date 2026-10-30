# Telegram website/file link previews

When Venom edits its live progress message, Telegram can display an expanded website or file preview for a URL in the text, then make that card disappear at the next edit. This is a Telegram link-preview card, separate from Venom's **SYMBIOTE TRANSMISSION** intermediate prose.

To prevent flashing preview cards:

- All `editMessageText` requests explicitly use `link_preview_options: { "is_disabled": true }`, regardless of user preference. Progress messages are always edited.
- Ordinary `sendMessage` and `sendRichMessage` sends default to link previews **off**.
- Use **/tg → Config → Link previews** to optionally enable preview cards on newly sent messages.
- Link text and file URLs remain in the message and remain clickable. This setting controls Telegram's expanded preview cards, not the link itself.
- The choice is saved in the project's `.pi/telegram.json` as `linkPreviews: true | false`.

The progress display still updates intermediate assistant prose in place. If the concern is disappearing *text* rather than the website card, that is a separate rendering-lifecycle issue; the prior progress-history fix preserves meaningful assistant text in the final answer.

Run `npm test && npm run typecheck` and verify against the actual Telegram client before merging.
