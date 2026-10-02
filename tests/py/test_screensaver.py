"""The photo screensaver's own entities (screensaver.py, switch.py,
binary_sensor.py): one switch and one in-use sensor per screen that uses HK
Frontend's screensaver, the old WallPanel helper mirrored both ways while it
exists, the page's touches, and the settings feed naming the switch."""
from __future__ import annotations

from datetime import timedelta

from pytest_homeassistant_custom_component.common import MockUser, async_fire_time_changed  # noqa: F401

from homeassistant.config_entries import ConfigSubentry
from homeassistant.helpers import entity_registry as er

from conftest import entry
from test_accessories import Conn as _Conn

DOMAIN = "hk_frontend"
SW = "switch.hall_photo_screensaver"
INUSE = "binary_sensor.hall_screen_in_use"
LEGACY = "input_boolean.wallpanel_screensaver_hall"


class Conn(_Conn):
    def send_error(self, msg_id, code, message):
        self.sent.append({"id": msg_id, "type": "result", "success": False, "error": code, "message": message})


def _hall(**data):
    d = {"screensaver": True, "tablet_user": "hall", "idle_room": "hall"}
    d.update(data)
    return ConfigSubentry(data=d, subentry_type="dashboard", title="Hall", unique_id="dashboard-hall")


async def _add(hass, sub):
    hass.config_entries.async_add_subentry(entry(hass), sub)
    await hass.async_block_till_done(wait_background_tasks=True)


async def _change(hass, sub, **data):
    new = dict(sub.data)
    new.update(data)
    hass.config_entries.async_update_subentry(entry(hass), sub, data=new)
    await hass.async_block_till_done(wait_background_tasks=True)


def _touch(hass, conn, n=1, path="dashboard-hall"):
    from custom_components.hk_frontend.screensaver import ws_touch
    ws_touch(hass, conn, {"id": n, "type": "hk_frontend/screensaver/touch", "dashboard": path})
    return conn.sent[-1]


# ------------------------------------------------------------ the one timer
def test_the_in_use_window_is_starts_after_less_a_minute():
    from custom_components.hk_frontend.screensaver import window_of
    assert window_of(180) == 120 and window_of(300) == 240
    assert window_of(60) == 15 and window_of(15) == 15, "never shorter than 15 s"


# ------------------------------------------------------------ which screens
async def test_a_screen_with_hks_screensaver_gets_its_switch_and_sensor(hass, frontend):
    await _add(hass, _hall())
    sw, use = hass.states.get(SW), hass.states.get(INUSE)
    assert sw is not None and sw.state == "off" and sw.name == "Hall Photo screensaver"
    assert use is not None and use.state == "off" and use.name == "Hall Screen in use"
    assert sw.attributes["starts_after"] == 180 and sw.attributes["in_use_window"] == 120
    assert sw.attributes["dashboard"] == "dashboard-hall" and sw.attributes["last_touch"] is None
    reg = er.async_get(hass)
    ent = reg.async_get(SW)
    sub = next(s for s in entry(hass).subentries.values() if s.unique_id == "dashboard-hall")
    assert ent.config_subentry_id == sub.subentry_id, "tied to the screen's item"


async def test_the_entities_go_when_the_screen_stops_using_hks_screensaver(hass, frontend):
    sub = _hall()
    await _add(hass, sub)
    assert hass.states.get(SW) is not None
    await _change(hass, sub, screensaver_engine="wallpanel")
    assert hass.states.get(SW) is None and hass.states.get(INUSE) is None
    assert er.async_get(hass).async_get(SW) is None, "not left behind as unavailable"
    await _change(hass, sub, screensaver_engine="hk")
    assert hass.states.get(SW) is not None, "back when it is HK's again"
    await _change(hass, sub, screensaver=False)
    assert hass.states.get(SW) is None
    await _change(hass, sub, screensaver=True, tablet_user="")
    assert hass.states.get(SW) is None, "no tablet user, no tablet to put to sleep"


async def test_starts_after_is_on_both_entities(hass, frontend):
    sub = _hall()
    await _add(hass, sub)
    await _change(hass, sub, screensaver_options={"starts_after": 300})
    assert hass.states.get(SW).attributes["in_use_window"] == 240
    assert hass.states.get(INUSE).attributes["starts_after"] == 300


# ------------------------------------------------------------ the switch
async def test_the_switch_turns_on_and_off(hass, frontend):
    await _add(hass, _hall())
    await hass.services.async_call("switch", "turn_on", {"entity_id": SW}, blocking=True)
    assert hass.states.get(SW).state == "on"
    await hass.services.async_call("switch", "turn_off", {"entity_id": SW}, blocking=True)
    assert hass.states.get(SW).state == "off"


