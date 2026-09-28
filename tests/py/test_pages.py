"""Custom pages (settings.py SUBENTRY_PAGE): pages the house writes
itself -- Energy, EcoFlow -- items of the integration, sent to every screen and
shown by any generated dashboard that lists them."""
from __future__ import annotations

from unittest.mock import patch

from conftest import FakeConnection, entry

DOMAIN = "hk_frontend"
ENERGY = {"title": "Energy", "path": "energy", "icon": "mdi:flash", "type": "custom:hk-grid-view",
          "background": "#101010", "cards": [{"type": "custom:hk-heading-card", "name": "Energy"}]}


async def _view_of(_hass, key):
    return ENERGY if key == "dashboard-kitchen/energy" else None


async def _importable(_hass, exclude=""):
    return {"dashboard-kitchen/energy": "Energy · Kitchen"}


def _page(hass, path):
    return next((s for s in entry(hass).subentries.values() if s.subentry_type == "page" and s.unique_id == path), None)


async def _add(hass, first, view=None):
    e = entry(hass)
    with patch("custom_components.hk_frontend.config_flow._view_of", _view_of), \
            patch("custom_components.hk_frontend.config_flow._importable", _importable):
        r = await hass.config_entries.subentries.async_init((e.entry_id, "page"), context={"source": "user"})
        assert r["type"] == "form" and r["step_id"] == "user"
        r = await hass.config_entries.subentries.async_configure(r["flow_id"], first)
        if r["type"] != "form" or r["step_id"] != "view":
            return r
        return await hass.config_entries.subentries.async_configure(r["flow_id"], {} if view is None else {"view": view})


async def test_a_page_imported_from_a_dashboard_is_the_house_s_own(hass, frontend):
    from custom_components.hk_frontend import ws_settings_subscribe
    screen = FakeConnection(None)
    ws_settings_subscribe(hass, screen, {"id": 1})
    assert screen.sent[-1]["event"]["custom_pages"] == []
    e = entry(hass)
    with patch("custom_components.hk_frontend.config_flow._view_of", _view_of), \
            patch("custom_components.hk_frontend.config_flow._importable", _importable):
        r = await hass.config_entries.subentries.async_init((e.entry_id, "page"), context={"source": "user"})
        starts = [o["value"] for o in r["data_schema"].schema["start"].config["options"]]
        assert starts == ["blank", "dashboard-kitchen/energy"], "blank, or any dashboard's page"
        r = await hass.config_entries.subentries.async_configure(r["flow_id"], {
            "title": "Energy", "icon": "mdi:flash", "start": "dashboard-kitchen/energy"})
        assert r["step_id"] == "view"
        shown = {k.schema: (k.description or {}).get("suggested_value") for k in r["data_schema"].schema}
        assert shown["view"]["cards"] == ENERGY["cards"] and "title" not in shown["view"], \
            "the copied page, less what the page keeps itself"
        r = await hass.config_entries.subentries.async_configure(r["flow_id"], {"view": shown["view"]})
    assert r["type"] == "create_entry" and r["title"] == "Energy"
    await hass.async_block_till_done()
    page = screen.sent[-1]["event"]["custom_pages"][0]
    assert page == {"path": "energy", "title": "Energy", "icon": "mdi:flash",
                    "view": {"type": "custom:hk-grid-view", "background": "#101010", "cards": ENERGY["cards"]}}


async def test_an_address_is_checked(hass, frontend):
    r = await _add(hass, {"title": "Lights", "start": "blank"})
    assert r["errors"] == {"path": "bad_page_path"}, "a generated page's own address"
    r = await _add(hass, {"title": "Den", "path": "room-den", "start": "blank"})
    assert r["errors"] == {"path": "bad_page_path"}, "a room page's"
    r = await _add(hass, {"title": "Network Rack", "start": "blank"})
    assert r["type"] == "create_entry" and _page(hass, "network-rack"), "made from the name"
    r = await _add(hass, {"title": "Rack", "path": "network-rack", "start": "blank"})
    assert r["errors"] == {"path": "page_path_taken"}
    r = await _add(hass, {"title": "", "start": "blank"})
    assert r["errors"] == {"title": "name_needed"}


async def test_its_gear_edits_the_name_icon_and_yaml(hass, frontend):
    await _add(hass, {"title": "EcoFlow", "start": "blank"})
    sub = _page(hass, "ecoflow")
    e = entry(hass)
    r = await hass.config_entries.subentries.async_init(
        (e.entry_id, "page"), context={"source": "reconfigure", "subentry_id": sub.subentry_id})
    assert r["step_id"] == "reconfigure" and r["description_placeholders"]["path"] == "ecoflow"
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {"title": "EcoFlow", "view": [1, 2]})
    assert r["errors"] == {"base": "page_view"}, "a list is not a page"
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {
        "title": "EcoFlow Panel", "icon": "mdi:home-battery", "view": {"cards": [{"type": "x"}], "path": "nope"}})
    assert r["type"] == "abort" and r["reason"] == "reconfigure_successful"
    s = e.subentries[sub.subentry_id]
    assert s.title == "EcoFlow Panel" and s.unique_id == "ecoflow", "the address stays"
    assert s.data == {"title": "EcoFlow Panel", "icon": "mdi:home-battery", "view": {"cards": [{"type": "x"}]}}


async def test_a_dashboard_lists_them_on_its_pages(hass, frontend):
    """A screen's Pages on the HK Settings page: which custom pages it
    shows, in its page order (board/set)."""
    from homeassistant.config_entries import ConfigSubentry
    from custom_components.hk_frontend.panel import ws_board_set, ws_panel_get
    from custom_components.hk_frontend.settings import as_client
    from test_settings_api import Conn
    await _add(hass, {"title": "EcoFlow", "start": "blank"})
    await _add(hass, {"title": "Energy", "start": "blank"})
    e = entry(hass)
    hass.config_entries.async_add_subentry(e, ConfigSubentry(
        data={}, subentry_type="dashboard", title="Hall", unique_id="dashboard-hall"))
    conn = Conn(await hass.auth.async_create_user("Admin", group_ids=["system-admin"]))
    ws_panel_get(hass, conn, {"id": 1, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert [(p["path"], p["title"]) for p in conn.sent[-1]["result"]["custom_pages"]] == [
        ("ecoflow", "EcoFlow"), ("energy", "Energy")], "offered by title"
    ws_board_set(hass, conn, {"id": 2, "type": "hk_frontend/board/set", "dashboard": "dashboard-hall",
                              "changes": {"pages": ["weather", "energy", "lights", "ecoflow", "rooms"],
                                          "custom_pages": ["energy", "ecoflow"]}})
    b = as_client(e)["boards"]["dashboard-hall"]
    assert b["custom_pages"] == ["energy", "ecoflow"] and b["pages"] == ["weather", "energy", "lights", "ecoflow", "rooms"]
