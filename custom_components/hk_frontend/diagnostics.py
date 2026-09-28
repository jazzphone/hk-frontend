"""Settings -> Devices & services -> HK Frontend -> Download diagnostics.

The configuration lives in Home Assistant's storage, not in YAML files, so
this is the export: what is configured, what a screen is handed for it, and
where the font and glyphs are being served from.
"""
from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import files
from . import settings as dash_settings

REDACT = {"hash", "salt", "birthdays"}


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry
                                             ) -> dict[str, Any]:
    # a feature's entry is its own (features/): its own export, or its options
    from . import features as F
    kind = F.kind_of(entry)
    if kind != F.FRONTEND:
        own = getattr(F.module(kind), "async_diagnostics", None)
        if own is not None:
            return await own(hass, entry)
        return {"kind": kind, "options": async_redact_data(dict(entry.options), REDACT)}
    return {
        # The sky's birthdays are names and dates of the people in the
        # house: not for a file that gets attached to public issues.
        "options": async_redact_data(dict(entry.options), REDACT),
        # What every screen is handed: the options with each default filled in.
        "resolved": async_redact_data(dash_settings.as_client(entry), REDACT),
        # Where the font and the glyphs are coming from: "folder:..." is your
        # files folder, "bundled:..." the integration's own, None is missing.
        "files": await hass.async_add_executor_job(files.status, hass),
    }
