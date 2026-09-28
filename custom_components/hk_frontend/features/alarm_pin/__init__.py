"""ALARM PIN: a PIN in front of an alarm that takes none.

Some alarm integrations arm and disarm for anyone who can call them (their
panel reports `code_format: None`). Add Alarm PIN for such an alarm and it
provides a second alarm panel that mirrors the first -- its state, its
availability, its features -- and arms or disarms it only with the right PIN.
A wrong PIN is REFUSED with Home Assistant's own error, so every keypad (HA's
alarm card, the app, voice, the HK keypad) says so, with no helper entities.

One entry per protected alarm; its unique id is "alarm_pin:<the alarm>". The
PIN is never stored, only a salted hash (pin.py). Point keypads and dashboards
at the PIN panel; automations can keep using the alarm itself.

  * Add feature -> Alarm PIN   the alarm to protect, a PIN (typed twice),
                             whether arming needs it;
  * Configure                another alarm, a new PIN typed twice (both empty
                             keeps the current one), the arm rule;
  * the settings page        the same, through settings_ws.py.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlowResult, OptionsFlow
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .. import ALARM_PIN, entry_data, legacy, unique_id
from . import checks, settings_ws
from .const import ALREADY, CONF_ALARM, CONF_ARM_REQUIRED
from .pin import hash_pin

PLATFORMS = [Platform.ALARM_CONTROL_PANEL]


async def async_setup(hass: HomeAssistant) -> None:
    # the HK Settings page (settings_ws.py)
    settings_ws.async_register(hass)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await legacy.async_adopt(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # A new PIN, the arm rule, or another alarm: the panel is rebuilt with it.
    entry.async_on_unload(entry.add_update_listener(_reload))
    return True


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """The protected alarm and the arm rule -- never the PIN's hash or its salt."""
    from homeassistant.components.diagnostics import async_redact_data
    return {"data": dict(entry.data),
            "options": async_redact_data(dict(entry.options), {"hash", "salt"})}


class FlowSteps:
    """Add feature -> Alarm PIN: the alarm to protect, a PIN (typed twice),
    whether arming needs it."""

    async def async_step_alarm_pin(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            alarm = user_input[CONF_ALARM]
            if err := checks.alarm_error(self.hass, alarm):
                errors[CONF_ALARM] = err
            pin = "" if errors else checks.new_pin(user_input, errors, required=True)
            if not errors:
                await self.async_set_unique_id(unique_id(ALARM_PIN, alarm))
                self._abort_if_unique_id_configured(error=ALREADY)     # a race: checked above
                stored = await self.hass.async_add_executor_job(hash_pin, pin)
                return self.async_create_entry(
                    title=checks.title(self.hass, alarm), data=entry_data(ALARM_PIN, {CONF_ALARM: alarm}),
                    options={CONF_ARM_REQUIRED: bool(user_input.get(CONF_ARM_REQUIRED, True)), **stored})
        return self.async_show_form(step_id="alarm_pin", errors=errors, data_schema=vol.Schema({
            vol.Required(CONF_ALARM): checks.alarm_picker(self.hass),
            vol.Required("pin"): checks.pin_field(),
            vol.Required("pin_again"): checks.pin_field(),
            vol.Optional(CONF_ARM_REQUIRED, default=True): bool,
        }))

    async def async_import_alarm_pin(self, data: dict[str, Any]) -> ConfigFlowResult:
        """An older version's Alarm PIN entry (legacy.py): its alarm, the PIN's
        hash, the arm rule and its title, as they were."""
        old = data[legacy.IMPORT]
        made = legacy.created(ALARM_PIN, data)
        await self.async_set_unique_id(unique_id(ALARM_PIN, made.get(CONF_ALARM, "")))
        self._abort_if_unique_id_configured(error=ALREADY)
        return self.async_create_entry(title=old["title"], data=made, options=dict(old["options"]))


class AlarmPinOptions(OptionsFlow):
    """Configure: the alarm it protects, a new PIN (both empty keeps the
    current one) and the arm rule. Options it does not show are kept."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.async_step_alarm_pin_options(user_input)

    async def async_step_alarm_pin_options(self, user_input: dict[str, Any] | None = None
                                           ) -> ConfigFlowResult:
        entry = self.config_entry
        current = dict(entry.options)
        errors: dict[str, str] = {}
        if user_input is not None:
            alarm = user_input.get(CONF_ALARM) or entry.data[CONF_ALARM]
            if err := checks.alarm_error(self.hass, alarm, entry.entry_id):
                errors[CONF_ALARM] = err
            pin = checks.new_pin(user_input, errors, required=False)
            if not errors:
                options = {**current, CONF_ARM_REQUIRED: bool(user_input.get(CONF_ARM_REQUIRED, True))}
                if pin:
                    options.update(await self.hass.async_add_executor_job(hash_pin, pin))
                if alarm != entry.data[CONF_ALARM]:
                    # The entry IS the alarm it protects: its data, unique id
                    # and title follow -- in the same write as the options, so
                    # the panel is rebuilt once (the flow's own write then
                    # changes nothing).
                    self.hass.config_entries.async_update_entry(
                        entry, data={**entry.data, CONF_ALARM: alarm}, options=options,
                        unique_id=unique_id(ALARM_PIN, alarm), title=checks.title(self.hass, alarm))
                return self.async_create_entry(data=options)
        return self.async_show_form(
            step_id="alarm_pin_options", errors=errors,
            data_schema=self.add_suggested_values_to_schema(vol.Schema({
                vol.Required(CONF_ALARM): checks.alarm_picker(self.hass),
                vol.Optional("pin"): checks.pin_field(),
                vol.Optional("pin_again"): checks.pin_field(),
                vol.Optional(CONF_ARM_REQUIRED, default=True): bool,
            }), {CONF_ALARM: entry.data[CONF_ALARM],
                 CONF_ARM_REQUIRED: current.get(CONF_ARM_REQUIRED, True)}))


def options_flow(entry: ConfigEntry) -> OptionsFlow:
    return AlarmPinOptions()


def subentry_types(entry: ConfigEntry) -> dict:
    return {}
