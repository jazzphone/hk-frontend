"""Sleep Screen's engine (sleep_engine.py) in a running Home Assistant: a
screen Decided By HK Frontend sleeps and wakes itself, on a stand-in Kiosk
Satellite and a stand-in page -- the house's sleep and wake, and its races."""
from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from homeassistant.const import EVENT_CALL_SERVICE
from homeassistant.core import Context, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er

from conftest import entry
from test_screensaver import Conn, _add, _change, _hall

BLACK, PHOTOS, SLEEP = "switch.hall_black_screen", "switch.hall_photo_screensaver", "sensor.hall_sleep_screen"
K = {"screen": "light.hall_kiosk_screen", "active": "switch.hall_kiosk_screensaver_active",
     "armed": "switch.hall_kiosk_screensaver", "mode": "select.hall_kiosk_screensaver_mode",
     "app": "sensor.hall_kiosk_foreground_app", "touched": "sensor.hall_kiosk_last_interaction",
     "front": "button.hall_kiosk_bring_to_front"}
MOTION, LAMP, NIGHT, AWAY, BELL, SMOKE, TARGET = ("binary_sensor.hall_motion", "light.hall_lamp", "timer.night",
                                                  "input_boolean.away", "timer.doorbell", "binary_sensor.smoke",
                                                  "sensor.hall_target")


@pytest.fixture(autouse=True)
def quick(monkeypatch):
    from custom_components.hk_frontend import sleep_engine as E
    monkeypatch.setattr(E, "CONFIRM_S", 0.3)
    monkeypatch.setattr(E, "KIOSK_WAIT_S", 0.2)
    monkeypatch.setattr(E, "SETTLE_S", 0.02)
    monkeypatch.setattr(E, "BACKSTOP_S", 0.2)


class Kiosk:
    """A stand-in Kiosk Satellite: its entities on a device, answering the
    calls the engine makes the way the real one does."""

    def __init__(self, hass, page=True):
        self.hass, self.page, self.calls = hass, page, []
        ce = MockConfigEntry(domain="esphome")
        ce.add_to_hass(hass)
        dev = dr.async_get(hass).async_get_or_create(config_entry_id=ce.entry_id, identifiers={("esphome", "hall")},
                                                     name="Hall Kiosk")
        self.device = dev.id
        reg = er.async_get(hass)
        for part, eid in K.items():
            d, obj = eid.split(".")
            reg.async_get_or_create(d, "esphome", "hall-" + part, suggested_object_id=obj, device_id=dev.id,
                                    config_entry=ce)
        s = hass.states.async_set
        s(K["screen"], "on", {"brightness": 174})
        s(K["active"], "off"); s(K["armed"], "off"); s(K["mode"], "Black")
        s(K["app"], "me.jxl.kiosk_satellite"); s(K["touched"], "2026-01-01T00:00:00+00:00")
        s(K["front"], "unknown")
        for d, svc in (("light", "turn_on"), ("light", "turn_off"), ("select", "select_option"), ("button", "press")):
            if not hass.services.has_service(d, svc):
                hass.services.async_register(d, svc, lambda call: None)
        hass.bus.async_listen(EVENT_CALL_SERVICE, self._call)
        hass.bus.async_listen("state_changed", self._black)

    @callback
    def _call(self, ev):
        d, svc, data = ev.data["domain"], ev.data["service"], dict(ev.data.get("service_data") or {})
        ids = data.get("entity_id") or []
        ids = [ids] if isinstance(ids, str) else list(ids)
        mine = [i for i in ids if i in K.values()]
        if not mine:
            return
        self.calls.append((d, svc, tuple(mine), data.get("brightness") or data.get("option")))
        for i in mine:
            if d == "switch":
                self.hass.states.async_set(i, "on" if svc == "turn_on" else "off")
            elif d == "light":
                st = self.hass.states.get(i)
                b = data.get("brightness", st.attributes.get("brightness"))
                self.hass.states.async_set(i, "on" if svc == "turn_on" else "off", {"brightness": b}, context=ev.context)
            elif d == "select":
                self.hass.states.async_set(i, data["option"])

    @callback
    def _black(self, ev):
        # the page: HK's black confirmed once drawn (when there is a page)
        new = ev.data.get("new_state")
        if self.page and ev.data["entity_id"] == BLACK and new is not None and new.state == "on" \
                and not new.attributes.get("confirmed"):
            from custom_components.hk_frontend.screensaver import manager
            self.hass.loop.call_later(0.05, manager(self.hass).entities["dashboard-hall"]["black"].page_says, True)

    def did(self, d, svc, part):
        return [c for c in self.calls if c[0] == d and c[1] == svc and K[part] in c[2]]


def opts(kiosk, **o):
    base = {"decided_by": "hk", "kiosk": kiosk.device, "presence": [MOTION], "linger": 0}
    base.update(o)
    return base


async def settle(hass, s=0.4):
    for _ in range(int(s / 0.05)):
        await asyncio.sleep(0.05)
        await hass.async_block_till_done()


