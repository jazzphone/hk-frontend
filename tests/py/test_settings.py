"""The dashboard settings: the model (settings.py, kinds.py) and what every
screen is handed. Their WRITES are the HK Settings page's
(test_settings_api.py); Configure keeps only the way there (test_configure.py)."""
from __future__ import annotations

import pytest


from conftest import FakeConnection, entry
from conftest import COMPONENT  # noqa: E402

DOMAIN = "hk_frontend"


# ------------------------------------------------------------ the model
def test_defaults_assume_no_house():
    from custom_components.hk_frontend import settings as S
    m = S.merged({})
    assert m["security"] == {"alarm": None, "garage": [], "locks": [], "doors": [], "windows": []}
    assert m["weather"]["entity"] is None and m["weather"]["place"] is None
    assert m["sky"]["birthdays"] == [] and m["idle"]["dashboards"] == [] and m["car"]["dashboards"] == []
    # nothing in the defaults names an entity a fresh house would not have,
    # except Home Assistant's own Time & Date sensors (with a browser fallback)
    named = [v for sec in m.values() for v in sec.values() if isinstance(v, str) and "." in v]
    assert named == ["sensor.time", "sensor.date"]
    assert m["sky"]["hemisphere"] == "north" and len(m["sky"]["themes"]) == 10
    assert set(m["counts"]) == {"smoke", "lights", "fans", "doors", "windows", "garage", "locks", "blinds",
                                "leaks", "thermostats", "timers", "vacuums", "speakers", "temperature", "humidity",
                                "motion", "occupancy", "valves"}
    assert all(v is None for v in m["counts"].values()), "every kind automatic"


def test_merged_keeps_unknown_keys_out():
    from custom_components.hk_frontend import settings as S
    m = S.merged({"dashboard": {"security": {"alarm": "alarm_control_panel.a", "bogus": 1},
                                "nonsense": {"x": 1}}})
    assert m["security"]["alarm"] == "alarm_control_panel.a"
    assert "bogus" not in m["security"] and "nonsense" not in m


def test_birthdays_and_rooms_round_trip_as_text():
    from custom_components.hk_frontend import settings as S
    rows = S.parse_birthdays("Alex 03-14\n\n  Sam Lee 12-01 ")
    assert rows == [{"name": "Alex", "month": 3, "day": 14}, {"name": "Sam Lee", "month": 12, "day": 1}]
    assert S.parse_birthdays(S.format_birthdays(rows)) == rows
    assert S.parse_birthdays("Alex 13-01") is None
    assert S.parse_birthdays("Alex March 3") is None
    rooms = S.parse_rooms("dashboard-kitchen = kitchen\ndashboard-livingroom=living_room")
    assert rooms == {"dashboard-kitchen": "kitchen", "dashboard-livingroom": "living_room"}
    assert S.parse_rooms(S.format_rooms(rooms)) == rooms
    assert S.parse_rooms("dashboard-kitchen = Kitchen Room") is None


# ------------------------------------------------------------ the pages
def _house(hass):
    hass.states.async_set("lock.front", "locked")
    hass.states.async_set("binary_sensor.front_door", "off", {"device_class": "door"})
    hass.states.async_set("binary_sensor.den_window", "off", {"device_class": "window"})
    hass.states.async_set("binary_sensor.motion", "off", {"device_class": "motion"})
    hass.states.async_set("binary_sensor.plain", "off")
    hass.states.async_set("alarm_control_panel.home", "disarmed")
    hass.states.async_set("cover.garage", "closed", {"device_class": "garage"})
    hass.states.async_set("binary_sensor.garage_entry", "off", {"device_class": "door"})
    hass.states.async_set("cover.blinds", "closed", {"device_class": "blind"})
    hass.states.async_set("cover.plain", "closed")
    hass.states.async_set("cover.car_frunk", "closed", {"device_class": "door"})
    hass.states.async_set("light.den", "on")
    hass.states.async_set("light.all", "on", {"entity_id": ["light.den"]})
    # an integration's group (a Hue room, a Zigbee group): Home Assistant 2026's group_entities
    hass.states.async_set("light.den_lamps", "on", {"group_entities": ["light.den"]})
    hass.states.async_set("switch.coffee", "on")
    hass.states.async_set("binary_sensor.sink_leak", "off", {"device_class": "moisture"})
    hass.states.async_set("media_player.kitchen", "idle", {"device_class": "speaker"})
    hass.states.async_set("media_player.tv", "idle", {"device_class": "tv"})
    hass.states.async_set("binary_sensor.hall_smoke", "off", {"device_class": "smoke"})
    hass.states.async_set("binary_sensor.hall_co", "off", {"device_class": "carbon_monoxide"})
    hass.states.async_set("binary_sensor.basement_gas", "off", {"device_class": "gas"})


def test_each_kind_finds_its_own(hass):
    from custom_components.hk_frontend import kinds as K
    _house(hass)
    found = K.resolve(K.candidates(hass), {})
    assert found["locks"] == ["lock.front"]
    assert found["doors"] == ["binary_sensor.front_door", "binary_sensor.garage_entry"]
    assert found["windows"] == ["binary_sensor.den_window"]
    assert found["garage"] == ["cover.garage"], "a garage cover; not a door-class cover"
    assert found["blinds"] == ["cover.blinds", "cover.plain"], "a cover with no class is a blind"
    assert found["lights"] == ["light.den"], "a light group, a helper's or an integration's, would count its members twice"
    assert found["leaks"] == ["binary_sensor.sink_leak"]
    assert found["speakers"] == ["media_player.kitchen"], "not the TV"
    assert found["smoke"] == ["binary_sensor.hall_co", "binary_sensor.hall_smoke"], "smoke and CO; gas only if added"


def test_leave_out_and_also_count(hass):
    from custom_components.hk_frontend import kinds as K
    _house(hass)
    cands = K.candidates(hass)
    s = {"counts": {"lights": {"exclude": ["light.den"], "include": ["switch.coffee", "switch.gone"]},
                    "blinds": {"exclude": ["cover.plain"], "include": []}}}
    found = K.resolve(cands, s)
    assert found["lights"] == ["switch.coffee"], "left out, also counted, a missing one skipped"
    assert found["blinds"] == ["cover.blinds"]
    # the house-wide Leave out (Generated dashboard) applies to what is found
    found = K.resolve(cands, {"generated": {"exclude_entities": ["lock.front"]}})
    assert found["locks"] == []


def test_an_old_list_is_kept_until_what_counts_is_saved(hass):
    from custom_components.hk_frontend import kinds as K
    _house(hass)
    hass.states.async_set("lock.back", "locked")
    cands = K.candidates(hass)
    old = {"security": {"locks": ["lock.front", "lock.shed"]},
           "features": {"thermostats": []}}
    assert K.resolve(cands, old)["locks"] == ["lock.front"], "exactly the old list (present ones)"
    offer = K.suggest(cands, old)
    assert offer["locks"] == {"exclude": ["lock.back"], "include": ["lock.shed"]}
    # saving that offer counts what the old list counted
    saved = {**old, "counts": {"locks": offer["locks"]}}
    assert K.resolve(cands, saved)["locks"] == ["lock.front"]
    assert offer["lights"] == {"exclude": [], "include": []}, "no old list: automatic"


