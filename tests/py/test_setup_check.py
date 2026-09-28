"""Configure -> Setup check, and the two Repairs issues behind it
(setup_check.py): what a new house is told, and that it clears itself."""
from __future__ import annotations

from types import SimpleNamespace

from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import entry

DOMAIN = "hk_frontend"


def test_the_version_floor():
    from custom_components.hk_frontend.setup_check import version_ok
    assert version_ok("2026.8.0") and version_ok("2026.9.3") and version_ok("2027.1.0")
    assert not version_ok("2026.7.4") and not version_ok("2025.12.0")
    assert version_ok("dev"), "a development build is not nagged"


async def test_the_theme_issue_appears_and_clears_itself_on_a_themes_reload(hass, frontend):
    from homeassistant.components.frontend import DATA_THEMES, EVENT_THEMES_UPDATED
    reg = ir.async_get(hass)
    hass.data.pop("hk_frontend_themes")     # themes.py could not read its file
    hass.data[DATA_THEMES] = {}
    hass.bus.async_fire(EVENT_THEMES_UPDATED)
    await hass.async_block_till_done()
    issue = reg.async_get_issue(DOMAIN, "theme_missing")
    assert issue is not None and issue.translation_key == "theme_missing"
    hass.data[DATA_THEMES] = {"HK Kiosk": {}}
    hass.bus.async_fire(EVENT_THEMES_UPDATED)
    await hass.async_block_till_done()
    assert reg.async_get_issue(DOMAIN, "theme_missing") is None
    assert reg.async_get_issue(DOMAIN, "ha_too_old") is None, "the harness is new enough"


def _house(hass):
    """An area that is ready, one that is not, and a device in no area."""
    areas = ar.async_get(hass)
    ready = areas.async_create("Den", icon="mdi:sofa")
    hass.states.async_set("sensor.den_t", "71", {"device_class": "temperature"})
    hass.states.async_set("sensor.den_h", "46", {"device_class": "humidity"})
    areas.async_update(ready.id, temperature_entity_id="sensor.den_t", humidity_entity_id="sensor.den_h")
    areas.async_create("Porch")
    src = MockConfigEntry(domain="demo")
    src.add_to_hass(hass)
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=src.entry_id,
                                                 identifiers={("demo", "lamp")}, name="Hall Lamp")
    er.async_get(hass).async_get_or_create("light", "demo", "lamp", device_id=dev.id,
                                           config_entry=src)
    diag = dr.async_get(hass).async_get_or_create(config_entry_id=src.entry_id,
                                                  identifiers={("demo", "bridge")}, name="Bridge")
    er.async_get(hass).async_get_or_create("sensor", "demo", "bridge_rssi", device_id=diag.id,
                                           config_entry=src, entity_category=er.EntityCategory.DIAGNOSTIC)
    watch = dr.async_get(hass).async_get_or_create(config_entry_id=src.entry_id,
                                                   identifiers={("demo", "watch")}, name="Watch")
    er.async_get(hass).async_get_or_create("device_tracker", "demo", "watch", device_id=watch.id,
                                           config_entry=src)


async def test_the_check_page_says_what_is_ready_and_what_to_fix(hass, frontend):
    _house(hass)
    e = entry(hass)
    r = await hass.config_entries.options.async_init(e.entry_id)
    assert "check" in r["menu_options"]
    r = await hass.config_entries.options.async_configure(r["flow_id"], {"next_step_id": "check"})
    assert r["type"] == "form" and r["step_id"] == "check"
    text = r["description_placeholders"]["report"]
    assert text.startswith("**1 thing to fix.**"), text.splitlines()[0]
    assert "⚠️\u2002**HK Kiosk theme**" in text
    assert "ℹ️\u2002**1 device in no area** — Hall Lamp." in text
    assert "Bridge" not in text and "Watch" not in text, "only devices with a tile count"
    assert "ℹ️\u2002**1 area with no icon** — Porch." in text
    assert "ℹ️\u2002**1 area with no temperature or humidity sensor** — Porch." in text
    assert "ℹ️\u2002**Menu and room pages** — Off on every dashboard." in text
    assert "ℹ️\u2002**Live TV** — Not added." in text
    # the things to fix come first
    assert text.index("⚠️") < text.index("✅") < text.index("ℹ️")
    # it saves nothing; submitting goes back to the menu
    before = dict(e.options)
    r = await hass.config_entries.options.async_configure(r["flow_id"], {})
    assert r["type"] == "menu" and dict(e.options) == before


async def test_the_menu_line_names_a_dashboard_that_does_not_exist(hass, frontend):
    from custom_components.hk_frontend import setup_check
    from homeassistant.components.lovelace.const import LOVELACE_DATA
    items = [{"url": "/hk/cards/hk-base.js?v=1"}]
    hass.data[LOVELACE_DATA] = SimpleNamespace(
        dashboards={None: object(), "dashboard-hall": object()}, resource_mode="yaml",
        resources=SimpleNamespace(async_items=lambda: items))
    lines = await setup_check.async_run(hass, {"dashboard": {"menu": {"dashboards": ["dashboard-hall", "dashboard-gone"]}}})
    by = {x.title: x for x in lines}
    assert by["Menu and room pages"].ok is False and "dashboard-gone" in by["Menu and room pages"].detail
    assert "dashboard-hall" not in by["Menu and room pages"].detail
    cards = by["Card files"]
    assert cards.ok is False and "YAML mode" in cards.detail and "/hk/cards/hk-base.js" not in cards.detail
    assert "/hk/cards/hk-room.js" in cards.detail
    lines = await setup_check.async_run(hass, {"dashboard": {"menu": {"dashboards": ["dashboard-hall"]}}})
    assert {x.title: x for x in lines}["Menu and room pages"].ok is True


async def test_the_menu_line_reads_the_dashboard_items(hass, frontend):
    """The menu is on where a dashboard's item says so."""
    from custom_components.hk_frontend import setup_check
    from homeassistant.components.lovelace.const import LOVELACE_DATA
    hass.data[LOVELACE_DATA] = SimpleNamespace(
        dashboards={None: object(), "dashboard-hall": object()}, resource_mode="storage",
        resources=SimpleNamespace(async_items=lambda: []))
    boards = {"dashboard-hall": {"menu": "open"}, "dashboard-den": {"menu": "off"}}
    line = {x.title: x for x in await setup_check.async_run(hass, {}, boards)}["Menu and room pages"]
    assert line.ok is True and "1 dashboard" in line.detail, "an item with the menu off does not count"
    boards["dashboard-gone"] = {"menu": "tab"}
    line = {x.title: x for x in await setup_check.async_run(hass, {}, boards)}["Menu and room pages"]
    assert line.ok is False and "dashboard-gone" in line.detail and "Dashboards" in line.detail
