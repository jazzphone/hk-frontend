"""THE PHOTO SCREENSAVER'S ENTITIES (HK Frontend 1.3): for every screen whose
photo screensaver is HK Frontend's own (hk-saver.js), two entities of this
integration, tied to that screen's item:

    switch.<screen>_photo_screensaver    on while the photos show. Two-way:
        the screensaver turns it on when it starts and off when someone taps
        it; turning it on starts the screensaver at once, off closes it (the
        doorbell). Restored across restarts. Nobody creates a helper.
    binary_sensor.<screen>_screen_in_use  on while the screen was touched
        within its window -- Starts After less a minute -- so the photos can
        only come up once the screen has stopped counting as in use. Only a
        person can touch the page: no command to the tablet's browser (a
        brightness write, starting its screensaver) can fake it.

    switch.<screen>_black_screen  (2026-10-09) on while the screen is black:
        HK Frontend's own black over the page and the backlight at its
        lowest, for a screen whose Black Screen is HK Frontend (in place of
        Kiosk Satellite's Black screensaver). Turned on and off by the
        house's sleep and wake (hk_frontend.set_black_screen also carries the
        brightness to come back to); the page confirms it went black
        (`confirmed`), and turns it off itself when a tap wakes it.

Attributes on all: starts_after, in_use_window, last_touch (the screen's
last touch, reported by hk-saver.js at most every 10 s while touched).

THE OLD HELPER, MIRRORED. A house that followed the 1.2 docs has
input_boolean.wallpanel_screensaver_<room> (its Tablet Room) and automations
on it. While that helper exists the switch mirrors it both ways, so nothing
breaks and the house can move to the switch in its own time; once it is
deleted the mirror is simply idle.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from . import settings as S
from .const import DOMAIN, SIGNAL_CONFIG

_LOGGER = logging.getLogger(__name__)
DATA = "saver"                 # hass.data[DOMAIN][DATA]: the manager
SWITCH_KEY = "photo_screensaver"
BLACK_KEY = "black_screen"
INUSE_KEY = "screen_in_use"
MARGIN = 60                    # s: the window is Starts After less this
MIN_WINDOW = 15
TOUCH_EVERY = 10               # s: the page reports a touch at most this often


def window_of(starts_after: int) -> int:
    """The in-use window for a Starts After: a minute less, so the photos can
    only come up after the screen has stopped counting as in use (the house's
    reconciler and the screensaver can never disagree about who goes first)."""
    return max(MIN_WINDOW, int(starts_after) - MARGIN)


def wanted(entry: ConfigEntry) -> dict[str, dict[str, Any]]:
    """The screens that get the entities: HK's own photo screensaver on, with a
    tablet user. `{path: {"sub": subentry, "board": board}}`."""
    out: dict[str, dict[str, Any]] = {}
    for sub in entry.subentries.values():
        if sub.subentry_type != S.SUBENTRY_DASHBOARD or not sub.unique_id:
            continue
        b = S.resolved(S.board(sub.data), entry.options)
        if b["screensaver"] and b["tablet_user"] and b["screensaver_engine"] == "hk":
            out[sub.unique_id] = {"sub": sub, "board": b}
    return out


class Manager:
    """Adds and removes the per-screen entities as screens change, and holds
    each screen's last touch."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass, self.entry = hass, entry
        self.adders: dict[str, Any] = {}              # platform -> async_add_entities
        # path -> {"switch": photos, "black": black screen, "binary_sensor": in use}
        self.entities: dict[str, dict[str, Any]] = {}
        self.touch: dict[str, datetime] = {}
        # Sleep Screen: path -> its engine (sleep_engine.py), while its screen
        # is Decided By HK Frontend or in shadow; and what it was built from
        self.engines: dict[str, Any] = {}
        self._engine_keys: dict[str, str] = {}

    def attach(self, platform: str, add: Any) -> None:
        self.adders[platform] = add
        self.sync()

    @callback
    def sync(self) -> None:
        """Make the entities match the screens: new screens get theirs, a screen
        that no longer has HK's screensaver loses them."""
        want = wanted(self.entry)
        reg = er.async_get(self.hass)
        devs = dr.async_get(self.hass)
        for path in list(self.entities):
            if path not in want:
                for ent in self.entities.pop(path).values():
                    eid = ent.entity_id
                    self.hass.async_create_task(ent.async_remove(force_remove=True))
                    if eid and reg.async_get(eid):
                        reg.async_remove(eid)
                dev = devs.async_get_device_by_identifier((DOMAIN, f"{self.entry.entry_id}_{path}"), self.entry.entry_id)
                if dev:
                    devs.async_remove_device(dev.id)
        from .binary_sensor import ScreenInUse
        from .sensor import SleepScreenSensor
        from .switch import BlackScreen, PhotoScreensaver
        for path, w in want.items():
            have = self.entities.setdefault(path, {})
            # a renamed screen renames its device (unless the house named it)
            dev = devs.async_get_device_by_identifier((DOMAIN, f"{self.entry.entry_id}_{path}"), self.entry.entry_id)
            title = w["sub"].title or path
            if dev and dev.name != title:
                devs.async_update_device(dev.id, name=title)
            for kind, platform, cls in (("switch", "switch", PhotoScreensaver), ("black", "switch", BlackScreen),
                                        ("binary_sensor", "binary_sensor", ScreenInUse),
                                        ("sleep", "sensor", SleepScreenSensor)):
                if kind in have or platform not in self.adders:
                    continue
                ent = cls(self, path, w["sub"].title or path)
                have[kind] = ent
                self.adders[platform]([ent], config_subentry_id=w["sub"].subentry_id)
        self._sync_engines(want)
        for have in self.entities.values():
            for ent in have.values():
                if ent.hass is not None:
                    ent.async_write_ha_state()

    @callback
    def _sync_engines(self, want: dict[str, Any]) -> None:
        """An engine for each screen whose Sleep Screen is Decided By HK
        Frontend (or shadow), built again when what it reads changes."""
        import json
        from .sleep_engine import Engine
        for path in list(self.engines):
            sl = (want.get(path) or {}).get("board", {}).get("sleep") or {}
            if sl.get("decided_by") not in ("hk", "shadow"):
                self.engines.pop(path).unload()
                self._engine_keys.pop(path, None)
        for path, w in want.items():
            b = w["board"]
            if (b.get("sleep") or {}).get("decided_by") not in ("hk", "shadow"):
                continue
            have = self.entities.get(path, {})
            ids = {k: getattr(e, "entity_id", None) for k, e in have.items()}
            key = json.dumps([b.get("sleep"), b.get("black_screen"), b.get("screensaver_options"), ids], sort_keys=True, default=str)
            if self._engine_keys.get(path) == key:
                continue
            eng = self.engines.get(path) or Engine(self.hass, self, path)
            self.engines[path] = eng
            self._engine_keys[path] = key
            eng.configure(b)

    @callback
    def unload(self) -> None:
        for eng in self.engines.values():
            eng.unload()
        self.engines.clear()
        self._engine_keys.clear()

    def board(self, path: str) -> dict[str, Any]:
        w = wanted(self.entry).get(path)
        return w["board"] if w else S.resolved(S.board(None), self.entry.options)

    def switch_ids(self) -> dict[str, str]:
        """{path: entity id} of each screen's switch, for the settings feed."""
        out: dict[str, str] = {}
        for path, have in self.entities.items():
            sw = have.get("switch")
            if sw is not None and sw.entity_id:
                out[path] = sw.entity_id
        return out

    def black_ids(self) -> dict[str, str]:
        """{path: entity id} of each screen's black screen switch."""
        out: dict[str, str] = {}
        for path, have in self.entities.items():
            b = have.get("black")
            if b is not None and b.entity_id:
                out[path] = b.entity_id
        return out

    def entity_ids(self) -> dict[str, dict[str, str | None]]:
        """{path: {"switch": id, "in_use": id}} for the settings page, which
        names them on the screen's Screensaver page."""
        out: dict[str, dict[str, str | None]] = {}
        for path, have in self.entities.items():
            sw, use, blk, slp = have.get("switch"), have.get("binary_sensor"), have.get("black"), have.get("sleep")
            out[path] = {"switch": sw.entity_id if sw is not None else None,
                         "in_use": use.entity_id if use is not None else None,
                         "black": blk.entity_id if blk is not None else None,
                         "sleep": slp.entity_id if slp is not None else None}
        return out

    @callback
    def touched(self, path: str) -> None:
        self.touch[path] = dt_util.utcnow()
        for ent in self.entities.get(path, {}).values():
            if ent.hass is not None:
                ent.touched()


