"""THE DASHBOARD SETTINGS: which entities the pages read, chosen in the UI.

The header's security line, the weather band, the sky, the idle-return timer
and the car viewport name no entity in their source: they read them from
here. The settings are chosen on the HK Settings page, stored in the entry's
options under "dashboard", and handed to every screen over
`hk_frontend/settings/subscribe` (hk-settings.js), now and again whenever
anything is edited. Each is documented on its topic's page in docs/.

The DEFAULTS assume no particular house. An unset entity is None and each page
has a generic fallback for it -- the first weather entity, the browser's clock,
the moon and the holiday season computed from the date -- so a fresh install
draws something sensible before anything is chosen. hk-settings.js carries the
same DEFAULTS; tests/py/test_settings.py keeps the two in step.
"""
from __future__ import annotations

from collections.abc import Mapping
import copy
import json
import re
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import kinds

CONF_DASHBOARD = "dashboard"

# The sky's themes: three holiday SEASONS and seven SURPRISES (hk-sky.js).
SEASONS = ("halloween", "thanksgiving", "christmas")
SURPRISES = ("birthday", "fourth-of-july", "valentines-day", "spring-garden",
             "winter-wonderland", "storybook-magic", "space-night")
THEMES = SEASONS + SURPRISES

# The sky's calendar, all MM-DD, None = built in:
#   halloween 09-22..10-31, thanksgiving 11-01..US Thanksgiving,
#   christmas 12-07..12-25 (the garland stays out of early December),
#   july4 06-28..07-04, valentines 02-08..02-14,
#   spring 03-20..06-20 and winter 12-21..03-19 (southern: six months on).
# A window may wrap the new year (12-20 .. 01-05).
SKY_DATES = tuple(f"{t}_{e}" for t in ("halloween", "thanksgiving", "christmas", "july4",
                                        "valentines", "spring", "winter")
                  for e in ("from", "to"))
# The built-in dates -- the same table as hk-settings.js BUILT_IN / SOUTH
# (tests/py/test_settings.py keeps the two in step). "thanksgiving" is US
# Thanksgiving Day.
SKY_BUILT_IN = {"halloween": ("09-22", "10-31"), "thanksgiving": ("11-01", "thanksgiving"),
                "christmas": ("12-07", "12-25"), "july4": ("06-28", "07-04"),
                "valentines": ("02-08", "02-14"), "spring": ("03-20", "06-20"),
                "winter": ("12-21", "03-19")}
SKY_SOUTH = {"spring": ("09-22", "12-20"), "winter": ("06-21", "09-21")}


def sky_built_in(theme: str, hemisphere: str) -> tuple[str, str]:
    return (hemisphere == "south" and SKY_SOUTH.get(theme)) or SKY_BUILT_IN[theme]


def sky_date(prefix: str, end: str, raw: Any, hemisphere: str) -> str | bool | None:
    """What one of the sky's date fields saves (`<prefix>_<end>`, end "from"
    or "to"): None when it is empty or the built-in date -- so the
    hemisphere can still move it -- a clean MM-DD when it is another date,
    False when it is not a date. Only Thanksgiving's last day may be the
    holiday itself ("Thanksgiving Day"). The settings page saves through
    this (settings_api.py)."""
    text = str(raw or "").strip()
    built = sky_built_in(prefix, hemisphere)[0 if end == "from" else 1]
    if not text:
        return None
    if text.lower() in ("thanksgiving", "thanksgiving day"):
        return None if built == "thanksgiving" else False
    v = parse_mmdd(text)
    if v is False:
        return False
    return None if v == built else v
# How often, None = built in ("sometimes" / once a month).
SEASON_OFTEN = ("every_day", "sometimes", "near_end")
SURPRISE_OFTEN = ("often", "sometimes", "rarely")
PER_MONTH = ("1", "2", "4")
SPOOKY_OFTEN = ("sometimes", "every_night", "never")
SKY_OFTEN = {"halloween_often": SEASON_OFTEN, "thanksgiving_often": SEASON_OFTEN,
             "christmas_often": SEASON_OFTEN, "spring_often": SURPRISE_OFTEN,
             "winter_often": SURPRISE_OFTEN, "storybook_per_month": PER_MONTH,
             "space_per_month": PER_MONTH, "spooky_often": SPOOKY_OFTEN}
# The sky's backdrops (HK Settings -> Sky / Background): a fixed all-day
# gradient instead of the live sky. "live" is the live sky itself; "custom"
# is the house's own stops (sky.gradient_custom below).
# Python owns the complete palette table; the panel receives it in choices.
# hk-settings.js mirrors it for the dashboard's first paint, before a server
# answer. The parity test compares labels and every stop as well as ids.
# Four stops top to horizon, at [0, .42, .72, 1]. The curated sets stay
# under the live sky's luminance cap; custom stops use its normal scrim.
SKY_BACKDROPS = (
    {"id": "live", "label": "Live sky"},
    {"id": "dusk", "label": "Dusk",
     "day": ["#141f3d", "#26314f", "#5c4460", "#b06a4a"],
     "night": ["#0c1428", "#161d35", "#33263f", "#5e3730"]},
    {"id": "midnight", "label": "Midnight",
     "day": ["#0d2f57", "#154272", "#256192", "#5b93b8"],
     "night": ["#04070f", "#060a16", "#0a0f1f", "#111726"]},
    {"id": "fjord", "label": "Fjord",
     "day": ["#121634", "#183456", "#1e6e7c", "#579eaa"],
     "night": ["#0a0d22", "#0f2136", "#133f47", "#336163"]},
    {"id": "dune", "label": "Dune",
     "day": ["#171d12", "#3a4020", "#7a5a24", "#b07f38"],
     "night": ["#0d100a", "#1e2112", "#3f2e14", "#5e4522"]},
    {"id": "graphite", "label": "Graphite",
     "day": ["#080a0e", "#0f1219", "#171b23", "#222833"],
     "night": ["#040507", "#080a0d", "#0d1015", "#11141a"]},
    {"id": "plum", "label": "Plum",
     "day": ["#150e1f", "#2e1b42", "#5c2f76", "#9a6bb0"],
     "night": ["#0b0713", "#170e24", "#2e1a3f", "#4c3659"]},
    {"id": "ember", "label": "Ember",
     "day": ["#1c0e10", "#3c1a1e", "#7a2f34", "#b0605f"],
     "night": ["#100708", "#1e0d10", "#3d191c", "#5d3231"]},
    {"id": "mist", "label": "Mist",
     "day": ["#0d1a1c", "#173437", "#22646a", "#56a0a0"],
     "night": ["#080f10", "#0d1e21", "#12373d", "#325556"]},
    {"id": "custom", "label": "Custom"},
)
SKY_BACKDROP_IDS = tuple(p["id"] for p in SKY_BACKDROPS)
# A PAGE'S BACKGROUND (Sky / Background -> Pages): its own color, or any
# backdrop -- "live" among them, the live sky
SKY_PAGE_MODES = ("own",) + SKY_BACKDROP_IDS
_MMDD = re.compile(r"^\s*(\d{1,2})-(\d{1,2})\s*$")


def parse_mmdd(text: str | None) -> str | bool | None:
    """'12-01' -> '12-01'; empty -> None; anything else -> False."""
    if not (text or "").strip():
        return None
    m = _MMDD.match(text)
    if not m or not (1 <= int(m.group(1)) <= 12 and 1 <= int(m.group(2)) <= 31):
        return False
    return f"{int(m.group(1)):02d}-{int(m.group(2)):02d}"


def sky_pages(v: Any) -> dict[str, str] | None:
    """Each page's background as stored: {page kind or custom page address:
    a SKY_PAGE_MODES value}; None when it cannot be read. An unknown page or
    mode is left out (a page removed, a backdrop retired)."""
    if v is None:
        return {}
    if not isinstance(v, Mapping):
        return None
    return {str(k): m for k, m in v.items()
            if isinstance(k, str) and re.match(r"^[a-z0-9][a-z0-9_-]{0,39}$", k) and m in SKY_PAGE_MODES}


def sky_stops(v: Any) -> dict[str, list[str]] | None:
    """A custom backdrop's stops, as stored: {day: ["#rrggbb" x 4],
    night: [...]}, lowercased; None when it is None or says nothing else."""
    if v is None:
        return None
    if not isinstance(v, Mapping):
        return None
    out: dict[str, list[str]] = {}
    for k in ("day", "night"):
        s = v.get(k)
        if not isinstance(s, (list, tuple)) or len(s) != 4 \
                or not all(isinstance(x, str) and ACCENT_HEX.fullmatch(x) for x in s):
            return None
        out[k] = [x.lower() for x in s]
    return out


# The menu (hk-sidebar.js) and the room pages (docs/Menu.md, docs/Pages.md).
#   button: auto -- the pinned chip when the dashboard's Home view carries a
#           menu button card, else the edge tab; chip; tab. Phones always get
#           the round button (a phone's margin has no room for a tab).
#   glyph:  the button's picture -- the iPad sidebar glyph, or three lines.
#   order:  the Rooms list, A to Z or in the dashboard's own view order.
MENU_BUTTONS = ("auto", "chip", "tab")
MENU_GLYPHS = ("sidebar", "lines")
# THE MENU'S HIGHLIGHT (its icons and the current page's row): one of Apple's
# system colours by name (hk-menu.js ACCENTS has their values), or "#rrggbb".
ACCENTS = ("orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink", "red")
ACCENT_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
# A dashboard item's Menu -> Tab position: a distance from the top of the page, or a share
# of its height. A bare number is px.
TAB_POSITION = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$")


DOCK_MIN = (700, 3000)      # a screen's Menu -> "Keep Open Down To", px


def tab_position(text: object) -> str | None:
    """"" for automatic, "140px" / "20%" normalized, None when it is neither."""
    t = str(text or "").strip()
    if not t or t.lower() in ("auto", "automatic"):
        return ""
    m = TAB_POSITION.match(t)
    if not m:
        return None
    n = float(m.group(1))
    unit = m.group(2) or "px"
    if (unit == "%" and n > 100) or (unit == "px" and n > 4000):
        return None
    return f"{n:g}{unit}"


# What a room page's status row may show, in the order it shows them by
# default: the Home app's own (a room there, 2026-10-04) -- readings, the
# security system, the accessories, the sensors, and what is playing. The
# saved list (rooms.status) is in the house's own order.
STATUS_KINDS = ("temperature", "humidity", "security", "tvs", "lights", "outlets", "blinds", "fans",
                "windows", "doors", "locks", "garage", "valves", "motion", "occupancy", "leaks", "speakers")
