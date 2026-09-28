"""Clean Areas, a feature of HK Frontend: added from Add feature, its action,
its Configure, and an entry of the older, separate hk_clean_areas
integration adopted."""
from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import DOMAIN, add_feature, feature_entries


async def test_added_from_the_feature_menu_once(hass, frontend):
    r = await add_feature(hass, "clean_areas", {"vacuums": ["vacuum.downstairs"]})
    assert r["type"] == "create_entry" and r["title"] == "Clean Areas"
    (e,) = feature_entries(hass, "clean_areas")
    assert e.options == {"vacuums": ["vacuum.downstairs"]}
    assert hass.services.has_service(DOMAIN, "clean_areas")
    # one per house: the menu no longer offers it
    from homeassistant import config_entries
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert "clean_areas" not in r["menu_options"] and "alarm_pin" in r["menu_options"]


async def test_its_configure_keeps_what_it_does_not_show(hass, frontend):
    await add_feature(hass, "clean_areas", {})
    (e,) = feature_entries(hass, "clean_areas")
    r = await hass.config_entries.options.async_init(e.entry_id)
    assert r["type"] == "form" and r["step_id"] == "clean_areas_options"
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"vacuums": ["vacuum.up"], "areas": ["kitchen"]})
    assert r["type"] == "create_entry"
    assert e.options == {"vacuums": ["vacuum.up"], "areas": ["kitchen"]}


async def test_the_action_says_when_the_feature_is_not_added(hass, frontend):
    import pytest
    from homeassistant.exceptions import ServiceValidationError
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "clean_areas", {"areas": ["kitchen"]}, blocking=True,
                                       return_response=True)


async def test_an_old_hk_clean_areas_entry_is_adopted(hass, frontend):
    from custom_components.hk_frontend.features import legacy
    old = MockConfigEntry(domain="hk_clean_areas", title="HK Clean Areas", data={},
                          options={"vacuums": ["vacuum.downstairs"], "areas": ["kitchen"]})
    old.add_to_hass(hass)
    await legacy.async_import_all(hass)
    await hass.async_block_till_done()
    (e,) = feature_entries(hass, "clean_areas")
    assert e.options == {"vacuums": ["vacuum.downstairs"], "areas": ["kitchen"]}
    assert hass.config_entries.async_get_entry(old.entry_id) is None, "the old entry is gone"
    assert "legacy_entry_id" not in e.data and e.data["kind"] == "clean_areas"
    # and only once
    await legacy.async_import_all(hass)
    await hass.async_block_till_done()
    assert len(feature_entries(hass, "clean_areas")) == 1


async def test_every_screen_learns_it_is_added(hass, frontend):
    """The settings feed's `added`: its action is always there, so this is
    how a card knows to offer it."""
    from custom_components.hk_frontend import ws_settings_subscribe
    from conftest import FakeConnection
    screen = FakeConnection(None)
    ws_settings_subscribe(hass, screen, {"id": 1})
    assert screen.sent[-1]["event"]["added"] == []
    await add_feature(hass, "clean_areas", {})
    assert screen.sent[-1]["event"]["added"] == ["clean_areas"]
    (e,) = feature_entries(hass, "clean_areas")
    await hass.config_entries.async_unload(e.entry_id)
    await hass.async_block_till_done()
    assert screen.sent[-1]["event"]["added"] == []
