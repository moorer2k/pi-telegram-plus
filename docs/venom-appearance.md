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

## Telegram-native Blacksite formatting

Blacksite now uses Telegram's native HTML formatting for visual hierarchy: bold header and active status, underlined terminal heading, a single preformatted monospace tool block, a native blockquote around the current assistant transmission, and compact inline-code/italic telemetry. No color or client theme override is attempted. Plain Lethal Protector and Minimal Terminal retain their existing output.

Progress updates remain edits of the existing Telegram message. All dynamic tool and assistant content is HTML-escaped before insertion, link preview behavior is unchanged, and existing theme settings require no migration.

## Hermes-inspired HUD themes and history

Select a layout under `/tg → Config → Venom appearance → Preset`:

- `symbiote-hud`: clear Lethal Protector heading, current status, objective, operation lifecycle, and telemetry.
- `predator-terminal`: terse terminal status and compact tool rows.
- `classified`: intelligence-report vocabulary and explicit operation status.
- Existing `blacksite`, `lethal-protector`, and `minimal-terminal` remain selectable.

The three new HUD themes expose extra settings in the same menu:

- **Collapse history**: `off` (show only the latest X) or `expandable` (show latest X with a native Telegram expandable quote containing older operations, capped to 20 older lines).
- **Console entries**: latest X operations, 1–12.
- **Tool details**: `compact` or `full`, truncating each display row to 75 or 140 characters.
- **Show tool states**: show/hide actual completed, running and failed operation counts.
- **Show objective**: show/hide the latest captured assistant update.
- **Footer density**: `compact` single line or `normal` multi-line.

Example (merge into your existing `.pi/telegram.json`):

```json
{
  "venomTheme": {
    "preset": "symbiote-hud",
    "visibleOperations": 4,
    "collapseOperations": "expandable",
    "operationDetail": "compact",
    "showOperationStates": true,
    "showObjective": true,
    "footerDensity": "compact"
  }
}
```

The HUD doesn't infer a task plan or verification success from tool names: counts are tracked from real tool start/end events. Telegram HTML `<blockquote expandable>` provides optional tap-to-expand history without requiring Rich Message support. A hidden history mode never injects older events.

The controller also blocks unknown slash-command callback payloads from launching a management command, preventing a stale `/tg` button from being treated as an unsolicited command. Genuine explicit `/tg` messages are logged with their originating Telegram message ID to assist further diagnosis.

## Stable HUD layout and native activity expansion

All six Venom presets now share a compact Telegram HTML status renderer rather than switching between large `<pre>` blocks, inline-terminal rows, and different content structures. Titles, status labels, six-cell pulses, activity, objective, and telemetry each occupy independent rows. The pulse resets only after completing its full cycle and no longer pushes the adjacent status text around.

New `Fixed operation rows` setting defaults **on**. A visible count of X (1–12) reserves exactly X tool slots; unused slots display a small "awaiting operation" placeholder, so incoming tool events replace existing rows rather than changing the height of the bubble. When enabled, activity summaries are clipped to 36 characters to avoid mobile wraps. Turn it off to allow naturally sized rows and longer lines.

`Collapse history → expandable` uses Telegram's built-in expandable HTML blockquote, not a custom inline button or Telegram Rich Message `<details>` element. It appears **only after the number of operations exceeds the visible X limit**. Newest X operations always remain above the collapsed older log. Choose `off` to omit old history entirely. Expandable quotes need an up-to-date Telegram client that supports that HTML entity type.

Operation totals no longer appear twice: when operation-state counts are displayed (`N done · N running · N failed`), the footer omits the redundant total operation count. The latest assistant preview is constrained to a single short paragraph to reduce layout movement. Existing Telegram Rich Messages for qualifying final-reply tables are unchanged.

Recommended menu configuration: `/tg → Config → Venom appearance`, choose `Symbiote HUD`, set `Console entries=3`, `Collapse history=expandable`, `Fixed operation rows=on`, `Show tool states=on`, `Footer density=compact`.

Note: Telegram controls message bubble width and font sizing. This redesign minimizes reflows but the Bot API cannot guarantee identical pixel dimensions after every edit.

## Venom live trace HUD (structured lifecycle mode)

Live progress (`Tool: progress`) now renders **tool events**, not an append-only list of console strings. Each tool call is tracked by `toolCallId` through `tool_execution_start` and `tool_execution_end`; visible trace slots show a Venom operation tag, running/done/failed state, completed duration when known, and a bounded one-line command or target excerpt.

