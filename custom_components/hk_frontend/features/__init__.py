"""THE FEATURES: what HK Frontend adds beside the dashboards, each its own
entry of the integration (Settings -> Devices & services -> HK Frontend ->
Add feature), each optional:

    music        Music: whole-home music through Music Assistant
    live_tv      Live TV: an HDHomeRun tuner's channels, on the screens
    clean_areas  Clean Areas: "clean these rooms" for the house's vacuums
    alarm_pin    Alarm PIN: a PIN in front of an alarm that takes none
                 (one entry per alarm)

An entry's data says which it is (`kind`); the dashboards' own entry -- the
house's settings -- has no kind. Each feature is a package here with the same
shape:

    PLATFORMS                          the entity platforms its entries forward
    async_setup(hass)                  once, at start: its actions and its
                                       websocket commands (so the settings page
                                       can ask even before it is added)
    async_setup_entry / async_unload_entry (hass, entry)
    FlowSteps                          its config-flow steps, mixed into the
                                       integration's flow; every step id starts
                                       with the kind ("alarm_pin_…")
    options_flow(entry)                its Configure
    subentry_types(entry)              its items (Music's presets and playlists)

(An older version shipped them as integrations of their own -- hk_music,
hk_tv, hk_clean_areas, hk_alarm_pin; legacy.py adopts entries left by it,
once.)
"""
from __future__ import annotations

import importlib
from types import ModuleType
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from ..const import DOMAIN

KIND = "kind"
FRONTEND = "frontend"
MUSIC = "music"
LIVE_TV = "live_tv"
CLEAN_AREAS = "clean_areas"
ALARM_PIN = "alarm_pin"
KINDS = (MUSIC, LIVE_TV, CLEAN_AREAS, ALARM_PIN)
# one entry per house; Alarm PIN has one per protected alarm
SINGLE = (MUSIC, LIVE_TV, CLEAN_AREAS)
TITLES = {MUSIC: "Music", LIVE_TV: "Live TV", CLEAN_AREAS: "Clean Areas", ALARM_PIN: "Alarm PIN"}


def kind_of(entry: ConfigEntry) -> str:
    """Which feature an entry is -- FRONTEND for the house's own entry."""
    return str(entry.data.get(KIND) or FRONTEND)


def entries(hass: HomeAssistant, kind: str) -> list[ConfigEntry]:
    """Every entry of one kind, loaded or not."""
    return [e for e in hass.config_entries.async_entries(DOMAIN) if kind_of(e) == kind]


def loaded(hass: HomeAssistant, kind: str) -> list[ConfigEntry]:
    """The entries of one kind that are set up."""
    return [e for e in hass.config_entries.async_loaded_entries(DOMAIN) if kind_of(e) == kind]


def frontend_entry(hass: HomeAssistant) -> ConfigEntry | None:
    """The house's entry (there is only ever one), loaded or not: its options
    are the settings even while it is disabled."""
    return next(iter(entries(hass, FRONTEND)), None)


def module(kind: str) -> ModuleType:
    """A feature's package."""
    if kind not in KINDS:
        raise KeyError(kind)
    return importlib.import_module(f"{__name__}.{kind}")


def unique_id(kind: str, key: str = "") -> str:
    """A feature entry's unique id: its kind, and for Alarm PIN the alarm."""
    return f"{kind}:{key}" if key else kind


def entry_data(kind: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {KIND: kind, **{k: v for k, v in (data or {}).items() if k != KIND}}
