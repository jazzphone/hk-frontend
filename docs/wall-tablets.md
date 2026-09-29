# Wall tablets

HK Frontend was built for tablets mounted on a wall and left on all day. This
page sets one up from start to finish: its own user, its screen, the kiosk
browser, a photo screensaver, and returning to Home when nobody is using it.
It works the same for one tablet or ten, of any brand.

![A wall tablet showing the Home page, with the menu open beside it](images/tablet-home.png)

## What HK Frontend does, and what it leaves to you

**HK Frontend does:** the screen itself, a menu that stays open beside the
page, returning an untouched page to Home, a photo screensaver (through
WallPanel), a now-playing bar, and `sensor.tv_viewers` for knowing when a
tablet is showing Live TV.

**It leaves to you:** turning the screen off and on, and its brightness. Those
belong to the kiosk browser and your own automations (for example with the
Fully Kiosk Browser integration and a motion sensor). HK Frontend gives those
automations what they need to read; see
[What keeps a tablet awake](#what-keeps-a-tablet-awake).

## What you need

- An Android tablet. Any size works; a 10–11 inch tablet that reports about
  1280 × 800 in its browser shows the full layout. Choose one with **6 GB of
  memory or more**: memory, not the processor, is what makes the difference.
- **Fully Kiosk Browser** on it. Its PLUS license adds remote administration,
  which the **Fully Kiosk Browser** integration in Home Assistant uses to
  reload the page and see the screen.
- Optional, from HACS (Frontend):
  - **Kiosk Mode**, to hide Home Assistant’s header and sidebar;
  - **WallPanel**, for the photo screensaver.

**HK Settings → Setup Check** says whether Kiosk Mode and WallPanel are
installed and loaded.

## 1. Give the tablet its own user

In **Settings → People → Users**, add a user for the tablet, for example
“Kitchen Tablet.” Do not make it an administrator.

A user per tablet is what lets each tablet be itself:

- its photo screensaver runs for that user only, so a computer opening the
  same dashboard never gets it;
- Music knows which room the tablet hangs in (its **Home Room**);
- `sensor.tv_viewers` and `hk_frontend.show_popup` can name it.

To sign a tablet in without typing a password, add a `trusted_networks` auth
provider **before** the `homeassistant` one in `configuration.yaml`, with the
tablet’s fixed address and its user:

```yaml
homeassistant:
  auth_providers:
    - type: trusted_networks
      trusted_networks:
        - <the tablet's IP address>
      trusted_users:
        <the tablet's IP address>:
          - <the tablet user's id>
      allow_bypass_login: true
    - type: homeassistant
```

Any other device still gets the password form. Behind a reverse proxy, also
set `use_x_forwarded_for` and `trusted_proxies` under `http:`, so Home
Assistant sees the tablet’s own address.

## 2. Make the tablet’s screen

1. Open **HK Settings** in the sidebar and select **Add Screen**.
2. Give it a **Name**, for example “Kitchen.”
3. Set **Shown On** to **Wall Tablet**.
4. Leave **Only Admins Can Open It** off (the tablet’s user is not an admin).
5. Select **Create Screen**.

A screen named “Kitchen” is the dashboard `/hk-kitchen`. It builds itself from
your areas and devices; see [Screens](screens.md) for everything it can show.

The **Wall Tablet** preset starts the screen with:

| Setting | Wall Tablet starts with |
|---|---|
| Menu | Always open beside the page |
| Time and weather | In the menu, at its top (the Home page’s header steps aside) |
| Return to Home When Idle | On |
| Hide Home Assistant Header & Sidebar | On (needs Kiosk Mode) |

A preset is only a starting point. Every value can be changed afterwards on
the screen’s page in HK Settings.

An existing dashboard can be a wall tablet’s screen too: in **Add Screen**,
pick it under **Existing Dashboards** and choose **Wall Tablet**. A dashboard
you write in YAML says a few of these things in its own YAML (kiosk mode and
the screensaver); see below.

## 3. Set up Fully Kiosk Browser

In Fully Kiosk Browser’s settings on the tablet:

- **Start URL**: the screen’s address, for example
  `https://homeassistant.local:8123/hk-kitchen/0`.
- **Keep the screen on** while the app runs, unless your own automation turns
  it off.
- **Autoplay** audio and video, so camera and Live TV sound can start without
  a tap.
- **Microphone access**, if you want to talk on the doorbell pop-up. Browsers
  allow the microphone only on a secure page, so the tablet must load Home
  Assistant over **https** for talking. Everything else works over http.
- **Remote administration** on (PLUS), then add the tablet in Home Assistant
  with the **Fully Kiosk Browser** integration. Its **Load start URL** button
  reloads the tablet from Home Assistant.

Sign in once as the tablet’s user.

On the tablet itself:

- **Update Android System WebView** from the Play Store before judging how
  anything looks or scrolls. A factory WebView can be far behind.
- **Disable the vendor apps you do not use.** Background apps cost a tablet
  more smoothness than anything on the page. Never disable Wi-Fi, the
  keyboard, Google Play services or the Play Store.
- Leave Android’s **Remove animations** (and power-saving modes that turn
  animations off) off. With it on, the browser asks pages for reduced motion
  and the live sky stands still.

## 4. Hide Home Assistant’s header and sidebar

1. Install **Kiosk Mode** from HACS (Frontend). HACS normally adds it as a
   dashboard resource; if Setup Check says it is not loaded, add
   `/hacsfiles/kiosk-mode/kiosk-mode.js` (JavaScript module) under
   **Settings → Dashboards → Resources**.
2. In **HK Settings**, open the screen. Under **Appearance**, turn on **Hide
   Home Assistant Header & Sidebar** (the Wall Tablet preset already did).
3. Optional: **Kiosk Mode Options** beside it: **Hide Header**, **Hide
   Sidebar**, **Show Header for Admins**, and any other Kiosk Mode option in
   YAML.

With the header hidden, you can still reach Home Assistant from the tablet if
you want to: the screen’s **Menu** settings can add a **Home Assistant
Section** -- Home Assistant’s own pages in the menu, and **Show Menu**, which
opens its sidebar over the page. A tablet’s own user sees only what it may
open. Leave it off on a tablet everyone uses.

A dashboard you write in YAML takes Kiosk Mode’s own `kiosk_mode:` block in
its YAML instead:

```yaml
kiosk_mode:
  hide_header: true
  hide_sidebar: true
```

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

## The now-playing bar

With Music added (see [Features](features.md#music)), a generated screen can
show a bar along the bottom while music plays on its room or a quick timer
runs: artwork, the track, play and skip, volume and progress. Turn on **Now
Playing Bar** under the screen’s **Behavior**.

The bar rises when music starts on the room the screen is showing, and stays
for 20 seconds after it stops. Close it and it stays closed on that screen
until the music or the timers change. The dashboard keeps working under it.

Quick timers need HK Frontend’s optional timer helpers; see
[Getting started](getting-started.md#what-next).

## Open a pop-up on a tablet

`hk_frontend.show_popup` opens a pop-up (the doorbell, say) on every screen
showing a dashboard, over whatever page it is on, but it does not wake a
sleeping tablet. To wake one and bring it to its screen with the pop-up open,
load the screen’s address with the pop-up’s hash on the end, through the Fully
Kiosk Browser integration:

```yaml
action: fully_kiosk.load_url
data:
  device_id: 0123456789abcdef0123456789abcdef   # the tablet's device
  url: https://homeassistant.local:8123/hk-kitchen/0#front-door
```

Making pop-ups: [Screens](screens.md#detail-sheets-and-pop-ups). The action:
[Features](features.md#show-a-pop-up).

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

More help: [Troubleshooting](troubleshooting.md).
