# Venom appearance configuration

Use **/tg → Config → Venom appearance** in Telegram. Settings are stored in the active Pi project binding at `.pi/telegram.json`, not in `~/.pi/agent/tg.json`. No bot token is copied.

The menu can edit:

- Bot title (defaults to `VENOM // LETHAL PROTECTOR`)
- Console section heading, transmission heading, elapsed-time label
- Console prompt (defaults to `>`), divider, and awaiting-target placeholder
- Each of six activity labels: awakening, tracking, examining, testing, adapting, hunting
- Animation preset: `symbiote` (spinner + pulse), `spinner`, `static`
- Pulse visibility; animation edit interval (1800–15000 ms)
- Number of visible operations (1–8)
- Intermediate reply preview length (100–1500 characters)
- Operation count / elapsed-time visibility
- Reset all appearance options

Text inputs are trimmed, capped in length, and escaped in Telegram HTML. Blank text resets that individual label to its default. The reset option clears all overrides. No custom HTML or uncontrolled Telegram API formatting is accepted.

Example project file (keep all existing fields, such as botId):

```json
{
  "tool": "progress",
  "venomTheme": {
    "title": "VENOM // LETHAL PROTECTOR",
    "sectionTitle": "THE HUNT // TERMINAL",
    "transmissionTitle": "SYMBIOTE TRANSMISSION",
    "footerLabel": "hunting",
    "consolePrefix": ">",
      "animation": "symbiote",
    "animationIntervalMs": 2600,
    "visibleOperations": 3,
    "previewLength": 500,
    "showElapsed": true,
    "showOperations": true,
    "showPulse": true,
    "labels": {
      "tracking": "Following the Scent",
      "testing": "Testing Our Prey"
    }
  }
}
```

Settings persist across restarts. Changes to rendering text apply to subsequent edits; changes to the interval start on the next agent turn because the timer is created at `agent_start`.

The animation uses edits to the same Telegram message, not a native GIF or sticker. Rate limits depend on the Telegram Bot API and client. **No additional model calls are made.**

Check with `npm ci && npm test && npm run typecheck` before merging; the full suite and live Telegram client have not been exercised in this environment.

The live progress footer now includes operation count, measured context usage (percentage/window), the active model ID, and elapsed hunting time. Missing context metrics are omitted. The previous trailing divider is not rendered; legacy `venomTheme.divider` settings are accepted but ignored.
