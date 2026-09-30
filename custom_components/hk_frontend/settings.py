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
_MMDD = re.compile(r"^\s*(\d{1,2})-(\d{1,2})\s*$")


def parse_mmdd(text: str | None) -> str | bool | None:
    """'12-01' -> '12-01'; empty -> None; anything else -> False."""
    if not (text or "").strip():
        return None
    m = _MMDD.match(text)
    if not m or not (1 <= int(m.group(1)) <= 12 and 1 <= int(m.group(2)) <= 31):
        return False
    return f"{int(m.group(1)):02d}-{int(m.group(2)):02d}"


# The menu (hk-sidebar.js) and the room pages (docs/Menu.md, docs/Pages.md).
#   button: auto -- the pinned chip when the dashboard's Home view carries a
#           menu button card, else the edge tab; chip; tab. Phones always get
#           the round button (a phone's margin has no room for a tab).
#   glyph:  the button's picture -- the iPad sidebar glyph, or three lines.
#   order:  the Rooms list, A to Z or in the dashboard's own view order.
MENU_BUTTONS = ("auto", "chip", "tab")
MENU_GLYPHS = ("sidebar", "lines")
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


# What a room page's status row may show, in the order it shows them
# (the Home app's own: readings, then accessories, then sensors).
STATUS_KINDS =("temperature", "humidity", "outlets", "blinds", "fans", "windows",
                "doors", "locks", "garage", "motion", "occupancy", "leaks")

