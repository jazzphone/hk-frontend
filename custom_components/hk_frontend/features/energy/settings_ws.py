"""Energy's settings, for the HK Settings page (admin only):

    hk_energy/settings/get                     -> the page
    hk_energy/settings/set {changes: {...}}    -> the page again, or the refusal
    hk_energy/device/set {key, changes}        -> one device's own settings
                                                  (name, icon, color, power,
                                                  control, hidden); a null
                                                  value goes back to Automatic

The page is the stored options, the plan the screens draw, and every device
the page could show -- hidden ones too -- with how its power sensor was
found. Each change is checked the way the field means it and refused BY FIELD
(the message is a JSON map, field -> a sentence to show).
"""
from __future__ import annotations

import json
import re
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .. import ENERGY, Feature, async_update, entries
from . import plan
from .const import (COLORS, CONF_BATTERIES, CONF_COST, CONF_DETAIL, CONF_DEVICES, CONF_EXTRA, CONF_FOLLOW,
                    CONF_SECTIONS, CONF_TITLE, CONF_TOP, CONF_TOTAL, CONF_USAGES, OPTION_KEYS, SECTIONS, TOP_MAX,
                    USAGES_MAX)

ENTITY = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
ICON = re.compile(r"^(hk|mdi):[a-z0-9-]+$")
SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
PATH = re.compile(r"^[A-Za-z0-9_./#?=&-]{1,120}$")
NAME_MAX = 40
DEVICE_FIELDS = ("name", "icon", "color", "power", "control", "hidden")

MSG = {
    "unknown": "That setting doesn’t exist.",
    "bool": "Choose on or off.",
    "name": "Up to 40 characters.",
    "entity": "That isn’t an entity id.",
    "list": "That list couldn’t be read.",
    "too_many": "That’s more than this row holds.",
    "icon": "An icon is hk:name or mdi:name.",
    "color": "That isn’t one of the colors.",
    "section": "Each section needs an id and a name.",
    "device": "That device couldn’t be read.",
    "link": "A link is a page address.",
}


def _entry(hass: HomeAssistant) -> Feature | None:
    return next(iter(entries(hass, ENERGY)), None)


def page(hass: HomeAssistant, entry: Feature) -> dict[str, Any]:
    from . import current, house, prefs
    opts = dict(entry.options)
    pl = current(hass, fresh=True) or {}
    ctx = plan.collect(hass, prefs(hass), opts, house(hass))
    devs = plan.devices(ctx, opts)
    names = {d["key"]: d["name"] for d in devs}
    bats = plan.batteries(ctx, opts)
    secs = plan.sections(devs, bats, opts)
    p = prefs(hass) or {}
    return {
        "configured": True,
        "state": entry.state.value,
        "options": {k: opts.get(k) for k in OPTION_KEYS},
        "plan": pl,
        "devices": [{k: d[k] for k in ("key", "name", "raw", "stat", "power", "found", "section", "icon", "color",
                                        "control", "hidden", "extra", "parent", "children")}
                    | {"parent_name": names.get(d["parent"] or "")} for d in devs],
        "batteries": bats,
        "sections": secs,
        "section_kinds": [list(s) for s in SECTIONS],
        "grid": plan.grid_of(p),
        "energy": {"grid": bool(plan.grid_of(p)), "devices": len(p.get("device_consumption") or []),
                   "url": "/config/energy"},
        "colors": list(COLORS),
    }


# ----------------------------------------------------------------- checks
def _ent(v: Any) -> bool:
    return isinstance(v, str) and bool(ENTITY.match(v))


def _ent_or_blank(v: Any) -> bool:
    return v in (None, "") or _ent(v)


def _name(v: Any) -> bool:
    return isinstance(v, str) and 0 < len(v.strip()) <= NAME_MAX


def check_device(v: Any) -> dict[str, Any] | None:
    """One device's own settings, checked; None when it cannot be read."""
    if not isinstance(v, dict):
        return None
    out: dict[str, Any] = {}
    for k, x in v.items():
        if k not in DEVICE_FIELDS:
            return None
        if x in (None, ""):
            continue
        if k == "name" and not _name(x):
            return None
        if k == "icon" and not (isinstance(x, str) and ICON.match(x)):
            return None
        if k == "color" and x not in COLORS:
            return None
        if k in ("power", "control") and not _ent(x):
            return None
        if k == "hidden" and not isinstance(x, bool):
            return None
        out[k] = x.strip() if isinstance(x, str) else x
    return out


