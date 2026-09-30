# Live Sky

Behind HK Frontend’s screens is a sky that follows the real one: the sun’s
height and direction, the moon at its actual phase, the clouds you have, and
rain or snow when it is falling. On some days it also dresses up for a season,
a holiday or a birthday: [Seasonal Decorations](Seasonal-Decorations.md).

![The live sky on a clear day, behind the Home page](images/sky-clear-day.png)

## What it shows

| | What the sky does |
|---|---|
| **Time of day** | The colors follow the sun’s elevation, from a deep noon blue through sunset to night. The sun’s glow sits where the sun is. |
| **Night** | Stars, and the moon drawn at its real phase. |
| **Clouds** | As many as the weather says (its cloud coverage, or a guess from the condition when there is none). At sunset they are lit warm from below. |
| **Rain and snow** | Falling while the weather is rainy, pouring, hailing or snowy; lightning in a thunderstorm; a haze in fog. |

The sky is kept dark enough that glass tiles and white text on top of it stay
readable, even at noon.

![The live sky at night](images/sky-night.png)

![Rain on the live sky](images/sky-rain.png)

![Snow on the live sky](images/sky-snow.png)

It reads:

- `sun.sun`, for where the sun is;
- the weather entity chosen under **HK Settings → All Screens → Weather**
  (without one, the first weather entity it finds);
- the moon’s phase, worked out from the date (or a sensor you choose; see
  [Advanced](Seasonal-Decorations.md#advanced)).

### Where it appears

On a generated screen, the live sky is behind **Home**, **Weather** and the
room pages. The category pages (Lights, Climate, Doors & Windows, Security,
Timers, Vacuums, Water, Cameras, Live TV, Play Music and Browse Music) each
have a still wash of their own color instead, matching the chip that opens
them. A custom page shows the live sky when its YAML says `sky: true`.
Decorations appear only on the live sky.

When the tablet is behind a screensaver, or its browser tab is hidden, the sky
stops moving.

## Turn it on or off

**Every generated screen at once:** pick an input boolean or switch as the
**Sky Switch** under **HK Settings → All Screens → Sky → Live Sky**. While it
is off, no generated screen shows the live sky. With none chosen, the sky is
always on.

**One screen:** HK Settings → the screen → **Appearance → Live Sky**.

**A dashboard you write in YAML:** the dashboard opts in with a `sky:` block,
and each view that wants the sky says `sky: true`:

```yaml
sky:
  enable: input_boolean.live_sky                          # optional: off hides the sky
  sleep: input_boolean.kitchen_photos                     # optional: on pauses it
views:
  - title: Home
    path: home
    type: custom:hk-grid-view
    sky: true
    cards: []
```

`sky: {}` on its own is enough to opt in. A view can instead take one of the
still washes with `sky_variant:` (`lights`, `climate`, `doors`, `timers`,
`vacuums`, `water`, `cameras`, `playmusic`, `energy` or `ecoflow`).

## On phones and narrow screens

The decorations are drawn for a landscape screen. On a screen taller than it
is wide, each one is drawn as its left and right edges, blended through the
middle, so the branches and garlands still reach in from both sides.

## If the sky stands still

A browser that asks pages for **reduced motion** gets a still sky. On an
Android tablet, Android’s **Remove animations**, some power-saving modes and
the developer animation settings all turn that on, and the browser can keep
reporting it until the tablet restarts. If the sky is frozen on one tablet and
moving everywhere else, check those settings and restart the tablet. More in
[Troubleshooting](Troubleshooting.md).
