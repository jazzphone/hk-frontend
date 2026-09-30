# Wall Tablets

HK Frontend was built for tablets mounted on a wall and left on all day. This
page and [Screensaver and Idle](Screensaver-and-Idle.md) set one up from start
to finish: its own user, its screen, the kiosk browser, a photo screensaver,
and returning to Home when nobody is using it. It works the same for one
tablet or ten, of any brand.

![A wall tablet showing the Home page, with the menu open beside it](images/tablet-home.png)

## What HK Frontend does, and what it leaves to you

**HK Frontend does:** the screen itself, a menu that stays open beside the
page, returning an untouched page to Home, a photo screensaver, a
now-playing bar, and `sensor.tv_viewers` for knowing when a
tablet is showing Live TV.

**It leaves to you:** turning the screen off and on, and its brightness. Those
belong to the kiosk browser and your own automations (for example with the
Fully Kiosk Browser integration and a motion sensor). HK Frontend gives those
automations what they need to read; see
[What keeps a tablet awake](Screensaver-and-Idle.md#what-keeps-a-tablet-awake).

## What you need

- An Android tablet. Any size works; a 10–11 inch tablet that reports about
  1280 × 800 in its browser shows the full layout. Choose one with **6 GB of
  memory or more**: memory, not the processor, is what makes the difference.
- **Fully Kiosk Browser** on it. Its PLUS license adds remote administration,
  which the **Fully Kiosk Browser** integration in Home Assistant uses to
  reload the page and see the screen.
- Nothing else from HACS: hiding Home Assistant’s header and sidebar, and the
  photo screensaver, are part of HK Frontend.

**HK Settings → Setup Check** says how many screensaver photos it finds, and
whether each screensaver screen’s Tablet User exists.

## 1. Give the tablet its own user

In **Settings → People → Users**, add a user for the tablet, for example
“Kitchen Tablet.” Do not make it an administrator.

A user per tablet is what lets each tablet be itself:

- its photo screensaver runs for that user only, so a computer opening the
  same dashboard never gets it, and only that user’s touches count for the
  screen’s In Use sensor;
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
your areas and devices; see [Screens](Screens.md) for everything it can show.

The **Wall Tablet** preset starts the screen with:

| Setting | Wall Tablet starts with |
|---|---|
| Menu | Always open beside the page |
| Time and weather | In the menu, at its top (the Home page’s header steps aside) |
| Return to Home When Idle | On |
| Hide Home Assistant Header & Sidebar | On |

A preset is only a starting point. Every value can be changed afterwards on
the screen’s page in HK Settings.

An existing dashboard can be a wall tablet’s screen too: in **Add Screen**,
pick it under **Existing Dashboards** and choose **Wall Tablet**. It gets the
same settings, hiding the header and the photo screensaver included; see
[Your Own Dashboard](Your-Own-Dashboard.md) for what its own YAML can add.

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

1. In **HK Settings**, open the screen. Under **Appearance**, turn on **Hide
   Home Assistant Header & Sidebar** (the Wall Tablet preset already did).
2. Optional: **Header & Sidebar** beside it: **Hide Header**, **Hide
   Sidebar**, and **For Admins Too** (off: an admin still sees them).

HK Frontend does this itself: nothing to install. Leaving the screen (for
Settings, say) always brings them back, and `?hk_kiosk=off` on the screen’s
address shows them until the page is reloaded, while you work on the tablet.

With the header hidden, you can still reach Home Assistant from the tablet if
you want to: the screen’s **Menu** settings can add a **Home Assistant
Section** -- Home Assistant’s own pages in the menu, and **Show Menu**, which
opens its sidebar over the page. A tablet’s own user sees only what it may
open. Leave it off on a tablet everyone uses.

A dashboard you write in YAML gets the same from its HK settings, or from an
`hk_kiosk:` block in its YAML ([Your Own Dashboard](Your-Own-Dashboard.md#hide-home-assistants-header-and-sidebar)):

```yaml
hk_kiosk: true
```

**Coming from the Kiosk Mode plugin.** Screens that hid Home Assistant’s
header through the Kiosk Mode plugin (HACS) do it themselves from 1.3, with
nothing to change. A screen with **Kiosk Mode Options** of its own moves over
too when **Header & Sidebar** can say the same (hide the header, the sidebar,
and admins seeing both); with any other option it keeps the plugin until you
turn off **Header & Sidebar → Use the Kiosk Mode Plugin Instead**. A
dashboard with its own `kiosk_mode:` block keeps it too: HK Frontend leaves
that dashboard alone. Once nothing uses the plugin, you can remove it in HACS.

Next: [5. Add the photo screensaver](Screensaver-and-Idle.md#5-add-the-photo-screensaver).
