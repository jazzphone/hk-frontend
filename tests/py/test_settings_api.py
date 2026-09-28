"""The settings page's writes (settings_api.py + panel.py): only
what changed, checked the way Configure checks it, refused by field -- never
quietly turned into a default -- and stored exactly where Configure stores
it, so the two surfaces stay one source of truth."""
from __future__ import annotations

import json

from pytest_homeassistant_custom_component.common import MockUser  # noqa: F401  (harness import order)

from conftest import entry
from test_accessories import Conn as _Conn

DOMAIN = "hk_frontend"


class Conn(_Conn):
    """Keeps the refusal's message too (the field -> reason map)."""

    def send_error(self, msg_id, code, message):
        self.sent.append({"id": msg_id, "type": "result", "success": False, "error": code,
                          "message": message})


async def _admin(hass):
    return Conn(await hass.auth.async_create_user("Admin", group_ids=["system-admin"]))


# ------------------------------------------------------------ what it covers
def test_every_screen_setting_can_be_written():
    from custom_components.hk_frontend import settings as S, settings_api as A
    assert set(A.BOARD) == set(S.BOARD_DEFAULTS), set(A.BOARD) ^ set(S.BOARD_DEFAULTS)


def test_every_house_setting_a_person_can_change_can_be_written():
    """Every stored house key but the older lists the house cannot set
    (read only while What counts is unsaved), the menu's pre-item lists, the
    idle/car lists derived from the screens, and the retired house-wide Parts
    switches (generated.chips ... -- each screen's own setting)."""
    from custom_components.hk_frontend import settings as S, settings_api as A
    legacy = {"security.garage", "security.locks", "security.doors", "security.windows",
              "features.thermostats", "idle.dashboards", "idle.rooms", "car.dashboards",
              *(f"menu.{k}" for k in S.DEFAULTS["menu"] if k not in ("glyph", "clock")),
              *(f"generated.{k}" for k in ("chips", "pages", "sky", "music", "rooms"))}
    dates = {f"sky.{k}" for k in S.SKY_DATES}
    stored = {f"{sec}.{k}" for sec, vals in S.DEFAULTS.items() for k in vals}
    missing = stored - legacy - dates - set(A.HOUSE)
    assert not missing, missing
    assert all(A.SKY_DATE.match(d) for d in dates)


# ------------------------------------------------------------ the house
def test_house_changes_are_checked_and_merged():
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_house
    opts = {"dashboard": {"look": {"glass": "clear", "frost": 30}}, "files_folder": "hk_local"}
    new, err = apply_house(opts, {"look.glass": "blur", "weather.place": "  HOME  ", "sidebar": False,
                                  "features.house_timers": ["timer.nap", "timer.nap", "timer.bed"]})
    assert err == {}
    m = S.merged(new)
    assert m["look"]["glass"] == "blur" and m["look"]["frost"] == 30, "the rest of the section kept"
    assert m["weather"]["place"] == "HOME" and new["sidebar"] is False and new["files_folder"] == "hk_local"
    assert m["features"]["house_timers"] == ["timer.nap", "timer.bed"]
    # refused by field, and nothing at all is written
    same, err = apply_house(opts, {"look.glass": "wobbly", "security.alarm": "light.kitchen",
                                   "look.frost": 140, "nope.nope": 1, "look.details": True})
    assert err == {"look.glass": "choice", "security.alarm": "entity", "look.frost": "amount",
                   "nope.nope": "unknown"}
    assert same == opts


def test_empty_means_automatic_not_an_error():
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_house
    new, err = apply_house({}, {"security.alarm": None, "weather.place": "", "look.photos": "",
                                "look.browse_view": "/music-browse/"})
    assert err == {}
    m = S.merged(new)
    assert m["security"]["alarm"] is None and m["weather"]["place"] is None
    assert m["look"]["photos"] == S.DEFAULTS["look"]["photos"], "empty photos folder is the default"
    assert m["look"]["browse_view"] == "music-browse"