# ...those added in entry 1.10 (HK Frontend 1.5), which a list saved before is given
STATUS_KINDS_ADDED = ("security", "tvs", "lights", "valves", "speakers")

# THE PAGES' STATUS ROWS (hk-room.js pageItems): the row under a category
# page's title, as Climate's. Each page: (what it may show, what it shows by
# default, in order). Saved as status_rows.<page> = {status, exclude_areas}.
STATUS_ROWS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "climate": (("temperature", "humidity", "blinds", "fans"),
                ("temperature", "humidity", "blinds", "fans")),
    "lights": (("lights", "outlets"), ("lights", "outlets")),
    "doors_windows": (("doors", "windows", "garage", "motion", "occupancy"),
                      ("doors", "windows", "motion", "occupancy")),
    "water": (("leaks", "valves"), ("leaks", "valves")),
    "security": (("security", "locks", "garage", "doors", "windows", "leaks", "motion", "occupancy"),
                 ("security", "locks", "garage", "doors", "windows", "leaks")),
}

# The clouds' looks (sky.cloud_style, a screen's sky_cloud_style)
CLOUD_STYLES = ("classic", "realistic")

# The seasons whose woodland New Decorations shows between occasions (sky.woodland)
WOODLAND_SEASONS = ("spring", "summer", "fall", "winter")

DEFAULTS: dict[str, dict[str, Any]] = {
    # the pages' status rows: what each shows, in its order, and the rooms it
    # leaves out (an outdoor area's temperature, a shed's leak sensor)
    "status_rows": {p: {"status": list(d), "exclude_areas": []} for p, (_k, d) in STATUS_ROWS.items()},
    # The header's right-hand line: "Disarmed · 2 Doors Open" / "Home Secured".
    "security": {"alarm": None, "garage": [], "locks": [], "doors": [], "windows": []},
    # The header clock. Home Assistant's Time & Date integration; the page
    # falls back to the browser's own clock when these do not exist.
    "clock": {"time": "sensor.time", "date": "sensor.date"},
    # The weather band and strip. Unset sensors fall back to the weather
    # entity's own attributes; unset forecasts to weather/subscribe_forecast.
    "weather": {"entity": None, "feels_like": None, "humidity": None, "wind": None, "gust": None,
                "uv": None, "forecast_daily": None, "forecast_hourly": None,
                "alerts": None, "place": None, "outside": None,
                # the Weather Radar Card's own options (YAML) over the tuned map
                "radar": {}},
    # The live sky. moon: a 0..1 phase-fraction sensor (else computed);
    # holidays: a sensor whose state is Halloween / Thanksgiving / Christmas
    # during each season (else computed); seasonal: an on/off gate.
    # decorations: the integration's own on/off (switch.<...>_seasonal_decorations,
    # switch.py); seasonal: optionally, an entity of the house's that must also be on.
    "sky": {"moon": None, "holidays": None, "seasonal": None, "birthdays": [],
            "decorations": True, "decoration_style": "old",
            # the clouds' look: "classic" (the drifting noise decks) or
            # "realistic" (photographic cloud cut-outs, tools/sky/cloud_art.py)
            "cloud_style": "classic",
            # New Decorations' woodland on days with no holiday or birthday,
            # season by season -- its own choice, not the holidays' Show
            "woodland": list(WOODLAND_SEASONS),
            # The sky's own look (Sky / Background): animations -- the moving
            # parts (drifting clouds, falling rain and snow, the seasons);
            # weather -- the clouds, rain, snow and fog (the sun, moon and
            # stars stay when it is off); gradient -- "live" or a backdrop
            # id (SKY_BACKDROPS); gradient_custom -- its own stops, for
            # "custom". Each screen may set its own (the board's
            # sky_animations ... sky_custom keys, None = follow these).
            "animations": True, "weather": True,
            "gradient": "live", "gradient_custom": None,
            # EACH PAGE'S BACKGROUND (sky_pages below): page kind or custom
            # page address -> "own" (its own color), "live" (the live sky,
            # with this look) or a backdrop id. Missing: Automatic -- a page
            # with a color of its own keeps it, the rest show the live sky.
            "pages": {},
            # Which themes may run (all by default) and the hemisphere, which
            # flips the spring and winter surprise windows. (christmas_from is
            # one of SKY_DATES below: None = the built-in 12-07.)
            "themes": list(THEMES), "hemisphere": "north",
            # WHEN each theme may run and HOW OFTEN (docs/Seasonal-Decorations.md). None
            # is the built-in value, which the screens know (hk-settings.js
            # skyWindow): the dates below, the hemisphere's spring and winter,
            # and US Thanksgiving.
            **{k: None for k in SKY_DATES}, **{k: None for k in SKY_OFTEN}},
    # Return to the dashboard's first view when a page is left untouched.
    # dashboards: where it applies; rooms: dashboard -> room slug, which names
    # that tablet's own entities (binary_sensor.<room>_tablet_in_use,
    # input_select.<room>_tablet_idle_return, input_number.<room>_tablet_room_idle).
    "idle": {"dashboards": [], "rooms": {}, "default": None},
    # Dashboards opened in a car browser: the viewport is pinned (tesla-viewport.js).
    "car": {"dashboards": []},
    # The generated dashboards (custom:hk-dashboard): what to leave out (also
    # out of Status & Chips, everywhere) and what to add. A dashboard's own YAML
    # options add to these. (Which parts a screen shows -- chips, pages, sky,
    # rooms -- is each screen's own, and a dashboard's YAML can say
    # `chips: false` and the like.)
    "generated": {"exclude_areas": [], "exclude_devices": [], "exclude_entities": [],
                  "include_entities": []},
    # STATUS & CHIPS (kinds.py): each kind's Leave out / Also count, by kind;
    # None = nothing saved, so the kind is automatic (or its older list,
    # kinds.LEGACY).
    "counts": kinds.blank(),
    # Entities single cards fall back to when their config does not name one.
    "features": {"vacuum_script": None, "alarm_bad_code": None,
                 # thermostats: the older list Status & Chips replaced
                 # (kinds.LEGACY) -- read only while "thermostats" is unsaved.
                 # temperature: the indoor temperature the Climate chip shows
                 # (else the first thermostat's); power: the house's power
                 # draw, for the Energy chip. Both on the Status & Chips page.
                 "thermostats": [], "temperature": None, "power": None,
                 # The Timers page's "House timers": the timers people start
                 # themselves (a nap, bedtime), in order, one tap each.
                 "house_timers": []},
    # The menu of pages and rooms. OFF on every dashboard until one is
    # listed here, so a house that never sets it up sees no change.
    # docked: the dashboards whose menu is always shown beside the page (with
    # room for it), with no button; everywhere else it stays hidden until
    # opened. tab_position: "" (level with the date line), "140px" or "20%".
    # categories: the view paths listed under Categories; empty = the pages
    # the Home view's chips open. ha_sidebar: the dashboards whose menu has a
    # "Home Assistant" row that opens Home Assistant's own sidebar -- over the
    # page, even where kiosk mode hides it. Per dashboard: a wall tablet
    # everyone uses may not want it.
    # dock_min: the narrowest the dashboard may be and keep a docked menu open;
    # narrower, it folds into the dashboard's button (an iPad mini upright, a
    # phone). time_weather: the dashboards whose DOCKED menu carries the time,
    # date and weather at its top, the Home header giving its space back.
    "menu": {"dashboards": [], "docked": [], "dock_min": 1000, "time_weather": [],
             "button": "auto", "tab_position": "",
             "glyph": "sidebar", "clock": True, "order": "az", "categories": [],
             "ha_sidebar": [],
             # ALL SCREENS' MENU (entry 1.9, 2026-10-02): every screen's menu
             # settings but whether it has one (its `menu`: off, a button,
             # always open), for each screen that doesn't set its own
             # (menu_custom). MENU_KEYS maps them onto a screen's keys; named
             # apart from the older lists above, which settings.py still
             # fills in for an older hk-base.js.
             "style": "auto", "narrow": "chip", "tab_at": "", "tab_size": "large",
             "tab_size_phone": "standard", "open_min": 1000, "time_weather_at": "page",
             "ha_row": False, "accent": "orange", "swipe": False,
             # the tab bar (2026-10-05): while scrolling, its Rooms button,
             # its glass
             "bar_scroll": "shrink", "bar_rooms": "more", "bar_glass": "house", "bar_more": "icons"},
    # The room pages: whether room headings on Home open them, and what the
    # status row shows.
    # ROOMS, for every screen that doesn't set its own (a screen's
    # rooms_custom): the order of the rooms and which are on Home (`order`,
    # `home` -- empty: floor by floor, then A to Z), the menu's rooms A to Z or
    # in that order (`menu`), and the pages that group by room by floor or in
    # it (`pages`). Before 2026-10-01 each screen held its own copy.
    "rooms": {"headings": True, "status": list(STATUS_KINDS), "order": [], "home": "as_is", "menu": "az",
              "pages": "floor"},
    # How the glass surfaces look (hk-settings.js applies it; hk-glass.js draws
    # the shared blur): clear -- the original plate, the status chips blur
    # themselves; frosted -- a frosted material, no blur at all; blur -- ONE
    # blur layer per scroller behind every glass surface; blur_each -- every
    # surface blurs itself (phones, iPads, computers: too heavy for a wall
    # tablet). frost: how milky Frosted is; blur: how strong both blurs are
    # -- each 0-100 %, 50 (the middle) as designed: 20 px of blur.
    # docs/ (each setting on its topic's page).
    "look": {"glass": "clear", "frost": 50, "blur": 50,
             # The detail sheets (hk-detail.js), after the Home app's, in
             # place of HA's more-info dialog on the dashboards, and the view
             # a speaker's sheet opens with "Browse Music" (a view path on the
             # same dashboard; empty = no Browse button).
             "details": True, "browse_view": "music-browse",
             # A generated dashboard's live sky follows this switch (off: no
             # sky anywhere), and its photo screensaver shows this folder.
             "sky_switch": None, "photos": "media-source://media_source/local/photos",
             # A PAGE PILL'S LOOK: the scenes row's pills that open a page,
             # kind -> {name, icon, color}; empty is each pill's own
             # ("Play Music" can read "Apple Music")
             "page_pills": {}},
    # THE CALENDAR (the Calendar page, hk-calendar.js, and the screensaver's
    # calendar pane): the calendar entities shown, in order (empty: every
    # calendar the house has), and each one's colour -- entity -> a page pill
    # colour (settings_api.PILL_COLORS); one left out takes the next of the
    # palette by its place in the list.
    "calendar": {"entities": [], "colors": {}},
    # Browse Music: the categories its first page leaves out, and its
    # Discover rows in the order shown. Every
    # hk-library-card without its own `hide:` / `discover:` reads these.
    "browse": {"hide": [], "discover": ["recently_played", "favourite_playlists", "most_played",
                                        "recently_added", "favourite_radio"]},
}
GLASS = ("clear", "frosted", "blur", "blur_each")
AMOUNT = (0, 100)                  # look.frost and look.blur, in %; 50 is the default