class SaverEntity:
    """What the switch and the in-use sensor share. Each screen is a device of
    its own (named like the screen, in the screen's item), so the ids read
    switch.<screen>_photo_screensaver and the house's device stays out of the
    screen's item."""

    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, mgr: Manager, path: str, title: str, key: str) -> None:
        self._mgr, self._path = mgr, path
        self._attr_unique_id = f"{mgr.entry.entry_id}_{path}_{key}"
        self._attr_translation_key = key          # translations/en.json entity.*
        self._attr_device_info = device_info(mgr.entry, path, title)

    def _starts_after(self) -> int:
        return int(self._mgr.board(self._path)["screensaver_options"]["starts_after"])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        t = self._mgr.touch.get(self._path)
        sa = self._starts_after()
        return {"dashboard": self._path, "starts_after": sa, "in_use_window": window_of(sa),
                "last_touch": t.isoformat() if t else None}

    def touched(self) -> None:
        self.async_write_ha_state()


def device_info(entry: ConfigEntry, path: str, title: str) -> Any:
    from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
    return DeviceInfo(identifiers={(DOMAIN, f"{entry.entry_id}_{path}")}, name=title,
                      manufacturer="HK Frontend", model="Screen", entry_type=DeviceEntryType.SERVICE)


async def async_setup_platform(hass: HomeAssistant, entry: ConfigEntry, platform: str, add: Any) -> None:
    mgr = hass.data.setdefault(DOMAIN, {}).get(DATA)
    if mgr is None or mgr.entry is not entry:
        mgr = Manager(hass, entry)
        hass.data[DOMAIN][DATA] = mgr
        entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_CONFIG, mgr.sync))

        @callback
        def _forget() -> None:
            mgr.unload()
            if hass.data.get(DOMAIN, {}).get(DATA) is mgr:
                hass.data[DOMAIN].pop(DATA)
        entry.async_on_unload(_forget)
    mgr.attach(platform, add)