async def test_screens_get_the_kinds_and_their_changes(hass, frontend):
    from custom_components.hk_frontend import ws_settings_subscribe
    from datetime import timedelta
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import async_fire_time_changed
    _house(hass)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=2))
    await hass.async_block_till_done()
    tablet = await hass.auth.async_create_user("kitchen")
    conn = FakeConnection(tablet)
    ws_settings_subscribe(hass, conn, {"id": 5, "type": "hk_frontend/settings/subscribe"})
    ev = conn.sent[-1]["event"]
    assert "counts" not in ev, "a screen gets the answer, not the adjustments"
    assert ev["kinds"]["locks"] == ["lock.front"]
    assert ev["security"]["locks"] == ["lock.front"], "the older key, for a screen on older files"
    # a new lock is counted without anyone listing it
    n = len(conn.sent)
    hass.states.async_set("lock.back", "locked")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=4))
    await hass.async_block_till_done()
    assert len(conn.sent) > n and conn.sent[-1]["event"]["kinds"]["locks"] == ["lock.back", "lock.front"]
    # an ordinary state change sends nothing
    n = len(conn.sent)
    hass.states.async_set("lock.back", "unlocked")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=6))
    await hass.async_block_till_done()
    assert len(conn.sent) == n


async def test_a_light_that_becomes_a_group_is_no_longer_counted(hass, frontend):
    """An integration's group that came up unavailable (no attributes yet)
    and then reports its group_entities is reclassified: its members are
    not counted twice."""
    from custom_components.hk_frontend import kinds as K
    from datetime import timedelta
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import async_fire_time_changed
    hass.states.async_set("light.den", "on")
    hass.states.async_set("light.den_lamps", "unavailable", {})
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=2))
    await hass.async_block_till_done()
    assert "light.den_lamps" in K.current(hass)["lights"]
    hass.states.async_set("light.den_lamps", "on", {"group_entities": ["light.den"]})
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=4))
    await hass.async_block_till_done()
    assert K.current(hass)["lights"] == ["light.den"]


def test_card_options_are_a_mapping_of_plain_values():
    from custom_components.hk_frontend.settings import board, card_options
    assert card_options(None) == {} and card_options("") == {} and card_options({}) == {}
    assert card_options({"idle_time": 300, "style": {"a": {"b": "c"}}}) == {"idle_time": 300, "style": {"a": {"b": "c"}}}
    assert card_options([1, 2]) is None and card_options("idle_time: 3") is None
    assert card_options({"x": "y" * 30000}) is None, "not huge"
    b = board({"wallpanel_options": {"idle_time": 300}, "kiosk_options": [1]})
    assert b["wallpanel_options"] == {"idle_time": 300} and b["kiosk_options"] == {}


def test_screensaver_options_defaults_checks_and_the_wallpanel_carry_over():
    """HK Frontend's own screensaver (hk-saver.js): its options over the
    defaults, a bad value refused (the form says so), and a screen that never
    had any keeps the choices it made on WallPanel's options page."""
    from custom_components.hk_frontend.settings import SAVER_DEFAULTS, board, saver_options
    assert saver_options(None) == SAVER_DEFAULTS and saver_options({}) == SAVER_DEFAULTS
    assert SAVER_DEFAULTS["starts_after"] == 180 and SAVER_DEFAULTS["zoom"] is False, \
        "180 s: longer than the tablets' 120 s use window; Slow Zoom off: it costs heat"
    got = saver_options({"each_photo": 45, "clock": False})
    assert got["each_photo"] == 45 and got["clock"] is False and got["starts_after"] == 180
    for bad in ({"starts_after": 5}, {"each_photo": 9999}, {"order": "shuffled"}, {"zoom": "yes"},
                {"starts_after": True}, {"whatever": 1}, [1], "x"):
        assert saver_options(bad) is None, bad
    old = {"idle_time": 300, "display_time": 20, "media_order": "sorted", "image_fit_landscape": "contain",
           "image_animation_ken_burns": True, "style": {"x": 1}}
    b = board({"screensaver": True, "wallpanel_options": old})
    assert b["screensaver_options"] == dict(SAVER_DEFAULTS, starts_after=300, each_photo=20, order="sorted",
                                            fill=False, zoom=True), b["screensaver_options"]
    assert b["wallpanel_options"] == old, "WallPanel's own options stay, for a screen that goes back to it"
    assert board({"wallpanel_options": {"idle_time": 1}})["screensaver_options"]["starts_after"] == 15, \
        "an old value out of range is clamped, not refused: it was accepted once"
    mine = board({"wallpanel_options": old, "screensaver_options": {"each_photo": 60}})["screensaver_options"]
    assert mine["each_photo"] == 60 and mine["starts_after"] == 180, "a screen's own options win over the old ones"
    assert board({})["screensaver_engine"] == "hk" and board({"screensaver_engine": "wallpanel"})["screensaver_engine"] == "wallpanel"
    assert board({"screensaver_engine": "other"})["screensaver_engine"] == "hk"
    assert board({"screensaver_options": {"bogus": 1}})["screensaver_options"] == SAVER_DEFAULTS


def test_hiding_home_assistants_header_is_hk_frontends_own_unless_a_screen_is_tuned_for_the_plugin():
    from custom_components.hk_frontend.settings import board
    b = board({"kiosk": True})
    assert b["kiosk_engine"] == "hk" and b["kiosk_header"] and b["kiosk_sidebar"] and b["kiosk_admins"], \
        "1.3: HK Frontend hides both itself, for admins too"
    assert board({"kiosk": True, "kiosk_options": {}})["kiosk_engine"] == "hk"
    old = board({"kiosk": True, "kiosk_options": {"admin_settings": {"hide_header": False}}})
    assert old["kiosk_engine"] == "kiosk_mode", \
        "a 1.2 screen whose options HK Frontend can't say (admins see the header, not the sidebar) keeps the plugin"
    assert board(dict(old))["kiosk_engine"] == "kiosk_mode", "...and keeps it once stored"
    assert board({"kiosk": True, "kiosk_options": {"hide_search": True}})["kiosk_engine"] == "kiosk_mode", \
        "...as does one with any other option of the plugin's"
    car = board({"kiosk": True, "kiosk_options": {"admin_settings": {"hide_header": False, "hide_sidebar": False}}})
    assert car["kiosk_engine"] == "hk" and car["kiosk_admins"] is False and car["kiosk_header"] and car["kiosk_sidebar"], \
        "admins seeing both: HK Frontend's For Admins Too off -- the screen moves over as it was"
    only = board({"kiosk": True, "kiosk_options": {"hide_sidebar": False}})
    assert only["kiosk_engine"] == "hk" and only["kiosk_header"] and only["kiosk_sidebar"] is False and only["kiosk_admins"]
    mine = board({"kiosk": True, "kiosk_options": {"hide_sidebar": False}, "kiosk_sidebar": True})
    assert mine["kiosk_sidebar"] is True, "a setting of its own is never overwritten from the plugin's options"
    chosen = board({"kiosk": True, "kiosk_engine": "hk", "kiosk_options": {"hide_header": False}})
    assert chosen["kiosk_engine"] == "hk" and chosen["kiosk_options"] == {"hide_header": False}, \
        "a screen moved to HK Frontend's own keeps its plugin options, unused, for going back"
    assert board({"kiosk_engine": "other"})["kiosk_engine"] == "hk"
    mine = board({"kiosk": True, "kiosk_header": False, "kiosk_admins": 0})
    assert mine["kiosk_header"] is False and mine["kiosk_sidebar"] is True and mine["kiosk_admins"] is False