# Music Assistant's own categories on Browse Music's first page, by the id
# browse_media gives each (media_content_id), in MA's order.
BROWSE_CATEGORIES = ("artists", "albums", "tracks", "playlists", "radio", "podcasts", "audiobooks")

# THE DISCOVER ROWS a house can pick from. Each is one
# `music_assistant.get_library` call -- a media type and an order, or the
# favorites -- because that is what the page can ask without Music
# Assistant's own token; MA's streaming-curated rows ("Stations for You") are
# not reachable that way. Titles are what the row's heading says.
SHELVES: dict[str, dict[str, Any]] = {
    "recently_played": {"title": "Recently played", "media_type": "track",
                        "order_by": "last_played_desc"},
    "recent_albums": {"title": "Recently played albums", "media_type": "album",
                      "order_by": "last_played_desc"},
    "recent_playlists": {"title": "Recently played playlists", "media_type": "playlist",
                         "order_by": "last_played_desc"},
    "recent_artists": {"title": "Recently played artists", "media_type": "artist",
                       "order_by": "last_played_desc"},
    "recent_podcasts": {"title": "Recently played podcasts", "media_type": "podcast",
                        "order_by": "last_played_desc"},
    "favourite_playlists": {"title": "Favorite playlists", "media_type": "playlist", "favorite": True},
    "favourite_songs": {"title": "Favorite songs", "media_type": "track", "favorite": True},
    "favourite_albums": {"title": "Favorite albums", "media_type": "album", "favorite": True},
    "favourite_artists": {"title": "Favorite artists", "media_type": "artist", "favorite": True},
    "favourite_radio": {"title": "Favorite radio", "media_type": "radio", "favorite": True},
    "favourite_podcasts": {"title": "Favorite podcasts", "media_type": "podcast", "favorite": True},
    "most_played": {"title": "Most played", "media_type": "album", "order_by": "play_count_desc"},
    "most_played_songs": {"title": "Most played songs", "media_type": "track",
                          "order_by": "play_count_desc"},
    "most_played_playlists": {"title": "Most played playlists", "media_type": "playlist",
                              "order_by": "play_count_desc"},
    "most_played_artists": {"title": "Most played artists", "media_type": "artist",
                            "order_by": "play_count_desc"},
    "recently_added": {"title": "Recently added", "media_type": "album",
                       "order_by": "timestamp_added_desc"},
    "recently_added_playlists": {"title": "Recently added playlists", "media_type": "playlist",
                                 "order_by": "timestamp_added_desc"},
    "recently_added_songs": {"title": "Recently added songs", "media_type": "track",
                             "order_by": "timestamp_added_desc"},
    "newest_albums": {"title": "Newest albums", "media_type": "album", "order_by": "year_desc"},
    "random_albums": {"title": "Albums at random", "media_type": "album", "order_by": "random"},
}


def discover_rows(keys: list[str] | None) -> list[dict[str, Any]]:
    """The picked Discover rows as the queries a screen runs, in order."""
    return [{"key": k, **SHELVES[k]} for k in (keys or []) if k in SHELVES]



def merged(options: Mapping[str, Any] | None) -> dict[str, dict[str, Any]]:
    """The stored settings over the defaults, section by section."""
    out = copy.deepcopy(DEFAULTS)
    stored = (options or {}).get(CONF_DASHBOARD) or {}
    for section, values in stored.items():
        if section in out and isinstance(values, dict):
            out[section].update({k: v for k, v in values.items() if k in out[section]})
    out["look"]["saver"] = saver_options(out["look"].get("saver")) or dict(SAVER_DEFAULTS)
    return out


# OPTIONAL CARDS FROM HACS: a page that can use one draws it
# only when it is installed -- the Weather page's radar map. key -> (HACS
# repository folder, file). Looked for under www/community, where HACS keeps
# them and serves them as /hacsfiles/<folder>/<file>; the file's time goes on
# the URL, so an update is fetched afresh.
THIRD_PARTY: dict[str, dict[str, Any]] = {
    "wallpanel": {"name": "WallPanel", "folder": "lovelace-wallpanel", "file": "wallpanel.js", "resource": True,
                  "what": "photo screensaver on a wall tablet"},
    "kiosk": {"name": "Kiosk Mode", "folder": "kiosk-mode", "file": "kiosk-mode.js", "resource": True,
              "what": "full-window dashboard, with Home Assistant's header and sidebar hidden"},
    "radar": {"name": "Weather Radar Card", "folder": "weather-radar-card", "file": "weather-radar-card.js",
              "resource": False, "what": "radar map on the Weather page"},
}
OPTIONAL_CARDS = {k: (v["folder"], v["file"]) for k, v in THIRD_PARTY.items()}
# A card's own options (YAML) as the user writes them: kept only when they are
# a mapping of plain values, and not huge. Merged over the dashboards' tuned
# settings key by key (hk-strategy.js); `key: null` removes one.
CARD_OPTIONS_MAX = 20000


# ------------------------------------------------------------ the screensaver
# THE PHOTO SCREENSAVER'S OPTIONS (a generated wall tablet's Screensaver
# Options page; hk-saver.js draws it). HK Frontend's own screensaver since
# 1.3.0 -- WallPanel (HACS) is only a fallback a screen can choose
# (screensaver_engine), with its own wallpanel_options.
SAVER_DEFAULTS: dict[str, Any] = {
    "starts_after": 180,     # s untouched (the switch can start it sooner)
    "each_photo": 30,        # s
    "order": "random",       # random: every photo once before any repeats
    "fill": True,            # a landscape photo fills the screen (else whole)
    "zoom": False,           # Slow Zoom -- a frame per refresh; off by default
    "clock": True, "weather": True, "music": True, "timers": True,
    "status": True,          # Home Status, top right (hk-screensaver-status-card)
    # photos: the photos, and the forecast whenever there are none to show;
    # both: the photos with the forecast as a slide every `forecast_every`
    # photos; forecast: always the forecast (the live sky over the land)
    "show": "photos",
    "forecast_every": 5,
    # THE FORECAST DETAILS (today, the hours, the days, along the bottom): on
    # the forecast (Forecast, the Photos & Forecast slide, the no-photos
    # fallback), and over the photos
    "band": True, "band_photos": False,
    # with Show: photos and no photos to show -- the forecast (True) or a dark
    # screen, as before 1.3 (False)
    "fallback": True,
    # THE CALENDAR PANE (1.4): the coming events down the right of the
    # screen, the photos (or the forecast) beside it; and how many days it
    # lists -- today, tomorrow, and so on
    "calendar": False, "calendar_days": 2,
    # BACK TO THE DASHBOARD: how long the screensaver takes to fade away, ms
    # (0: at once), after the dashboard has been drawn underneath it
    "fade_back": 500,
}
SAVER_ORDERS = ("random", "sorted")
SAVER_SHOWS = ("photos", "both", "forecast")
# ALL SCREENS' screensaver options (Wall Tablets -> Screensaver): a screen
# whose own `screensaver_options` is null uses these (resolved()).
DEFAULTS["look"]["saver"] = dict(SAVER_DEFAULTS)
SAVER_FC_EVERY = (2, 100)
SAVER_CAL_DAYS = (1, 7)
SAVER_FADE_BACK = (0, 5000)
SAVER_ENGINES = ("hk", "wallpanel")
# WHO HIDES HOME ASSISTANT'S HEADER AND SIDEBAR on a screen with Hide Home
# Assistant Header & Sidebar: HK Frontend itself (hk-kiosk.js, 1.3), or the
# Kiosk Mode plugin (HACS) with the screen's kiosk_options.
KIOSK_ENGINES = ("hk", "kiosk_mode")
SAVER_STARTS = (15, 3600)
SAVER_EACH = (5, 600)


def saver_options(v: Any, legacy: Any = None) -> dict[str, Any] | None:
    """The screensaver's options over the defaults, or None when `v` is not a
    mapping or holds a value that cannot be used (the form says so). With no
    options of its own yet, a screen's old WallPanel choices carry over:
    idle_time, display_time, media_order, image_fit_landscape and
    image_animation_ken_burns are the ones its page ever set."""
    out = dict(SAVER_DEFAULTS)
    if v in (None, "", {}):
        w = legacy if isinstance(legacy, dict) else {}
        v = {}
        for src, dst in (("idle_time", "starts_after"), ("display_time", "each_photo")):
            if isinstance(w.get(src), (int, float)) and not isinstance(w.get(src), bool):
                v[dst] = w[src]
        if w.get("media_order") in SAVER_ORDERS:
            v["order"] = w["media_order"]
        if w.get("image_fit_landscape") in ("cover", "contain"):
            v["fill"] = w["image_fit_landscape"] == "cover"
        if isinstance(w.get("image_animation_ken_burns"), bool):
            v["zoom"] = w["image_animation_ken_burns"]
        # an out-of-range old value is clamped rather than refused: it was
        # accepted once, and the screen must keep working
        for k, (lo, hi) in (("starts_after", SAVER_STARTS), ("each_photo", SAVER_EACH)):
            if k in v:
                v[k] = int(min(max(v[k], lo), hi))
    if not isinstance(v, dict):
        return None
    for k, val in v.items():
        if k not in SAVER_DEFAULTS:
            return None
        if k in ("starts_after", "each_photo", "forecast_every", "calendar_days", "fade_back"):
            lo, hi = {"starts_after": SAVER_STARTS, "each_photo": SAVER_EACH, "forecast_every": SAVER_FC_EVERY,
                      "calendar_days": SAVER_CAL_DAYS, "fade_back": SAVER_FADE_BACK}[k]
            if isinstance(val, bool) or not isinstance(val, (int, float)) or not lo <= val <= hi:
                return None
            out[k] = int(val)
        elif k in ("order", "show"):
            if val not in (SAVER_ORDERS if k == "order" else SAVER_SHOWS):
                return None
            out[k] = val
        else:
            if not isinstance(val, bool):
                return None
            out[k] = val
    return out


