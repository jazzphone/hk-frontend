"""ADOPTING ENTRIES FROM AN OLDER VERSION, once. An older version shipped
Music, Live TV, Clean Areas and Alarm PIN as integrations of their own
(hk_music, hk_tv, hk_clean_areas, hk_alarm_pin). Their entries stay in Home
Assistant after their folders are gone -- entries whose integration no
longer exists. Each is adopted as an HK Frontend entry of its kind:

  1. at start, an import flow per old entry makes the new entry, with the old
     one's data, options, title and items (Music's presets and playlists),
     and notes the old entry's id;
  2. the new entry's setup, BEFORE its platforms make any entity, moves the
     old entry's entities and devices to it -- same entity ids, so every
     dashboard, automation and history that names them goes on working --
     and then removes the old entry.

Nothing else moves: each feature keeps the storage files it always had.
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from ..const import DOMAIN
from . import ALARM_PIN, CLEAN_AREAS, KIND, LIVE_TV, MUSIC, entries

_LOGGER = logging.getLogger(__name__)

LEGACY = {"hk_music": MUSIC, "hk_tv": LIVE_TV, "hk_clean_areas": CLEAN_AREAS, "hk_alarm_pin": ALARM_PIN}
LEGACY_ID = "legacy_entry_id"
LEGACY_DOMAIN = "legacy_domain"
# what the import flow is handed (data["legacy"])
IMPORT = "legacy"


def old_entries(hass: HomeAssistant) -> list[tuple[str, ConfigEntry]]:
    """(kind, entry) for every old entry not yet adopted."""
    out: list[tuple[str, ConfigEntry]] = []
    for domain, kind in LEGACY.items():
        taken = {e.data.get(LEGACY_ID) for e in entries(hass, kind)}
        out.extend((kind, e) for e in hass.config_entries.async_entries(domain) if e.entry_id not in taken)
    return out


def import_data(kind: str, old: ConfigEntry) -> dict[str, Any]:
    """What the import flow needs to make the new entry."""
    return {KIND: kind, IMPORT: {
        "entry_id": old.entry_id, "domain": old.domain, "title": old.title,
        "data": dict(old.data), "options": dict(old.options), "unique_id": old.unique_id,
        # each item keeps its id: a playlist is keyed by it
        "subentries": [{"subentry_type": s.subentry_type, "title": s.title, "data": dict(s.data),
                        "unique_id": s.unique_id, "subentry_id": s.subentry_id}
                       for s in old.subentries.values()]}}


async def async_import_all(hass: HomeAssistant) -> None:
    """Step 1, at start. An old entry already adopted is skipped (its new
    entry carries its id until step 2 removes it)."""
    for kind, old in old_entries(hass):
        _LOGGER.info("Adopting %s (%s) as an HK Frontend %s entry", old.title, old.domain, kind)
        await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_IMPORT}, data=import_data(kind, old))


async def async_adopt(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Step 2, from a feature entry's setup before its platforms: the old
    entry's entities and devices become this entry's, then the old entry
    goes. A unique id that named the old entry names this one."""
    old_id = entry.data.get(LEGACY_ID)
    if not old_id:
        return
    old_domain = str(entry.data.get(LEGACY_DOMAIN) or "")
    # its folder still installed: the old entry may be running, and an entity
    # that is running cannot move -- it is unloaded first
    old = hass.config_entries.async_get_entry(old_id)
    if old is not None and old.state is ConfigEntryState.LOADED:
        await hass.config_entries.async_unload(old_id)
    ereg, dreg = er.async_get(hass), dr.async_get(hass)
    for ent in er.async_entries_for_config_entry(ereg, old_id):
        ereg.async_update_entity_platform(
            ent.entity_id, DOMAIN, new_config_entry_id=entry.entry_id,
            new_unique_id=str(ent.unique_id).replace(old_id, entry.entry_id))
    for dev in dr.async_entries_for_config_entry(dreg, old_id):
        ids = {(DOMAIN if d == old_domain else d, str(v).replace(old_id, entry.entry_id))
               for d, v in dev.identifiers}
        dreg.async_update_device(dev.id, new_identifiers=ids, add_config_entry_id=entry.entry_id,
                                 remove_config_entry_id=old_id)
    if hass.config_entries.async_get_entry(old_id) is not None:
        await hass.config_entries.async_remove(old_id)
    hass.config_entries.async_update_entry(
        entry, data={k: v for k, v in entry.data.items() if k not in (LEGACY_ID, LEGACY_DOMAIN)})
    _LOGGER.info("Adopted %s: its entities and devices are HK Frontend's now", old_domain)


def created(kind: str, data: dict[str, Any]) -> dict[str, Any]:
    """The new entry's own data from an import: the old data, its kind, and
    the note step 2 reads."""
    old = data[IMPORT]
    return {**dict(old.get("data") or {}), KIND: kind, LEGACY_ID: old["entry_id"], LEGACY_DOMAIN: old["domain"]}