async def test_third_party_cards_ready_not_loaded_or_missing(hass, frontend, tmp_path, monkeypatch):
    """Setup check's and the forms' notes: installed from HACS and, for the two
    that must be, loaded as dashboard resources."""
    from custom_components.hk_frontend import thirdparty
    monkeypatch.setattr(hass.config, "config_dir", str(tmp_path))
    st = await thirdparty.async_status(hass)
    assert st == {"wallpanel": "missing", "kiosk": "missing", "radar": "missing"}
    for folder, name in (("lovelace-wallpanel", "wallpanel.js"), ("weather-radar-card", "weather-radar-card.js")):
        (tmp_path / "www" / "community" / folder).mkdir(parents=True)
        (tmp_path / "www" / "community" / folder / name).write_text("//")

    class Coll:
        def async_items(self):
            return [{"url": "/hacsfiles/kiosk-mode/kiosk-mode.js?hacstag=1"}]

    class Data:
        resources = Coll()
    from homeassistant.components.lovelace.const import LOVELACE_DATA
    monkeypatch.setitem(hass.data, LOVELACE_DATA, Data())
    st = await thirdparty.async_status(hass)
    assert st == {"wallpanel": "not_loaded", "kiosk": "missing", "radar": "ready"}, \
        "WallPanel must be a resource; the radar card never needs to be"
    assert "Settings → Dashboards → Resources" in thirdparty.note("wallpanel", st["wallpanel"])
    assert "not installed" in thirdparty.note("kiosk", "missing")


def test_the_built_in_dates_match_the_screens():
    import json
    import os
    import re
    import subprocess
    from custom_components.hk_frontend import settings as S
    src = os.path.join(COMPONENT, "frontend", "modules", "hk-settings.js")
    text = open(src, encoding="utf-8").read()
    js = {}
    for name in ("BUILT_IN", "SOUTH"):
        body = re.search(r"var " + name + r" = (\{.*?\});", text, re.S)
        out = subprocess.run(["node", "-e", "process.stdout.write(JSON.stringify(" + body.group(1) + "))"],
                             capture_output=True, text=True, check=False)
        if out.returncode != 0:
            import pytest
            pytest.skip("node is not available")
        js[name] = json.loads(out.stdout)
    assert js["BUILT_IN"] == {k: list(v) for k, v in S.SKY_BUILT_IN.items()}
    assert js["SOUTH"] == {k: list(v) for k, v in S.SKY_SOUTH.items()}


def test_dates_parse():
    from custom_components.hk_frontend import settings as S
    assert S.parse_mmdd("12-1") == "12-01" and S.parse_mmdd(" 03-14 ") == "03-14"
    assert S.parse_mmdd("") is None and S.parse_mmdd(None) is None
    assert S.parse_mmdd("13-01") is False and S.parse_mmdd("Dec 1") is False


def test_every_discover_row_is_a_real_get_library_query():
    """Each row's media type and order are values music_assistant.get_library
    accepts (as its service schema lists them), and every row and category
    has a label in the picker."""
    import json
    import os
    from custom_components.hk_frontend import settings as S
    types = {"artist", "album", "audiobook", "playlist", "podcast", "track", "radio"}
    orders = {"name", "name_desc", "sort_name", "sort_name_desc", "timestamp_added",
              "timestamp_added_desc", "last_played", "last_played_desc", "play_count",
              "play_count_desc", "year", "year_desc", "position", "position_desc",
              "artist_name", "artist_name_desc", "random", "random_play_count"}
    for key, row in S.SHELVES.items():
        assert row["media_type"] in types, key
        assert set(row) <= {"title", "media_type", "order_by", "favorite"}, key
        assert ("order_by" in row) != bool(row.get("favorite")), f"{key}: an order or the favorites"
        if "order_by" in row:
            assert row["order_by"] in orders, key
    assert set(S.DEFAULTS["browse"]["discover"]) <= set(S.SHELVES)
    assert all(row["title"] for row in S.SHELVES.values()), "the page names each row by its title"


# ------------------------------------------------------ what screens get
async def test_every_screen_gets_the_settings_and_every_change(hass, frontend):
    from custom_components.hk_frontend import ws_settings_subscribe
    tablet = await hass.auth.async_create_user("kitchen")           # non-admin
    conn = FakeConnection(tablet)
    ws_settings_subscribe(hass, conn, {"id": 5, "type": "hk_frontend/settings/subscribe"})
    assert conn.sent[0]["success"]
    first = conn.sent[-1]["event"]
    assert first["configured"] is True and first["security"]["locks"] == []
    from custom_components.hk_frontend.settings_api import apply_house
    opts, err = apply_house(entry(hass).options, {"features.vacuum_script": "script.clean"})
    assert not err
    hass.config_entries.async_update_entry(entry(hass), options=opts)
    await hass.async_block_till_done()
    assert conn.sent[-1]["event"]["features"]["vacuum_script"] == "script.clean"
    n = len(conn.sent)
    conn.subscriptions[5]()
    hass.config_entries.async_update_entry(entry(hass), options={**entry(hass).options, "files_folder": "hk_x"})
    await hass.async_block_till_done()
    assert len(conn.sent) == n


async def test_a_screen_before_setup_gets_the_defaults(hass, base):
    from custom_components.hk_frontend import ws_settings_subscribe
    from homeassistant.setup import async_setup_component
    assert await async_setup_component(hass, DOMAIN, {DOMAIN: {}})
    conn = FakeConnection(None)
    ws_settings_subscribe(hass, conn, {"id": 1, "type": "hk_frontend/settings/subscribe"})
    ev = conn.sent[-1]["event"]
    assert ev["configured"] is False and ev["weather"]["entity"] is None


def test_no_string_has_an_angle_bracket():
    """Home Assistant formats every string as an ICU message, where `<x>` is
    a markup tag: `<dashboard>/0#doorbell` in a description shows
    "Translation error: UNCLOSED_TAG" instead of the text. Write an example
    instead (`dashboard-kitchen/0#doorbell`). And `{...}` is a placeholder:
    only `{name}` is one -- a YAML `{entity: zone.home}` shows
    "Translation error: MALFORMED_ARGUMENT"."""
    import json
    import os
    import re
    tr = json.load(open(os.path.join(COMPONENT, "translations", "en.json")))
    bad: list[str] = []

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, f"{path}.{k}")
        elif isinstance(o, str) and ("<" in o or any(not re.fullmatch(r"\{[a-z_]+\}", m)
                                                     for m in re.findall(r"\{[^}]*\}", o))):
            bad.append(path)                  # `{key: value}` is a malformed ICU argument
    walk(tr, "")
    assert not bad, bad