def _usage(v: Any) -> dict[str, Any] | None:
    if not isinstance(v, dict) or not _ent(v.get("entity")):
        return None
    out = {"entity": v["entity"]}
    if v.get("stat") not in (None, ""):
        if not _ent(v["stat"]):
            return None
        out["stat"] = v["stat"]
    if v.get("name") not in (None, ""):
        if not _name(v["name"]):
            return None
        out["name"] = v["name"].strip()
    if v.get("color") not in (None, ""):
        if v["color"] not in COLORS:
            return None
        out["color"] = v["color"]
    return out


def _section(v: Any) -> dict[str, Any] | None:
    if not isinstance(v, dict) or not isinstance(v.get("id"), str) or not SLUG.match(v["id"]) or not _name(v.get("name")):
        return None
    items = v.get("items") or []
    if not isinstance(items, list) or not all(isinstance(x, str) for x in items):
        return None
    out: dict[str, Any] = {"id": v["id"], "name": v["name"].strip(), "items": list(dict.fromkeys(items))}
    link = v.get("link")
    if link not in (None, {}, ""):
        if not isinstance(link, dict) or not isinstance(link.get("path"), str) or not PATH.match(link["path"]):
            return None
        out["link"] = {"path": link["path"], "text": str(link.get("text") or "")[:NAME_MAX]}
    return out


def _extra(v: Any) -> dict[str, Any] | None:
    if not isinstance(v, dict) or not _name(v.get("name")):
        return None
    if not (_ent(v.get("power")) or _ent(v.get("stat"))):
        return None
    if not _ent_or_blank(v.get("power")) or not _ent_or_blank(v.get("stat")):
        return None
    key = v.get("key") or v.get("stat") or v.get("power")
    if not isinstance(key, str) or not key:
        return None
    return {"key": key, "name": v["name"].strip(), "power": v.get("power") or None, "stat": v.get("stat") or None}


def _battery(v: Any) -> dict[str, Any] | None:
    if not isinstance(v, dict) or not _ent(v.get("entity")):
        return None
    out: dict[str, Any] = {"entity": v["entity"]}
    if v.get("name") not in (None, ""):
        if not _name(v["name"]):
            return None
        out["name"] = v["name"].strip()
    if v.get("label") not in (None, ""):
        if not _ent(v["label"]):
            return None
        out["label"] = v["label"]
    if v.get("label_suffix") is not None:
        out["label_suffix"] = str(v["label_suffix"])[:NAME_MAX]
    if v.get("label_decimals") is not None:
        try:
            out["label_decimals"] = int(min(max(int(v["label_decimals"]), 0), 3))
        except (TypeError, ValueError):
            return None
    if v.get("icon") not in (None, ""):
        if not (isinstance(v["icon"], str) and ICON.match(v["icon"])):
            return None
        out["icon"] = v["icon"]
    if v.get("house"):
        out["house"] = True
    return out


def _list_of(v: Any, one: Any, most: int | None = None) -> tuple[list[Any] | None, str | None]:
    if not isinstance(v, list):
        return None, "list"
    if most is not None and len(v) > most:
        return None, "too_many"
    out = [one(x) for x in v]
    return (None, "list") if any(x is None for x in out) else (out, None)


