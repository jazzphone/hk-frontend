// hk-campost.js -- give the cameras page a poster it already has.
//
// THE PROBLEM, measured on a wall tablet. A cameras page is a grid of
// `picture-entity` cards with `camera_view: live`. Their <video>
// elements exist at 425ms, and HA sets a /api/camera_proxy poster on each one
// at the same moment -- but that poster has to be FETCHED, and UniFi Protect
// takes 1.6-3.1 seconds to produce a snapshot. The live stream usually wins
// (nine Protect cameras):
//
//     camera            HA poster    first video frame
//     front_door           1624ms          1158ms   <- video
//     driveway             2299ms          2050ms   <- video
//     front_yard_left      2501ms          2437ms   <- video
//     front_yard_right     2718ms          1923ms   <- video
//     right_side           2667ms          4361ms   <- poster
//     backyard_left        2828ms          1499ms   <- video
//     deck                 3070ms          1540ms   <- video
//     backyard_right       3105ms          1669ms   <- video
//     garage               2904ms          2904ms   <- tie
//
// Video beat the poster on SEVEN OF NINE. HA's poster mechanism is there and
// is doing almost nothing, so the page is simply dark from 425ms until the
// stream starts -- between 1.2 and 4.4 seconds per tile.
//
// THE FIX IS NOT A FASTER FETCH, it is not fetching. The camera strip on the
// home view already keeps a thumbnail of the last frame it saw in
// localStorage (snapCache in hk-base.js). That is a data: URL -- no network, no
// Protect, available at 0ms. This hands it to the player as its poster.
//
// FRESHNESS IS THE WHOLE SAFETY ARGUMENT. The strip can show an old frame
// because it draws an age label over every tile; the cameras page has no such
// label, and a picture of the front door from three hours ago presented as
// live is worse than a black tile. So a cached frame is used ONLY while it is
// under two minutes old -- which is exactly the case where the wait is most
// annoying (you were just looking at the dashboard) and never the case where
// it would mislead. Past that the page behaves exactly as it would without
// this module.
//
// WHAT THIS REACHES INTO, stated plainly: `ha-web-rtc-player` and
// `ha-hls-player` are HA internals, and `posterUrl` is a Lit reactive property
// on them. If HA renames or restructures those, this stops finding them and
// does nothing -- HA's own poster is still set and the page is no worse than
// without it. That is the failure mode this is designed for; it never replaces
// anything of HA's except a poster it is about to lose the race on anyway.
(function () {
  if (window.hkCamPost) return;                   // double-load guard
  window.hkCamPost = { version: '1.0.0' };

  var PLAYERS = ['ha-web-rtc-player', 'ha-hls-player'];

  function deepFind(tags, root, out) {
    out = out || [];
    root = root || document.body;
    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (tags.indexOf(el.tagName.toLowerCase()) !== -1) out.push(el);
      if (el.shadowRoot) deepFind(tags, el.shadowRoot, out);
      deepFind(tags, el, out);
    }
    return out;
  }

  // One pass. Cheap enough to run on a short ramp after a navigation: it is a
  // tree walk that finds nothing at all on a view with no cameras.
  //
  // MEASURED, because the cost was worth knowing before tuning it: 0.39-0.43ms
  // per sweep, so the full 50-tick ramp is ~20ms spread over three seconds.
  // That is not a performance problem and this file should not be
  // restructured as if it were. What matters is that the ramp STOPS: without
  // that it keeps walking for the remaining three seconds after every player
  // already has its poster. Hence the DONE return below.
  //
  // Returns the number of posters set, or DONE when there is nothing left to
  // do -- players exist and every one of them has been handled.
  var DONE = -1;
  function sweep() {
    var C = window.hkCards, HS = window.hkSettings;
    if (!C || !C.snapCache) return 0;
    // No players outside a Lovelace panel: done, and no walk.
    if (HS && HS.lovelacePanel && HS.lovelacePanel() === false) return DONE;
    var players = deepFind(PLAYERS);
    if (!players.length) return 0;
    var n = 0, pending = 0;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.__hkPosted) continue;                 // once per element
      pending++;
      // The entity is on the ha-camera-stream ABOVE the player, which is the
      // shadow host of the root the player lives in.
      var host = p.getRootNode && p.getRootNode().host;
      var st = host && host.stateObj;
      if (!st || !st.entity_id) continue;
      var hit = C.snapCache.get(st.entity_id, C.snapCache.FRESH);
      if (!hit) { p.__hkPosted = true; continue; }  // stale or absent: leave HA's
      try {
        p.posterUrl = hit.d;
        p.__hkPosted = true;
        n++;
      } catch (e) { p.__hkPosted = true; }
    }
    // Every player on this view is handled, so further ticks can only walk the
    // tree and find nothing to change.
    return pending === 0 ? DONE : n;
  }

  // CAN THIS VIEW HOLD ONE AT ALL? Home Assistant's players come only from a
  // live camera view: `camera_view: live` in a view's cards (picture-entity,
  // picture-glance, the Cameras page) or the camera strip's live tile
  // (hk-camera-mosaic-card). A view with neither needs no walk. The 0.4 ms
  // above was a desk; on a wall tablet (4x throttle) a walk of Home is 2.4 ms,
  // and the ceiling made it ~50 of them -- ~120 ms of main thread -- after
  // every navigation AND every pop-up opening or closing (both fire
  // location-changed), on views with no camera at all. Unknown (no config
  // yet, not a dashboard view): look, as before.
  function mayHavePlayers() {
    var M = window.hkCards && window.hkCards.menu;
    var cfg = M && typeof M.config === 'function' ? M.config() : null;
    if (!cfg || !Array.isArray(cfg.views)) return true;
    var seg = String(location.pathname).split('/')[2] || '', view = null;
    cfg.views.forEach(function (v, i) {
      if (!view && v && ((v.path && v.path === seg) || String(i) === seg)) view = v;
    });
    if (!view && !seg) view = cfg.views[0];
    if (!view) return true;
    var s = JSON.stringify(view);
    return s.indexOf('"camera_view":"live"') >= 0 || s.indexOf('hk-camera-mosaic-card') >= 0;
  }

  // THE SAME SHAPE AS hk-sky's FIRST MOUNT, and for the same reason: the
  // players do not exist when this module loads, and no event fires when they
  // appear. A 60ms ramp with a ceiling catches them at ~425ms; the ceiling
  // stops it dead on the views that have no cameras at all.
  var ramp = null;
  function chase() {
    if (ramp) clearInterval(ramp);
    ramp = null;
    if (!mayHavePlayers()) return;
    var tries = 0;
    ramp = setInterval(function () {
      // Stop as soon as the work is done, or at the ceiling. The ceiling is
      // still what ends the ramp on the views that have no cameras at
      // all -- there is no cheap way to know that without the walk, and at
      // 0.4ms a tick there is no reason to invent one.
      if (sweep() === DONE || ++tries > 50) { clearInterval(ramp); ramp = null; }   // ~3s
    }, 60);
  }

  window.addEventListener('location-changed', chase);
  window.addEventListener('popstate', chase);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', chase);
  } else {
    chase();
  }
  window.hkCamPost.sweep = sweep;
  window.hkCamPost.mayHavePlayers = mayHavePlayers;
})();