DEFAULTS: dict[str, dict[str, Any]] = {
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
            "decorations": True,
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
    # out of What counts, everywhere) and what to add. A dashboard's own YAML
    # options add to these. (Which parts a screen shows -- chips, pages, sky,
    # rooms -- is each screen's own, and a dashboard's YAML can say
    # `chips: false` and the like.)
    "generated": {"exclude_areas": [], "exclude_devices": [], "exclude_entities": [],
                  "include_entities": []},
    # WHAT COUNTS (kinds.py): each kind's Leave out / Also count, by kind;
    # None = nothing saved, so the kind is automatic (or its older list,
    # kinds.LEGACY).
    "counts": kinds.blank(),
    # Entities single cards fall back to when their config does not name one.
    "features": {"vacuum_script": None, "alarm_bad_code": None,
                 # thermostats: the older list What counts replaced
                 # (kinds.LEGACY) -- read only while "thermostats" is unsaved.
                 # temperature: the indoor temperature the Climate chip shows
                 # (else the first thermostat's); power: the house's power
                 # draw, for the Energy chip. Both on the What counts page.
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
             "ha_sidebar": []},
    # The room pages: whether room headings on Home open them, and what the
    # status row shows.
    "rooms": {"headings": True, "status": list(STATUS_KINDS)},
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
              extras: dict[str, Any] | None = None) -> dict[str, Any]:
    """What a screen is handed. The same for every user: the house-wide
    sections, and `boards` -- each dashboard item's own menu settings, by
    url path. The menu's older lists (dashboards, docked, ...) are filled in
    from the items too, so a screen still running an older hk-base.js (the
    first load after an update) keeps its menu until it reloads.

    `kinds` (found): What counts, resolved (kinds.py) -- each kind's entity
    ids. The raw Leave out / Also count stay here; a screen needs only the
    answer. The older lists the header and the generated dashboard read
    (security.locks ..., features.thermostats) are the same answer, for a
    screen still running older files."""
    out = {"configured": entry is not None, **merged(entry.options if entry else None)}
    del out["counts"]
    items = boards(entry)
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
# row, its categories and its room order. Only the menu's icon, the clock tap
# and the room pages' status line are shared by every screen (HK Settings ->
# Menu & Rooms). docs/Menu.md and docs/Screens.md.
SUBENTRY_DASHBOARD = "dashboard"
# menu: off, a button (automatic / the pinned chip / the edge tab), or open
# (always beside the page, folding to the automatic button when narrower
# than dock_min).
# chip_scroll: the chip, and the edge tab slides in while it is scrolled out
# of sight; chip_home: that on Home, the tab on every other page.
BOARD_MENUS = ("off", "auto", "chip", "chip_scroll", "chip_home", "tab", "open")
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
PAGE_KINDS = ("weather", "cameras", "live_tv", "security", "doors_windows", "climate", "lights",
              "timers", "vacuums", "music", "water", "rooms")
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
# scrolled past, or the edge tab (hk-base.js narrowStyle)
BOARD_NARROW = ("chip", "chip_scroll", "tab")
# what a phone shows at the top of Home: the clock and weather header, or the
# one-line weather strip (a generated screen; a YAML one draws its own)
BOARD_PHONE = ("header", "strip")
VIEW_PATH = re.compile(r"^[A-Za-z0-9_.-]{1,60}$")
BOARD_DEFAULTS: dict[str, Any] = {
    # the menu
    "menu": "auto", "dock_min": 1000, "time_weather": "page", "ha_row": False,
    "categories": [], "tab_position": "", "room_order": [],
    "menu_rooms": "az", "home_rooms": "as_is", "page_rooms": "floor",
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
    # kiosk: a generated dashboard hides Home Assistant's header and sidebar
    # (the kiosk-mode plugin); a hand-written one says so in its own YAML.
    "kiosk": False,
    # popups: this dashboard answers the house's pop-ups (Pop-ups) -- off for
    # a screen that must never be covered (a car's)
    "popups": True,
    # a GENERATED wall tablet's own: the now-playing bar, and the photo
    # screensaver (WallPanel) for the tablet's HA user -- the sky pauses
    # behind it
    "now_playing": False, "screensaver": False, "tablet_user": "",
    # a GENERATED dashboard's third-party cards' own options (YAML), over the
    # tuned settings: WallPanel's and Kiosk Mode's
    "wallpanel_options": {}, "kiosk_options": {},
    # the house's CUSTOM PAGES this generated dashboard shows (their
    # addresses, in this order), after its category pages and before the
    # rooms
    "custom_pages": [],
    # HOME PAGE: off, a generated screen is only its custom pages and opens
    # on the first -- an Energy dashboard in the sidebar, say
    "home_page": True,
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
    out["glass"] = pick("glass", BOARD_GLASS)
    for k in ("frost", "blur"):
        out[k] = amount_or_none(d.get(k))
    for k in ("chips_row", "camera_strip", "scenes_row", "sky", "idle_return", "car", "kiosk", "popups",
              "now_playing", "screensaver", "home_page"):
        out[k] = bool(d.get(k, BOARD_DEFAULTS[k]))
    user = str(d.get("tablet_user") or "").strip()
    out["tablet_user"] = user if re.fullmatch(r"[A-Za-z0-9_.@ -]{1,64}", user) else ""
    for k in ("wallpanel_options", "kiosk_options"):
        out[k] = card_options(d.get(k)) or {}
    live = str(d.get("camera_live") or "").strip()
    out["camera_live"] = live if re.fullmatch(r"(input_select|select)\.[a-z0-9_]+", live) else ""
    room = str(d.get("idle_room") or "").strip()
    out["idle_room"] = room if re.fullmatch(r"[a-z0-9_]*", room) else ""
    return out


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
PAGE_RESERVED = ("home", "weather", "cameras", "live-tv", "security", "doors-windows", "climate", "lights",
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


def boards(entry: ConfigEntry | None) -> dict[str, dict[str, Any]]:
    """Every dashboard item's settings, by url path."""
    out: dict[str, dict[str, Any]] = {}
    for sub in (entry.subentries.values() if entry is not None else ()):
        if sub.subentry_type == SUBENTRY_DASHBOARD and sub.unique_id:
            out[sub.unique_id] = board(sub.data)
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
    on = [p for p, b in items.items() if b["menu"] != "off"]
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
    """What a house that has never saved What counts probably wants: every
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