def test_the_screens_defaults_are_these_defaults():
    """hk-settings.js carries its own copy of DEFAULTS, for the first paint
    before the integration answers. The two must never disagree."""
    import json
    import os
    import re
    import subprocess
    from custom_components.hk_frontend.settings import DEFAULTS
    src = os.path.join(COMPONENT, "frontend", "modules", "hk-settings.js")
    text = open(src, encoding="utf-8").read()
    body = re.search(r"var DEFAULTS = (\{.*?\n  \});", text, re.S)
    assert body, "DEFAULTS not found in hk-settings.js"
    # node, else macOS's own JavaScriptCore, so a Mac without node still
    # compares the two copies instead of skipping.
    jsc = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
    runs = [["node", "-e", "process.stdout.write(JSON.stringify(" + body.group(1) + "))"],
            [jsc, "-e", "print(JSON.stringify(" + body.group(1) + "))"]]
    out = None
    for cmd in runs:
        try:
            js = subprocess.run(cmd, capture_output=True, text=True, check=False)
        except FileNotFoundError:
            continue
        if js.returncode == 0:
            out = js.stdout
            break
    if out is None:
        import pytest
        pytest.skip("no JavaScript engine to read the JS defaults")
    # Status & Chips' adjustments never reach a screen (it gets `kinds`, resolved),
    # and Browse Music's rows reach it as the queries (discover_rows).
    from custom_components.hk_frontend.settings import discover_rows
    want = {k: v for k, v in DEFAULTS.items() if k != "counts"}
    want["browse"] = {**want["browse"], "discover": discover_rows(want["browse"]["discover"])}
    assert json.loads(out) == json.loads(json.dumps(want))


# --------------------------------------------------- each dashboard's item
def test_a_stored_item_is_read_defensively():
    from custom_components.hk_frontend.settings import board
    b = board({"menu": "sideways", "dock_min": "lots", "time_weather": None, "categories": "lights",
               "tab_position": "near the top", "home_rooms": "shuffled", "chips": ["lights", "confetti"],
               "chips_quiet": "all", "pages": ["weather", "casino", "Not A Page!", "weather", "room-kitchen",
                                               "music-browse", "browse"], "glass": "stained",
               "idle_room": "Kitchen Tablet", "sky": 0})
    assert (b["menu"], b["dock_min"], b["time_weather"], b["categories"], b["tab_position"], b["home_rooms"]) == (
        "auto", 1000, "page", [], "", "as_is")
    # a page list holds kinds, Browse Music and custom page addresses (casino
    # could be one); junk, a reserved address, a room page and a repeat go
    assert b["chips"] == ["lights"] and b["pages"] == ["weather", "casino", "browse"] and b["glass"] == "house"
    assert b["chips_quiet"] == ["weather_alert", "doors_windows", "blinds", "water"], "unreadable: the default"
    assert board({"chips_quiet": []})["chips_quiet"] == [], "none quiet is a choice"
    assert b["idle_room"] == "" and b["sky"] is False
    assert b["page_rooms"] == "floor" and board({"page_rooms": "shuffled"})["page_rooms"] == "floor"
    assert board({"dock_min": 50})["dock_min"] == 700 and board({"dock_min": 99999})["dock_min"] == 3000


def test_the_tab_position_reads_a_distance_or_a_share():
    from custom_components.hk_frontend.settings import tab_position
    assert tab_position("") == "" and tab_position(None) == "" and tab_position("Automatic") == ""
    assert tab_position("140") == "140px" and tab_position(" 140 px ") == "140px"
    assert tab_position("20%") == "20%" and tab_position("12.5 %") == "12.5%"
    assert tab_position("120%") is None and tab_position("-5px") is None and tab_position("top") is None


def test_the_old_lists_carry_the_button_the_items_agree_on():
    """A screen on the previous hk-base.js reads ONE button style: the one the
    items share (a migrated house), else automatic."""
    from custom_components.hk_frontend.settings import board, legacy_lists
    items = {"a": board({"menu": "tab", "tab_position": "140px"}), "b": board({"menu": "tab"}),
             "c": board({"menu": "open"})}
    old = legacy_lists(items)
    assert old["button"] == "tab" and old["tab_position"] == "140px" and old["docked"] == ["c"]
    items["b"] = board({"menu": "chip"})
    assert legacy_lists(items)["button"] == "auto"


async def test_a_hand_written_screens_menu_layout(hass, frontend):
    """What a YAML screen's Pages in Menu lists (panel._menu_layout):
    not Home, not rooms or a follower; each page's own `menu: top`, and whether
    Categories lists it while automatic -- Home's chips open it."""
    from unittest.mock import MagicMock
    from custom_components.hk_frontend.panel import _menu_layout
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    class Board:
        def __init__(self, cfg): self.cfg = cfg
        async def async_load(self, force): return self.cfg

    chip = lambda path: {"type": "custom:hk-status-chip-card", "tap_action": {"action": "navigate",  # noqa: E731
                                                                              "navigation_path": path}}
    data = MagicMock()
    data.dashboards = {"dash-y": Board({"views": [
        {"title": "Home", "cards": [{"type": "grid", "cards": [chip("./lights"), chip("/dash-y/energy#x")]}]},
        {"title": "Weather", "path": "weather", "menu": "top"},
        {"title": "Lights", "path": "lights"},
        {"title": "Climate", "path": "climate"},
        {"title": "Energy", "path": "energy", "menu_title": "Power"},
        {"title": "Browse", "path": "browse", "menu_follows": "music"},
        {"title": "Kitchen", "path": "kitchen", "area": "kitchen"},
        {"title": "Secret", "path": "secret", "menu": False}]})}
    hass.data[LOVELACE_DATA] = data
    got = await _menu_layout(hass, "dash-y")
    assert got == [
        {"path": "weather", "title": "Weather", "top": True, "auto": False},
        {"path": "lights", "title": "Lights", "top": False, "auto": True},
        {"path": "climate", "title": "Climate", "top": False, "auto": False},
        {"path": "energy", "title": "Power", "top": False, "auto": True, "page": "Energy"},
        {"path": "secret", "title": "Secret", "top": False, "auto": False}]
    assert await _menu_layout(hass, "nowhere") == []

    # THE CHIPS CARD: its kinds (the screen's Chips, else every kind) as the
    # first of their pages the dashboard has, then the chips written out
    data.dashboards["dash-c"] = Board({"views": [
        {"title": "Home", "cards": [{"type": "custom:hk-chips-card", "extra": [{"card": chip("./ecoflow")}]}]},
        {"title": "Alarm", "path": "alarm"}, {"title": "Lights", "path": "lights"},
        {"title": "Water", "path": "water"}, {"title": "EcoFlow", "path": "ecoflow", "menu_title": "House Battery"}]})
    auto = {i["path"]: i["auto"] for i in await _menu_layout(hass, "dash-c")}
    assert auto == {"alarm": True, "lights": True, "water": True, "ecoflow": True}
    auto = {i["path"]: i["auto"] for i in await _menu_layout(hass, "dash-c", {"chips": ["lights", "sensor.mail"]})}
    assert auto == {"alarm": False, "lights": True, "water": False, "ecoflow": True}
    auto = {i["path"]: i["auto"] for i in await _menu_layout(hass, "dash-c", {"chips_row": False})}
    assert auto == {"alarm": False, "lights": False, "water": False, "ecoflow": True}
    data.dashboards["dash-c"].cfg["views"][0]["cards"][0]["in_menu"] = False
    auto = {i["path"]: i["auto"] for i in await _menu_layout(hass, "dash-c")}
    assert auto == {"alarm": True, "lights": True, "water": True, "ecoflow": True}   # no chips: every page


