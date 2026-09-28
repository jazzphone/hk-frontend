"""CLEAN AREAS: "clean these areas", sent to whichever vacuums can reach them.

One action, `hk_frontend.clean_areas` (areas, dry_run): each vacuum gets the
chosen areas on its own room map in Home Assistant (clean.py). Used by the
vacuum area picker on the dashboards, and just as usable from an automation
or a voice sentence. One entry per house: Configure picks which vacuums take
part and which areas the picker offers.

The action is registered at start, not per entry, so a call made while the
feature is not added gets a clear error rather than "unknown action".
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers import selector as sel
from homeassistant.helpers.dispatcher import async_dispatcher_send

from ...const import DOMAIN
from .. import CLEAN_AREAS, TITLES, entry_data, legacy, loaded, unique_id
from . import clean, settings_ws
from .const import CONF_AREAS, CONF_VACUUMS, SERVICE_CLEAN, SIGNAL_CHANGED

PLATFORMS: list = []


async def async_setup(hass: HomeAssistant) -> None:
    async def handle(call: ServiceCall) -> ServiceResponse:
        on = loaded(hass, CLEAN_AREAS)
        if not on:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="clean_areas_not_set_up")
        res: dict[str, Any] = await clean.async_clean(
            hass, list(call.data["areas"]), on[0].options, call.data.get("dry_run", False))
        # A caller that asked for the answer reads it; one that did not (an
        # automation) would never learn of a refusal, so for it one RAISES.
        if call.return_response or res.get("ok"):
            return res
        raise HomeAssistantError(res.get("message") or "Nothing was sent to the vacuums.")

    hass.services.async_register(DOMAIN, SERVICE_CLEAN, handle, vol.Schema({
        vol.Required("areas"): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional("dry_run", default=False): cv.boolean}),
        supports_response=SupportsResponse.OPTIONAL)
    # the HK Settings page and the area picker (settings_ws.py)
    settings_ws.async_register(hass)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await legacy.async_adopt(hass, entry)
    # the options are read on every call; nothing to hold. A change made in
    # Configure tells the open pickers, as the settings page's own does.
    entry.async_on_unload(entry.add_update_listener(_changed))
    async_dispatcher_send(hass, SIGNAL_CHANGED)
    return True


async def _changed(hass: HomeAssistant, entry: ConfigEntry) -> None:
    async_dispatcher_send(hass, SIGNAL_CHANGED)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_dispatcher_send(hass, SIGNAL_CHANGED)
    return True


def _schema(areas: bool = False) -> vol.Schema:
    fields: dict = {vol.Optional(CONF_VACUUMS): sel.EntitySelector(
        sel.EntitySelectorConfig(filter={"domain": "vacuum"}, multiple=True))}
    if areas:
        fields[vol.Optional(CONF_AREAS)] = sel.AreaSelector(sel.AreaSelectorConfig(multiple=True))
    return vol.Schema(fields)


class FlowSteps:
    """Add feature -> Clean Areas: which vacuums take part."""

    async def async_step_clean_areas(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(unique_id(CLEAN_AREAS))
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title=TITLES[CLEAN_AREAS], data=entry_data(CLEAN_AREAS),
                options={CONF_VACUUMS: list(user_input.get(CONF_VACUUMS) or [])})
        return self.async_show_form(step_id="clean_areas", data_schema=_schema())

    async def async_import_clean_areas(self, data: dict[str, Any]) -> ConfigFlowResult:
        """An older version's Clean Areas entry (legacy.py)."""
        await self.async_set_unique_id(unique_id(CLEAN_AREAS))
        self._abort_if_unique_id_configured()
        old = data[legacy.IMPORT]
        return self.async_create_entry(
            title=TITLES[CLEAN_AREAS], data=legacy.created(CLEAN_AREAS, data), options=dict(old["options"]))


class CleanAreasOptions(OptionsFlow):
    """Which vacuums take part, and which areas the picker offers. Every
    option is written back, so saving the vacuums keeps everything else."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.async_step_clean_areas_options(user_input)

    async def async_step_clean_areas_options(self, user_input: dict[str, Any] | None = None
                                             ) -> ConfigFlowResult:
        opts = self.config_entry.options
        if user_input is not None:
            return self.async_create_entry(data={
                **opts, CONF_VACUUMS: list(user_input.get(CONF_VACUUMS) or []),
                CONF_AREAS: list(user_input.get(CONF_AREAS) or [])})
        return self.async_show_form(
            step_id="clean_areas_options", data_schema=self.add_suggested_values_to_schema(
                _schema(areas=True), {CONF_VACUUMS: list(opts.get(CONF_VACUUMS) or []),
                                      CONF_AREAS: list(opts.get(CONF_AREAS) or [])}))


def options_flow(entry: ConfigEntry) -> OptionsFlow:
    return CleanAreasOptions()


def subentry_types(entry: ConfigEntry) -> dict:
    return {}

