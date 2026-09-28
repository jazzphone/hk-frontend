"""Music's lifecycle: unload, reload, remove, an entry of the older,
separate hk_music integration adopted, and what callers are told at each
step."""
from __future__ import annotations

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant import config_entries
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from conftest import DOMAIN, FakeConnection, feature_entries
from music_sample_house import OFF, ROOMS, VOLUME, music_entry, subentries
from music_sample_house import house, music  # noqa: F401 -- the fixtures

ACTIONS = {"music_play", "music_transfer", "music_stop", "music_transport", "music_play_media"}


async def test_unload_then_reload(hass, music):
    from custom_components.hk_frontend.features.music import ws_music_subscribe
    e = music_entry(hass)
    conn = FakeConnection(None)
    ws_music_subscribe(hass, conn, {"id": 1})
    assert conn.sent[-1]["event"]["configured"] is True
    assert await hass.config_entries.async_unload(e.entry_id)
    await hass.async_block_till_done()
    assert conn.sent[-1]["event"] == {"configured": False}, "screens were not told"
    with pytest.raises(ServiceValidationError) as err:
        await hass.services.async_call(DOMAIN, "music_stop", {}, blocking=True, return_response=True)
    assert err.value.translation_key == "music_not_set_up"
    for _ in range(3):
        assert await hass.config_entries.async_reload(e.entry_id)
        await hass.async_block_till_done()
    assert conn.sent[-1]["event"]["configured"] is True
    assert len(e.update_listeners) == 1
    res = await hass.services.async_call(DOMAIN, "music_stop", {}, blocking=True, return_response=True)
    assert res == {"ok": True}


async def test_a_second_entry_cannot_be_added(hass, music):
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert r["type"] == "menu" and "music" not in r["menu_options"]
    # nor imported
    r = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_IMPORT},
        data={"kind": "music", "legacy": {"entry_id": "x", "domain": "hk_music", "data": {},
                                          "options": {}, "subentries": []}})
    assert r["type"] == "abort" and r["reason"] == "already_configured"
    assert len(feature_entries(hass, "music")) == 1


async def test_an_automation_learns_of_a_refusal(hass, music, house):
    with pytest.raises(HomeAssistantError, match="no playlist called nope"):
        await hass.services.async_call(DOMAIN, "music_play", {"rooms": [OFF], "playlist": "nope"},
                                       blocking=True)
    res = await hass.services.async_call(DOMAIN, "music_play", {"rooms": [OFF], "playlist": "nope"},
                                         blocking=True, return_response=True)
    assert res["ok"] is False
    await hass.services.async_call(DOMAIN, "music_stop", {}, blocking=True)


async def test_transport_level_is_bounded(hass, music, house):
    import voluptuous as vol
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(DOMAIN, "music_transport",
                                       {"player": OFF, "command": "volume_set", "level": 7},
                                       blocking=True)


async def test_an_old_hk_music_entry_is_adopted(hass, frontend, house):
    """An entry of the older, separate hk_music integration: its speakers,
    volume and home rooms, and every preset and playlist, become the Music
    feature's -- playable at once under HK Frontend's own action names."""
    from custom_components.hk_frontend.features import legacy
    user = await hass.auth.async_create_user("kitchen")
    options = {"speakers": list(ROOMS), "volume": VOLUME, "homes": {user.id: OFF}}
    items = [{"data": dict(s.data), "subentry_id": s.subentry_id, "subentry_type": s.subentry_type,
              "title": s.title, "unique_id": s.unique_id} for s in subentries()]
    items[0]["unique_id"] = "everywhere"          # a unique id is carried too
    old = MockConfigEntry(domain="hk_music", title="HK Music", data={}, options=options,
                          subentries_data=items)
    old.add_to_hass(hass)
    await legacy.async_import_all(hass)
    await hass.async_block_till_done()

    (e,) = feature_entries(hass, "music")
    assert e.title == "Music" and e.unique_id == "music"
    assert e.options == options
    got = sorted((s.subentry_type, s.title, dict(s.data), s.unique_id) for s in e.subentries.values())
    want = sorted((i["subentry_type"], i["title"], i["data"], i["unique_id"]) for i in items)
    assert got == want, "the same presets and playlists"
    assert hass.config_entries.async_get_entry(old.entry_id) is None, "the old entry is gone"
    assert e.data == {"kind": "music"}, "the adoption note is cleared once done"
    assert ACTIONS <= set(hass.services.async_services_for_domain(DOMAIN))

    mgr = e.runtime_data
    mgr.settle = 0
    key = next(p.key for p in mgr.config.playlists if p.name == "Country")
    res = await hass.services.async_call(DOMAIN, "music_play", {"rooms": [OFF], "playlist": key},
                                         blocking=True, return_response=True)
    assert res == {"ok": True, "leader": OFF}
    assert mgr.config.as_client(user.id)["home"] == OFF

    # and only once
    await legacy.async_import_all(hass)
    await hass.async_block_till_done()
    assert len(feature_entries(hass, "music")) == 1


async def test_an_adopted_playlist_keeps_its_key_when_the_import_carries_it(hass, frontend, house):
    """A playlist's key is its item id, which an automation names. The import
    flow keeps an id it is handed."""
    from custom_components.hk_frontend.features import legacy
    items = [{"data": dict(s.data), "subentry_type": s.subentry_type, "title": s.title,
              "unique_id": s.unique_id, "subentry_id": s.subentry_id} for s in subentries()]
    r = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_IMPORT},
        data={"kind": "music", legacy.IMPORT: {
            "entry_id": "gone", "domain": "hk_music", "title": "HK Music", "data": {},
            "options": {"speakers": list(ROOMS), "volume": VOLUME, "homes": {}},
            "unique_id": None, "subentries": items}})
    await hass.async_block_till_done()
    assert r["type"] == "create_entry"
    (e,) = feature_entries(hass, "music")
    assert set(e.subentries) == {i["subentry_id"] for i in items}


async def test_remove(hass, music):
    e = music_entry(hass)
    assert await hass.config_entries.async_remove(e.entry_id)
    await hass.async_block_till_done()
    assert not feature_entries(hass, "music")
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "music_stop", {}, blocking=True, return_response=True)
    # and it can be added again
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert "music" in r["menu_options"]
