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

## Tactical terminal presets

Use **/tg → Config → Venom appearance → Preset** to select:
- **Blacksite** — keeps the `VENOM // LETHAL PROTECTOR` title; uses `[ SYMBIOTE TERMINAL ]`, `[ NEURAL LINK ]`, tactical state labels (for example `TARGET ACQUIRED`, `DEEP RECON`, `VALIDATING TARGET`) and real tool tags `[RECON]`, `[READ]`, `[PATCH]`, `[VERIFY]`, `[EXEC]`, `[TRACE]` or `[ERROR]`. A two-line telemetry footer shows real context/model data and hunt time without an unfinished trailing rule.
- **Lethal Protector** — preserves the original headings, status language, console rows, and one-line footer.
- **Minimal Terminal** — compact operational labels, restrained headings, tactical tool tags, and the original compact footer.

The preset selector updates preset-controlled headings and activity labels, while preserving the bot title, animation, console prompt, preview length and telemetry visibility settings. Subsequent individual label edits remain possible. Presets do not change bot permissions, tools, model, or notification settings.

To choose Blacksite by editing `.pi/telegram.json` directly, set `venomTheme.preset` to `"blacksite"` and remove existing `venomTheme.sectionTitle`, `venomTheme.transmissionTitle` and `venomTheme.labels` if those older overrides would hide Blacksite terminology. The in-app preset selector performs those replacements automatically.

Tool labels describe observed operations, never fictional stages. The animated pulse indicates activity only, not task completion. No actual Telegram bubble color can be changed by a bot. A completion label marked verified is not shown unless execution evidence supports that claim.