def test_a_screens_amounts_and_menu_mixes_are_read_defensively():
    from custom_components.hk_frontend.settings import board
    assert board({})["frost"] is None and board({})["blur"] is None
    assert board({"frost": "30", "blur": 250})["frost"] == 30 and board({"blur": 250})["blur"] == 100
    assert board({"frost": "milky", "blur": True})["frost"] is None and board({"blur": True})["blur"] is None
    assert board({"menu": "chip_scroll"})["menu"] == "chip_scroll"
    assert board({"menu": "chip_home"})["menu"] == "chip_home"


async def test_one_feature_change_sends_the_settings_once(hass, frontend):
    """A feature item changed: every screen gets the settings ONCE (it was
    twice -- the feature sync and the house's update listener both sent)."""
    from conftest import FakeConnection, put_feature, update_feature
    from custom_components.hk_frontend import ws_settings_subscribe
    feat = await put_feature(hass, "clean_areas", options={"vacuums": []})
    conn = FakeConnection(None)
    ws_settings_subscribe(hass, conn, {"id": 9})
    n = len(conn.sent)
    update_feature(hass, feat, options={"vacuums": ["vacuum.a"], "areas": []})
    await hass.async_block_till_done()
    assert len(conn.sent) - n == 1, conn.sent[n:]


def test_the_menu_tab_size():
    """The edge tab's size, a screen's own: Large unless it says otherwise,
    and nothing else stored survives (settings.py board, hk-menu.js)."""
    from custom_components.hk_frontend import settings as S, settings_api as A
    assert S.board({})["tab_size"] == "large"
    assert S.board({"tab_size": "xl"})["tab_size"] == "xl"
    assert S.board({"tab_size": "huge"})["tab_size"] == "large"
    assert A.BOARD["tab_size"]("standard") == "standard"
    import pytest
    with pytest.raises(A.Invalid):
        A.BOARD["tab_size"]("huge")


def test_the_menu_tab_size_on_phones():
    """A phone's tab has the same three sizes, set apart from the tablet's:
    Standard unless the screen says otherwise."""
    from custom_components.hk_frontend import settings as S, settings_api as A
    assert S.board({})["tab_size_phone"] == "standard"
    assert S.board({"tab_size_phone": "xl", "tab_size": "standard"})["tab_size_phone"] == "xl"
    assert S.board({"tab_size_phone": "xl"})["tab_size"] == "large"
    assert S.board({"tab_size_phone": "huge"})["tab_size_phone"] == "standard"
    assert A.BOARD["tab_size_phone"]("large") == "large"
    import pytest
    with pytest.raises(A.Invalid):
        A.BOARD["tab_size_phone"]("huge")


def test_the_screensaver_shows_photos_or_the_forecast():
    """Show: photos (the forecast whenever there are none) or forecast."""
    from custom_components.hk_frontend import settings as S
    assert S.saver_options({})["show"] == "photos"
    assert S.saver_options({"show": "forecast"})["show"] == "forecast"
    assert S.saver_options({"show": "weather"}) is None, "refused, never quietly a default"
    assert S.saver_options({})["fallback"] is True, "no photos: the forecast, unless turned off"
    assert S.saver_options({"fallback": False})["fallback"] is False
    assert S.saver_options({"fallback": "no"}) is None
    assert S.saver_options({"show": "both"})["show"] == "both" and S.saver_options({})["forecast_every"] == 5
    # Fade Back: ms from the screensaver to the dashboard, 0 (at once) to 5 s
    assert S.saver_options({})["fade_back"] == 500
    assert S.saver_options({"fade_back": 0})["fade_back"] == 0 and S.saver_options({"fade_back": 2000})["fade_back"] == 2000
    assert S.saver_options({"fade_back": 9000}) is None and S.saver_options({"fade_back": True}) is None
    assert S.saver_options({"forecast_every": 10})["forecast_every"] == 10
    assert S.saver_options({"forecast_every": 1}) is None and S.saver_options({"forecast_every": 500}) is None
    d = S.saver_options({})
    assert d["band"] is True and d["band_photos"] is False, "the details on the forecast, not over the photos"
    assert S.saver_options({"band": "yes"}) is None


def test_all_screens_screensaver():
    """A screen follows All Screens' screensaver (look.saver) unless it has
    its own; the stored form keeps null, reading fills it in."""
    from custom_components.hk_frontend import settings as S
    assert S.merged({})["look"]["saver"] == S.SAVER_DEFAULTS
    house = {S.CONF_DASHBOARD: {"look": {"saver": {"show": "both", "starts_after": 300}}}}
    got = S.merged(house)["look"]["saver"]
    assert got["show"] == "both" and got["starts_after"] == 300 and got["each_photo"] == 30, "normalized over the defaults"
    b = S.board({"screensaver": True})
    assert b["screensaver_options"] is None, "stored: null (follow)"
    r = S.resolved(b, house)
    assert r["screensaver_house"] is True and r["screensaver_options"]["show"] == "both", "read: All Screens' own"
    own = S.board({"screensaver": True, "screensaver_options": {"show": "forecast"}})
    r = S.resolved(own, house)
    assert r["screensaver_house"] is False and r["screensaver_options"]["show"] == "forecast", "its own wins"
    # 1.2: a screen that never had options keeps its old WallPanel choices as its own
    w = S.board({"screensaver": True, "wallpanel_options": {"idle_time": 240}})
    assert w["screensaver_options"]["starts_after"] == 240
    assert S.board({"screensaver": True, "wallpanel_options": {"hide_toolbar": True}})["screensaver_options"] is None, \
        "old WallPanel options that say nothing about the screensaver: All Screens"


def test_the_calendar_pane_and_its_days():
    """The screensaver's calendar pane (1.4): off by default, two days
    (today and tomorrow); one to seven days, a bool for the pane, anything
    else refused."""
    from custom_components.hk_frontend.settings import DEFAULTS, SAVER_DEFAULTS, saver_options
    assert SAVER_DEFAULTS["calendar"] is False and SAVER_DEFAULTS["calendar_days"] == 2
    got = saver_options({"calendar": True, "calendar_days": 5})
    assert got["calendar"] is True and got["calendar_days"] == 5
    for bad in ({"calendar": "yes"}, {"calendar_days": 0}, {"calendar_days": 8}, {"calendar_days": True},
                {"calendar_days": "3"}):
        assert saver_options(bad) is None, bad
    assert DEFAULTS["calendar"] == {"entities": [], "colors": {}}, "every calendar, coloured in turn, until chosen"