def card_options(v: Any) -> dict[str, Any] | None:
    """A card's options as stored ({} for none), or None when `v` is not a
    mapping of plain values (the form says so)."""
    import json
    if v in (None, "", {}):
        return {}
    if not isinstance(v, dict):
        return None
    try:
        text = json.dumps(v)
    except (TypeError, ValueError):
        return None
    return json.loads(text) if len(text) <= CARD_OPTIONS_MAX else None


def find_extras(config_dir: str) -> dict[str, str | None]:
    """Each optional card's URL, or None when it is not installed. Blocking:
    run in the executor."""
    import os
    out: dict[str, str | None] = {}
    for key, (folder, name) in OPTIONAL_CARDS.items():
        path = os.path.join(config_dir, "www", "community", folder, name)
        try:
            out[key] = f"/hacsfiles/{folder}/{name}?v={int(os.path.getmtime(path))}"
        except OSError:
            out[key] = None
    return out


def as_client(entry: ConfigEntry | None,
              found: dict[str, list[str]] | None = None,
              accessories: dict[str, Any] | None = None,
              extras: dict[str, Any] | None = None,
              switches: dict[str, str] | None = None) -> dict[str, Any]:
    """What a screen is handed. The same for every user: the house-wide
    sections, and `boards` -- each dashboard item's own menu settings, by
    url path. The menu's older lists (dashboards, docked, ...) are filled in
    from the items too, so a screen still running an older hk-base.js (the
    first load after an update) keeps its menu until it reloads.

    `kinds` (found): Status & Chips, resolved (kinds.py) -- each kind's entity
    ids. The raw Leave out / Also count stay here; a screen needs only the
    answer. The older lists the header and the generated dashboard read
    (security.locks ..., features.thermostats) are the same answer, for a
    screen still running older files."""
    out = {"configured": entry is not None, **merged(entry.options if entry else None)}
    del out["counts"]
    items = boards(entry)
    # each screen's photo screensaver switch, by its current entity id
    # (screensaver.py) -- a rename in the UI keeps working
    for path, b in items.items():
        b["screensaver_switch"] = (switches or {}).get(path)
    out["boards"] = items
    if items:
        out["menu"].update(legacy_lists(items))
        for section, values in legacy_screens(items).items():
            out[section].update(values)
    # Browse Music's rows go out as the queries themselves, so a screen needs
    # no copy of SHELVES.
    out["browse"]["discover"] = discover_rows(out["browse"]["discover"])
    # Each accessory's settings and each room's tile order (accessories.py).
    out["accessories"] = accessories or {"entities": {}, "rooms": {}, "into": {}, "pages": {}}
    # The optional cards that are installed (find_extras): url or None.
    out["extras"] = dict(extras or {})
    out["popups"] = popups(entry)
    out["custom_pages"] = custom_pages(entry)
    out["custom_chips"] = custom_chips(entry)
    out["kinds"] = found or {}
    if found:
        for kind, (section, key) in kinds.LEGACY.items():
            out[section][key] = list(found.get(kind) or [])
    return out


# ------------------------------------------------------------ the dashboards
# EACH DASHBOARD ITS OWN ITEM: a subentry of type "dashboard", keyed by its
# url path, listed under Dashboards on the integration's page with its own
# settings -- the menu, where the time and weather sit, the Home Assistant
# row, its categories -- and its rooms, All Screens' (HK Settings -> Rooms)
# unless it sets its own (rooms_custom). The menu's icon and the clock tap are
# shared by every screen (HK Settings -> Menu). docs/Menu.md, docs/Rooms.md
# and docs/Screens.md.
SUBENTRY_DASHBOARD = "dashboard"
# menu: off, a button (automatic / the pinned chip / the edge tab), or open
# (always beside the page, folding to the automatic button when narrower
# than dock_min).
# chip_scroll: the chip, and the edge tab slides in while it is scrolled out
# of sight; chip_home: that on Home, the tab on every other page. none: no
# button at all, the swipe from the left edge opens it -- only with `swipe`
# on (hk-base.js treats it as auto without it).
# tabbar: no side menu at all -- the tab bar (hk-tabbar.js), at every width.
BOARD_MENUS = ("off", "auto", "chip", "chip_scroll", "chip_home", "tab", "none", "open", "tabbar")
BOARD_TIME = ("page", "menu")          # the time and weather: header or menu
BOARD_MENU_ROOMS = ("az", "order")     # rooms in the menu: A to Z / room order
# rooms on Home: as written / in room order / only the rooms in room order
BOARD_HOME_ROOMS = ("as_is", "order", "only")
# rooms on a generated dashboard's pages (Lights, Climate, Water ...):
# floor by floor, A to Z within each / in room order
BOARD_PAGE_ROOMS = ("floor", "order")
# THE CHIPS (hk-chip.js KIND_ORDER): which a dashboard shows, in its order.
CHIP_KINDS = ("weather_alert", "security", "doors_windows", "climate", "lights", "blinds",
              "timers", "vacuums", "speakers", "water", "energy")
CHIPS_QUIET = ["weather_alert", "doors_windows", "blinds", "water"]
# THE PAGES a generated dashboard can have (hk-strategy.js), in menu order.
# Energy: the Energy feature's page (features/energy), while it is added.
PAGE_KINDS = ("weather", "calendar", "cameras", "live_tv", "security", "doors_windows", "climate", "lights",
              "timers", "vacuums", "music", "water", "energy", "rooms")
# A DASHBOARD'S PAGE ORDER: the kinds above, plus Browse Music as a place of
# its own (it comes with Play Music -- never on its own -- and follows it
# unless placed), plus the house's custom pages by address, so every page in
# the menu can be reordered.
PAGE_BROWSE = "browse"
PAGE_ORDER = (PAGE_KINDS[:PAGE_KINDS.index("music") + 1] + (PAGE_BROWSE,)
              + PAGE_KINDS[PAGE_KINDS.index("music") + 1:])
BOARD_GLASS = ("house", "clear", "frosted", "blur", "blur_each")   # house: the shared look
# ON NARROW SCREENS: the button under 1,024 px and while an
# always-open menu is folded -- the chip, the chip then the edge tab once
# scrolled past, the edge tab, or none (the swipe alone; the chip without
# it) -- hk-base.js narrowStyle
# ...or the tab bar in its place (hk-tabbar.js)
BOARD_NARROW = ("chip", "chip_scroll", "tab", "none", "tabbar")
# what a phone shows at the top of Home: the clock and weather header, or the
# one-line weather strip (a generated screen; a YAML one draws its own)
BOARD_PHONE = ("header", "strip")
# the menu's edge tab: its size on a tablet or wider (tab_size), and on a phone
# (tab_size_phone, under 640 px), each the screen's own -- hk-menu.js. A phone
# starts with the standard one, which already lies over the first column.
BOARD_TAB_SIZES = ("standard", "large", "xl")
# THE TAB BAR (hk-tabbar.js, docs/Tab-Bar.md): iOS's floating tab bar, the
# menu's other form. A screen's `menu` "tabbar" is the bar at every width
# and no side menu; its `narrow` "tabbar" is the side menu (a button, or
# always open) on wide screens and the bar where that menu would fold. The
# two never show together. How the bar behaves while the page scrolls, its
# Rooms button and its glass are menu settings (MENU_KEYS): All Screens'
# unless the screen sets its own menu (menu_custom).
# shrink: folds into a small round button while scrolling down; hide: slides
# away; stay: never moves. Both come back on any scroll up, at the page's
# ends and on a page change.
TAB_BAR_SCROLLS = ("shrink", "hide", "stay")
# house: the screen's glass (its own or All Screens'); clear: a near-solid
# tint -- a see-through bar cannot be read over the tiles (measured
# 2026-10-05)
TAB_BAR_GLASS = ("house", "clear", "frosted", "blur")
# the rooms: a section of More (under its pages), a round button of their own
# beside the tabs, or not in the bar at all
TAB_BAR_ROOMS = ("more", "button", "off")
# More's look: a grid of icons (wide on a tablet), or a list like the side
# menu's (about a phone's width everywhere)
TAB_BAR_MORE = ("icons", "list")


def tab_bar_rooms(v: Any) -> str:
    """The Rooms setting as stored; a boolean from before 2026-10-05
    evening: True is In More."""
    if v is False:
        return "off"
    return v if v in TAB_BAR_ROOMS else "more"