def test_sky_dates_store_none_for_the_built_in_date():
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_house
    new, err = apply_house({}, {"sky.halloween_from": "09-22", "sky.christmas_from": "12-1",
                                "sky.thanksgiving_to": "Thanksgiving Day"})
    assert err == {}
    sky = S.merged(new)["sky"]
    assert sky["halloween_from"] is None and sky["christmas_from"] == "12-01" and sky["thanksgiving_to"] is None
    _, err = apply_house({}, {"sky.halloween_to": "Thanksgiving Day", "sky.spring_from": "13-40"})
    assert err == {"sky.halloween_to": "date", "sky.spring_from": "date"}
    # the hemisphere in the same change moves what "built in" is
    new, err = apply_house({}, {"sky.hemisphere": "south", "sky.spring_from": "09-22"})
    assert err == {} and S.merged(new)["sky"]["spring_from"] is None


def test_birthdays_themes_and_ordered_lists():
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_house
    new, err = apply_house({}, {
        "sky.birthdays": [{"name": "Alex", "month": 11, "day": 20}, {"name": "Emma", "month": 3, "day": 14}],
        "sky.themes": ["christmas", "halloween"],
        "browse.discover": ["most_played", "recently_played", "most_played"],
        "browse.hide": ["tracks", "artists"], "rooms.status": ["locks", "temperature"]})
    assert err == {}
    m = S.merged(new)
    assert [b["name"] for b in m["sky"]["birthdays"]] == ["Emma", "Alex"], "in date order"
    assert m["sky"]["themes"] == ["halloween", "christmas"], "in the house's order"
    assert m["browse"]["discover"] == ["most_played", "recently_played"], "in the order given"
    assert m["browse"]["hide"] == ["artists", "tracks"] and m["rooms"]["status"] == ["temperature", "locks"]
    _, err = apply_house({}, {"sky.birthdays": [{"name": "", "month": 1, "day": 1}],
                              "browse.discover": ["stations_for_you"]})
    assert set(err) == {"sky.birthdays", "browse.discover"}


def test_saving_one_kind_retires_only_its_old_list():
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_house
    opts = {"dashboard": {"security": {"locks": ["lock.a"], "doors": ["binary_sensor.d"]}}}
    new, err = apply_house(opts, {"counts.locks": {"exclude": ["lock.b"], "include": []}})
    assert err == {}
    m = S.merged(new)
    assert m["counts"]["locks"] == {"exclude": ["lock.b"], "include": []}
    assert m["security"]["locks"] == [] and m["security"]["doors"] == ["binary_sensor.d"]
    assert m["counts"]["doors"] is None, "an untouched kind stays automatic"
    new, err = apply_house(new, {"counts.locks": None})
    assert err == {} and S.merged(new)["counts"]["locks"] is None


# ------------------------------------------------------------ one screen
def test_screen_changes_are_checked_not_defaulted():
    from custom_components.hk_frontend.settings_api import apply_board
    data, err = apply_board({"menu": "chip"}, {"menu": "open", "dock_min": 1100, "frost": 30,
                                               "chips": ["lights", "sensor.mail"], "tab_position": "140"})
    assert err == {}
    assert data["menu"] == "open" and data["dock_min"] == 1100 and data["frost"] == 30
    assert data["chips"] == ["lights", "sensor.mail"] and data["tab_position"] == "140px"
    data, err = apply_board(data, {"frost": None, "glass": "house"})
    assert err == {} and data["frost"] is None, "None follows the house again"
    same, err = apply_board(data, {"tab_position": "somewhere", "idle_room": "Living Room!",
                                   "menu": "sideways", "chips": ["spaceships"], "wallpanel_options": [1],
                                   "whatever": 1})
    assert err == {"tab_position": "tab_position", "idle_room": "bad_room", "menu": "choice",
                   "chips": "choice", "wallpanel_options": "card_options", "whatever": "unknown"}
    assert same == data


