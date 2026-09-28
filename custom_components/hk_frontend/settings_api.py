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
    """One kind of What counts: {exclude, include}, or None -- automatic."""
    if v is None:
        return None
    got = K.clean(v)
    if got is None:
        raise Invalid("count")
    return {k: _entities()(got[k]) for k in ("exclude", "include")}


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
    "look.glass": _choice(S.GLASS),
    "look.frost": _amount,
    "look.blur": _amount,
    "look.details": _bool,
    "look.sky_switch": _entity("input_boolean", "switch"),
    "look.photos": _photos,
    "look.browse_view": _browse_view,
    "look.page_pills": _page_pills,
    "menu.glyph": _choice(S.MENU_GLYPHS),
    "menu.clock": _bool,
    "rooms.headings": _bool,
    "rooms.status": _subset(S.STATUS_KINDS),
    "browse.hide": _subset(S.BROWSE_CATEGORIES),
    "browse.discover": _ordered(list(S.SHELVES)),
    "generated.exclude_areas": _ids,
    "generated.exclude_devices": _ids,
    "generated.exclude_entities": _entities(),
    "generated.include_entities": _entities(),
    "sky.decorations": _bool,
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
def _tab_position(v: Any) -> str:
    t = S.tab_position(v)
    if t is None:
        raise Invalid("tab_position")
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
    "room_order": _ids,
    "menu_rooms": _choice(S.BOARD_MENU_ROOMS),
    "home_rooms": _choice(S.BOARD_HOME_ROOMS),
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
    "custom_pages": _custom_pages,
    "home_page": _bool,
    "glass": _choice(S.BOARD_GLASS),
    "frost": _amount_or_none,
    "blur": _amount_or_none,
    "sky": _bool,
    "idle_return": _bool,
    "idle_room": _room,
    "car": _bool,
    "kiosk": _bool,
    "popups": _bool,
    "now_playing": _bool,
    "screensaver": _bool,
    "tablet_user": _user,
    "wallpanel_options": _card_options,
    "kiosk_options": _card_options,
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
