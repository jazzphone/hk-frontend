"""Following an entity rename (rename.py): exact ids, HK Frontend's own
structured settings only, card configurations reported and never rewritten,
nothing overwritten, everything said in one notification."""
from __future__ import annotations

from custom_components.hk_frontend import rename as R

OLD, NEW = "light.a", "light.b"


# ------------------------------------------------------------ the rules
def test_only_an_exact_value_is_replaced():
    assert R._swap(OLD, OLD, NEW) == (NEW, True)
    assert R._swap("light.a_2", OLD, NEW) == ("light.a_2", False), "never a substring"
    assert R._swap("xlight.a", OLD, NEW) == ("xlight.a", False)
    assert R._swap(["light.z", OLD, "light.a_2"], OLD, NEW) == (["light.z", NEW, "light.a_2"], True)
    assert R._swap({"entity": OLD}, OLD, NEW) == ({"entity": OLD}, False), "a mapping is not a value"
    assert R._swap(5, OLD, NEW) == (5, False)


def test_a_list_that_already_names_the_new_id_keeps_one():
    assert R._swap([NEW, OLD, "light.z"], OLD, NEW) == ([NEW, "light.z"], True)


def test_options_follow_value_list_and_counts_but_never_the_radar():
    dash = {"weather": {"entity": "weather.home", "outside": OLD, "radar": {"layers": [OLD]}},
            "features": {"house_timers": ["timer.x", OLD]},
            "counts": {"lights": {"exclude": [OLD], "include": []}},
            "security": {"alarm": "alarm_control_panel.a"}}
    out, paths = R.rewrite_options(dash, OLD, NEW)
    assert out["weather"]["outside"] == NEW and out["features"]["house_timers"] == ["timer.x", NEW]
    assert out["counts"]["lights"]["exclude"] == [NEW]
    assert out["weather"]["radar"] == {"layers": [OLD]}, "third-party card options are never touched"
    assert sorted(paths) == ["counts.lights.exclude", "features.house_timers", "weather.outside"]
    assert dash["weather"]["outside"] == OLD, "the original is not mutated"


def test_items_follow_only_their_named_fields():
    board = {"favorites": [OLD], "cameras": [], "scenes": [OLD], "title": OLD,
             "wallpanel_options": {"entity": OLD}, "custom_pages": ["light.a"]}
    out, paths = R.rewrite_fields(board, R.BOARD_KEYS, OLD, NEW)
    assert out["favorites"] == [NEW] and out["scenes"] == [NEW] and sorted(paths) == ["favorites", "scenes"]
    assert out["title"] == OLD and out["wallpanel_options"] == {"entity": OLD} and out["custom_pages"] == ["light.a"]


def test_accessories_move_the_settings_and_every_order():
    data = {"entities": {OLD: {"name": "Lamp"}, "light.k": {"fav_with": [OLD, "light.z"]}},
            "rooms": {"kitchen": ["light.k", OLD]}, "pages": {"vacuums": ["vacuum.x"]}, "into": {}}
    out, changed, clash = R.rewrite_accessories(data, OLD, NEW)
    assert out["entities"][NEW] == {"name": "Lamp"} and OLD not in out["entities"]
    assert out["entities"]["light.k"]["fav_with"] == [NEW, "light.z"]
    assert out["rooms"]["kitchen"] == ["light.k", NEW] and out["pages"] == {"vacuums": ["vacuum.x"]}
    assert not clash and len(changed) == 3


def test_accessories_never_overwrite_the_new_ids_own_settings():
    data = {"entities": {OLD: {"name": "Old"}, NEW: {"name": "Mine"}}, "rooms": {}, "pages": {}}
    out, changed, clash = R.rewrite_accessories(data, OLD, NEW)
    assert out["entities"] == {OLD: {"name": "Old"}, NEW: {"name": "Mine"}}
    assert clash and not changed


def test_a_favorite_with_itself_is_dropped_after_the_rename():
    data = {"entities": {NEW: {"fav_with": [OLD, "light.z"]}}, "rooms": {}, "pages": {}}
    out, _c, _x = R.rewrite_accessories(data, OLD, NEW)
    assert out["entities"][NEW]["fav_with"] == ["light.z"]