def test_the_calendar_is_a_page_a_screen_can_have():
    from custom_components.hk_frontend.settings import PAGE_KINDS, PAGE_ORDER, PAGE_RESERVED, SCENE_PAGES
    assert PAGE_KINDS.index("calendar") == PAGE_KINDS.index("weather") + 1
    assert "calendar" in PAGE_ORDER and "calendar" in SCENE_PAGES
    assert "calendar" in PAGE_RESERVED, "no custom page may take its address"


ORDER = ["living_room", "kitchen", "office"]


def test_a_screen_follows_all_screens_rooms_unless_it_sets_its_own():
    """Rooms (2026-10-01): All Screens' order, Home's rooms, the menu's and
    the pages' -- filled into every screen that doesn't set its own."""
    from custom_components.hk_frontend import settings as S
    opts = {"dashboard": {"rooms": {"order": ORDER, "home": "only", "menu": "order", "pages": "order"}}}
    follows = S.resolved(S.board({"room_order": ["x"], "menu_rooms": "az"}), opts)
    assert follows["rooms_house"] is True
    assert (follows["room_order"], follows["home_rooms"], follows["menu_rooms"], follows["page_rooms"]) == (
        ORDER, "only", "order", "order")
    own = S.resolved(S.board({"rooms_custom": True, "room_order": ["office"], "menu_rooms": "az"}), opts)
    assert own["rooms_house"] is False and own["room_order"] == ["office"] and own["menu_rooms"] == "az"
    # nothing set for All Screens: the automatic rooms
    plain = S.resolved(S.board({}), {})
    assert (plain["room_order"], plain["home_rooms"], plain["menu_rooms"], plain["page_rooms"]) == (
        [], "as_is", "az", "floor")
    # what is stored is checked on reading
    bad = S.resolved(S.board({}), {"dashboard": {"rooms": {"order": ["ok", "Not An Id", 3], "home": "x"}}})
    assert bad["room_order"] == ["ok"] and bad["home_rooms"] == "as_is"


def test_all_screens_rooms_are_checked():
    from custom_components.hk_frontend import settings_api as A
    import pytest
    assert A.HOUSE["rooms.order"](ORDER) == ORDER
    assert A.HOUSE["rooms.menu"]("order") == "order"
    assert A.BOARD["rooms_custom"](True) is True
    for k, v in (("rooms.home", "most"), ("rooms.pages", "x"), ("rooms.order", "kitchen")):
        with pytest.raises(A.Invalid):
            A.HOUSE[k](v)


def test_the_rooms_move_to_all_screens():
    """1.7 -> 1.8: the room settings most screens chose become All Screens';
    a screen with them, or with none, follows; one that differs keeps its own."""
    from custom_components.hk_frontend import settings as S
    same = {"room_order": ORDER, "home_rooms": "order", "menu_rooms": "az", "page_rooms": "order"}
    items = {"a": dict(same), "b": dict(same, menu="open"), "c": {"room_order": ["office"], "home_rooms": "only"},
             "car": {}}
    options, out = S.rooms_lifted({"dashboard": {"rooms": {"headings": False}}}, items)
    assert options["dashboard"]["rooms"] == {"headings": False, "order": ORDER, "home": "order", "menu": "az",
                                             "pages": "order"}
    assert [out[p]["rooms_custom"] for p in ("a", "b", "c", "car")] == [False, False, True, False]
    assert out["b"]["menu"] == "open", "the rest of a screen is untouched"
    for p in items:                                   # and nothing anyone sees changes
        if p != "car":
            before = S.board(items[p])
            after = S.resolved(S.board(out[p]), options)
            assert all(before[k] == after[k] for k in S.ROOM_KEYS), p
    # a house already moved is left alone; one where no screen chose rooms
    # gets nothing new, and its screens follow
    assert S.rooms_lifted(options, items) == (None, {})
    none_opts, none_items = S.rooms_lifted({}, {"x": {}})
    assert none_opts is None and none_items["x"]["rooms_custom"] is False


async def test_an_entry_from_1_7_moves_its_rooms(hass, base):
    from conftest import house_entry
    from custom_components.hk_frontend import settings as S
    same = {"room_order": ORDER, "home_rooms": "order", "menu_rooms": "order", "page_rooms": "floor"}
    old = house_entry({"subentry_type": "dashboard", "unique_id": "dashboard-a", "title": "A", "data": dict(same)},
                      {"subentry_type": "dashboard", "unique_id": "dashboard-b", "title": "B", "data": dict(same)},
                      minor_version=7)
    old.add_to_hass(hass)
    assert await hass.config_entries.async_setup(old.entry_id)
    await hass.async_block_till_done()
    assert old.minor_version == 10
    assert S.merged(old.options)["rooms"]["order"] == ORDER
    got = S.boards(old)
    assert all(got[p]["rooms_house"] and got[p]["room_order"] == ORDER and got[p]["menu_rooms"] == "order"
               for p in ("dashboard-a", "dashboard-b"))


# ------------------------------------------------ the menu, All Screens' (1.9)
def test_menu_lifted_takes_what_most_screens_show_and_marks_the_rest():
    from custom_components.hk_frontend import settings as S
    items = {
        # two wall tablets, the same; one with its own Keep Open Down To
        "wall-a": {"menu": "open", "time_weather": "menu", "dock_min": 1200},
        "wall-b": {"menu": "open", "time_weather": "menu", "dock_min": 1200},
        "wall-c": {"menu": "open", "time_weather": "menu", "dock_min": 900},
        # phones: the edge tab, one with a large tab -- its time_weather is
        # never shown, so it doesn't count against it
        "phone-a": {"menu": "tab", "tab_size": "xl", "time_weather": "page"},
        "phone-b": {"menu": "tab", "tab_size": "xl"},
        "phone-c": {"menu": "chip", "tab_size": "xl"},
        "car": {"menu": "off", "dock_min": 3000},
    }
    options, out = S.menu_lifted({"dashboard": {"menu": {"glyph": "lines", "clock": False}}}, items)
    m = options["dashboard"]["menu"]
    assert (m["style"], m["open_min"], m["time_weather_at"], m["tab_size"]) == ("tab", 1200, "menu", "xl")
    assert (m["glyph"], m["clock"]) == ("lines", False), "the icon and the clock tap stay All Screens'"
    custom = {p for p, d in out.items() if d["menu_custom"]}
    assert custom == {"wall-c", "phone-c"}
    # a screen that keeps its own keeps the shared look it had
    assert (out["wall-c"]["glyph"], out["wall-c"]["clock"]) == ("lines", False)
    # every screen as read shows what it showed before
    for p, d in out.items():
        before, after = S.board(items[p]), S.resolved(S.board(d), options)
        if before["menu"] == "off":
            continue
        for k in S._menu_shown(before):
            assert after[k] == before[k], (p, k)
    # once All Screens has a style, nothing moves again
    assert S.menu_lifted(options, out) == (None, {})