async def test_the_commands_write_what_configure_reads(hass, frontend):
    from homeassistant.config_entries import ConfigSubentry
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.panel import ws_board_set, ws_settings_set
    conn = await _admin(hass)
    ws_settings_set(hass, conn, {"id": 1, "type": "hk_frontend/settings/set",
                                 "changes": {"look.glass": "frosted", "look.frost": 70}})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert conn.sent[-1]["success"], conn.sent[-1]
    look = S.merged(entry(hass).options)["look"]
    assert look["glass"] == "frosted" and look["frost"] == 70
    ws_settings_set(hass, conn, {"id": 2, "type": "hk_frontend/settings/set",
                                 "changes": {"look.glass": "frosted", "menu.glyph": "hamburger"}})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert conn.sent[-1]["error"] == "invalid_format"
    assert json.loads(conn.sent[-1]["message"]) == {"menu.glyph": "choice"}

    ws_board_set(hass, conn, {"id": 3, "type": "hk_frontend/board/set", "dashboard": "dashboard-hall",
                              "changes": {"menu": "open"}})
    assert conn.sent[-1]["error"] == "no_item"
    hass.config_entries.async_add_subentry(entry(hass), ConfigSubentry(
        data={}, subentry_type="dashboard", title="Hall", unique_id="dashboard-hall"))
    ws_board_set(hass, conn, {"id": 4, "type": "hk_frontend/board/set", "dashboard": "dashboard-hall",
                              "changes": {"idle_return": True, "idle_room": "hall", "glass": "blur"}})
    assert conn.sent[-1]["success"], conn.sent[-1]
    client = S.as_client(entry(hass))
    assert client["boards"]["dashboard-hall"]["glass"] == "blur"
    assert client["idle"]["dashboards"] == ["dashboard-hall"] and client["idle"]["rooms"] == {"dashboard-hall": "hall"}


async def test_only_admins_write(hass, frontend):
    import pytest
    from homeassistant.exceptions import Unauthorized
    from custom_components.hk_frontend.panel import ws_board_set, ws_settings_set
    await hass.auth.async_create_user("Owner")          # the first user is the owner, an admin
    tablet = Conn(await hass.auth.async_create_user("kitchen"))
    with pytest.raises(Unauthorized):
        ws_board_set(hass, tablet, {"id": 1, "type": "hk_frontend/board/set", "dashboard": "x", "changes": {}})
    with pytest.raises(Unauthorized):
        ws_settings_set(hass, tablet, {"id": 2, "type": "hk_frontend/settings/set", "changes": {}})