# ------------------------------------------------ through the registry
async def _house(hass, frontend):
    """An entry with an old id in each place it may be: options, a screen, a
    pop-up, a custom page's cards (with an action that looks like an id),
    and the accessories store."""
    from homeassistant.config_entries import ConfigSubentry
    from custom_components.hk_frontend import accessories
    e = frontend
    dash = dict(e.options.get("dashboard") or {})
    dash["features"] = {**(dash.get("features") or {}), "temperature": OLD, "house_timers": []}
    hass.config_entries.async_update_entry(e, options={**e.options, "dashboard": dash})
    hass.config_entries.async_add_subentry(e, ConfigSubentry(
        data={"dashboard": "dashboard-kitchen", "favorites": [OLD, "light.z"], "wallpanel_options": {"x": OLD}},
        subentry_type="dashboard", title="Kitchen", unique_id="dashboard-kitchen"))
    hass.config_entries.async_add_subentry(e, ConfigSubentry(
        data={"kind": "accessories", "entities": [OLD], "name": "Lamps"},
        subentry_type="popup", title="Lamps", unique_id="lamps"))
    view = {"cards": [{"type": "custom:hk-stat-card", "entity": OLD,
                       "tap_action": {"action": "perform-action", "perform_action": "select.select_option"}}]}
    hass.config_entries.async_add_subentry(e, ConfigSubentry(
        data={"title": "Energy", "view": view}, subentry_type="page", title="Energy", unique_id="energy"))
    acc = accessories.get(hass)
    acc.set(OLD, {"name": "Lamp"})
    await hass.async_block_till_done()
    return e, view


def _registered(hass, object_id="a"):
    from homeassistant.helpers import entity_registry as er
    reg = er.async_get(hass)
    return reg, reg.async_get_or_create("light", "test", object_id, suggested_object_id=object_id)


async def test_a_rename_is_followed_everywhere_it_may_be_and_said(hass, frontend):
    from custom_components.hk_frontend import accessories
    e, view = await _house(hass, frontend)
    reg, ent = _registered(hass)
    assert ent.entity_id == OLD
    reg.async_update_entity(OLD, new_entity_id=NEW)
    await hass.async_block_till_done()

    assert e.options["dashboard"]["features"]["temperature"] == NEW
    subs = {s.unique_id: s for s in e.subentries.values()}
    assert subs["dashboard-kitchen"].data["favorites"] == [NEW, "light.z"]
    assert subs["lamps"].data["entities"] == [NEW]
    assert accessories.get(hass).data["entities"].get(NEW) == {"name": "Lamp"}
    # never rewritten: a card configuration, a third-party option
    assert subs["energy"].data["view"] == view, "the custom page's cards are untouched"
    assert subs["dashboard-kitchen"].data["wallpanel_options"] == {"x": OLD}
    # and said, both halves
    from homeassistant.components import persistent_notification
    notes = persistent_notification._async_get_or_create_notifications(hass)
    msg = next(n["message"] for k, n in notes.items() if k.startswith(R.NOTIFY_ID))
    assert "light.a" in msg and "custom page Energy" in msg and "wallpanel_options" in msg


async def test_anything_that_is_not_a_rename_changes_nothing(hass, frontend):
    e, _view = await _house(hass, frontend)
    before = (dict(e.options), {s.unique_id: dict(s.data) for s in e.subentries.values()})
    reg, _ent = _registered(hass)
    reg.async_update_entity(OLD, name="A new friendly name")      # an update, no new id
    reg.async_remove(OLD)                                          # a removal
    await hass.async_block_till_done()
    assert (dict(e.options), {s.unique_id: dict(s.data) for s in e.subentries.values()}) == before


async def test_a_failure_changes_nothing_further_and_is_logged(hass, frontend, caplog):
    from unittest.mock import patch
    await _house(hass, frontend)
    reg, _ent = _registered(hass)
    with patch.object(R, "rewrite_options", side_effect=RuntimeError("boom")):
        reg.async_update_entity(OLD, new_entity_id=NEW)
        await hass.async_block_till_done()
    assert "failed; nothing further was changed" in caplog.text