def test_a_screen_follows_all_screens_menu_but_keeps_off_and_always_open():
    from custom_components.hk_frontend import settings as S
    opts = {"dashboard": {"menu": {"style": "chip_home", "accent": "teal", "tab_at": "20%", "open_min": 1400}}}
    btn = S.resolved(S.board({"menu": "tab", "accent": "red"}), opts)
    assert (btn["menu"], btn["accent"], btn["tab_position"], btn["menu_house"]) == ("chip_home", "teal", "20%", True)
    docked = S.resolved(S.board({"menu": "open"}), opts)
    assert (docked["menu"], docked["dock_min"]) == ("open", 1400)
    assert S.resolved(S.board({"menu": "off"}), opts)["menu"] == "off"
    own = S.resolved(S.board({"menu": "tab", "accent": "red", "menu_custom": True}), opts)
    assert (own["menu"], own["accent"], own["menu_house"]) == ("tab", "red", False)


def test_the_swipe_and_no_button():
    """Swipe from Left Edge: off unless stored True, All Screens' unless the
    screen sets its own; No Button is a button style and a narrow choice."""
    from custom_components.hk_frontend import settings as S
    assert S.board({})["swipe"] is False and S.board({"swipe": "yes"})["swipe"] is False
    assert S.board({"swipe": True})["swipe"] is True
    assert S.board({"menu": "none", "narrow": "none"})["menu"] == "none"
    assert S.board({"narrow": "none"})["narrow"] == "none"
    assert "none" in S.MENU_STYLES and S.house_menu({"style": "none"})["menu"] == "none"
    assert S.house_menu({})["swipe"] is False and S.house_menu({"swipe": True})["swipe"] is True
    opts = {"dashboard": {"menu": {"style": "none", "swipe": True}}}
    follows = S.resolved(S.board({"menu": "tab"}), opts)
    assert (follows["menu"], follows["swipe"]) == ("none", True)
    own = S.resolved(S.board({"menu": "tab", "menu_custom": True}), opts)
    assert (own["menu"], own["swipe"]) == ("tab", False)


def test_menu_accent_is_a_name_or_a_hex():
    from custom_components.hk_frontend import settings as S
    assert S.accent("Teal") == "teal" and S.accent("#A1B2C3") == "#a1b2c3"
    assert S.accent("chartreuse") is None and S.accent("#abc") is None
    assert S.board({"accent": "nope"})["accent"] == "orange"
    assert S.house_menu({"accent": "#123456"})["accent"] == "#123456"


def test_a_preset_keeps_its_own_menu_only_where_all_screens_differ():
    from custom_components.hk_frontend import settings as S
    wall = S.SCREEN_PRESETS["wall_tablet"]
    assert S.preset_menu(S.board(wall), wall, {})["menu_custom"] is True
    assert S.preset_menu(S.board(wall), wall, {"dashboard": {"menu": {"time_weather_at": "menu"}}})["menu_custom"] is False
    phone = S.SCREEN_PRESETS["personal"]
    assert S.preset_menu(S.board(phone), phone, {})["menu_custom"] is False


async def test_an_entry_from_1_8_moves_its_menu(hass, base):
    from conftest import house_entry
    from custom_components.hk_frontend import settings as S
    old = house_entry({"subentry_type": "dashboard", "unique_id": "dashboard-a", "title": "A",
                       "data": {"menu": "tab", "tab_size": "xl"}},
                      {"subentry_type": "dashboard", "unique_id": "dashboard-b", "title": "B",
                       "data": {"menu": "tab", "tab_size": "standard", "tab_position": "30%"}},
                      {"subentry_type": "dashboard", "unique_id": "dashboard-c", "title": "C",
                       "data": {"menu": "tab", "tab_size": "xl"}},
                      minor_version=8)
    old.add_to_hass(hass)
    assert await hass.config_entries.async_setup(old.entry_id)
    await hass.async_block_till_done()
    assert old.minor_version == 10
    assert (S.merged(old.options)["menu"]["style"], S.merged(old.options)["menu"]["tab_size"]) == ("tab", "xl")
    got = S.boards(old)
    assert got["dashboard-a"]["menu_house"] and got["dashboard-c"]["menu_house"]
    assert not got["dashboard-b"]["menu_house"] and got["dashboard-b"]["tab_position"] == "30%"


def test_sky_palette_mirror_and_readability():
    """A full-table comparison protects the first paint and panel swatches;
    the curated colors must remain within the established glass budget."""
    import json
    import os
    import re
    import subprocess
    from custom_components.hk_frontend import settings as S
    src = open(os.path.join(COMPONENT, "frontend", "modules", "hk-settings.js")).read()
    body = re.search(r"var SKY_BACKDROPS = (\[.*?\n  \]);", src, re.S)
    assert body
    engines = [["node", "-e", "console.log(JSON.stringify(" + body[1] + "))"],
               ["/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc",
                "-e", "print(JSON.stringify(" + body[1] + "))"]]
    for cmd in engines:
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, check=True)
            break
        except FileNotFoundError:
            continue
    else:
        raise AssertionError("a JavaScript engine is required for palette parity")
    assert json.loads(out.stdout) == list(S.SKY_BACKDROPS)
    assert len(set(S.SKY_BACKDROP_IDS)) == 10
    assert len([p for p in S.SKY_BACKDROPS if "day" in p]) == 8
    def luma(color):
        return sum(int(color[i:i + 2], 16) * w for i, w in zip((1, 3, 5), (.2126, .7152, .0722)))
    pos = (0, .42, .72, 1)
    for p in S.SKY_BACKDROPS:
        if "day" not in p:
            continue
        assert S.sky_stops(p) is not None
        for key in ("day", "night"):
            values = list(map(luma, p[key]))
            assert values[-1] <= 146, (p["id"], key, values[-1])
            assert sum((values[i] + values[i + 1]) / 2 * (pos[i + 1] - pos[i]) for i in range(3)) <= 86


def test_sky_stops_and_screen_look_read_defensively():
    from custom_components.hk_frontend import settings as S
    stops = {"day": ["#ABCDEF"] * 4, "night": ["#010203"] * 4}
    assert S.sky_stops(stops) == {"day": ["#abcdef"] * 4, "night": stops["night"]}
    for bad in (None, [], "blue", {}, {"day": ["#abc"] * 4, "night": stops["night"]},
                {"day": stops["day"][:3], "night": stops["night"]}, {"day": [42] * 4, "night": stops["night"]}):
        assert S.sky_stops(bad) is None
    parsed = S.board({"sky_animations": False, "sky_weather": True, "sky_decorations": None,
                      "sky_gradient": "custom", "sky_custom": stops})
    assert parsed["sky_animations"] is False and parsed["sky_weather"] is True
    assert parsed["sky_gradient"] == "custom" and parsed["sky_custom"] == S.sky_stops(stops)
    parsed = S.board({"sky_animations": 0, "sky_weather": "off", "sky_decorations": 1,
                      "sky_gradient": "unknown", "sky_custom": {}})
    assert all(parsed[k] is None for k in ("sky_animations", "sky_weather", "sky_decorations", "sky_gradient", "sky_custom"))