async def test_the_old_helper_is_mirrored_both_ways(hass, frontend):
    from homeassistant.setup import async_setup_component
    assert await async_setup_component(hass, "input_boolean", {"input_boolean": {
        "wallpanel_screensaver_hall": {"initial": True}}})
    await _add(hass, _hall())
    assert hass.states.get(SW).state == "on", "starts from the helper the house kept"
    # the house's automation turns the helper off -> the switch follows
    await hass.services.async_call("input_boolean", "turn_off", {"entity_id": LEGACY}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get(SW).state == "off"
    # the screensaver writes the switch -> the helper follows
    await hass.services.async_call("switch", "turn_on", {"entity_id": SW}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get(LEGACY).state == "on"
    await hass.services.async_call("switch", "turn_off", {"entity_id": SW}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get(LEGACY).state == "off" and hass.states.get(SW).state == "off"


async def test_with_no_old_helper_nothing_is_mirrored(hass, frontend):
    calls = []
    hass.bus.async_listen("call_service", lambda e: calls.append(e.data["domain"]))
    await _add(hass, _hall())
    await hass.services.async_call("switch", "turn_on", {"entity_id": SW}, blocking=True)
    await hass.async_block_till_done()
    assert "input_boolean" not in calls


# ------------------------------------------------------------ the page's touches
async def test_a_touch_puts_the_screen_in_use_for_its_window(hass, frontend, freezer):
    await _add(hass, _hall())
    await hass.auth.async_create_user("Owner")          # the first user is the owner, an admin
    tablet = Conn(await hass.auth.async_create_user("hall"))
    r = _touch(hass, tablet)
    assert r["success"] and r["result"] == {"window": 120}
    await hass.async_block_till_done()
    use = hass.states.get(INUSE)
    assert use.state == "on" and use.attributes["last_touch"]
    assert hass.states.get(SW).attributes["last_touch"] == use.attributes["last_touch"]
    freezer.tick(timedelta(seconds=100))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(INUSE).state == "on", "still inside the 120 s window"
    freezer.tick(timedelta(seconds=21))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(INUSE).state == "off", "off exactly when the window runs out"


async def test_only_the_screens_tablet_or_an_admin_may_touch(hass, frontend):
    await _add(hass, _hall())
    await hass.auth.async_create_user("Owner")          # the first user is the owner, an admin
    desk = Conn(await hass.auth.async_create_user("desk"))
    r = _touch(hass, desk)
    assert r["success"] is False and r["error"] == "unauthorized"
    assert hass.states.get(INUSE).state == "off"
    admin = Conn(await hass.auth.async_create_user("Admin", group_ids=["system-admin"]))
    assert _touch(hass, admin, 2)["success"]
    r = _touch(hass, admin, 3, path="dashboard-nowhere")
    assert r["success"] is False and r["error"] == "not_found"


# ------------------------------------------------------------ the settings feed
async def test_the_feed_names_each_screens_switch(hass, frontend):
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.screensaver import manager
    await _add(hass, _hall())
    await _add(hass, ConfigSubentry(data={}, subentry_type="dashboard", title="Desk", unique_id="dashboard-desk"))
    ids = manager(hass).switch_ids()
    assert ids == {"dashboard-hall": SW}
    client = S.as_client(entry(hass), switches=ids)
    assert client["boards"]["dashboard-hall"]["screensaver_switch"] == SW
    assert client["boards"]["dashboard-desk"]["screensaver_switch"] is None


async def test_a_renamed_switch_is_what_the_feed_names(hass, frontend):
    from custom_components.hk_frontend.screensaver import manager
    await _add(hass, _hall())
    er.async_get(hass).async_update_entity(SW, new_entity_id="switch.hall_photos")
    await hass.async_block_till_done(wait_background_tasks=True)
    assert manager(hass).switch_ids() == {"dashboard-hall": "switch.hall_photos"}


async def test_a_renamed_screen_renames_its_device(hass, frontend):
    from homeassistant.helpers import device_registry as dr
    sub = _hall()
    await _add(hass, sub)
    hass.config_entries.async_update_subentry(entry(hass), sub, title="Front Hall")
    await hass.async_block_till_done(wait_background_tasks=True)
    dev = dr.async_get(hass).async_get(er.async_get(hass).async_get(SW).device_id)
    from conftest import device_place
    assert dev.name == "Front Hall" and device_place(dev) == (entry(hass).entry_id, sub.subentry_id)
    assert hass.states.get(SW).name == "Front Hall Photo screensaver"


async def test_nothing_it_does_is_reported_as_deprecated(hass, frontend, caplog):
    """HA 2027.8 turns these reports into errors: adding, renaming and
    removing a screen's entities must not make any."""
    sub = _hall()
    await _add(hass, sub)
    hass.config_entries.async_update_subentry(entry(hass), sub, title="Front Hall")
    await hass.async_block_till_done(wait_background_tasks=True)
    await _change(hass, sub, screensaver=False)
    assert "Detected that custom integration 'hk_frontend'" not in caplog.text


# ------------------------------------------------------------ a new house, start to finish
async def test_a_new_house_gets_a_working_screensaver_without_making_anything(hass, frontend, monkeypatch):
    """The HACS path: add HK Frontend, add a Wall Tablet screen, turn on Photo
    Screensaver and choose the Tablet User -- that is all. No helper, no
    Tablet Room: the switch and In Use sensor are there, the screens are told
    the switch, and Setup Check is satisfied."""
    from types import SimpleNamespace
    from unittest.mock import patch
    from homeassistant.components import media_source
    from homeassistant.components.lovelace.const import LOVELACE_DATA
    from custom_components.hk_frontend import settings as S, setup_check
    from custom_components.hk_frontend.panel import ws_board_set
    from custom_components.hk_frontend.screensaver import manager
    from test_configure import _add

    # the dashboard as Lovelace has it, titled Kitchen (the harness has no Lovelace)
    hass.data[LOVELACE_DATA] = SimpleNamespace(
        dashboards={None: object(), "dashboard-kitchen": SimpleNamespace(config={"title": "Kitchen"})},
        resource_mode="storage", resources=SimpleNamespace(async_items=lambda: []))
    async def boards(_hass):
        return ["dashboard-kitchen"]
    with patch("custom_components.hk_frontend.config_flow._dashboards", boards):
        r = await _add(hass, "dashboard-kitchen", kind="wall_tablet")
    assert r["type"] == "create_entry"
    await hass.async_block_till_done(wait_background_tasks=True)
    assert manager(hass).switch_ids() == {}, "nothing yet: the screensaver is off"

    admin = Conn(await hass.auth.async_create_user("Admin", group_ids=["system-admin"]))
    await hass.auth.async_create_user("Kitchen Tablet")
    ws_board_set(hass, admin, {"id": 1, "type": "hk_frontend/board/set", "dashboard": "dashboard-kitchen",
                               "changes": {"screensaver": True, "tablet_user": "Kitchen Tablet"}})
    assert admin.sent[-1]["success"], admin.sent[-1]
    await hass.async_block_till_done(wait_background_tasks=True)

    sw = hass.states.get("switch.kitchen_photo_screensaver")
    assert sw is not None and sw.state == "off" and sw.attributes["starts_after"] == 180
    assert hass.states.get("binary_sensor.kitchen_screen_in_use").state == "off"
    assert not hass.states.async_entity_ids("input_boolean"), "no helper was made or needed"
    b = S.as_client(entry(hass), switches=manager(hass).switch_ids())["boards"]["dashboard-kitchen"]
    assert b["screensaver_switch"] == "switch.kitchen_photo_screensaver" and b["idle_room"] == ""


    async def browse(_hass, _id):
        return SimpleNamespace(children=[SimpleNamespace(media_class="image", media_content_type="image/jpeg",
                                                         can_expand=False)])
    monkeypatch.setattr(media_source, "async_browse_media", browse)
    lines = {x.title: x for x in await setup_check.async_run(hass, dict(entry(hass).options), S.boards(entry(hass)))}
    assert lines["Screensaver tablets"].ok is True and "switch.kitchen" in lines["Screensaver tablets"].detail
    assert lines["Screensaver photos"].ok is True
    assert "WallPanel" not in lines, "nothing from HACS is asked for"


async def test_a_screen_following_all_screens_takes_its_timer_from_there(hass, frontend):
    """The one timer, for a screen whose Same as All Screens is on: Starts
    After (and so the In Use window) is All Screens'."""
    from custom_components.hk_frontend.panel import ws_settings_set
    await _add(hass, _hall(screensaver_options=None))
    assert hass.states.get(SW).attributes["starts_after"] == 180
    admin = Conn(await hass.auth.async_create_user("Admin", group_ids=["system-admin"]))
    ws_settings_set(hass, admin, {"id": 1, "type": "hk_frontend/settings/set",
                                  "changes": {"look.saver": {"starts_after": 300}}})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert admin.sent[-1]["success"], admin.sent[-1]
    sw = hass.states.get(SW)
    assert sw.attributes["starts_after"] == 300 and sw.attributes["in_use_window"] == 240
