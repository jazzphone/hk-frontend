"""Adding the integration, and what its own entry does not hold."""
from __future__ import annotations

from conftest import DOMAIN, entry


async def test_only_one_house(hass, frontend):
    """A second Add feature is the feature menu, never a second house."""
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert r["type"] == "menu" and r["step_id"] == "feature"


async def test_setup_starts_empty_and_assumes_no_house(hass, base):
    """Adding the integration asks nothing and imports nothing."""
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert r["type"] == "form" and not r["data_schema"].schema
    r = await hass.config_entries.flow.async_configure(r["flow_id"], {})
    assert r["type"] == "create_entry"
    e = entry(hass)
    assert e.options == {} and not e.subentries
    assert e.minor_version == 7, "a new entry is already the latest version"


async def test_the_house_entry_holds_no_music(hass, frontend):
    """Whole-home music is the Music feature's own entry: the house's
    Configure has no Speakers page and its items are only its own."""
    from homeassistant.config_entries import HANDLERS

    r = await hass.config_entries.options.async_init(frontend.entry_id)
    assert r["type"] == "menu" and "music" not in r["menu_options"]
    # its items are dashboards, pop-ups and custom pages -- no music, no speakers
    assert list(HANDLERS[DOMAIN].async_get_supported_subentry_types(frontend)) == ["dashboard", "popup", "page", "chip"]
    # its actions: Show pop-up, and the features' own (each answers "not
    # added" until its feature is)
    assert {"show_popup", "clean_areas"} <= set(hass.services.async_services_for_domain(DOMAIN))