def test_each_pages_background_is_kept_only_when_it_means_something():
    """Sky / Background -> Page Backgrounds: {page: own | a backdrop id}, a
    screen's own over All Screens'; an unknown page name or mode is left out."""
    from custom_components.hk_frontend import settings as S
    assert S.sky_pages(None) == {} and S.sky_pages("x") is None
    assert S.sky_pages({"energy": "live", "climate": "own", "ecoflow": "dusk", "bad key!": "live", "water": "plaid"}) == \
        {"energy": "live", "climate": "own", "ecoflow": "dusk"}
    assert S.board({"sky_pages": {"energy": "midnight"}})["sky_pages"] == {"energy": "midnight"}
    assert S.board({})["sky_pages"] == {} and S.merged({})["sky"]["pages"] == {}


def test_the_tab_bar_is_a_menu_choice_and_a_narrow_choice():
    """The tab bar (hk-tabbar.js) is the menu's other form: `menu` "tabbar"
    (no side menu) or `narrow` "tabbar" (the side menu wide, the bar where it
    folds) -- never both. Its look is a menu setting, All Screens' unless the
    screen sets its own menu; read defensively."""
    from custom_components.hk_frontend import settings as S
    b = S.board({})
    assert (b["tab_bar_scroll"], b["tab_bar_rooms"], b["tab_bar_glass"]) == ("shrink", "more", "house")
    assert [S.board({"tab_bar_rooms": v})["tab_bar_rooms"] for v in (True, False, "button", "off", "x")] == \
        ["more", "off", "button", "off", "more"], "a boolean from the first form; In More by default"
    assert S.board({"menu": "tabbar"})["menu"] == "tabbar" and S.board({"narrow": "tabbar"})["narrow"] == "tabbar"
    assert "tabbar" not in S.MENU_STYLES, "not a button style"
    odd = S.board({"tab_bar_scroll": "fade", "tab_bar_rooms": "no", "tab_bar_glass": "glitter"})
    assert (odd["tab_bar_scroll"], odd["tab_bar_rooms"], odd["tab_bar_glass"]) == ("shrink", "more", "house")
    opts = {"dashboard": {"menu": {"bar_scroll": "hide", "bar_rooms": "button", "bar_glass": "blur", "narrow": "tabbar"}}}
    follows = S.resolved(S.board({"menu": "open"}), opts)
    assert (follows["tab_bar_scroll"], follows["tab_bar_rooms"], follows["tab_bar_glass"], follows["narrow"]) == \
        ("hide", "button", "blur", "tabbar")
    assert S.resolved(S.board({"menu": "tabbar"}), opts)["menu"] == "tabbar", "the tab bar is the screen's own, as off is"
    own = S.resolved(S.board({"menu_custom": True, "tab_bar_scroll": "stay", "tab_bar_glass": "clear"}), opts)
    assert (own["tab_bar_scroll"], own["tab_bar_rooms"], own["tab_bar_glass"]) == ("stay", "more", "clear")
    assert S.merged(None)["menu"]["bar_scroll"] == "shrink" and "tab_bar" not in S.merged(None)
    assert S.legacy_lists({"d": S.board({"menu": "tabbar"})})["dashboards"] == [], "an older page sees no menu"


def test_the_tab_bars_first_form_is_read_once():
    """2026-10-05: for a few hours the tab bar had a `tab_bar` of its own."""
    from custom_components.hk_frontend import settings as S
    assert S.board({"menu": "off", "tab_bar": "always"})["menu"] == "tabbar"
    assert S.board({"menu": "open", "tab_bar": "narrow"})["narrow"] == "tabbar"
    assert S.board({"menu": "open", "narrow": "chip", "tab_bar": "narrow"})["narrow"] == "chip", "a choice made since stands"
    assert S.board({"menu": "off", "tab_bar": "narrow"})["menu"] == "off"
    assert "tab_bar" not in S.board({"tab_bar": "always"}), "written back without it"


def test_the_tab_bars_more_style():
    """More: a grid of icons (the default) or a list like the side menu's --
    a menu setting, All Screens' unless the screen sets its own."""
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_board, apply_house
    assert S.board({})["tab_bar_more"] == "icons" and S.board({"tab_bar_more": "tiles"})["tab_bar_more"] == "icons"
    opts, err = apply_house({}, {"menu.bar_more": "list"})
    assert err == {} and S.resolved(S.board({}), opts)["tab_bar_more"] == "list"
    assert S.resolved(S.board({"menu_custom": True, "tab_bar_more": "icons"}), opts)["tab_bar_more"] == "icons"
    assert apply_board({}, {"tab_bar_more": "tiles"})[1] == {"tab_bar_more": "choice"}
    # a phone's own: a list unless chosen
    assert S.board({})["tab_bar_more_phone"] == "list"
    opts, err = apply_house({}, {"menu.bar_more_phone": "icons"})
    assert err == {} and S.resolved(S.board({}), opts)["tab_bar_more_phone"] == "icons"
    data, err = apply_board({}, {"tab_bar_more_phone": "icons"})
    assert err == {} and data["tab_bar_more_phone"] == "icons"


def test_the_tab_bars_position():
    """Bottom by default; top, left or right -- a menu setting, All Screens'
    unless the screen sets its own."""
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_board, apply_house
    assert S.board({})["tab_bar_pos"] == "bottom" and S.board({"tab_bar_pos": "middle"})["tab_bar_pos"] == "bottom"
    opts, err = apply_house({}, {"menu.bar_pos": "right"})
    assert err == {} and S.resolved(S.board({}), opts)["tab_bar_pos"] == "right"
    data, err = apply_board({}, {"menu_custom": True, "tab_bar_pos": "top"})
    assert err == {} and S.resolved(data, opts)["tab_bar_pos"] == "top"
    assert apply_board({}, {"tab_bar_pos": "middle"})[1] == {"tab_bar_pos": "choice"}


def test_the_tab_bars_shrink_end():
    """Shrinks To: the start of the bar (a bar's left, a rail's top) unless
    the end is chosen."""
    from custom_components.hk_frontend import settings as S
    from custom_components.hk_frontend.settings_api import apply_board, apply_house
    assert S.board({})["tab_bar_fold"] == "start" and S.board({"tab_bar_fold": "middle"})["tab_bar_fold"] == "start"
    opts, err = apply_house({}, {"menu.bar_fold": "end"})
    assert err == {} and S.resolved(S.board({}), opts)["tab_bar_fold"] == "end"
    assert apply_board({}, {"tab_bar_fold": "middle"})[1] == {"tab_bar_fold": "choice"}
    # Start Small: rests full unless chosen
    assert S.board({})["tab_bar_start"] == "full"
    opts, err = apply_house({}, {"menu.bar_start": "small"})
    assert err == {} and S.resolved(S.board({}), opts)["tab_bar_start"] == "small"
    assert apply_board({}, {"tab_bar_start": "tiny"})[1] == {"tab_bar_start": "choice"}