def engine(hass):
    from custom_components.hk_frontend.screensaver import manager
    return manager(hass).engines.get("dashboard-hall")


async def screen(hass, kiosk, black="hk", **o):
    hass.states.async_set(MOTION, "off")
    sub = _hall(black_screen=black, sleep=opts(kiosk, **o))
    await _add(hass, sub)
    await settle(hass)
    return sub


async def test_an_automation_decides_until_the_screen_says_hk_frontend(hass, frontend):
    sub = _hall()
    await _add(hass, sub)
    assert hass.states.get(SLEEP).state == "automation" and engine(hass) is None
    k = Kiosk(hass)
    hass.states.async_set(MOTION, "unavailable")
    await _change(hass, sub, sleep=opts(k, decided_by="shadow"))
    assert hass.states.get(SLEEP).state == "hold", "a presence sensor missing: no guess"
    hass.states.async_set(MOTION, "off")
    await settle(hass)
    assert engine(hass) is not None and hass.states.get(SLEEP).state == "dark"
    assert not k.calls and hass.states.get(BLACK).state == "off", "shadow decides, never acts"
    await _change(hass, sub, sleep=opts(k, decided_by="automation"))
    assert engine(hass) is None and hass.states.get(SLEEP).state == "automation"


async def test_nobody_here_sleeps_under_hks_black_and_somebody_wakes_it(hass, frontend):
    k = Kiosk(hass)
    await screen(hass, k)
    s = hass.states.get(SLEEP)
    assert s.state == "dark" and s.attributes["reason"] == "nobody here"
    assert hass.states.get(BLACK).state == "on" and hass.states.get(BLACK).attributes["confirmed"] is True
    assert hass.states.get(PHOTOS).state == "on", "the photos selected under the black, as the house's sleep"
    assert not k.did("switch", "turn_on", "active"), "the page answered: Kiosk Satellite's black not used"
    assert hass.states.get(BLACK).attributes["brightness"] is None
    k.calls.clear()
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "photos"
    assert hass.states.get(BLACK).state == "off" and hass.states.get(PHOTOS).state == "off", \
        "arriving in a dark room wakes it to the dashboard (the photos come by themselves)"
    assert k.did("button", "press", "front") and k.did("switch", "turn_off", "active")
    assert hass.states.get(SLEEP).attributes["actual"] == "dashboard"


async def test_no_answer_from_the_page_falls_back_to_kiosk_satellites_black(hass, frontend):
    k = Kiosk(hass, page=False)
    await screen(hass, k)
    assert hass.states.get(BLACK).state == "on" and hass.states.get(BLACK).attributes["confirmed"] is False
    assert k.did("switch", "turn_on", "active") and hass.states.get(K["active"]).state == "on"
    assert hass.states.get(SLEEP).attributes["actual"] == "dark"
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(BLACK).state == "off" and hass.states.get(K["active"]).state == "off", "both come down"


async def test_kiosk_satellites_black_when_the_screen_draws_with_it(hass, frontend):
    k = Kiosk(hass)
    await screen(hass, k, black="kiosk")
    assert hass.states.get(BLACK).state == "off" and hass.states.get(K["active"]).state == "on"


async def test_a_tap_on_the_black_is_in_use_and_never_slept_again(hass, frontend):
    from custom_components.hk_frontend.screensaver import ws_black
    k = Kiosk(hass)
    await screen(hass, k)
    seen = []
    hass.bus.async_listen("state_changed", lambda ev: seen.append(ev.data["new_state"].state)
                          if ev.data["entity_id"] == BLACK else None)
    tablet = Conn(await hass.auth.async_create_user("hall"))
    ws_black(hass, tablet, {"id": 1, "type": "hk_frontend/screensaver/black", "dashboard": "dashboard-hall", "black": False})
    await settle(hass)
    assert hass.states.get(SLEEP).state == "dashboard" and hass.states.get(SLEEP).attributes["in_use"] is True
    assert "off" in seen and "on" not in seen[seen.index("off"):], \
        "the black never put back after the tap (the house's 2 s re-sleep)"
    assert hass.states.get(BLACK).state == "off"


async def test_another_app_in_front_is_left_alone(hass, frontend):
    k = Kiosk(hass)
    hass.states.async_set(K["app"], "com.netflix.mediaclient")
    await screen(hass, k)
    s = hass.states.get(SLEEP)
    assert s.state == "hold" and "another app" in s.attributes["reason"] and not k.calls
    assert hass.states.get(BLACK).state == "off"