VIEW_PATH = re.compile(r"^[A-Za-z0-9_.-]{1,60}$")
BOARD_DEFAULTS: dict[str, Any] = {
    # the menu
    "menu": "auto", "dock_min": 1000, "time_weather": "page", "ha_row": False,
    "categories": [], "tab_position": "", "tab_size": "large", "tab_size_phone": "standard", "room_order": [],
    "menu_rooms": "az", "home_rooms": "as_is", "page_rooms": "floor",
    # rooms_custom: the four room settings above are this screen's own; off,
    # they are All Screens' (settings `rooms`, filled in by resolved())
    "rooms_custom": False,
    # menu_custom: the menu settings in MENU_KEYS are this screen's own; off,
    # they are All Screens' (settings `menu`, filled in by resolved()) -- all
    # but `menu` itself, whose button style alone follows
    "menu_custom": False, "accent": "orange", "glyph": "sidebar", "clock": True,
    # swipe: a drag right from the left edge opens the menu, at every width,
    # beside whatever button there is (hk-menu.js wireEdge)
    "swipe": False,
    # the tab bar (menu or narrow "tabbar"): while scrolling, its Rooms
    # button, its glass -- menu settings (MENU_KEYS)
    "tab_bar_scroll": "shrink", "tab_bar_rooms": "more", "tab_bar_glass": "house", "tab_bar_more": "icons",
    # narrow: BOARD_NARROW; menu_top: the view paths at the top of the menu,
    # right under Home -- empty is the views' own `menu: top`
    "narrow": "chip", "menu_top": [], "phone_header": "header", "chips_custom": [],
    # Home: the chips -- empty = every kind the house has; quiet = only when
    # there is something to report; extra = entities as chips of their own
    # -- then the camera strip, the scenes row and the favorites.
    # chips_row: the row itself.
    "chips_row": True, "chips": [], "chips_quiet": list(CHIPS_QUIET), "chips_extra": [],
    # camera_live: an input_select/select whose option names the live camera
    # (an automation picks one -- from person detection, say)
    "camera_strip": True, "cameras": [], "camera_live": "",
    "scenes_row": True, "scenes": [], "scenes_pages": [],
    "favorites": [],
    # Pages (generated dashboards): empty = every page the house has.
    "pages": [],
    # Screen: frost, blur: this screen's own amounts (0-100 %) -- None
    # follows the shared look (HK Settings -> Appearance).
    "glass": "house", "frost": None, "blur": None, "sky": True, "idle_return": False, "idle_room": "", "car": False,
    # Sky / Background, this screen's own: None for each follows All
    # Screens (the house's sky animations / weather / decorations, and the
    # house's backdrop -- sky_gradient: a SKY_BACKDROPS id, sky_custom: its
    # stops, for "custom").
    "sky_animations": None, "sky_weather": None, "sky_decorations": None, "sky_decoration_style": None,
    "sky_cloud_style": None, "sky_gradient": None, "sky_custom": None,
    # each page's background, this screen's own: {page: mode}; a page
    # missing follows All Screens' (sky.pages)
    "sky_pages": {},
    # kiosk: the screen hides Home Assistant's header and sidebar -- HK
    # Frontend itself (hk-kiosk.js), any screen, generated or not. Which of
    # the two (kiosk_header, kiosk_sidebar), and whether for admins too
    # (kiosk_admins). kiosk_engine "kiosk_mode": the Kiosk Mode plugin (HACS)
    # does it instead, with kiosk_options -- a generated screen only.
    "kiosk": False, "kiosk_header": True, "kiosk_sidebar": True, "kiosk_admins": True,
    "kiosk_engine": "hk",
    # popups: this dashboard answers the house's pop-ups (Pop-ups) -- off for
    # a screen that must never be covered (a car's)
    "popups": True,
    # a GENERATED wall tablet's own: the now-playing bar, and the photo
    # screensaver for the tablet's HA user (HK Frontend's own, hk-saver.js;
    # or WallPanel if the screen chooses it) -- the sky and the cards pause
    # behind it
    "now_playing": False, "screensaver": False, "tablet_user": "",
    # null: the settings for All Screens (resolved() fills them in)
    "screensaver_options": None, "screensaver_engine": "hk",
    # a GENERATED dashboard's third-party cards' own options (YAML), over the
    # tuned settings: WallPanel's and Kiosk Mode's
    "wallpanel_options": {}, "kiosk_options": {},
    # the house's CUSTOM PAGES this generated dashboard shows (their
    # addresses, in this order), after its category pages and before the
    # rooms
    "custom_pages": [],
    # HOME PAGE: off, a generated screen is only the pages it lists
    # (`only_pages`: any page kind or custom page, in order) and opens on the
    # first -- an Energy display, a Security panel. Its own list, apart from
    # the whole screen's `pages`, so turning Home back on finds the whole
    # screen as it was. Listing none (a screen set up before 2026-10-04):
    # only its custom pages, `energy` among them the Energy feature's page
    "home_page": True, "only_pages": [],
    # ...and on, WHICH Home: "" the generated one, or the address of one of
    # the house's custom pages -- a car's own first page over the generated
    # category pages
    "home_view": ""}
# The pages a scene pill can open (Home -> Scenes -> Pills that open a page).
SCENE_PAGES = tuple(k for k in PAGE_KINDS if k != "rooms")
SCENE_PAGE = "page:"                   # such a pill's place in the scenes order
ENTITY_ID = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")

# WHAT A NEW DASHBOARD ITEM STARTS FROM (Add dashboard -> "What is this
# screen?"): the settings that differ by the kind of screen, the
# rest are the defaults. "custom" starts from the defaults (the menu off for a
# hand-written dashboard). A preset is a starting point, not a mode: nothing
# remembers it, and every value can be changed on the gear afterwards.
SCREEN_PRESETS: dict[str, dict[str, Any]] = {
    # on a wall: the menu always open with the time and weather in it, back to
    # Home when left alone, no Home Assistant chrome
    "wall_tablet": {"menu": "open", "time_weather": "menu", "idle_return": True, "kiosk": True},
    # phones and iPads: the menu behind a button, the time in the header
    "personal": {"menu": "auto", "time_weather": "page"},
    # a desk or a laptop: the menu open beside the page
    "computer": {"menu": "open", "time_weather": "page"},
    # a car's browser: no menu, the car's viewport, no chrome
    "car": {"menu": "off", "car": True, "kiosk": True},
    # an energy display: only the Energy page (the Energy feature's), no
    # menu, no Home Assistant chrome -- a screen beside the electrical panel
    "energy": {"menu": "off", "home_page": False, "only_pages": ["energy"], "kiosk": True},
    "custom": {},
}


def amount_or_none(v: Any) -> int | None:
    """A look amount (0-100 %), or None: not set, follow the house's."""
    if v is None or v == "" or isinstance(v, bool):
        return None
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return max(AMOUNT[0], min(AMOUNT[1], n))


_MISSING = object()


def board(data: Mapping[str, Any] | None) -> dict[str, Any]:
    """One dashboard's settings over the defaults, each value checked: what
    is stored can predate a choice being removed."""
    out = copy.deepcopy(BOARD_DEFAULTS)
    d = dict(data or {})
    pick = lambda k, allowed: d[k] if d.get(k) in allowed else out[k]  # noqa: E731
    out["menu"] = pick("menu", BOARD_MENUS)
    out["time_weather"] = pick("time_weather", BOARD_TIME)
    out["menu_rooms"] = pick("menu_rooms", BOARD_MENU_ROOMS)
    out["home_rooms"] = pick("home_rooms", BOARD_HOME_ROOMS)
    out["page_rooms"] = pick("page_rooms", BOARD_PAGE_ROOMS)
    out["narrow"] = pick("narrow", BOARD_NARROW)
    out["phone_header"] = pick("phone_header", BOARD_PHONE)
    try:
        out["dock_min"] = int(min(max(float(d.get("dock_min") or 1000), DOCK_MIN[0]), DOCK_MIN[1]))
    except (TypeError, ValueError):
        pass
    out["ha_row"] = bool(d.get("ha_row", False))
    out["rooms_custom"] = bool(d.get("rooms_custom", False))
    out["menu_custom"] = bool(d.get("menu_custom", False))
    out["accent"] = accent(d.get("accent")) or out["accent"]
    out["glyph"] = pick("glyph", MENU_GLYPHS)
    out["clock"] = bool(d.get("clock", True))
    out["swipe"] = d.get("swipe") is True
    # THE TAB BAR'S FIRST FORM (2026-10-05, a few hours): a `tab_bar` of its
    # own beside the menu. Always is now the menu's Tab Bar; Narrow Screens
    # the narrow choice. Read once: the next write of the item drops the key.
    old_bar = d.get("tab_bar")
    if old_bar == "always" and "tabbar" not in (d.get("menu"), d.get("narrow")):
        out["menu"] = "tabbar"
    elif old_bar == "narrow" and out["menu"] not in ("off", "tabbar") and d.get("narrow") is None:
        out["narrow"] = "tabbar"
    out["tab_bar_scroll"] = pick("tab_bar_scroll", TAB_BAR_SCROLLS)
    out["tab_bar_rooms"] = tab_bar_rooms(d.get("tab_bar_rooms"))
    out["tab_bar_glass"] = pick("tab_bar_glass", TAB_BAR_GLASS)
    out["tab_bar_more"] = pick("tab_bar_more", TAB_BAR_MORE)
    strs = lambda v: [str(x) for x in v if x] if isinstance(v, list) else None  # noqa: E731
    for k in ("categories", "room_order", "cameras", "scenes", "favorites", "chips_extra"):
        out[k] = strs(d.get(k)) or []
    # chips: the kinds AND the dashboard's own chips (entities), in one order;
    # which entities are chips at all is chips_extra's to say
    out["chips"] = [k for k in (strs(d.get("chips")) or []) if k in CHIP_KINDS or ENTITY_ID.match(k)
                    or (k.startswith(CHIP_TOKEN) and CHIP_KEY.match(k[len(CHIP_TOKEN):]))]
    out["chips_custom"] = [k for k in (strs(d.get("chips_custom")) or []) if CHIP_KEY.match(k)]
    quiet = strs(d.get("chips_quiet"))
    out["chips_quiet"] = list(CHIPS_QUIET) if quiet is None else [k for k in quiet if k in CHIP_KINDS]
    out["pages"] = page_order(strs(d.get("pages")) or [])
    out["only_pages"] = page_order(strs(d.get("only_pages")) or [])
    # scenes: scene entities and "page:<kind>" -- a pill that opens a page,
    # placed among them; which pages have a pill at all is scenes_pages' to
    # say
    out["scenes"] = [k for k in out["scenes"] if ENTITY_ID.match(k) or
                     (k.startswith(SCENE_PAGE) and k[len(SCENE_PAGE):] in SCENE_PAGES)]
    out["scenes_pages"] = [k for k in (strs(d.get("scenes_pages")) or []) if k in PAGE_KINDS and k != "rooms"]
    out["custom_pages"] = [k for k in (strs(d.get("custom_pages")) or []) if PAGE_PATH.match(k)]
    hv = str(d.get("home_view") or "").strip()
    out["home_view"] = hv if PAGE_PATH.match(hv) else ""
    out["menu_top"] = list(dict.fromkeys(k for k in (strs(d.get("menu_top")) or []) if VIEW_PATH.match(k)))
    t = tab_position(d.get("tab_position"))
    out["tab_position"] = t if t is not None else ""
    out["tab_size"] = pick("tab_size", BOARD_TAB_SIZES)
    out["tab_size_phone"] = pick("tab_size_phone", BOARD_TAB_SIZES)
    out["glass"] = pick("glass", BOARD_GLASS)
    for k in ("frost", "blur"):
        out[k] = amount_or_none(d.get(k))
    # The screen's own Sky / Background: each flag stored as anything but a
    # boolean is not set (follow All Screens), as a backdrop id not in
    # SKY_BACKDROPS and stops that do not parse are (sky_stops()).
    for k in ("sky_animations", "sky_weather", "sky_decorations"):
        out[k] = d.get(k) if isinstance(d.get(k), bool) else None
    out["sky_decoration_style"] = d.get("sky_decoration_style") if d.get("sky_decoration_style") in ("old", "new") else None
    out["sky_cloud_style"] = d.get("sky_cloud_style") if d.get("sky_cloud_style") in CLOUD_STYLES else None
    out["sky_gradient"] = d.get("sky_gradient") if d.get("sky_gradient") in SKY_BACKDROP_IDS else None
    out["sky_custom"] = sky_stops(d.get("sky_custom"))
    out["sky_pages"] = sky_pages(d.get("sky_pages")) or {}
    for k in ("chips_row", "camera_strip", "scenes_row", "sky", "idle_return", "car", "kiosk", "popups",
              "now_playing", "screensaver", "home_page", "kiosk_header", "kiosk_sidebar", "kiosk_admins"):
        out[k] = bool(d.get(k, BOARD_DEFAULTS[k]))
    user = str(d.get("tablet_user") or "").strip()
    out["tablet_user"] = user if re.fullmatch(r"[A-Za-z0-9_.@ -]{1,64}", user) else ""
    for k in ("wallpanel_options", "kiosk_options"):
        out[k] = card_options(d.get(k)) or {}
    # A SCREEN'S SCREENSAVER OPTIONS, AS STORED: its own (a mapping), or null
    # -- the settings for All Screens, filled in on reading (resolved()). A
    # screen that never had any keeps its old WallPanel choices as its own
    # (1.2 -> 1.3), or follows All Screens.
    own = d.get("screensaver_options", _MISSING)
    if own is None:
        out["screensaver_options"] = None
    elif isinstance(own, dict) and own:
        out["screensaver_options"] = saver_options(own) or saver_options(None, out["wallpanel_options"])
    else:
        legacy = saver_options(None, out["wallpanel_options"])
        out["screensaver_options"] = legacy if legacy != SAVER_DEFAULTS else None
    out["screensaver_engine"] = d.get("screensaver_engine") if d.get("screensaver_engine") in SAVER_ENGINES else "hk"
    # WHO HIDES THE HEADER: HK Frontend (1.3), unless the screen is still
    # tuned for the Kiosk Mode plugin. A 1.2 screen whose Kiosk Mode Options
    # say only what HK Frontend can (kiosk_from_plugin) moves over with them;
    # any other options keep the plugin, and so everything they say.
    eng = d.get("kiosk_engine")
    if eng in KIOSK_ENGINES:
        out["kiosk_engine"] = eng
    else:
        same = kiosk_from_plugin(out["kiosk_options"])
        out["kiosk_engine"] = "hk" if same is not None else "kiosk_mode"
        for k, v in (same or {}).items():
            if k not in d:
                out[k] = v
    live = str(d.get("camera_live") or "").strip()
    out["camera_live"] = live if re.fullmatch(r"(input_select|select)\.[a-z0-9_]+", live) else ""
    room = str(d.get("idle_room") or "").strip()
    out["idle_room"] = room if re.fullmatch(r"[a-z0-9_]*", room) else ""
    return out


