# Claude Usage Gauge Card

A custom Lovelace card for Home Assistant that shows Claude usage as a themed
semicircle needle gauge, with the session percentage inside the arc and a
weekly usage bar below it that includes straight-line pacing.

The card reads its colors from your active Home Assistant theme, so it fits
light and dark dashboards without any color configuration.

![Claude Usage Gauge Card](https://raw.githubusercontent.com/j6s33m/claude-usage-gauge-card/main/images/card-preview.png)

## Features

- Needle gauge with gradient arc, tick marks, and a status band
  (Nominal / Elevated / High Load / Critical)
- Session percentage and label rendered inside the arc
- Session reset line with a friendly idle message when no session is active
- Weekly usage bar bound to a separate sensor, with a pacing marker showing
  where you *should* be if usage were spread evenly across the week, plus a
  plain-language message (Well under pace … Well over pace)
- Fully themeable, with a visual editor for every option

## Installation (HACS)

1. In Home Assistant, go to **HACS**.
2. Open the three-dot menu in the top right and choose **Custom repositories**.
3. Paste this repository's URL, set the category to **Dashboard**, and add it.
4. Find **Claude Usage Gauge Card** in the list and click **Download**.
5. Reload your browser (a hard refresh clears the old cache).

HACS registers the dashboard resource automatically. You do **not** need to add
it manually under Settings → Dashboards → Resources.

## Data source

This card expects Home Assistant entities that report Claude session and weekly
usage as percentages.

The companion [Claude Usage for Home Assistant](https://github.com/j6s33m/claude-usage)
package creates the sensors used in the examples below, including:

- `sensor.claude_session_usage`
- `sensor.claude_weekly_usage`
- `sensor.claude_weekly_resets`

You can also use your own sensors as long as the session and weekly entities
report values from `0` to `100`.

## Adding the card

After installing the sensors, add a manual card:

```yaml
type: custom:claude-usage-gauge-card
entity: sensor.claude_session_usage
label: Claude Usage
reset_attribute: session_resets_in
weekly_entity: sensor.claude_weekly_usage
weekly_reset_entity: sensor.claude_weekly_resets
weekly_period_days: 7
```

Or use the visual editor, which exposes every option. See the
[README](https://github.com/j6s33m/claude-usage-gauge-card) for the full
configuration reference.

## Updating

Updates are managed through HACS. When a new release is published here, HACS
shows an update prompt on the card and pulls it in one click.

## License

MIT