async def test_claims_holds_and_quiet_hours(hass, frontend):
    k = Kiosk(hass)
    for e in (SMOKE, BELL, AWAY, NIGHT):
        hass.states.async_set(e, "off" if e.startswith(("binary", "input")) else "idle")
    await screen(hass, k, wake_for=[SMOKE], hold_while=[BELL], dark_while=[AWAY], quiet_while=[NIGHT],
                 quiet_ok=[SMOKE, BELL], dark_display="off_quiet")
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "photos"
    hass.states.async_set(NIGHT, "active")
    await settle(hass)
    s = hass.states.get(SLEEP)
    assert s.state == "dark" and s.attributes["reason"] == "quiet hours", "quiet hours beat somebody in the room"
    assert hass.states.get(K["screen"]).state == "off", "and the display goes off in quiet hours"
    hass.states.async_set(BELL, "active")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "hold", "the doorbell holds in quiet hours: its automation shows it"
    hass.states.async_set(BELL, "idle")
    hass.states.async_set(SMOKE, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "dashboard" and hass.states.get(K["screen"]).state == "on", \
        "smoke wakes it, display and all, in quiet hours"
    hass.states.async_set(SMOKE, "off")
    hass.states.async_set(NIGHT, "idle")
    hass.states.async_set(AWAY, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "dark" and hass.states.get(SLEEP).attributes["reason"].endswith("is on")


async def test_the_power_button_in_quiet_hours_wakes_it_for_a_minute(hass, frontend):
    k = Kiosk(hass)
    hass.states.async_set(NIGHT, "active")
    await screen(hass, k, quiet_while=[NIGHT], dark_display="off_quiet")
    assert hass.states.get(K["screen"]).state == "off"
    hass.states.async_set(K["screen"], "on", {"brightness": 1}, context=Context())   # the tablet itself
    await settle(hass)
    s = hass.states.get(SLEEP)
    assert s.state == "dashboard" and s.attributes["in_use"] is True
    assert hass.states.get(BLACK).state == "off"


async def test_good_night_darkens_an_occupied_room_until_it_is_re_entered(hass, frontend):
    k = Kiosk(hass)
    hass.states.async_set(NIGHT, "idle")
    await screen(hass, k, reset=[NIGHT])
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "photos"
    await asyncio.sleep(0.01)
    hass.states.async_set(NIGHT, "active")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "dark" and "re-entered" in hass.states.get(SLEEP).attributes["reason"]
    hass.states.async_set(MOTION, "off")
    await settle(hass)
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "photos", "somebody coming back in"


async def test_the_lit_gate(hass, frontend):
    k = Kiosk(hass)
    hass.states.async_set(LAMP, "off")
    await screen(hass, k, lit=[LAMP])
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "dark", "walking through a dark room at night does not light it"
    hass.states.async_set(LAMP, "on")
    await settle(hass)
    assert hass.states.get(SLEEP).state == "photos"


async def test_brightness_follows_its_sensor_and_never_lights_the_black(hass, frontend):
    k = Kiosk(hass)
    hass.states.async_set(TARGET, "174")
    await screen(hass, k, brightness="sensor", bright_sensor=TARGET)
    assert hass.states.get(BLACK).attributes["brightness"] == 174
    k.calls.clear()
    hass.states.async_set(TARGET, "75")
    await settle(hass)
    assert hass.states.get(BLACK).attributes["brightness"] == 75, "the black wakes to the new target"
    assert not k.did("light", "turn_on", "screen"), "the display is not written under the black"
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    hass.states.async_set(TARGET, "150")
    await settle(hass)
    assert k.did("light", "turn_on", "screen")[-1][3] == 150, "awake: the display follows"


async def test_after_the_screensaver_with_no_presence_sensors(hass, frontend, freezer):
    k = Kiosk(hass)
    sub = _hall(black_screen="hk", sleep=opts(k, presence=[], after_saver=5, decided_by="shadow"))
    await _add(hass, sub)
    assert hass.states.get(SLEEP).state == "photos", "no presence sensors: the room counts as occupied"
    freezer.tick(timedelta(seconds=180 + 5 * 60 + 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    s = hass.states.get(SLEEP)
    assert s.state == "dark" and "5 min" in s.attributes["reason"]


async def test_a_loop_waits(hass, frontend, caplog):
    from custom_components.hk_frontend import sleep_engine as E
    k = Kiosk(hass)
    await screen(hass, k)
    eng = engine(hass)
    eng._recent = [__import__("time").monotonic()] * E.ACTIONS_PER_MIN
    hass.states.async_set(MOTION, "on")
    await settle(hass)
    assert hass.states.get(BLACK).state == "on" and "actions in a minute" in caplog.text


async def test_day_and_night_brightness_and_the_repair_on_waking(hass, frontend):
    k = Kiosk(hass, page=False)              # Kiosk Satellite's black: it comes back at its own level
    hass.states.async_set(NIGHT, "idle")
    await screen(hass, k, brightness="fixed", bright_day=174, bright_night=75, night_while=[NIGHT])
    assert hass.states.get(SLEEP).attributes["target_brightness"] == 174
    hass.states.async_set(NIGHT, "active")
    await settle(hass)
    assert hass.states.get(SLEEP).attributes["target_brightness"] == 75
    # the tablet missed it (offline): the display still at 174 under the black
    hass.states.async_set(K["screen"], "on", {"brightness": 174})
    k.calls.clear()
    hass.states.async_set(MOTION, "on")
    await settle(hass, 0.8)
    assert k.did("light", "turn_on", "screen") and k.did("light", "turn_on", "screen")[-1][3] == 75, \
        "the wake puts the display at the target it missed"
