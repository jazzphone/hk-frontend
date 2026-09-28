"""Alarm PIN, a feature of HK Frontend, against real alarm entities: added
from Add feature, the PIN panel it makes, its Configure (a new PIN, the arm
rule, another alarm), and an entry of the older, separate hk_alarm_pin
integration adopted."""
from __future__ import annotations

import json

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.data_entry_flow import InvalidData
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component

from conftest import DOMAIN, add_feature, feature_entries

ALARM = "alarm_control_panel.home_alarm"
OTHER = "alarm_control_panel.garage"


async def two_alarms(hass):
    """Two code-less alarms that arm and disarm at once -- HA's manual alarm
    with no code, standing in for an alarm integration with no code of its
    own (for example Honeywell Lyric)."""
    assert await async_setup_component(hass, "alarm_control_panel", {"alarm_control_panel": [
        {"platform": "manual", "name": "Home Alarm", "code_arm_required": False,
         "arming_time": 0, "delay_time": 0, "trigger_time": 5},
        {"platform": "manual", "name": "garage", "code_arm_required": False,
         "arming_time": 0, "delay_time": 0, "trigger_time": 5}]})
    await hass.async_block_till_done()
    assert hass.states.get(ALARM).attributes.get("code_format") is None
    return ALARM


@pytest.fixture
async def alarms(hass):
    return await two_alarms(hass)


async def add(hass, alarm, pin="4321", arm_required=True, again=None):
    return await add_feature(hass, "alarm_pin", {
        "alarm": alarm, "pin": pin, "pin_again": pin if again is None else again,
        "arm_required": arm_required})


def pins(hass):
    return feature_entries(hass, "alarm_pin")


def panel_of(hass, entry):
    return er.async_get(hass).async_get_entity_id("alarm_control_panel", DOMAIN, entry.entry_id)


async def call(hass, service, entity, code=None):
    data = {"entity_id": entity}
    if code is not None:
        data["code"] = code
    await hass.services.async_call("alarm_control_panel", service, data, blocking=True)
    await hass.async_block_till_done()


async def configure(hass, entry, *steps):
    """Configure, one submit per step; the last result."""
    r = await hass.config_entries.options.async_init(entry.entry_id)
    assert r["type"] == "form" and r["step_id"] == "alarm_pin_options"
    for step in steps:
        r = await hass.config_entries.options.async_configure(r["flow_id"], step)
    await hass.async_block_till_done()
    return r


async def test_add_refuses_nonsense_and_duplicates(hass, frontend, alarms):
    r = await add(hass, ALARM, pin="12")
    assert r["errors"] == {"pin": "alarm_pin_too_short"}
    r = await add(hass, ALARM, pin="4321", again="4312")          # a slip is caught
    assert r["errors"] == {"pin_again": "alarm_pin_mismatch"}
    assert not pins(hass)
    r = await add(hass, ALARM)
    assert r["type"] == "create_entry" and r["title"] == "Home Alarm"
    (entry,) = pins(hass)
    assert entry.domain == DOMAIN and entry.data == {"kind": "alarm_pin", "alarm": ALARM}
    assert entry.unique_id == "alarm_pin:alarm_control_panel.home_alarm"
    ent = er.async_get(hass).async_get(panel_of(hass, entry))
    assert ent.platform == DOMAIN and ent.unique_id == entry.entry_id and ent.config_entry_id == entry.entry_id
    r = await add(hass, ALARM)                                     # it has a PIN already
    assert r["type"] == "form" and r["errors"] == {"alarm": "alarm_pin_taken"}
    assert len(pins(hass)) == 1
    with pytest.raises(InvalidData):                  # the picker leaves its own panels out
        await add(hass, panel_of(hass, entry))
    # one per alarm: the feature menu goes on offering it
    from homeassistant import config_entries
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert "alarm_pin" in r["menu_options"]
    hass.config_entries.flow.async_abort(r["flow_id"])


async def test_its_own_panels_are_only_alarm_pin_entries_alarm_panels(hass, frontend, alarms):
    """The integration owns other entities (the house's switch): never
    counted as a PIN panel, and a PIN panel is never the house's."""
    from custom_components.hk_frontend.features.alarm_pin import checks
    await add(hass, ALARM)
    (entry,) = pins(hass)
    assert checks.ours(hass) == [panel_of(hass, entry)]


async def test_the_pin_is_never_stored(hass, frontend, alarms):
    await add(hass, ALARM)
    (entry,) = pins(hass)
    blob = json.dumps({"d": dict(entry.data), "o": dict(entry.options)})
    assert "4321" not in blob and '"hash"' in blob
    from custom_components.hk_frontend.diagnostics import async_get_config_entry_diagnostics
    diag = await async_get_config_entry_diagnostics(hass, entry)
    assert diag["options"]["hash"] == "**REDACTED**" and diag["options"]["salt"] == "**REDACTED**"
    assert diag["data"]["alarm"] == ALARM and diag["options"]["arm_required"] is True