def manager(hass: HomeAssistant) -> Manager | None:
    return hass.data.get(DOMAIN, {}).get(DATA)


# ------------------------------------------------------------ the page's touches
@websocket_api.websocket_command({
    vol.Required("type"): "hk_frontend/screensaver/touch",
    vol.Required("dashboard"): str,
})
@callback
def ws_touch(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """hk-saver.js: somebody touched this screen. Only its tablet's own user
    (or an admin) may say so -- a desk opening the same screen is not the
    tablet."""
    mgr = manager(hass)
    path = msg["dashboard"]
    if mgr is None or path not in mgr.entities:
        connection.send_error(msg["id"], "not_found", "No HK screensaver on that screen")
        return
    user = connection.user
    if not (user and (user.is_admin or user.name == mgr.board(path)["tablet_user"])):
        connection.send_error(msg["id"], "unauthorized", "Only the screen's tablet user")
        return
    mgr.touched(path)
    connection.send_result(msg["id"], {"window": window_of(mgr.board(path)["screensaver_options"]["starts_after"])})


@websocket_api.websocket_command({
    vol.Required("type"): "hk_frontend/screensaver/black",
    vol.Required("dashboard"): str,
    vol.Required("black"): bool,
})
@callback
def ws_black(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """hk-saver.js, Black Screen: HK Frontend -- black: true once the page is
    black (its curtain drawn, the backlight down): the house's sleep waits for
    it, and falls back to Kiosk Satellite's black without it. black: false when
    a tap woke it on the tablet: the switch follows. The tablet's own user (or
    an admin) only, as for a touch."""
    mgr = manager(hass)
    path = msg["dashboard"]
    blk = mgr.entities.get(path, {}).get("black") if mgr else None
    if blk is None:
        connection.send_error(msg["id"], "not_found", "No black screen on that screen")
        return
    user = connection.user
    if not (user and (user.is_admin or user.name == mgr.board(path)["tablet_user"])):
        connection.send_error(msg["id"], "unauthorized", "Only the screen's tablet user")
        return
    # A TAP WOKE IT: in use first, then not black, in this one callback -- so
    # the house's want sensor never sees the black gone without the touch
    # (it would read "nobody here" and send the tablet back to sleep)
    if not msg["black"] and blk.is_on:
        mgr.touched(path)
    blk.page_says(msg["black"])
    connection.send_result(msg["id"], {"on": blk.is_on})


def register_commands(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_touch)
    websocket_api.async_register_command(hass, ws_black)
