"""The house entry's lifecycle: unload, reload, remove, re-add, and a newer
entry refused. Contracts, not internals: what a screen is sent at each step."""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import FakeConnection

DOMAIN = "hk_frontend"


def _entry(hass):
    return hass.config_entries.async_entries(DOMAIN)[0]


async def test_unload_then_reload(hass, frontend):
    from custom_components.hk_frontend import ws_settings_subscribe
    e = _entry(hass)
    conn = FakeConnection(None)
    ws_settings_subscribe(hass, conn, {"id": 2})
    assert conn.sent[-1]["event"]["configured"] is True
    switch = "switch.hk_frontend_seasonal_decorations"
    assert hass.states.get(switch).state == "on"

    assert await hass.config_entries.async_unload(e.entry_id)
    await hass.async_block_till_done()
    assert conn.sent[-1]["event"]["configured"] is True, "an unloaded entry keeps its settings"
    assert hass.states.get(switch).state == "unavailable"

    for _ in range(3):                             # repeated reloads leave one of everything
        assert await hass.config_entries.async_reload(e.entry_id)
        await hass.async_block_till_done()
    assert len(e.update_listeners) == 1
    assert hass.states.get(switch).state == "on"
    hass.config_entries.async_update_entry(e, options={**e.options, "files_folder": "hk_local"})
    await hass.async_block_till_done()
    sent = len(conn.sent)
    hass.config_entries.async_update_entry(e, options={**e.options, "files_folder": "hk_other"})
    await hass.async_block_till_done()
    assert len(conn.sent) == sent + 1, "one change, one message -- not one per reload"


async def test_remove_clears_its_repairs_and_screens_get_the_defaults(hass, frontend):
    from custom_components.hk_frontend import ws_settings_subscribe
    e = _entry(hass)
    reg = ir.async_get(hass)
    assert reg.async_get_issue(DOMAIN, "missing_font"), "the test house has no font"
    conn = FakeConnection(None)
    ws_settings_subscribe(hass, conn, {"id": 3})
    assert await hass.config_entries.async_remove(e.entry_id)
    await hass.async_block_till_done()
    assert not reg.async_get_issue(DOMAIN, "missing_font")
    assert not reg.async_get_issue(DOMAIN, "missing_glyphs")
    assert conn.sent[-1]["event"]["configured"] is False

    # ...and adding it again starts empty, nothing carried over
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    r = await hass.config_entries.flow.async_configure(r["flow_id"], {})
    assert r["type"] == "create_entry" and r["title"] == "HK Frontend"
    new = _entry(hass)
    assert new.options == {} and not new.subentries


async def test_a_newer_entry_is_refused_not_guessed(hass, base):
    newer = MockConfigEntry(domain=DOMAIN, title="HK Frontend", version=2, unique_id=DOMAIN,
                            data={}, options={})
    newer.add_to_hass(hass)
    assert not await hass.config_entries.async_setup(newer.entry_id)
    assert newer.state is config_entries.ConfigEntryState.MIGRATION_ERROR


async def test_a_second_house_entry_cannot_be_added(hass, frontend):
    """With the house's entry there, Add feature offers the features instead."""
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert r["type"] == "menu" and r["step_id"] == "feature"
    assert r["menu_options"] == ["music", "live_tv", "clean_areas", "alarm_pin"]