async def test_it_mirrors_and_forwards_only_the_right_pin(hass, frontend, alarms):
    await add(hass, ALARM)
    gate = panel_of(hass, pins(hass)[0])
    st = hass.states.get(gate)
    assert st.state == "disarmed" and st.attributes["code_format"] == "number"
    assert st.attributes["protects"] == ALARM and st.name == "Home Alarm PIN"
    with pytest.raises(ServiceValidationError) as err:
        await call(hass, "alarm_arm_away", gate, "1111")
    assert err.value.translation_domain == DOMAIN and err.value.translation_key == "alarm_pin_invalid_code"
    assert hass.states.get(ALARM).state == "disarmed", "a wrong PIN reached the alarm"
    with pytest.raises(ServiceValidationError):
        await call(hass, "alarm_arm_away", gate)
    await call(hass, "alarm_arm_away", gate, "4321")
    assert hass.states.get(ALARM).state == "armed_away"
    assert hass.states.get(gate).state == "armed_away"
    with pytest.raises(ServiceValidationError):
        await call(hass, "alarm_disarm", gate, "0000")
    await call(hass, "alarm_disarm", gate, "4321")
    assert hass.states.get(ALARM).state == "disarmed"


async def test_two_alarms_two_pins(hass, frontend, alarms):
    await add(hass, ALARM, pin="1111")
    await add(hass, OTHER, pin="2222")
    e1, e2 = sorted(pins(hass), key=lambda e: e.title)           # "Home Alarm", "garage"
    g_alarm, g_garage = panel_of(hass, e1), panel_of(hass, e2)
    with pytest.raises(ServiceValidationError):
        await call(hass, "alarm_arm_home", g_alarm, "2222")        # the garage's PIN
    await call(hass, "alarm_arm_home", g_garage, "2222")
    assert hass.states.get(OTHER).state == "armed_home" and hass.states.get(ALARM).state == "disarmed"


async def test_configure_changes_the_pin_and_the_arm_rule(hass, frontend, alarms):
    await add(hass, ALARM)
    (entry,) = pins(hass)
    r = await configure(hass, entry, {"alarm": ALARM, "pin": "12", "pin_again": "12"})
    assert r["errors"] == {"pin": "alarm_pin_too_short"}
    # A slip in either box changes nothing: the old PIN stays.
    r = await configure(hass, entry, {"alarm": ALARM, "pin": "9876", "pin_again": "9867"})
    assert r["errors"] == {"pin_again": "alarm_pin_mismatch"}
    r = await configure(hass, entry, {"alarm": ALARM, "pin": "", "pin_again": "9876"})
    assert r["errors"] == {"pin": "alarm_pin_too_short"}
    r = await configure(hass, entry, {"alarm": ALARM, "arm_required": False})
    assert r["type"] == "create_entry"
    gate = panel_of(hass, entry)
    await call(hass, "alarm_arm_home", gate)                       # no PIN to arm now
    assert hass.states.get(ALARM).state == "armed_home"
    with pytest.raises(ServiceValidationError):
        await call(hass, "alarm_disarm", gate)
    await call(hass, "alarm_disarm", gate, "4321")                 # the kept PIN
    await configure(hass, entry, {"alarm": ALARM, "pin": "9876", "pin_again": "9876", "arm_required": True})
    with pytest.raises(ServiceValidationError):
        await call(hass, "alarm_arm_home", gate, "4321")
    await call(hass, "alarm_arm_home", gate, "9876")
    assert entry.data == {"kind": "alarm_pin", "alarm": ALARM}, "the alarm stays"


async def test_configure_moves_it_to_another_alarm(hass, frontend, alarms):
    """What Reconfigure did: another alarm, same PIN and arm rule, same panel."""
    await add(hass, ALARM)
    (entry,) = pins(hass)
    gate = panel_of(hass, entry)
    r = await configure(hass, entry, {"alarm": OTHER})
    assert r["type"] == "create_entry"
    assert entry.unique_id == "alarm_pin:alarm_control_panel.garage" and entry.data["alarm"] == OTHER
    assert entry.title == "garage" and entry.options["arm_required"] is True
    assert panel_of(hass, entry) == gate, "the same panel"
    assert hass.states.get(gate).attributes["protects"] == OTHER
    await call(hass, "alarm_arm_away", gate, "4321")
    assert hass.states.get(OTHER).state == "armed_away" and hass.states.get(ALARM).state == "disarmed"
    # an alarm another entry protects is refused; its own panel is no choice
    await add(hass, ALARM, pin="1111")
    r = await configure(hass, entry, {"alarm": ALARM})
    assert r["type"] == "form" and r["errors"] == {"alarm": "alarm_pin_taken"}
    assert entry.data["alarm"] == OTHER
    with pytest.raises(InvalidData):
        await configure(hass, entry, {"alarm": gate})