def kiosk_from_plugin(o: Mapping[str, Any] | None) -> dict[str, bool] | None:
    """A 1.2 screen's Kiosk Mode Options, as HK Frontend's own kiosk
    settings -- or None when they say something HK Frontend can't (any
    other option of the plugin's, or admins seeing only part of what is
    hidden). The 1.2 page wrote hide_header, hide_sidebar and
    admin_settings; a screen that only ever used those moves over as it was."""
    o = dict(o or {})
    if set(o) - {"hide_header", "hide_sidebar", "admin_settings"}:
        return None
    header, sidebar = o.get("hide_header", True), o.get("hide_sidebar", True)
    admin = o.get("admin_settings", {})
    if not isinstance(header, bool) or not isinstance(sidebar, bool) or not isinstance(admin, dict) \
            or set(admin) - {"hide_header", "hide_sidebar"}:
        return None
    if not admin:
        return {"kiosk_header": header, "kiosk_sidebar": sidebar, "kiosk_admins": True}
    # admins: all of it shown (HK's For Admins Too off), or the same as everyone
    shown = {"hide_header": header, "hide_sidebar": sidebar}
    if all(admin.get(k, shown[k]) is False or not shown[k] for k in shown):
        return {"kiosk_header": header, "kiosk_sidebar": sidebar, "kiosk_admins": False}
    if all(admin.get(k, shown[k]) == shown[k] for k in shown):
        return {"kiosk_header": header, "kiosk_sidebar": sidebar, "kiosk_admins": True}
    return None


# ------------------------------------------------------------ the pop-ups
# POP-UPS ARE ITEMS TOO: a subentry of type "popup" each, listed
# under Pop-ups on the integration's page. A pop-up is a hash -- `#doorbell`
# on any dashboard's URL opens it, which is how an automation that loads
# `<dashboard>/0#doorbell` on a tablet works -- and what it shows:
#   camera       a camera's sheet, the picture to every edge, with its speaker
#                for talk-back (the doorbell)
#   alarm        the alarm keypad sheet
#   accessories  a sheet of several accessories, the way a room's are shown
#   cards        CUSTOM: the house's own cards, in YAML, on the
#                same sheet -- a narrow one (460) or a wide one (820), with
#                its own glyph in the header
# on every dashboard, or only those listed. A YAML hk-popup-card on the page
# that claims the same hash wins (the card over the house).
SUBENTRY_POPUP = "popup"
POPUP_KINDS = ("camera", "alarm", "accessories", "cards")
POPUP_WIDTHS = ("narrow", "wide")
POPUP_CARDS_MAX = 100000
POPUP_HASH = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
POPUP_DEFAULTS: dict[str, Any] = {
    "name": "", "kind": "camera", "entity": "", "speaker": "", "stream": "",
    "entities": [], "dashboards": [], "close_after": 60, "cards": [], "icon": "", "width": "narrow"}


def popup_cards(v: Any) -> list[dict[str, Any]] | None:
    """A custom pop-up's cards as stored: a list of cards (a single card, or
    a view's `cards:`, is taken as that list), not huge; None when it is not
    one."""
    import json
    if isinstance(v, dict):
        v = v.get("cards") if isinstance(v.get("cards"), list) and "type" not in v else [v] if v else []
    if v is None or v == "":
        v = []
    if not isinstance(v, list) or not all(isinstance(c, dict) and isinstance(c.get("type"), str) for c in v):
        return None
    try:
        text = json.dumps(v)
    except (TypeError, ValueError):
        return None
    return json.loads(text) if len(text) <= POPUP_CARDS_MAX else None


def slug(text: str) -> str:
    """A pop-up's hash from its name: "Front Door" -> front-door."""
    s = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower().replace("'", "").replace("\u2019", "")).strip("-")
    return s[:40]


def popup(data: Mapping[str, Any] | None, hash_: str = "") -> dict[str, Any]:
    """One pop-up's settings over the defaults, each value checked."""
    out = copy.deepcopy(POPUP_DEFAULTS)
    d = dict(data or {})
    out["hash"] = hash_ if POPUP_HASH.match(hash_ or "") else slug(d.get("name") or "")
    out["name"] = str(d.get("name") or "").strip()[:60]
    out["kind"] = d.get("kind") if d.get("kind") in POPUP_KINDS else "camera"
    ent = lambda v, dom: v if isinstance(v, str) and re.fullmatch(rf"({dom})\.[a-z0-9_]+", v) else ""  # noqa: E731
    out["entity"] = ent(d.get("entity"), "camera" if out["kind"] == "camera" else "alarm_control_panel")
    out["speaker"] = ent(d.get("speaker"), "media_player")
    out["stream"] = ent(d.get("stream"), "camera")
    out["entities"] = [e for e in (d.get("entities") or []) if isinstance(e, str) and "." in e]
    out["dashboards"] = [p for p in (d.get("dashboards") or []) if isinstance(p, str) and p]
    if out["kind"] == "cards":
        out["cards"] = popup_cards(d.get("cards")) or []
        icon = d.get("icon")
        out["icon"] = icon if isinstance(icon, str) and re.fullmatch(r"(mdi|hk):[a-z0-9-]+", icon) else ""
        out["width"] = d.get("width") if d.get("width") in POPUP_WIDTHS else "narrow"
    try:
        out["close_after"] = int(min(max(float(d.get("close_after", 60)), 10), 3600))
    except (TypeError, ValueError):
        pass
    return out


# ------------------------------------------------------------ custom pages
# A CUSTOM PAGE: a page the house writes itself -- its cards in YAML -- kept
# by the integration as an item of its own (like a pop-up) and shown by any
# generated dashboard that lists it on its Pages page. An Energy page, say,
# lives here rather than in a hand-written dashboard, so no screen depends on
# a YAML file. Its address is the view
# path (and the item's unique id): not one a generated page uses itself, not a
# room page's.
SUBENTRY_PAGE = "page"
PAGE_PATH = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
PAGE_RESERVED = ("home", "weather", "calendar", "cameras", "live-tv", "security", "doors-windows", "climate", "lights",
                 "timers", "vacuums", "playmusic", "music-browse", "water")
PAGE_VIEW_MAX = 300000
PAGE_OWN_KEYS = ("title", "path", "icon")


def page_path_ok(path: str) -> bool:
    return bool(PAGE_PATH.match(path or "")) and path not in PAGE_RESERVED and not path.startswith("room-")


def page_order(keys: list[str]) -> list[str]:
    """A dashboard's page list: page kinds, Browse Music and custom page
    addresses, each once, in the order given."""
    out: list[str] = []
    for k in keys:
        if k in out:
            continue
        if k in PAGE_KINDS or k == PAGE_BROWSE or page_path_ok(k):
            out.append(k)
    return out


def page_view(v: Any) -> dict[str, Any] | None:
    """A page's view as stored -- a mapping, not huge -- less what the page
    keeps itself (its title, address and icon); None when it is not one."""
    import json
    if v in (None, "", {}):
        return {"cards": []}
    if not isinstance(v, dict):
        return None
    try:
        text = json.dumps(v)
    except (TypeError, ValueError):
        return None
    if len(text) > PAGE_VIEW_MAX:
        return None
    out = json.loads(text)
    for k in PAGE_OWN_KEYS:
        out.pop(k, None)
    return out


