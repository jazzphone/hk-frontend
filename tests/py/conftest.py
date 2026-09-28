"""Fixtures for HK Frontend.

Run with tests/py/run (it builds the venv on first use). Music, Live TV,
Clean Areas and Alarm PIN are features of this integration (features/), each
its own entry; their tests are test_feature_*.py.
"""
from __future__ import annotations

import os
import sys
import tempfile

import pytest

from homeassistant.core import HomeAssistant

# `custom_components.hk_frontend`, and ONLY what these tests need: a throwaway
# `custom_components` package holding links, first on the path, so the loader
# finds this integration without also scanning whatever else sits beside it
# in custom_components/.
HERE = os.path.dirname(os.path.abspath(__file__))
_UP = os.path.abspath(os.path.join(HERE, "..", ".."))
# the component's own tests/py, or the repository's tests/py beside
# custom_components/hk_frontend; docs/ is two up either way
COMPONENT = (os.path.join(_UP, "custom_components", "hk_frontend")
             if os.path.isdir(os.path.join(_UP, "custom_components", "hk_frontend")) else _UP)
DOCS = os.path.join(_UP, "docs")
_ROOT = tempfile.mkdtemp(prefix="hk-cc-")
os.makedirs(os.path.join(_ROOT, "custom_components"))
open(os.path.join(_ROOT, "custom_components", "__init__.py"), "w").close()
os.symlink(COMPONENT, os.path.join(_ROOT, "custom_components", "hk_frontend"))
sys.path.insert(0, _ROOT)

pytest_plugins = ["pytest_homeassistant_custom_component"]

DOMAIN = "hk_frontend"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    # The harness imports ITS OWN `custom_components` (testing_config) before
    # this runs; extend that package's path so it can see this component too.
    import custom_components
    links = os.path.join(_ROOT, "custom_components")
    if links not in list(custom_components.__path__):
        custom_components.__path__.append(links)
    yield


@pytest.fixture
async def base(hass: HomeAssistant):
    """The two dependencies this component's FIRST half needs (serving /hk/
    and registering the bootstrap modules). The harness has no hass_frontend
    build, so http and frontend are marked as already set up, and the two
    calls into them are stood in for."""
    from unittest.mock import MagicMock, patch

    hass.config.components.update({"http", "frontend"})
    hass.http = MagicMock()
    with patch("homeassistant.components.frontend.add_extra_js_url"):
        yield hass


@pytest.fixture
async def frontend(hass: HomeAssistant, base):
    """The integration, added the way a user adds it: empty."""
    from homeassistant import config_entries

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    return entry(hass)


def entry(hass):
    """The house's entry (not a feature's)."""
    return next(e for e in hass.config_entries.async_entries(DOMAIN) if not e.data.get("kind"))


async def add_feature(hass, kind: str, user_input: dict | None = None, *more_steps: dict):
    """Add a feature the way a user does: Add feature -> the feature's menu
    item -> its form(s). Returns the flow's last result."""
    from homeassistant import config_entries
    r = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert r["type"] == "menu" and r["step_id"] == "feature", r
    r = await hass.config_entries.flow.async_configure(r["flow_id"], {"next_step_id": kind})
    for step in (user_input, *more_steps):
        if r["type"] != "form":
            break
        r = await hass.config_entries.flow.async_configure(r["flow_id"], step or {})
    await hass.async_block_till_done()
    return r


def feature_entries(hass, kind: str):
    return [e for e in hass.config_entries.async_entries(DOMAIN) if e.data.get("kind") == kind]


class FakeConnection:
    """The websocket handler's side of a connection: who is signed in, the
    subscriptions it holds, and every message sent to it."""

    def __init__(self, user):
        self.user, self.subscriptions, self.sent = user, {}, []

    def send_message(self, msg):
        self.sent.append(msg)

    def send_result(self, msg_id, result=None):
        self.sent.append({"id": msg_id, "type": "result", "success": True})