async def test_the_page_reads_what_it_lays_out(hass, frontend):
    from custom_components.hk_frontend.panel import ws_panel_get, ws_setup_check
    hass.states.async_set("lock.front", "locked")
    conn = await _admin(hass)
    ws_panel_get(hass, conn, {"id": 1, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    r = conn.sent[-1]["result"]
    for k in ("counts", "users", "integration", "thirdparty", "choices"):
        assert k in r, k
    assert r["counts"]["locks"]["auto"] == ["lock.front"] and r["counts"]["locks"]["saved"] is False
    assert r["integration"]["sidebar"] is True and "files" in r["integration"]
    ws_setup_check(hass, conn, {"id": 2, "type": "hk_frontend/setup/check"})
    await hass.async_block_till_done(wait_background_tasks=True)
    lines = conn.sent[-1]["result"]["lines"]
    assert lines and {"ok", "title", "detail"} <= set(lines[0])


# ------------------------------------------------------------ each settings page
# (what each page of settings does, through the page's own write)
async def _set(hass, changes):
    from custom_components.hk_frontend.panel import ws_settings_set
    conn = await _admin(hass)
    ws_settings_set(hass, conn, {"id": 1, "type": "hk_frontend/settings/set", "changes": changes})
    await hass.async_block_till_done(wait_background_tasks=True)
    return conn.sent[-1]


async def _screen(hass):
    from custom_components.hk_frontend import ws_settings_subscribe
    from conftest import FakeConnection
    conn = FakeConnection(None)
    ws_settings_subscribe(hass, conn, {"id": 7})
    return conn


async def test_general_what_the_house_has(hass, frontend):
    from custom_components.hk_frontend import settings as S
    r = await _set(hass, {"security.alarm": "alarm_control_panel.home", "features.temperature": "sensor.house",
                          "features.power": "sensor.power", "features.house_timers": ["timer.nap"]})
    assert r["success"], r
    m = S.merged(entry(hass).options)
    assert m["security"]["alarm"] == "alarm_control_panel.home"
    assert (m["features"]["temperature"], m["features"]["power"], m["features"]["house_timers"]) == (
        "sensor.house", "sensor.power", ["timer.nap"])


async def test_a_house_that_never_chose_an_alarm_is_offered_one(hass, frontend):
    from custom_components.hk_frontend.panel import ws_panel_get
    hass.states.async_set("alarm_control_panel.home", "disarmed")
    conn = await _admin(hass)
    ws_panel_get(hass, conn, {"id": 1, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert conn.sent[-1]["result"]["suggest"] == {"alarm": "alarm_control_panel.home"}
    await _set(hass, {"security.alarm": None})
    ws_panel_get(hass, conn, {"id": 2, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert conn.sent[-1]["result"]["suggest"] == {}, "chosen (even none): no more offers"


async def test_what_counts_offers_the_old_list_then_saving_a_kind_keeps_the_rest(hass, frontend):
    from custom_components.hk_frontend.panel import ws_panel_get
    for eid, dc in (("binary_sensor.front_door", "door"), ("binary_sensor.garage_entry", "door")):
        hass.states.async_set(eid, "off", {"device_class": dc})
    hass.config_entries.async_update_entry(entry(hass), options={"dashboard": {
        "security": {"alarm": "alarm_control_panel.home", "doors": ["binary_sensor.front_door"]},
        "features": {"temperature": "sensor.house"}}})
    await hass.async_block_till_done()
    conn = await _admin(hass)
    ws_panel_get(hass, conn, {"id": 1, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    doors = conn.sent[-1]["result"]["counts"]["doors"]
    assert doors["exclude"] == ["binary_sensor.garage_entry"] and doors["saved"] is False, "the old list, as a difference"
    assert doors["found"] == ["binary_sensor.front_door"]
    await _set(hass, {"counts.doors": {"exclude": doors["exclude"], "include": []}})
    d = entry(hass).options["dashboard"]
    assert d["security"]["doors"] == [] and d["security"]["alarm"] == "alarm_control_panel.home"
    assert d["features"]["temperature"] == "sensor.house"


async def test_weather_and_the_radar_options(hass, frontend):
    from custom_components.hk_frontend import settings as S
    r = await _set(hass, {"weather.entity": "weather.home", "weather.place": "HOME · SPRINGFIELD",
                          "weather.gust": "sensor.gust"})
    assert r["success"]
    w = S.merged(entry(hass).options)["weather"]
    assert (w["entity"], w["place"], w["gust"], w["feels_like"], w["radar"]) == (
        "weather.home", "HOME · SPRINGFIELD", "sensor.gust", None, {})
    r = await _set(hass, {"weather.radar": ["zoom_level", 7]})
    assert r["success"] is False and json.loads(r["message"]) == {"weather.radar": "card_options"}
    await _set(hass, {"weather.radar": {"zoom_level": 7, "data_source": "RainViewer"}})
    assert S.merged(entry(hass).options)["weather"]["radar"] == {"zoom_level": 7, "data_source": "RainViewer"}
    assert "sky" not in entry(hass).options["dashboard"], "only what changed"


async def test_the_sky_how_often_and_the_themes(hass, frontend):
    from custom_components.hk_frontend import settings as S
    r = await _set(hass, {"sky.halloween_often": "every_day", "sky.spooky_often": "never",
                          "sky.space_per_month": "2", "sky.themes": [t for t in S.THEMES if t not in (
                              "thanksgiving", "storybook-magic")], "sky.decorations": False})
    assert r["success"]
    sky = S.merged(entry(hass).options)["sky"]
    assert (sky["halloween_often"], sky["spooky_often"], sky["space_per_month"]) == ("every_day", "never", "2")
    assert "thanksgiving" not in sky["themes"] and "halloween" in sky["themes"] and sky["decorations"] is False
    r = await _set(hass, {"sky.halloween_often": "hourly"})
    assert r["success"] is False
    await _set(hass, {"sky.halloween_often": None})
    assert S.merged(entry(hass).options)["sky"]["halloween_often"] is None, "back to built in"


async def test_advanced_the_clock_the_idle_default_and_the_escape_hatches(hass, frontend):
    await _set(hass, {"clock.time": "sensor.time", "clock.date": None, "idle.default": "input_number.idle",
                      "features.vacuum_script": "script.clean"})
    d = entry(hass).options["dashboard"]
    assert d["clock"] == {"time": "sensor.time", "date": None}, "empty: the screen's own clock"
    assert d["idle"]["default"] == "input_number.idle" and d["features"]["vacuum_script"] == "script.clean"
    assert d["features"]["alarm_bad_code"] is None and "look" not in d


async def test_the_glass_and_its_amounts_reach_every_screen(hass, frontend):
    screen = await _screen(hass)
    look = screen.sent[-1]["event"]["look"]
    assert (look["glass"], look["frost"], look["blur"]) == ("clear", 50, 50)
    await _set(hass, {"look.glass": "blur_each", "look.blur": 80})
    look = entry(hass).options["dashboard"]["look"]
    assert (look["glass"], look["blur"], look["frost"]) == ("blur_each", 80, 50)
    assert screen.sent[-1]["event"]["look"]["blur"] == 80, "screens were told"
    r = await _set(hass, {"look.glass": "sparkly"})
    assert r["success"] is False and entry(hass).options["dashboard"]["look"]["glass"] == "blur_each"


async def test_music_categories_rows_and_the_browse_page(hass, frontend):
    screen = await _screen(hass)
    await _set(hass, {"browse.hide": ["podcasts", "audiobooks", "artists"],
                      "browse.discover": ["favourite_songs", "recent_artists", "favourite_songs"],
                      "look.browse_view": "/tunes/"})
    d = entry(hass).options["dashboard"]
    assert d["browse"]["hide"] == ["artists", "podcasts", "audiobooks"]
    assert d["browse"]["discover"] == ["favourite_songs", "recent_artists"] and d["look"]["browse_view"] == "tunes"
    sent = screen.sent[-1]["event"]["browse"]
    assert [r["title"] for r in sent["discover"]] == ["Favorite songs", "Recently played artists"], "sent as queries"
    await _set(hass, {"browse.discover": []})
    assert screen.sent[-1]["event"]["browse"]["discover"] == [], "none: no Discover section"
    r = await _set(hass, {"browse.discover": ["top_40"]})
    assert r["success"] is False


async def test_hidden_from_screens_and_the_retired_parts(hass, frontend):
    """Leave out / Also show (Accessories on the page). The house-wide Parts
    (chips, pages, sky, music, rooms) are retired: not sent, not writable,
    and dropped from storage the next time the section is written."""
    from custom_components.hk_frontend import settings as S
    hass.config_entries.async_update_entry(entry(hass), options={"dashboard": {"generated": {
        "exclude_areas": [], "chips": True, "pages": True, "sky": True, "music": True, "rooms": True}}})
    assert S.merged(entry(hass).options)["generated"] == {
        "exclude_areas": [], "exclude_devices": [], "exclude_entities": [], "include_entities": []}
    r = await _set(hass, {"generated.pages": False})
    assert r["success"] is False and json.loads(r["message"]) == {"generated.pages": "unknown"}
    await _set(hass, {"generated.exclude_areas": ["garage"], "generated.exclude_devices": ["dev1"],
                      "generated.include_entities": ["scene.movie"]})
    g = entry(hass).options["dashboard"]["generated"]
    assert g == {"exclude_areas": ["garage"], "exclude_devices": ["dev1"], "exclude_entities": [],
                 "include_entities": ["scene.movie"]}


async def test_menu_and_rooms(hass, frontend):
    from custom_components.hk_frontend.settings import as_client
    await _set(hass, {"menu.glyph": "lines", "menu.clock": False, "rooms.headings": False,
                      "rooms.status": ["motion", "temperature"]})
    d = entry(hass).options["dashboard"]
    assert d["menu"]["glyph"] == "lines" and d["menu"]["clock"] is False
    assert d["rooms"] == {"headings": False, "status": ["temperature", "motion"]}, "in the house order"
    c = as_client(entry(hass))
    assert c["menu"]["clock"] is False and c["rooms"]["headings"] is False


async def test_a_screens_own_card_options(hass, frontend):
    from homeassistant.config_entries import ConfigSubentry
    from custom_components.hk_frontend.panel import ws_board_set
    hass.config_entries.async_add_subentry(entry(hass), ConfigSubentry(
        data={}, subentry_type="dashboard", title="Hall", unique_id="dashboard-hall"))
    conn = await _admin(hass)
    ws_board_set(hass, conn, {"id": 1, "type": "hk_frontend/board/set", "dashboard": "dashboard-hall", "changes": {
        "wallpanel_options": {"idle_time": 300}, "kiosk_options": {"admin_settings": {"hide_header": False}},
        "car": True, "categories": ["security", "playmusic"]}})
    assert conn.sent[-1]["success"], conn.sent[-1]
    d = next(iter(entry(hass).subentries.values())).data
    assert d["wallpanel_options"] == {"idle_time": 300} and d["kiosk_options"] == {"admin_settings": {"hide_header": False}}
    assert d["categories"] == ["security", "playmusic"] and d["car"] is True


def test_home_page_off_is_a_screen_of_custom_pages():
    from custom_components.hk_frontend import settings as S, settings_api as A
    assert S.board({})["home_page"] is True
    assert S.board({"home_page": False})["home_page"] is False
    data, err = A.apply_board({}, {"home_page": False})
    assert err == {} and data["home_page"] is False
    data, err = A.apply_board(data, {"home_page": "sometimes"})
    assert "home_page" in err


def test_narrow_screens_and_the_top_of_the_menu():
    """On Narrow Screens / When Folded, and the pages at the top of the menu:
    checked, not defaulted; "-" is "nothing at the top"."""
    from custom_components.hk_frontend.settings import board
    from custom_components.hk_frontend.settings_api import apply_board
    data, err = apply_board({}, {"narrow": "chip_scroll", "menu_top": ["weather", "energy", "energy"]})
    assert err == {} and data["narrow"] == "chip_scroll" and data["menu_top"] == ["weather", "energy"]
    data, err = apply_board(data, {"menu_top": ["-"]})
    assert err == {} and data["menu_top"] == ["-"], "nothing at the top"
    _, err = apply_board(data, {"narrow": "sideways", "menu_top": ["no spaces please"]})
    assert err == {"narrow": "choice", "menu_top": "list"}
    b = board({"narrow": "hover", "menu_top": ["ok", "Not Ok!", 3]})
    assert b["narrow"] == "chip" and b["menu_top"] == ["ok", "3"], "read defensively (a view index is a path)"
    assert board({})["narrow"] == "chip" and board({})["menu_top"] == []


async def test_the_page_knows_which_features_the_house_has(hass, frontend):
    """Features: each one's entries -- the page lists a page for each one
    added, and offers Add for one that is not. Always installed (they are
    part of the integration)."""
    from custom_components.hk_frontend.panel import ws_panel_get
    from conftest import add_feature
    conn = await _admin(hass)
    ws_panel_get(hass, conn, {"id": 1, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    f = conn.sent[-1]["result"]["features"]
    assert set(f) == {"hk_music", "hk_alarm_pin", "hk_clean_areas", "hk_tv"}
    assert f["hk_clean_areas"] == {"name": "Clean Areas", "kind": "clean_areas", "installed": True, "entries": []}
    await add_feature(hass, "clean_areas", {})
    ws_panel_get(hass, conn, {"id": 2, "type": "hk_frontend/panel/get"})
    await hass.async_block_till_done(wait_background_tasks=True)
    ca = conn.sent[-1]["result"]["features"]["hk_clean_areas"]
    assert [e["title"] for e in ca["entries"]] == ["Clean Areas"]