def custom_page(data: Mapping[str, Any] | None, path: str) -> dict[str, Any]:
    d = dict(data or {})
    icon = d.get("icon")
    return {"path": path, "title": str(d.get("title") or path).strip()[:40],
            "icon": icon if isinstance(icon, str) and re.fullmatch(r"(mdi|hk):[a-z0-9-]+", icon) else "",
            "view": page_view(d.get("view")) or {"cards": []}}


# ------------------------------------------------------------ custom chips
# A CUSTOM CHIP: a status chip the house writes itself -- its card in YAML,
# anything a chip row can hold (an hk-status-chip-card, or one inside a
# conditional that shows it only sometimes) -- kept as an item of its own and
# shown by any screen that lists it (the board's chips_custom). It sits after
# a kind (`after`), at the start or the end, unless a screen's own chip order
# places it (the token "chip:<key>"). It is what `extra:` on a YAML chip row
# does (a house battery or mail chip, say), written once for every screen.
SUBENTRY_CHIP = "chip"


def taken_ids(entry: ConfigEntry, exclude: str | None = None) -> set[str]:
    """Every item's unique id, of EVERY type: Home Assistant refuses a new
    item whose unique id any other item of the entry has, whatever its type.
    Checked per type, a chip named "Energy" beside the Energy page -- or a
    pop-up #alarm beside the Alarm PIN's item -- got a raw already_configured
    ("Couldn't save.") instead of a place of its own."""
    return {s.unique_id for s in entry.subentries.values() if s.unique_id and s.unique_id != exclude}
CHIP_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
CHIP_TOKEN = "chip:"
CHIP_CARD_MAX = 20000


def chip_card(v: Any) -> dict[str, Any] | None:
    """A custom chip's card as stored -- a mapping with a type, not huge."""
    import json
    if not isinstance(v, dict) or not isinstance(v.get("type"), str) or not v["type"]:
        return None
    try:
        text = json.dumps(v)
    except (TypeError, ValueError):
        return None
    return json.loads(text) if len(text) <= CHIP_CARD_MAX else None


def custom_chip(data: Mapping[str, Any] | None, key: str) -> dict[str, Any]:
    d = dict(data or {})
    after = d.get("after")
    return {"key": key, "name": str(d.get("name") or key).strip()[:40],
            "after": after if after in ("start", "end") or after in CHIP_KINDS else "end",
            "card": chip_card(d.get("card")) or {"type": "custom:hk-status-chip-card", "name": str(d.get("name") or key)}}


def custom_chips(entry: ConfigEntry | None) -> list[dict[str, Any]]:
    """Every custom chip, by name."""
    out = [custom_chip(sub.data, sub.unique_id or "")
           for sub in (entry.subentries.values() if entry is not None else ())
           if sub.subentry_type == SUBENTRY_CHIP and sub.unique_id]
    return sorted(out, key=lambda c: c["name"].lower())


def custom_pages(entry: ConfigEntry | None) -> list[dict[str, Any]]:
    """Every custom page, by title."""
    out = [custom_page(sub.data, sub.unique_id or "")
           for sub in (entry.subentries.values() if entry is not None else ())
           if sub.subentry_type == SUBENTRY_PAGE and sub.unique_id]
    return sorted(out, key=lambda p: p["title"].lower())


def popups(entry: ConfigEntry | None) -> list[dict[str, Any]]:
    """Every pop-up, by name."""
    out = [popup(sub.data, sub.unique_id or "")
           for sub in (entry.subentries.values() if entry is not None else ())
           if sub.subentry_type == SUBENTRY_POPUP and sub.unique_id]
    return sorted(out, key=lambda p: (p["name"] or p["hash"]).lower())


# A SCREEN'S ROOM SETTINGS and All Screens' (settings `rooms`) they follow
# unless the screen sets its own (rooms_custom)
ROOM_KEYS = {"room_order": "order", "home_rooms": "home", "menu_rooms": "menu", "page_rooms": "pages"}
# A SCREEN'S MENU KEYS and All Screens' (settings `menu`) they follow. `menu`
# is special: off and always open are the screen's own, and only a button's
# style follows (MENU_STYLES).
MENU_KEYS = {"menu": "style", "narrow": "narrow", "tab_position": "tab_at", "tab_size": "tab_size",
             "tab_size_phone": "tab_size_phone", "dock_min": "open_min", "time_weather": "time_weather_at",
             "ha_row": "ha_row", "accent": "accent", "glyph": "glyph", "clock": "clock", "swipe": "swipe",
             "tab_bar_scroll": "bar_scroll", "tab_bar_rooms": "bar_rooms", "tab_bar_glass": "bar_glass",
             "tab_bar_more": "bar_more"}
# a menu BUTTON's styles: not off, always open or the tab bar
MENU_STYLES = tuple(m for m in BOARD_MENUS if m not in ("off", "open", "tabbar"))


def accent(v: Any) -> str | None:
    """A menu highlight as stored: a name in ACCENTS or "#rrggbb" (lower
    case); None for anything else."""
    t = str(v or "").strip().lower()
    return t if t in ACCENTS or ACCENT_HEX.match(t) else None


def house_menu(menu: Mapping[str, Any] | None) -> dict[str, Any]:
    """All Screens' menu settings, each checked, as a screen's keys (`menu`
    is the button style)."""
    m = dict(menu or {})
    d = BOARD_DEFAULTS
    pick = lambda k, allowed, dflt: m.get(k) if m.get(k) in allowed else dflt  # noqa: E731
    t = tab_position(m.get("tab_at"))
    try:
        dock = int(min(max(float(m.get("open_min") or 1000), DOCK_MIN[0]), DOCK_MIN[1]))
    except (TypeError, ValueError):
        dock = d["dock_min"]
    return {"menu": pick("style", MENU_STYLES, "auto"),
            "narrow": pick("narrow", BOARD_NARROW, d["narrow"]),
            "tab_position": t if t is not None else "",
            "tab_size": pick("tab_size", BOARD_TAB_SIZES, d["tab_size"]),
            "tab_size_phone": pick("tab_size_phone", BOARD_TAB_SIZES, d["tab_size_phone"]),
            "dock_min": dock,
            "time_weather": pick("time_weather_at", BOARD_TIME, d["time_weather"]),
            "ha_row": bool(m.get("ha_row", False)),
            "accent": accent(m.get("accent")) or d["accent"],
            "glyph": pick("glyph", MENU_GLYPHS, d["glyph"]),
            "clock": m.get("clock") is not False,
            "swipe": m.get("swipe") is True,
            "tab_bar_scroll": pick("bar_scroll", TAB_BAR_SCROLLS, d["tab_bar_scroll"]),
            "tab_bar_rooms": tab_bar_rooms(m.get("bar_rooms")),
            "tab_bar_glass": pick("bar_glass", TAB_BAR_GLASS, d["tab_bar_glass"]),
            "tab_bar_more": pick("bar_more", TAB_BAR_MORE, d["tab_bar_more"])}
AREA_ID = re.compile(r"^[a-z0-9_]+$")


def house_rooms(rooms: Mapping[str, Any] | None) -> dict[str, Any]:
    """All Screens' room settings, each checked, as a screen's keys."""
    r = dict(rooms or {})
    order = [a for a in r.get("order") or [] if isinstance(a, str) and AREA_ID.match(a)] \
        if isinstance(r.get("order"), list) else []
    return {"room_order": list(dict.fromkeys(order)),
            "home_rooms": r.get("home") if r.get("home") in BOARD_HOME_ROOMS else BOARD_DEFAULTS["home_rooms"],
            "menu_rooms": r.get("menu") if r.get("menu") in BOARD_MENU_ROOMS else BOARD_DEFAULTS["menu_rooms"],
            "page_rooms": r.get("pages") if r.get("pages") in BOARD_PAGE_ROOMS else BOARD_DEFAULTS["page_rooms"]}