The **six-cell symbiote progress pulse is retained** and occupies its own line. The pulse is an animation, **not a percent-complete meter**. Status headings, pulse, trace section, optional objective, and telemetry never share a line. Fixed rows reserve two display lines per operation (`Console entries`, default 3); inactive slots say `TRACE · IDLE` / `awaiting operation`. New tools replace reserved slots rather than appending growing blocks. All six presets retain their own section titles and activity labels.

Older trace entries appear below current slots in a native Telegram **expandable blockquote** once more than X tools have run. Collapse history defaults to expandable for new settings; explicit `off` hides older entries. Telegram client compatibility determines whether the native quote can be expanded. The full history is capped to the most recent 16 entries, and total tracked events are bounded to 120.

Tool state is shown on the individual tool rows; the footer deliberately omits the duplicate operation count. Telemetry reserves a model row and a context/time row (`Footer density: normal`), or a bounded compact row if requested. `Show tool states`, `Show objective`, `Show pulse`, `Fixed operation rows`, and existing preset options remain configurable.

This only applies to live progress. The final assistant answer continues to be sent as the actual response, rather than retaining a permanently animated placeholder. Telegram controls the chat bubble’s exact width and text layout, so completely invariant pixel dimensions across every client cannot be guaranteed.

## Why large Telegram headings require Rich Messages

The earlier Venom status card was rendered exclusively using Telegram's ordinary `parse_mode: HTML`. HTML `<b>` makes headings bold but **does not increase their size**, and `<blockquote expandable>` is a quote widget rather than the native Rich Markdown details block used by Hermes progress-tail.

The live-progress renderer now attempts an `editMessageText` call with `rich_message.markdown` for every status update. It uses actual level-two Markdown headings (`##`), a dedicated six-cell pulse line, a bounded bullet list of structured tool events, and native `<details><summary>...` history. The existing Telegram HTML card is retained as a fallback when Rich Messages are unsupported or rejected.

This uses the **same transport capability already present for the plugin's rich final replies**, not a new UI implementation. Self-hosted Bot API endpoints must support Rich Messages (the project tracks this as Bot API 10.1+). If the API server rejects `rich_message`, the transport logs the error and continues to edit the HTML fallback; this means headings will still look smaller. Inspect logs for `Rich Messages are not supported` or `Rich Message rejected` before assuming the HUD styles are active. Telegram client versions may differ in their rendering.

## Rich progress delivery lifecycle and diagnostics

For a fresh Telegram-originated turn in `Tool: progress` mode, the controller now calls `sendRichMessage` to create the **initial** progress placeholder (using `sendText` with a Rich Markdown argument). Subsequent updates call `editMessageText` with `rich_message.markdown` using the message ID returned by that original Rich send.

The transport no longer disables Rich Messages globally because an individual edit failed with `message text is empty`. Only a definitive unknown `sendRichMessage` method error disables Rich globally for the process. A repeated animation frame may elicit `message is not modified`; that is treated as a successful no-op and **does not** downgrade the status message to HTML.

To verify a live agent: the initial request should use `sendRichMessage`, followed by `editMessageText` requests with `rich_message` and no `parse_mode`. A log entry `Rich Message rejected; falling back to HTML` indicates a content- or edit-specific failure that must be investigated. The richer formatting is not active until this code is merged and the running plugin updated/restarted.

## Width-stable Lethal Protector Rich HUD

The experimental fixed-width divider was removed: it created visual clutter without controlling Telegram's native bubble width. Venom now constructs typed Rich blocks for headings, tool state, command excerpts, and collapsed history. The 12-cell symbiote pulse remains the only long horizontal visual element.

The **symbiote pulse now has 12 segments**, rather than six, and still fills monotonically before starting over. It is an activity signal, never a fictional task-progress estimate. Pulse remains on its own line, below the status, with no moving text alongside it.

Venom's Rich activity rows also distinguish live state without duplicating numeric tool totals: `◈` running, `◆` completed, `×` failed. Earlier traces keep a constant `<details>` slot throughout the turn, even before tools accumulate. The menu's explicit "collapse history: off" continues to hide that slot.

## Structured Rich document engine

The live HUD is now assembled by `lib/venom-rich-doc.ts` rather than hand-concatenating one Markdown string in the theme renderer. It emits typed blocks (heading, text, code, details), keeps the 12-cell symbiote pulse, and preserves theme-specific headings.

Command excerpts drop repeated tool prefixes and summarize long URLs/paths before rendering. The Rich transport sets `skip_entity_detection: true` for native Rich sends and edits, preventing unexpected automatic link detection in the live panel. Content is escaped, code formatted and bounded. Older trace history is capped to 16 entries and reduced before any recent tool/status content when the Rich message approaches its size budget.

This design reduces unpredictable wrapping, but cannot set or guarantee Telegram bubble pixel width. It reuses the existing Telegram API transport; no Python service or external dependency is required.
