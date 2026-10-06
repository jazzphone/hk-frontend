"""THE SETTINGS PAGE'S WRITES: one change, checked, saved.

The HK Settings page (panels/hk-settings.js) is laid out as the Home app's
settings are -- every control saves as it changes -- so it cannot submit a
config flow's form (a form saves every field it holds, and one it does not
show would have to be sent whole). It sends only what changed instead:

    hk_frontend/settings/set  {"changes": {"look.glass": "blur", ...}}
    hk_frontend/board/set     {"dashboard": "dashboard-kitchen", "changes": {"menu": "open"}}

Each value is checked here with the same settings.py functions the flows and
the settings feed use (board(), tab_position(), card_options(), sky_date(),
kinds.clean() ...) and refused with the field's name when it is not one it
could be, rather than quietly turned into a default. Nothing is written
unless every change in the call is good. The storage is the entry's own (its
options and its dashboard items), so the page and the flows can be used side
by side.
"""
from __future__ import annotations

from collections.abc import Callable, Mapping
import re
from typing import Any

from . import kinds as K
from . import settings as S

ENTITY = re.compile(r"^([a-z0-9_]+)\.[a-z0-9_]+$")


class Invalid(ValueError):
    """A value that cannot be saved: `code` says why (the page words it)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# ------------------------------------------------------------ the checks
def _entity(*domains: str) -> Callable[[Any], str | None]:
    def check(v: Any) -> str | None:
        if v in (None, ""):
            return None
        m = ENTITY.match(v) if isinstance(v, str) else None
        if not m or (domains and m.group(1) not in domains):
            raise Invalid("entity")
        return v
    return check


def _entities(*domains: str) -> Callable[[Any], list[str]]:
    one = _entity(*domains)

    def check(v: Any) -> list[str]:
        if v in (None, ""):
            return []
        if not isinstance(v, list):
            raise Invalid("list")
        out: list[str] = []
        for x in v:
            e = one(x)
            if e and e not in out:
                out.append(e)
        return out
    return check


def _ids(v: Any) -> list[str]:
    """Area or device ids: plain strings, each once."""
    if v in (None, ""):
        return []
    if not isinstance(v, list) or not all(isinstance(x, str) and re.fullmatch(r"[A-Za-z0-9_-]+", x) for x in v):
        raise Invalid("list")
    return list(dict.fromkeys(v))


def _bool(v: Any) -> bool:
    if not isinstance(v, bool):
        raise Invalid("bool")
    return v


def _choice(options: tuple[str, ...] | list[str], none: bool = False) -> Callable[[Any], Any]:
    def check(v: Any) -> Any:
        if none and v in (None, ""):
            return None
        if v not in options:
            raise Invalid("choice")
        return v
    return check


def _subset(options: tuple[str, ...]) -> Callable[[Any], list[str]]:
    """Some of `options`, kept in THEIR order whatever order they came in."""
    def check(v: Any) -> list[str]:
        if not isinstance(v, list) or any(x not in options for x in v):
            raise Invalid("choice")
        return [k for k in options if k in v]
    return check


def _status_row(page: str) -> Callable[[Any], dict[str, Any]]:
    """A page's status row (settings.STATUS_ROWS): {status: what it shows, in
    its order; exclude_areas: the rooms it leaves out}. A key left out keeps
    its default."""
    kinds, default = S.STATUS_ROWS[page]
    status = _ordered(kinds)
    def check(v: Any) -> dict[str, Any]:
        if not isinstance(v, Mapping) or set(v) - {"status", "exclude_areas"}:
            raise Invalid("choice")
        return {"status": status(v.get("status", list(default))), "exclude_areas": _ids(v.get("exclude_areas"))}
    return check


def _ordered(options: tuple[str, ...] | list[str]) -> Callable[[Any], list[str]]:
    """Some of `options`, each once, in the order given (the page's order)."""
    def check(v: Any) -> list[str]:
        if not isinstance(v, list) or any(x not in options for x in v):
            raise Invalid("choice")
        return list(dict.fromkeys(v))
    return check


def _text(limit: int, empty: Any = None) -> Callable[[Any], Any]:
    def check(v: Any) -> Any:
        if v is None:
            return empty
        if not isinstance(v, str) or len(v) > limit:
            raise Invalid("text")
        return v.strip() or empty
    return check


def _amount(v: Any) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not S.AMOUNT[0] <= v <= S.AMOUNT[1]:
        raise Invalid("amount")
    return int(round(v))


def _saver_options(v: Any) -> dict[str, Any]:
    got = S.saver_options(v)
    if got is None:
        raise Invalid("saver_options")
    return got


def _saver_engine(v: Any) -> str:
    if v not in S.SAVER_ENGINES:
        raise Invalid("choice")
    return v


def _card_options(v: Any) -> dict[str, Any]:
    got = S.card_options(v)
    if got is None:
        raise Invalid("card_options")
    return got


def _birthdays(v: Any) -> list[dict[str, Any]]:
    if not isinstance(v, list):
        raise Invalid("list")
    out = []
    for b in v:
        if not isinstance(b, Mapping):
            raise Invalid("birthday")
        name = str(b.get("name") or "").strip()
        try:
            month, day = int(b.get("month")), int(b.get("day"))
        except (TypeError, ValueError):
            raise Invalid("birthday") from None
        if not name or len(name) > 40 or not (1 <= month <= 12 and 1 <= day <= 31):
            raise Invalid("birthday")
        out.append({"name": name, "month": month, "day": day})
    return sorted(out, key=lambda b: (b["month"], b["day"], b["name"].lower()))


def _browse_view(v: Any) -> str:
    t = _text(60, "")(v)
    t = t.strip("/")
    if t and not re.fullmatch(r"[A-Za-z0-9_-]+", t):
        raise Invalid("path")
    return t


def _photos(v: Any) -> str:
    t = _text(300, "")(v)
    return t or S.DEFAULTS["look"]["photos"]


def _count(v: Any) -> dict[str, list[str]] | None:
    """One kind of Status & Chips: {exclude, include}, or None -- automatic."""
    if v is None:
        return None
    got = K.clean(v)
    if got is None:
        raise Invalid("count")
    return {k: _entities()(got[k]) for k in ("exclude", "include")}


def _sky_pages(v: Any) -> dict[str, str]:
    """Each page's background ({page: mode}); a page set to "" or None goes
    back to Automatic (left out)."""
    if v is None:
        return {}
    if not isinstance(v, dict):
        raise Invalid("choice")
    clean = {k: m for k, m in v.items() if m not in (None, "")}
    got = S.sky_pages(clean)
    if got is None or len(got) != len(clean):
        raise Invalid("choice")
    return got


def _sky_stops(v: Any) -> dict[str, list[str]] | None:
    """A custom backdrop's stops ({day, night}: four "#rrggbb" each), or
    None: no stops of its own."""
    if v is None:
        return None
    got = S.sky_stops(v)
    if got is None:
        raise Invalid("stops")
    return got


# EVERY HOUSE SETTING THE PAGE CAN WRITE: "section.key" -> its check. (The
# sky's dates are checked against the hemisphere in apply_house.)
SENSOR = _entity("sensor")
PILL_COLORS = ("white", "yellow", "orange", "red", "pink", "purple", "blue", "teal", "mint", "green")


def _page_pills(v: Any) -> dict[str, dict[str, str]]:
    """kind -> {name, icon, color}, each optional; an empty look is dropped."""
    if not isinstance(v, dict):
        raise Invalid("list")
    out: dict[str, dict[str, str]] = {}
    for kind, look in v.items():
        if kind not in S.SCENE_PAGES or not isinstance(look, dict) or set(look) - {"name", "icon", "color"}:
            raise Invalid("choice")
        one: dict[str, str] = {}
        name = str(look.get("name") or "").strip()
        if len(name) > 40:
            raise Invalid("text")
        if name:
            one["name"] = name
        icon = str(look.get("icon") or "").strip()
        if icon and not re.fullmatch(r"(mdi|hk):[a-z0-9-]+", icon):
            raise Invalid("icon")
        if icon:
            one["icon"] = icon
        color = look.get("color") or ""
        if color and color not in PILL_COLORS:
            raise Invalid("choice")
        if color:
            one["color"] = color
        if one:
            out[kind] = one
    return out


def _calendar_colors(v: Any) -> dict[str, str]:
    """calendar entity -> a pill colour; an empty colour is dropped."""
    if not isinstance(v, dict):
        raise Invalid("list")
    one = _entity("calendar")
    out: dict[str, str] = {}
    for ent, color in v.items():
        ent = one(ent)
        if color in (None, ""):
            continue
        if color not in PILL_COLORS:
            raise Invalid("choice")
        out[ent] = color
    return out


HOUSE: dict[str, Callable[[Any], Any]] = {
    "security.alarm": _entity("alarm_control_panel"),
    "features.temperature": SENSOR,
    "features.power": SENSOR,
    "features.house_timers": _entities("timer"),
    "features.vacuum_script": _entity("script"),
    "features.alarm_bad_code": _entity("input_boolean", "binary_sensor"),
    "clock.time": SENSOR,
    "clock.date": SENSOR,
    "idle.default": _entity("input_number", "number"),
    "weather.entity": _entity("weather"),
    "weather.place": _text(60),
    **{f"weather.{k}": SENSOR for k in ("feels_like", "humidity", "wind", "gust", "uv", "forecast_daily",
                                        "forecast_hourly", "alerts", "outside")},
    "weather.radar": _card_options,
    "calendar.entities": _entities("calendar"),
    "calendar.colors": _calendar_colors,
    "look.glass": _choice(S.GLASS),
    "look.frost": _amount,
    "look.blur": _amount,
    "look.details": _bool,
    "look.sky_switch": _entity("input_boolean", "switch"),
    "look.photos": _photos,
    "look.saver": _saver_options,
    "look.browse_view": _browse_view,
    "look.page_pills": _page_pills,
    "menu.glyph": _choice(S.MENU_GLYPHS),
    "menu.clock": _bool,
    # All Screens' menu (settings.MENU_KEYS): every screen that doesn't set its own
    "menu.style": _choice(S.MENU_STYLES),
    "menu.narrow": _choice(S.BOARD_NARROW),
    "menu.tab_at": lambda v: _tab_position(v),
    "menu.tab_size": _choice(S.BOARD_TAB_SIZES),
    "menu.tab_size_phone": _choice(S.BOARD_TAB_SIZES),
    "menu.open_min": lambda v: _dock_min(v),
    "menu.time_weather_at": _choice(S.BOARD_TIME),
    "menu.ha_row": _bool,
    "menu.swipe": _bool,
    "menu.accent": lambda v: _accent(v),
    # ...and its tab bar's
    "menu.bar_scroll": _choice(S.TAB_BAR_SCROLLS),
    "menu.bar_rooms": lambda v: _rooms_place(v),
    "menu.bar_glass": _choice(S.TAB_BAR_GLASS),
    "menu.bar_more": _choice(S.TAB_BAR_MORE),
    "menu.bar_more_phone": _choice(S.TAB_BAR_MORE),
    "menu.bar_pos": _choice(S.TAB_BAR_POS),
    "menu.bar_fold": _choice(S.TAB_BAR_FOLD),
    "menu.bar_start": _choice(S.TAB_BAR_START),
    "menu.bar_adjust": _bool,
    "menu.bar_scroll_phone": _choice(S.TAB_BAR_SCROLLS, none=True),
    "rooms.headings": _bool,
    "rooms.status": _ordered(S.STATUS_KINDS),
    **{f"status_rows.{p}": _status_row(p) for p in S.STATUS_ROWS},
    "rooms.order": _ids,
    "rooms.home": _choice(S.BOARD_HOME_ROOMS),
    "rooms.menu": _choice(S.BOARD_MENU_ROOMS),
    "rooms.pages": _choice(S.BOARD_PAGE_ROOMS),
    "browse.hide": _subset(S.BROWSE_CATEGORIES),
    "browse.discover": _ordered(list(S.SHELVES)),
    "generated.exclude_areas": _ids,
    "generated.exclude_devices": _ids,
    "generated.exclude_entities": _entities(),
    "generated.include_entities": _entities(),
    "sky.decorations": _bool,
    "sky.decoration_style": _choice(("old", "new")),
    "sky.cloud_style": _choice(S.CLOUD_STYLES),
    "sky.woodland": _subset(S.WOODLAND_SEASONS),
    "sky.animations": _bool,
    "sky.weather": _bool,
    "sky.gradient": _choice(S.SKY_BACKDROP_IDS),
    "sky.pages": _sky_pages,
    "sky.gradient_custom": _sky_stops,
    "sky.themes": _subset(S.THEMES),
    "sky.hemisphere": _choice(("north", "south")),
    "sky.moon": SENSOR,
    "sky.holidays": SENSOR,
    "sky.seasonal": _entity("input_boolean", "switch"),
    "sky.birthdays": _birthdays,
    **{f"sky.{k}": _choice(v, none=True) for k, v in S.SKY_OFTEN.items()},
    **{f"counts.{k}": _count for k in K.KINDS},
}
SKY_DATE = re.compile(r"^sky\.(" + "|".join(S.SKY_BUILT_IN) + r")_(from|to)$")
# Options of the integration itself, beside `dashboard`.
TOP = {"sidebar": _bool}


def apply_house(options: Mapping[str, Any], changes: Mapping[str, Any]
                ) -> tuple[dict[str, Any], dict[str, str]]:
    """The entry's options with `changes` made, and any refusals (path ->
    code). Nothing is made when anything is refused."""
    errors: dict[str, str] = {}
    now = S.merged(options)
    dash = {k: dict(v) if isinstance(v, Mapping) else v
            for k, v in (options.get(S.CONF_DASHBOARD) or {}).items()}
    top: dict[str, Any] = {}
    hemi = changes.get("sky.hemisphere", now["sky"].get("hemisphere") or "north")
    if hemi not in ("north", "south"):
        hemi = "north"
    for path, value in changes.items():
        try:
            if path in TOP:
                top[path] = TOP[path](value)
                continue
            m = SKY_DATE.match(path)
            if m:
                got = S.sky_date(m.group(1), m.group(2), value, hemi)
                if got is False:
                    raise Invalid("date")
            elif path in HOUSE:
                got = HOUSE[path](value)
            else:
                raise Invalid("unknown")
        except Invalid as err:
            errors[path] = err.code
            continue
        section, key = path.split(".", 1)
        # the section as merged (so every key is there), then this key; a
        # stored key the settings no longer have (from an older version) goes
        cur = dash.get(section) if isinstance(dash.get(section), dict) else {}
        dash[section] = {**now[section], **{k: v for k, v in cur.items() if k in now[section]}, key: got}
        if section == "counts":
            # A kind saved now is no longer read from its older list
            # (kinds.LEGACY): keeping it would be a second answer nobody
            # reads, so it is emptied.
            where = K.LEGACY.get(key)
            if where and got is not None:
                old = dash.get(where[0]) if isinstance(dash.get(where[0]), dict) else {}
                dash[where[0]] = {**now[where[0]], **old, where[1]: []}
    if errors:
        return dict(options), errors
    return {**options, **top, S.CONF_DASHBOARD: dash}, {}


# ------------------------------------------------------------ one screen
def _rooms_place(v: Any) -> str:
    """The tab bar's Rooms: In More, a button of their own, or off (a
    boolean, from the first form, is read as the settings read it)."""
    if isinstance(v, bool) or v in S.TAB_BAR_ROOMS:
        return S.tab_bar_rooms(v)
    raise Invalid("choice")


def _tab_position(v: Any) -> str:
    t = S.tab_position(v)
    if t is None:
        raise Invalid("tab_position")
    return t


def _accent(v: Any) -> str:
    t = S.accent(v)
    if t is None:
        raise Invalid("accent")
    return t


def _dock_min(v: Any) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not S.DOCK_MIN[0] <= v <= S.DOCK_MIN[1]:
        raise Invalid("dock_min")
    return int(v)


def _room(v: Any) -> str:
    t = str(v or "").strip().lower()
    if t and not re.fullmatch(r"[a-z0-9_]+", t):
        raise Invalid("bad_room")
    return t


def _user(v: Any) -> str:
    t = str(v or "").strip()
    if t and not re.fullmatch(r"[A-Za-z0-9_.@ -]{1,64}", t):
        raise Invalid("user")
    return t


def _amount_or_none(v: Any) -> int | None:
    return None if v is None else _amount(v)


def _bool_or_none(v: Any) -> bool | None:
    return None if v is None else _bool(v)


def _chip_keys(v: Any) -> list[str]:
    """The custom chips a screen shows (their keys)."""
    if not isinstance(v, list) or not all(isinstance(x, str) and S.CHIP_KEY.match(x) for x in v):
        raise Invalid("list")
    return list(dict.fromkeys(v))


def _views(v: Any) -> list[str]:
    """View paths (the menu's pages)."""
    if not isinstance(v, list) or not all(isinstance(x, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,60}", x) for x in v):
        raise Invalid("list")
    return list(dict.fromkeys(v))


def _chips(v: Any) -> list[str]:
    if not isinstance(v, list) or any(not (x in S.CHIP_KINDS or (isinstance(x, str) and ENTITY.match(x))
                                           or (isinstance(x, str) and x.startswith(S.CHIP_TOKEN)
                                               and S.CHIP_KEY.match(x[len(S.CHIP_TOKEN):])))
                                      for x in v):
        raise Invalid("choice")
    return list(dict.fromkeys(v))


def _scenes(v: Any) -> list[str]:
    ok = lambda x: isinstance(x, str) and (ENTITY.match(x) or (  # noqa: E731
        x.startswith(S.SCENE_PAGE) and x[len(S.SCENE_PAGE):] in S.SCENE_PAGES))
    if not isinstance(v, list) or not all(ok(x) for x in v):
        raise Invalid("choice")
    return list(dict.fromkeys(v))


def _pages(v: Any) -> list[str]:
    if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
        raise Invalid("list")
    got = S.page_order(v)
    if len(got) != len(dict.fromkeys(v)):
        raise Invalid("choice")
    return got


def _home_view(v: Any) -> str:
    """A screen's Home: "" (the generated one) or a custom page's address."""
    if v in (None, ""):
        return ""
    if not isinstance(v, str) or not S.PAGE_PATH.match(v):
        raise Invalid("choice")
    return v


def _custom_pages(v: Any) -> list[str]:
    if not isinstance(v, list) or not all(isinstance(x, str) and S.PAGE_PATH.match(x) for x in v):
        raise Invalid("list")
    return list(dict.fromkeys(v))


BOARD: dict[str, Callable[[Any], Any]] = {
    "menu": _choice(S.BOARD_MENUS),
    "narrow": _choice(S.BOARD_NARROW),
    "phone_header": _choice(S.BOARD_PHONE),
    "chips_custom": _chip_keys,
    "menu_top": _views,
    "dock_min": _dock_min,
    "time_weather": _choice(S.BOARD_TIME),
    "ha_row": _bool,
    "categories": _views,
    "tab_position": _tab_position,
    "tab_size": _choice(S.BOARD_TAB_SIZES),
    "tab_size_phone": _choice(S.BOARD_TAB_SIZES),
    "room_order": _ids,
    "menu_rooms": _choice(S.BOARD_MENU_ROOMS),
    "home_rooms": _choice(S.BOARD_HOME_ROOMS),
    "rooms_custom": _bool,
    "menu_custom": _bool,
    "accent": _accent,
    "glyph": _choice(S.MENU_GLYPHS),
    "clock": _bool,
    "swipe": _bool,
    "tab_bar_scroll": _choice(S.TAB_BAR_SCROLLS),
    "tab_bar_rooms": lambda v: _rooms_place(v),
    "tab_bar_glass": _choice(S.TAB_BAR_GLASS),
    "tab_bar_more": _choice(S.TAB_BAR_MORE),
    "tab_bar_more_phone": _choice(S.TAB_BAR_MORE),
    "tab_bar_pos": _choice(S.TAB_BAR_POS),
    "tab_bar_fold": _choice(S.TAB_BAR_FOLD),
    "tab_bar_start": _choice(S.TAB_BAR_START),
    "tab_bar_adjust": _bool,
    "tab_bar_scroll_phone": _choice(S.TAB_BAR_SCROLLS, none=True),
    "page_rooms": _choice(S.BOARD_PAGE_ROOMS),
    "chips_row": _bool,
    "chips": _chips,
    "chips_quiet": _subset(S.CHIP_KINDS),
    "chips_extra": _entities(),
    "camera_strip": _bool,
    "cameras": _entities("camera"),
    "camera_live": lambda v: _entity("input_select", "select")(v) or "",
    "scenes_row": _bool,
    "scenes": _scenes,
    "scenes_pages": _ordered(S.SCENE_PAGES),
    "favorites": _entities(),
    "pages": _pages,
    "only_pages": _pages,
    "custom_pages": _custom_pages,
    "home_page": _bool,
    "home_view": _home_view,
    "glass": _choice(S.BOARD_GLASS),
    "frost": _amount_or_none,
    "blur": _amount_or_none,
    "sky": _bool,
    # this screen's own Sky / Background; None: follow All Screens
    "sky_animations": _bool_or_none,
    "sky_weather": _bool_or_none,
    "sky_decorations": _bool_or_none,
    "sky_decoration_style": _choice(("old", "new"), none=True),
    "sky_cloud_style": _choice(S.CLOUD_STYLES, none=True),
    "sky_gradient": _choice(S.SKY_BACKDROP_IDS, none=True),
    "sky_pages": _sky_pages,
    "sky_custom": _sky_stops,
    "idle_return": _bool,
    "idle_room": _room,
    "car": _bool,
    "kiosk": _bool,
    "kiosk_header": _bool,
    "kiosk_sidebar": _bool,
    "kiosk_admins": _bool,
    "kiosk_engine": _choice(S.KIOSK_ENGINES),
    "popups": _bool,
    "now_playing": _bool,
    "screensaver": _bool,
    "tablet_user": _user,
    "wallpanel_options": _card_options,
    "kiosk_options": _card_options,
    # null: follow the settings for All Screens
    "screensaver_options": lambda v: None if v is None else _saver_options(v),
    "screensaver_engine": _saver_engine,
}


def apply_board(data: Mapping[str, Any], changes: Mapping[str, Any]
                ) -> tuple[dict[str, Any], dict[str, str]]:
    """One screen's settings with `changes` made (then settings.board(), as
    every write of an item), and any refusals."""
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}
    for key, value in changes.items():
        try:
            if key not in BOARD:
                raise Invalid("unknown")
            clean[key] = BOARD[key](value)
        except Invalid as err:
            errors[key] = err.code
    if errors:
        return S.board(data), errors
    return S.board({**dict(data), **clean}), {}