def resolved(b: Mapping[str, Any], options: Mapping[str, Any] | None,
             house: Mapping[str, Any] | None = None, rooms: Mapping[str, Any] | None = None,
             menu: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """A screen's settings as READ: a null screensaver_options filled in with
    All Screens' (`house`, or read from `options`), and `screensaver_house`
    saying which it is; its rooms, All Screens' (`rooms`, or read from
    `options`) unless it sets its own, `rooms_house` saying which; and its
    menu settings the same way (`menu`, `menu_house`) -- off and always open
    staying the screen's own."""
    out = dict(b)
    own = b.get("screensaver_options")
    if own is None and house is None:
        house = merged(options)["look"]["saver"]
    out["screensaver_house"] = own is None
    out["screensaver_options"] = dict(house) if own is None else own
    out["rooms_house"] = not b.get("rooms_custom")
    if out["rooms_house"]:
        out.update(house_rooms(merged(options)["rooms"] if rooms is None else rooms))
    out["menu_house"] = not b.get("menu_custom")
    if out["menu_house"]:
        hm = house_menu(merged(options)["menu"] if menu is None else menu)
        style = hm.pop("menu")
        out.update(hm)
        if out.get("menu") in MENU_STYLES:
            out["menu"] = style
    return out


def preset_menu(data: Mapping[str, Any], preset: Mapping[str, Any],
                options: Mapping[str, Any] | None) -> dict[str, Any]:
    """A new screen from a preset (SCREEN_PRESETS): it follows All Screens'
    menu unless the preset chooses a menu setting All Screens' differs on
    (a wall tablet's time and weather in the menu), when it starts with its
    own (menu_custom). Whether it has a menu is its own either way."""
    house = house_menu(merged(options)["menu"])
    keys = [k for k in preset if k in MENU_KEYS and k != "menu"]
    return {**data, "menu_custom": any(json.dumps(data[k]) != json.dumps(house[k]) for k in keys)}


# Which of a screen's menu keys show at all, by its menu: a button never
# docks, an always-open menu has no button style; off shows none. The edge
# tab's only where the screen shows it (hk-settings-model.js showsTab).
_MENU_SHOWN = {"button": ("menu", "narrow", "ha_row"),
               "open": ("dock_min", "narrow", "time_weather", "ha_row")}
_MENU_TAB = ("tab_position", "tab_size", "tab_size_phone")
_TAB_STYLES = ("auto", "chip_scroll", "chip_home", "tab")


def _menu_shown(b: Mapping[str, Any]) -> tuple[str, ...]:
    kind = "button" if b["menu"] in MENU_STYLES else b["menu"]
    keys = _MENU_SHOWN.get(kind, ())
    tab = (kind == "button" and b["menu"] in _TAB_STYLES) or b["narrow"] in ("tab", "chip_scroll")
    return keys + _MENU_TAB if keys and tab else keys


def menu_lifted(options: Mapping[str, Any] | None, items: Mapping[str, Mapping[str, Any]]
                ) -> tuple[dict[str, Any] | None, dict[str, dict[str, Any]]]:
    """THE MENU MOVES TO ALL SCREENS (entry 1.9, 2026-10-02), as the rooms
    did. Each of a screen's menu settings becomes All Screens' as most of the
    screens it SHOWS on have it (a button's style among the buttons, Keep
    Open Down To among the always-open, ...; ties: the first screen's); the
    icon and the clock tap were All Screens' already. A screen whose own
    match on everything it shows follows All Screens from now on; one that
    differs keeps its own (menu_custom). Returns (new options or None:
    unchanged, {path: new item data}). A house that already has All Screens'
    menu style is left alone."""
    stored = dict((options or {}).get(CONF_DASHBOARD) or {})
    if "style" in (stored.get("menu") or {}):
        return None, {}
    boards_ = {p: board(d) for p, d in items.items()}
    shown = {p: _menu_shown(b) for p, b in boards_.items()}
    picked: dict[str, Any] = {}
    for k in ("menu", "narrow", "tab_position", "tab_size", "tab_size_phone", "dock_min", "time_weather", "ha_row"):
        seen = [json.dumps(b[k]) for p, b in boards_.items() if k in shown[p]]
        picked[k] = json.loads(max(dict.fromkeys(seen), key=seen.count)) if seen else BOARD_DEFAULTS[k]
    if picked["menu"] not in MENU_STYLES:
        picked["menu"] = "auto"
    old = dict(stored.get("menu") or {})
    menu = {**old, **{MENU_KEYS[k]: v for k, v in picked.items()}}
    new_options = {**(options or {}), CONF_DASHBOARD: {**stored, "menu": menu}}
    out = {}
    for p, d in items.items():
        b = boards_[p]
        differs = any(json.dumps(b[k]) != json.dumps(picked[k]) for k in shown[p])
        out[p] = {**d, "menu_custom": differs}
        if differs:
            # its own copy starts from what it showed: the shared look too
            out[p].update({"glyph": old.get("glyph", "sidebar") if old.get("glyph") in MENU_GLYPHS else "sidebar",
                           "clock": old.get("clock") is not False})
    return new_options, out


def status_lifted(options: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """THE STATUS ROWS (entry 1.10, 2026-10-04): the Climate page's row
    (`climate`, 1.4.6) becomes one of the pages' (status_rows.climate), and a
    room status row saved before gains what the row can show now -- the
    security system, TVs, lights, valves and speakers. A list saved before was
    always in the house order, so the new kinds go in their places in it.
    Returns the new options, or None: unchanged."""
    stored = dict((options or {}).get(CONF_DASHBOARD) or {})
    changed = False
    old = stored.pop("climate", None)
    if isinstance(old, dict):
        rows = dict(stored.get("status_rows") or {})
        rows.setdefault("climate", {"status": old.get("status", list(STATUS_ROWS["climate"][1])),
                                    "exclude_areas": old.get("exclude_areas", [])})
        stored["status_rows"] = rows
        changed = True
    elif old is not None:
        changed = True
    rooms = dict(stored.get("rooms") or {})
    if isinstance(rooms.get("status"), list):
        saved = rooms["status"]
        rooms["status"] = [k for k in STATUS_KINDS if k in saved or k in STATUS_KINDS_ADDED]
        stored["rooms"] = rooms
        changed = changed or rooms["status"] != saved
    if not changed:
        return None
    return {**(options or {}), CONF_DASHBOARD: stored}


def rooms_lifted(options: Mapping[str, Any] | None, items: Mapping[str, Mapping[str, Any]]
                 ) -> tuple[dict[str, Any] | None, dict[str, dict[str, Any]]]:
    """THE ROOMS MOVE TO ALL SCREENS (entry 1.8, 2026-10-01). Before, each
    screen held its own room order, Home's rooms, the menu's and the pages'
    -- a house with five tablets kept five copies of one order. The room
    settings the most screens chose (counting only screens that chose any)
    become All Screens'; a screen with exactly those, or with none of its
    own, follows All Screens from now on; one that differs keeps its own
    (rooms_custom). Returns (new options or None: unchanged, {path: new
    item data}). A house that already has All Screens' order is left alone."""
    stored = dict((options or {}).get(CONF_DASHBOARD) or {})
    if "order" in (stored.get("rooms") or {}):
        return None, {}
    keys = tuple(ROOM_KEYS)
    defaults = tuple(json.dumps(BOARD_DEFAULTS[k]) for k in keys)
    sig = {p: tuple(json.dumps(board(d)[k]) for k in keys) for p, d in items.items()}
    chosen = [s for s in sig.values() if s != defaults]
    if not chosen:
        return None, {p: {**d, "rooms_custom": False} for p, d in items.items()}
    top = max(dict.fromkeys(chosen), key=chosen.count)         # ties: the first screen's
    picked = {k: json.loads(v) for k, v in zip(keys, top)}
    rooms = {**(stored.get("rooms") or {}), **{ROOM_KEYS[k]: picked[k] for k in keys}}
    new_options = {**(options or {}), CONF_DASHBOARD: {**stored, "rooms": rooms}}
    return new_options, {p: {**d, "rooms_custom": sig[p] not in (top, defaults)} for p, d in items.items()}


def boards(entry: ConfigEntry | None) -> dict[str, dict[str, Any]]:
    """Every dashboard item's settings, by url path (as read: resolved())."""
    out: dict[str, dict[str, Any]] = {}
    m = merged(entry.options if entry is not None else None)
    house, rooms, menu = m["look"]["saver"], m["rooms"], m["menu"]
    for sub in (entry.subentries.values() if entry is not None else ()):
        if sub.subentry_type == SUBENTRY_DASHBOARD and sub.unique_id:
            out[sub.unique_id] = resolved(board(sub.data), None, house, rooms, menu)
    return out


def legacy_screens(items: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """The idle return's and the car viewport's lists, read off the items.
    NOT a shim: hk-idle.js and tesla-viewport.js read only these
    (`idle.dashboards/rooms`, `car.dashboards`), so they must keep being
    sent."""
    idle = [p for p, b in items.items() if b["idle_return"]]
    return {"idle": {"dashboards": idle,
                     "rooms": {p: items[p]["idle_room"] for p in idle if items[p]["idle_room"]}},
            "car": {"dashboards": [p for p, b in items.items() if b["car"]]}}


def legacy_lists(items: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """The menu's older house-wide lists, read off the items -- for a screen
    still running an older hk-base.js until it reloads."""
    on = [p for p, b in items.items() if b["menu"] not in ("off", "tabbar")]
    docked = [p for p in on if items[p]["menu"] == "open"]
    # one button style, one tab position, one set of categories for all: the
    # older file knows no other. The buttons' shared choice when they agree
    # (a migrated entry always does), else automatic.
    styles = {items[p]["menu"] for p in on if items[p]["menu"] in MENU_BUTTONS}
    first = items[(on or list(items))[0]] if items else board(None)
    return {"dashboards": on, "docked": docked,
            "time_weather": [p for p in docked if items[p]["time_weather"] == "menu"],
            "ha_sidebar": [p for p in on if items[p]["ha_row"]],
            "dock_min": items[docked[0]]["dock_min"] if docked else 1000,
            "button": styles.pop() if len(styles) == 1 else "auto",
            "tab_position": first["tab_position"], "categories": list(first["categories"]),
            "order": "dashboard" if first["menu_rooms"] == "order" else "az"}


# ------------------------------------------------------------ text fields
# Two settings are small tables. The UI edits them as plain text, one row per
# line, because a list-of-objects selector does not exist -- and a format
# a person can read back is better than one only a form can.
_BIRTHDAY = re.compile(r"^\s*(.+?)\s+(\d{1,2})-(\d{1,2})\s*$")
_ROOM = re.compile(r"^\s*([A-Za-z0-9_-]+)\s*=\s*([a-z0-9_]+)\s*$")


def parse_birthdays(text: str) -> list[dict[str, Any]] | None:
    """'Name MM-DD' per line -> [{name, month, day}], or None if a line is bad."""
    out = []
    for line in (text or "").splitlines():
        if not line.strip():
            continue
        m = _BIRTHDAY.match(line)
        if not m:
            return None
        month, day = int(m.group(2)), int(m.group(3))
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None
        out.append({"name": m.group(1), "month": month, "day": day})
    return out


def format_birthdays(rows: list[dict[str, Any]]) -> str:
    return "\n".join(f"{b['name']} {b['month']:02d}-{b['day']:02d}" for b in rows or [])


def parse_rooms(text: str) -> dict[str, str] | None:
    """'dashboard-kitchen = kitchen' per line -> {dashboard: room}, or None."""
    out = {}
    for line in (text or "").splitlines():
        if not line.strip():
            continue
        m = _ROOM.match(line)
        if not m:
            return None
        out[m.group(1)] = m.group(2)
    return out


def format_rooms(rooms: dict[str, str]) -> str:
    return "\n".join(f"{d} = {r}" for d, r in (rooms or {}).items())


def suggestions(hass: HomeAssistant) -> dict[str, Any]:
    """What a house that has never saved Status & Chips probably wants: every
    lock, every door and window contact, every garage door -- a garage_door
    contact or a garage/gate COVER (the door itself is usually a cover; a
    contact named "Garage Door" is often the door INTO the garage, and its
    device_class says door, so it is offered as one). Offered as the
    form's starting point only -- nothing is saved until the form is."""
    doors, windows, garage, locks = [], [], [], []
    alarm = None
    for st in sorted(hass.states.async_all(), key=lambda s: s.entity_id):
        eid, dc = st.entity_id, st.attributes.get("device_class")
        if eid.startswith("lock."):
            locks.append(eid)
        elif eid.startswith("alarm_control_panel.") and alarm is None:
            alarm = eid
        elif eid.startswith("binary_sensor.") and dc == "door":
            doors.append(eid)
        elif eid.startswith("binary_sensor.") and dc == "window":
            windows.append(eid)
        elif eid.startswith("binary_sensor.") and dc == "garage_door":
            garage.append(eid)
        elif eid.startswith("cover.") and dc in ("garage", "gate"):
            garage.append(eid)
    return {"alarm": alarm, "locks": locks, "doors": doors, "windows": windows,
            "garage": garage}
