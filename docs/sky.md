# The live sky

Behind HK Frontend’s screens is a sky that follows the real one: the sun’s
height and direction, the moon at its actual phase, the clouds you have, and
rain or snow when it is falling. On some days it also dresses up for a season,
a holiday or a birthday.

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
  [Advanced](#advanced)).

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
  sleep: input_boolean.wallpanel_screensaver_kitchen      # optional: on pauses it
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

## Seasonal decorations

On some days the sky dresses up: falling leaves in the fall, a haunted night
near Halloween, a cozy window at Christmas, and a handful of surprises through
the year. Decorations are photographs laid over the live sky, and they never
change your lights or anything else in the house.

![A spooky Halloween night: a big moon, bare branches, fog and bats](images/sky-halloween.png)

**Turning them all off:** the **Seasonal decorations** switch,
`switch.hk_frontend_seasonal_decorations`, on the HK Frontend device. The same
switch is **HK Settings → All Screens → Sky → Seasonal Decorations**, and an
automation can flip it like any switch.

**Turning one off:** HK Settings → Sky → the decoration → **Show**.

![The Sky settings](images/settings-sky.png)

### The seasons

Each season has a window of dates. Inside it, the sky decorates **Sometimes**
by default: a roll of the dice each day, with the odds rising as the last day
nears, and always on the final days. You can change that to **Every Day** or
**Only the Last Days** (just the always-on days in the table below). With
dates of your own, the odds rise across your window instead.

| Season | Default dates | What it shows | Always on (with the default dates) |
|---|---|---|---|
| Fall & Halloween | Sep 22 – Oct 31 | An autumn canopy and tumbling leaves by day. On spooky nights: a big moon, fog, bare branches, bats, a cobweb and a witch crossing the moon. | Oct 28 – 31, spooky nights included |
| Thanksgiving | Nov 1 – Thanksgiving Day | The autumn canopy with heavier falling leaves. | The day before Thanksgiving, and the day |
| Christmas | Dec 7 – Dec 25 | Pine, ornaments and stockings along the top and sides, twinkling lights, drifting snow and a rare sleigh. | Dec 22 – 25 |

**Spooky nights** roll separately from the leaves, and more rarely: leaves are
the ambience, and a witch crossing the moon should be something you catch.
Under Fall & Halloween, **Spooky Nights** is **Sometimes**, **Every Night** or
**Never** (leaves only). A night is once the sun is more than 4° below the
horizon.

Thanksgiving Day is the fourth Thursday of November. Christmas starts on
December 7 rather than right after Thanksgiving, so the decoration stays a
treat rather than a month of wallpaper.

### The surprises

| Surprise | When | What it shows |
|---|---|---|
| Birthdays | On each birthday you add | Balloons and confetti. |
| Fourth of July | Every day, Jun 28 – Jul 4 | Bunting and sparkles, with a firework at night. |
| Valentine’s Day | Every day, Feb 8 – Feb 14 | Hearts and falling heart petals. |
| Spring Garden | Some days, Mar 20 – Jun 20 | Blossom and petals, with a butterfly by day. |
| Winter Wonderland | Some days, Dec 21 – Mar 19 | Frost and ice crystals. |
| Storybook Magic | One day a month | A storybook frame, sparkles and a fairy. |
| Space Night | One other day a month | Sparkles and a rocket. |

- **Spring Garden** and **Winter Wonderland** show on about one day in seven
  and one in eight. **Often** doubles that; **Rarely** halves it.
- **Storybook Magic** and **Space Night** each have their own fixed days in
  every month: **Once**, **Twice** or **Four Times a Month**. They never
  share a day.
- **Birthdays**: HK Settings → Sky → Birthdays → **Add a Birthday**, with a
  name, month and day.

**Which one wins.** Only one decoration shows on a day, in this order: a
birthday, the Fourth of July week, Valentine’s week, the season (on a day it
is decorating), Spring Garden or Winter Wonderland, Storybook Magic, then
Space Night. A birthday on December 16 replaces the Christmas decoration for
that day only.

**Every screen agrees.** The roll is made once per day on your local calendar,
so all your screens show the same thing, and nothing changes in front of you
during the day.

### Dates and how often

Each decoration’s page in **HK Settings → Sky** has:

- **Starts** and **Ends**: its window (a window may run past New Year).
  Thanksgiving’s can end on **Thanksgiving Day**. **Use Default Dates** goes
  back to the built-in ones.
- **How Often**, as above.

Every setting and its default: [Settings → Sky](settings.md#sky).

### Advanced

**HK Settings → Sky → Advanced:**

| Setting | What it does |
|---|---|
| Hemisphere | **Southern** moves Spring Garden to Sep 22 – Dec 20 and Winter Wonderland to Jun 21 – Sep 21. The holidays keep their dates. |
| Holiday Season | Optional: a sensor whose state is `Halloween`, `Thanksgiving` or `Christmas`, if your house already keeps its own holiday calendar. It then decides which season it is; the dates still limit when the sky decorates. |
| Moon Phase | Optional: a sensor giving the moon’s phase from 0 to 1 (0 new, 0.5 full). Without one, the phase is worked out from the date. |
| Also Needs | Optional: an input boolean or switch that must also be on for decorations to show. |

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
[Troubleshooting](troubleshooting.md).