async def test_it_follows_its_alarm_going_away(hass, frontend, alarms):
    await add(hass, ALARM)
    gate = panel_of(hass, pins(hass)[0])
    hass.states.async_set(ALARM, "unavailable")
    await hass.async_block_till_done()
    assert hass.states.get(gate).state == "unavailable"


async def test_unload_and_remove(hass, frontend, alarms):
    await add(hass, ALARM)
    (entry,) = pins(hass)
    gate = panel_of(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(gate).state == "unavailable"
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(gate).state == "disarmed"
    assert await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert er.async_get(hass).async_get(gate) is None
    assert hass.config_entries.async_get_entry(frontend.entry_id), "the house's entry stays"


async def test_an_alarm_not_loaded_yet_still_gives_its_name(hass, frontend):
    """No state yet (its integration has not loaded): the registry's name."""
    er.async_get(hass).async_get_or_create("alarm_control_panel", "other_integration", "abc",
                                           suggested_object_id="house_alarm", original_name="House Alarm")
    r = await add(hass, "alarm_control_panel.house_alarm")
    assert r["type"] == "create_entry" and r["title"] == "House Alarm"


async def test_an_old_hk_alarm_pin_entry_is_adopted(hass, frontend, alarms):
    """An entry of the older, separate hk_alarm_pin integration becomes an
    Alarm PIN entry of HK Frontend; its panel keeps its entity id and moves
    to it, and the PIN (only ever a hash) works."""
    from custom_components.hk_frontend.features import legacy
    from custom_components.hk_frontend.features.alarm_pin.pin import hash_pin
    stored = await hass.async_add_executor_job(hash_pin, "4321")
    old = MockConfigEntry(domain="hk_alarm_pin", title="Home Alarm", data={"alarm": ALARM},
                          options={"arm_required": False, **stored}, unique_id=ALARM)
    old.add_to_hass(hass)
    dreg, ereg = dr.async_get(hass), er.async_get(hass)
    dev = dreg.async_get_or_create(config_entry_id=old.entry_id, identifiers={("hk_alarm_pin", old.entry_id)},
                                   name="Home Alarm PIN", entry_type=dr.DeviceEntryType.SERVICE)
    made = ereg.async_get_or_create("alarm_control_panel", "hk_alarm_pin", old.entry_id, config_entry=old,
                                    device_id=dev.id, suggested_object_id="alarm_panel_keypad")
    ereg.async_update_entity(made.entity_id, name="Alarm Panel Keypad")
    panel = "alarm_control_panel.alarm_panel_keypad"
    assert made.entity_id == panel

    await legacy.async_import_all(hass)
    await hass.async_block_till_done()

    (entry,) = pins(hass)
    assert hass.config_entries.async_get_entry(old.entry_id) is None, "the old entry is gone"
    assert entry.title == "Home Alarm" and entry.unique_id == "alarm_pin:alarm_control_panel.home_alarm"
    assert entry.data == {"kind": "alarm_pin", "alarm": ALARM}, "the note is dropped once used"
    assert entry.options == {"arm_required": False, **stored}
    ent = ereg.async_get(panel)
    assert ent.platform == DOMAIN and ent.config_entry_id == entry.entry_id and ent.unique_id == entry.entry_id
    assert ent.name == "Alarm Panel Keypad" and ent.device_id == dev.id
    assert dreg.async_get(dev.id).identifiers == {(DOMAIN, entry.entry_id)}
    assert dr.async_entries_for_config_entry(dreg, entry.entry_id) == [dreg.async_get(dev.id)], "one device"
    st = hass.states.get(panel)
    assert st.state == "disarmed" and st.attributes["protects"] == ALARM
    await call(hass, "alarm_arm_away", panel)                      # the arm rule came along
    with pytest.raises(ServiceValidationError):
        await call(hass, "alarm_disarm", panel, "1111")
    await call(hass, "alarm_disarm", panel, "4321")                # the same PIN, never re-entered
    assert hass.states.get(ALARM).state == "disarmed"
    # a second start changes nothing
    await legacy.async_import_all(hass)
    await hass.async_block_till_done()
    assert len(pins(hass)) == 1 and ereg.async_get(panel).config_entry_id == entry.entry_id
