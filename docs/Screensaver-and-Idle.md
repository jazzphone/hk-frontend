# Screensaver and Idle

The last two steps of setting up a [wall tablet](Wall-Tablets.md), and what
keeps a tablet awake.

## 5. Add the photo screensaver

The screensaver shows your photos with the time, the weather, what is playing
and any running timers over them. It runs only for the tablet’s user.

1. Install **WallPanel** from HACS (Frontend). If Setup Check says it is not
   loaded, add `/hacsfiles/lovelace-wallpanel/wallpanel.js` (JavaScript
   module) under **Settings → Dashboards → Resources**.
2. Put some photos in a folder of Home Assistant’s media, and tell HK
   Frontend where: **HK Settings → Wall Tablets → Screensaver → Photos**. The
   default, `media-source://media_source/local/photos`, is a `photos` folder in
   your local media.
3. Open the screen in HK Settings. Under **Behavior**, turn on **Photo
   Screensaver** and choose the **Tablet User**.
4. Optional: **Screensaver Options**:

   | Option | Default |
   |---|---|
   | Starts After | 3 minutes |
   | Each Photo For | 30 seconds |
   | Order | Random (or In Order) |
   | Slow Zoom | On |
   | Fill the Screen | On (off shows the whole photo, with room around it) |

   Any other WallPanel option can be added there in YAML.

The photo screensaver is for generated screens. On a dashboard you write in
YAML, configure WallPanel in that dashboard’s YAML as its own documentation
describes.

**Pausing the sky behind the screensaver.** Give the screen a **Tablet Room**
(under Behavior, for example `kitchen`) and create a Toggle helper named
`input_boolean.wallpanel_screensaver_kitchen`. WallPanel then turns it on
while the screensaver shows, the live sky pauses behind it, and your own
automations can read it too.

## 6. Return to Home when idle

With **Return to Home When Idle** on (the screen’s **Behavior**), a page that
nobody has touched goes back to the screen’s first view: open Lights, walk
away, and the tablet is back on Home 50 seconds later. Scrolling or tapping
starts the count again.

It waits while:

- a detail sheet is open;
- a Live TV channel is playing;
- the tablet’s optional `binary_sensor.<room>_tablet_in_use` is on (below).

Turn it on for wall tablets only. On a desk, a phone or a car, a page someone
is reading should stay put.

**Finer control, per tablet (optional).** Set the screen’s **Tablet Room**
(lower-case letters, digits and underscores, like `living_room`), then create
any of these helpers for that room:

| Helper | What it does |
|---|---|
| `input_select.<room>_tablet_idle_return` | How long to wait. Its options must be exactly: `Quick 30s`, `Normal 50s`, `Relaxed 2 min (may return behind screensaver)`, `Never`, `Auto (10s before Room Idle)`. |
| `input_number.<room>_tablet_room_idle` | Seconds, for `Auto`: the page returns 10 seconds before this (never sooner than 10 seconds). |
| `binary_sensor.<room>_tablet_in_use` | While it is on, someone is using the tablet: the page stays, and is asked about again every 15 seconds. You build this one, from whatever tells you the tablet is being read. |

Without a room, or without the helpers, the wait is 50 seconds. **HK Settings
→ Wall Tablets → Default Idle Time** picks an `input_number` (or `number`)
for `Auto` to use when a room has no `_tablet_room_idle` of its own; with
none, `Auto` counts from 60 seconds.

## What keeps a tablet awake

HK Frontend never turns a screen off, so nothing in it has to be kept from
doing so. What it does is give the automations that sleep and wake your
tablets something to read:

| Entity | Use it to |
|---|---|
| `sensor.tv_viewers` (Live TV) | Keep a tablet on while it is showing a channel. The state is how many screens are watching; `users` names their signed-in users. |
| `input_boolean.wallpanel_screensaver_<room>` | Know when the photo screensaver is showing (you create it; see step 5). |
| `binary_sensor.<room>_tablet_in_use` | The same “someone is using it” signal the page reads (you create it; see step 6). |

For example, in the automation that turns the kitchen tablet’s screen off, a
condition that holds off while that tablet plays TV:

```yaml
conditions:
  - "{{ 'Kitchen Tablet' not in (state_attr('sensor.tv_viewers', 'users') or []) }}"
```

## When you change something

Everything HK Frontend serves is sent with `no-cache`, so a tablet picks up a
new version on its next load. The first load after an update can still come
from the browser’s own copy, so **reload twice** before deciding something
did not change. **Load start URL** on the tablet’s Fully Kiosk device reloads
it from Home Assistant. Settings you change in HK Settings reach open screens
by themselves, with no reload.

More help: [Troubleshooting](Troubleshooting.md).

## Wall Tablets settings

**All Screens → Wall Tablets.** Settings for every wall tablet. Each tablet’s
own switches (Return to Home, Tablet Room, Photo Screensaver) are on its
[screen](Screens.md#behavior). More about wall tablets: [Wall tablets](Wall-Tablets.md).

| Setting | Default | What it does |
|---|---|---|
| Default Idle Time | 60 Seconds | An input number or number entity: the room idle time for a tablet whose room has no `input_number.<room>_tablet_room_idle` of its own. Used only when the tablet’s return is set to `Auto` (below). |
| Photos | `media-source://media_source/local/photos` | The media folder a generated wall tablet’s photo screensaver shows. |
| Wall Tablets | — | Every screen with Return to Home or Photo Screensaver on, with its room. |

**How long Return to Home waits.** Without a Tablet Room, or without the
helpers below, a page goes back to Home after 50 seconds untouched. With a
Tablet Room, these optional helpers of yours are read when they exist:

| Helper | What it does |
|---|---|
| `input_select.<room>_tablet_idle_return` | Options `Quick 30s`, `Normal 50s`, `Relaxed 2 min (may return behind screensaver)`, `Never`, and `Auto (10s before Room Idle)`. |
| `input_number.<room>_tablet_room_idle` | Seconds, for `Auto`: the page returns 10 seconds before this (at least 10 seconds). Without it, Default Idle Time is used. |
| `binary_sensor.<room>_tablet_in_use` | While it is on, someone is reading the page: don’t return yet. |