def apply(options: dict[str, Any], changes: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """The options with the changes, and the refusals by field. A null for a
    list or a choice goes back to Automatic."""
    out, errors = dict(options), {}
    for k, v in changes.items():
        if k not in OPTION_KEYS:
            errors[k] = MSG["unknown"]
            continue
        if v is None and k in (CONF_TOP, CONF_USAGES, CONF_SECTIONS, CONF_BATTERIES, CONF_TOTAL, CONF_TITLE):
            out.pop(k, None)
            continue
        if k in (CONF_FOLLOW, CONF_COST, CONF_DETAIL):
            if not isinstance(v, bool):
                errors[k] = MSG["bool"]
            else:
                out[k] = v
        elif k == CONF_TITLE:
            if not _name(v):
                errors[k] = MSG["name"]
            else:
                out[k] = v.strip()
        elif k == CONF_TOTAL:
            if not isinstance(v, dict) or any(x not in ("power", "stat", "cost") for x in v) \
                    or not all(_ent_or_blank(x) for x in v.values()):
                errors[k] = MSG["entity"]
            else:
                tot = {x: y for x, y in v.items() if y}
                if tot:
                    out[k] = tot
                else:
                    out.pop(k, None)
        elif k == CONF_TOP:
            got, err = _list_of(v, lambda x: x if _ent(x) else None, TOP_MAX)
            if err:
                errors[k] = MSG[err]
            else:
                out[k] = list(dict.fromkeys(got or []))
        elif k == CONF_USAGES:
            got, err = _list_of(v, _usage, USAGES_MAX)
            if err:
                errors[k] = MSG[err]
            else:
                out[k] = got
        elif k == CONF_SECTIONS:
            got, err = _list_of(v, _section, 20)
            if err:
                errors[k] = MSG["section"] if err == "list" else MSG[err]
            elif len({s["id"] for s in got or []}) != len(got or []):
                errors[k] = MSG["section"]
            else:
                # a device is in one section: the first that lists it
                seen: set[str] = set()
                for s in got or []:
                    s["items"] = [x for x in s["items"] if not (x in seen or seen.add(x))]
                out[k] = got
        elif k == CONF_DEVICES:
            if not isinstance(v, dict):
                errors[k] = MSG["device"]
                continue
            devs = {}
            for key, d in v.items():
                c = check_device(d)
                if c is None or not isinstance(key, str):
                    errors[k] = MSG["device"]
                    break
                if c:
                    devs[key] = c
            else:
                out[k] = devs
        elif k == CONF_EXTRA:
            got, err = _list_of(v, _extra, 60)
            if err:
                errors[k] = MSG[err]
            else:
                out[k] = got
        elif k == CONF_BATTERIES:
            got, err = _list_of(v, _battery, 12)
            if err:
                errors[k] = MSG[err]
            else:
                out[k] = got
    return out, errors


def apply_device(options: dict[str, Any], key: str, changes: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    """One device's settings changed: a null field goes back to Automatic."""
    devs = {k: dict(v) for k, v in (options.get(CONF_DEVICES) or {}).items()}
    cur = devs.get(key, {})
    for f, v in changes.items():
        if f not in DEVICE_FIELDS:
            return options, MSG["unknown"]
        if v in (None, "") or (f == "hidden" and v is False):
            cur.pop(f, None)
        else:
            cur[f] = v
    c = check_device(cur)
    if c is None:
        return options, MSG["device"]
    if c:
        devs[key] = c
    else:
        devs.pop(key, None)
    return {**options, CONF_DEVICES: devs}, None


# ---------------------------------------------------------------- commands
def _save(hass: HomeAssistant, entry: Feature, options: dict[str, Any]) -> None:
    if options != dict(entry.options):
        async_update(hass, entry, options=options)
        from . import invalidate
        invalidate(hass)


@websocket_api.websocket_command({vol.Required("type"): "hk_energy/settings/get",
                                  vol.Optional("fresh"): bool})
@websocket_api.require_admin
@callback
def ws_settings_get(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    entry = _entry(hass)
    connection.send_result(msg["id"], page(hass, entry) if entry else {"configured": False})


@websocket_api.websocket_command({vol.Required("type"): "hk_energy/settings/set", vol.Required("changes"): dict})
@websocket_api.require_admin
@callback
def ws_settings_set(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_set_up", "Energy is not added")
        return
    options, errors = apply(dict(entry.options), dict(msg["changes"]))
    if errors:
        connection.send_error(msg["id"], "invalid_format", json.dumps(errors))
        return
    _save(hass, entry, options)
    connection.send_result(msg["id"], page(hass, entry))


@websocket_api.websocket_command({vol.Required("type"): "hk_energy/device/set", vol.Required("key"): str,
                                  vol.Required("changes"): dict})
@websocket_api.require_admin
@callback
def ws_device_set(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_set_up", "Energy is not added")
        return
    options, err = apply_device(dict(entry.options), msg["key"], dict(msg["changes"]))
    if err:
        connection.send_error(msg["id"], "invalid_format", json.dumps({k: err for k in msg["changes"]}))
        return
    _save(hass, entry, options)
    connection.send_result(msg["id"], page(hass, entry))


@callback
def async_register(hass: HomeAssistant) -> None:
    for cmd in (ws_settings_get, ws_settings_set, ws_device_set):
        websocket_api.async_register_command(hass, cmd)
