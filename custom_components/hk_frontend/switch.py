"""The integration's own switch: Seasonal decorations (the live sky's holiday
dress). Its state IS the setting `sky.decorations` in the entry's options, so
it survives restarts without a helper, reaches every screen over the settings
feed the moment it is flipped, and can be driven from a dashboard or an
automation like any switch. No input_boolean is needed (Configure ->
Seasonal sky still accepts one, as an extra gate)."""
from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import settings as S
from .entity import HkEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry,
                            async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([SeasonalDecorations(entry)])


class SeasonalDecorations(HkEntity, SwitchEntity):
    _attr_translation_key = "seasonal_decorations"

    def __init__(self, entry: ConfigEntry) -> None:
        super().__init__(entry, "seasonal_decorations")

    @property
    def is_on(self) -> bool:
        return bool(S.merged(self._entry.options)["sky"].get("decorations", True))

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._set(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._set(False)

    def _set(self, on: bool) -> None:
        opts = dict(self._entry.options)
        dash = dict(opts.get(S.CONF_DASHBOARD) or {})
        dash["sky"] = {**S.merged(opts)["sky"], "decorations": on}
        # The update listener re-sends the settings to every screen; the
        # entity writes its state when the options change (HkEntity).
        self.hass.config_entries.async_update_entry(
            self._entry, options={**opts, S.CONF_DASHBOARD: dash})
