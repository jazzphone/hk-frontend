// hk-popup.js -- a hash-driven sheet over the dashboard, as a native card.
//
// A native replacement for custom:bubble-card's pop-ups: bubble-card is
// about 1 MB -- 40% of a page load on every dashboard -- and three pop-ups
// (#alarm, #media, #doorbell) are all it is needed for.
//
// WHAT A POP-UP NEEDS, from bubble-card's configs and bubble-card.js itself:
//
//   hash                open while location.hash equals it; closing removes it.
//                       An automation can open one by loading ".../0#doorbell"
//                       on a wall tablet, so the hash is a public contract and
//                       is kept exactly.
//   position            center (#alarm, #doorbell) or bottom (#media, which
//                       grows upward from a fixed bottom edge).
//   width / background  e.g. 900px on #1c1c1e; 88% transparent for #media.
//   auto_close          e.g. 60 s on #alarm and #doorbell.
//   close outside       a tap on the dimmed backdrop closes.
//   trigger             #media opens itself when its conditions become true and
//                       (trigger_close) shuts when they become false.
//   close_action        (supported)
//
// AND ONE THING BUBBLE CANNOT DO, for #media:
//   dismissable         a hand-closed sheet stays closed on THAT screen until
//                       the session ends -- not a home-wide input_boolean that
//                       hides it on every screen at once. Level-triggered,
//                       survives a reload. See "dismissal" below.
//   entity_from / grace state conditions that follow a selector's mapped
//                       entity, and stay true N seconds after it leaves.
//
// BUBBLE'S TRIGGER RULES, copied rather than reinvented (its `ro`/`so`):
//   * evaluated only when the result CHANGES;
//   * true  -> open, unless already open;
//   * false -> close if trigger_close -- EXCEPT on the very first evaluation
//     after page load, so a reload never slams shut a sheet that was opened by
//     URL (a tablet told to load "#alarm" while the trigger is false).
// And its close_action rule (`Ga`/`Na`): run on every close, except when the
// hash changed to ANOTHER pop-up's -- switching sheets is not closing.
//
// WHERE THE SHEET LIVES: inside home-assistant's shadow root, NOT document.body.
// The cards in it fire hass-more-info / hass-action / show-dialog, and
// home-assistant only hears events that bubble through it. Mounted on body, a
// lock tile in the alarm sheet would tap and do nothing. Inside the root the
// events bubble (composed) up to the host and work; the theme still reaches it,
// because HA writes theme variables on <html>. More-info dialogs render in the
// browser's top layer, so they still open ABOVE the sheet.
//
// NOT inside the card's own shadow root: the view can carry a transform or
// opacity (hk-viewfade.js), and position:fixed under a transformed ancestor is
// positioned against that ancestor, not the screen.
//
// THE CHILD CARDS are built once, on first open, by HA's own
// createCardElement, and fed hass ONLY while open. Closed, they are detached --
// which is what stops the doorbell's live stream -- and cost nothing.
(function () {
  'use strict';

  var CSS = [
    // NO TAP HIGHLIGHT ANYWHERE IN THE SHEET. hk-tap.js clears Android
    // WebView's highlight on partial-panel-resolver, but this sheet is
    // mounted in home-assistant's shadow root, BESIDE that element, so nothing
    // in a pop-up inherits it: every keypad key would flash the WebView
    // default -- a square blue box that ignores the key's radius. The property
    // inherits, so setting it here covers every card inside.
    '.hkp{-webkit-tap-highlight-color:transparent}',
    '.hkp{position:fixed;inset:0;z-index:7;display:flex;justify-content:center;',
    '  align-items:center;pointer-events:none;box-sizing:border-box}',
    // A MODAL SHEET CENTRES ON THE DASHBOARD, not the window: past Home
    // Assistant's sidebar (hk-menu.js publishes where the dashboard starts),
    // over the whole dashboard -- a docked menu is part of it. The backdrop,
    // inset 0, still covers everything.
    '.hkp:not(.plain){padding-left:var(--hk-content-left,0px)}',
    '.hkp.bottom{align-items:flex-end}',
    // Bubble's backdrop, measured: rgba(17,17,17,0.8), 0.3s opacity fade.
    '.hkp .bd{position:absolute;inset:0;background:rgba(17,17,17,0.8);opacity:0;',
    '  transition:opacity .3s ease;pointer-events:auto;-webkit-tap-highlight-color:transparent}',
    '.hkp.open .bd{opacity:1}',
    // Opacity + transform only: compositor properties, no layout per frame.
    // --hk-vh: the car dashboards zoom <html> (tesla-viewport.js), and a
    // viewport unit is zoomed with it -- 100dvh there is 67% of the screen.
    // tesla-viewport.js publishes the real height in layout px; unset
    // everywhere else, so this is plain 100dvh.
    '.hkp .sheet{position:relative;box-sizing:border-box;pointer-events:auto;',
    '  max-height:calc(var(--hk-vh, 100dvh) - 36px);overflow-y:auto;overscroll-behavior:contain;',
    '  -webkit-overflow-scrolling:touch;opacity:0;transform:translateY(24px) scale(.98);',
    '  transition:opacity .25s ease,transform .3s cubic-bezier(.2,.8,.2,1)}',
    '.hkp.bottom .sheet{transform:translateY(100%)}',
    '.hkp.open .sheet{opacity:1;transform:none}',
    '.hkp .sheet>*{display:block}',
    // Between CARDS only. hk-glass.js puts its frost layer (absolute, out of
    // flow) first in the sheet, and a plain `*+*` would give the first card
    // an 8px top margin the moment the layer arrives -- after the frost has
    // been measured, so the pills would move off their own frost.
    // ...and not after the X either: it sits first in the sheet (absolute,
    // out of flow), and the rule would give the camera card under it 8px,
    // opening a gap at the top of the camera pop-ups.
    '.hkp .sheet>:not([data-hk-glass-layer]):not(.x)~:not([data-hk-glass-layer]):not(.x){margin-top:8px}',
    '.hkp .sheet::-webkit-scrollbar{display:none}',
    // ---- NON-MODAL (`modal: false`) -----------------------------------------
    // The now-playing bar: it sits over the dashboard and the dashboard KEEPS
    // WORKING under it. Two properties do that, and both are on the backdrop
    // rather than the container -- `.hkp` is already pointer-events:none, so
    // the backdrop is the only thing that blocks taps.
    //
    //   no background   nothing is dimmed
    //   pointer-events  taps fall through to the dashboard
    //
    // close_outside is meaningless here and is ignored: with nothing to catch
    // the tap, "outside" is just the dashboard. That is what close_button is
    // for.
    '.hkp.plain .bd{background:none;pointer-events:none}',
    // The X. In the sheet's top-right corner, over whatever the sheet draws,
    // because the sheet's content is a card that knows nothing about being in
    // a pop-up.
    // --hk-popup-x-top/-right: the camera pop-ups put the X on the same line
    // as their name label (16px / 18px); everything else keeps 10 / 12.
    '.hkp .x{position:absolute;top:var(--hk-popup-x-top,10px);right:var(--hk-popup-x-right,12px);',
    '  z-index:3;width:34px;',
    '  height:34px;border-radius:17px;display:flex;align-items:center;',
    '  justify-content:center;cursor:pointer;pointer-events:auto;',
    // --hk-popup-x-bg: a sheet over live video (the camera pop-ups) sets a
    // dark plate through `vars`, because the default white wash vanishes
    // against a bright sky. The now-playing bar keeps the default.
    '  background:var(--hk-popup-x-bg,rgba(255,255,255,.16));color:rgba(255,255,255,.92);',
    '  --mdc-icon-size:19px}',
    '.hkp .x:active{background:rgba(255,255,255,.30)}',
    // PREPARED UNSEEN: a sheet with a live camera opens at 1% until the
    // camera's first frame has been drawn -- see _show.
    '.hkp{transition:opacity .2s ease}',
    '.hkp.prep{opacity:.01}',
    // The dim still CATCHES taps while the sheet prepares (its click handler
    // ignores them): with pointer-events off, a second tap in that 1.2 s would
    // go straight through to the dashboard underneath -- another camera, a pill.
    '.hkp.prep .sheet,.hkp.prep .x{pointer-events:none}',
    '@media (prefers-reduced-motion:reduce){.hkp,.hkp .bd,.hkp .sheet{transition:none}}'
  ].join('');

  // ---------------------------------------------------------------- conditions
  // The subset of HA's condition vocabulary these configs use, plus the obvious
  // neighbours. Unknown condition types evaluate FALSE and say so once, rather
  // than silently opening a sheet.
  var warned = {};
  // ctx carries the clock and collects the soonest moment a `grace` window
  // runs out, so the card can re-evaluate exactly then instead of waiting for
  // an unrelated state change that may never come.
  function met(conds, states, ctx) {
    ctx = ctx || { now: Date.now(), next: Infinity };
    return (conds || []).every(function (c) { return one(c, states, ctx); });
  }

  // `grace`: how long a state condition STAYS true after the entity leaves the
  // state -- the equivalent of an automation's `from: playing, for: 20s`, which
  // keeps the widget up across a track change or a pause-and-resume.
  //
  // Timed from when THIS SCREEN SAW the change, not from last_changed. A wall
  // tablet's clock can be minutes off the server's, and a server timestamp
  // compared with Date.now() would stretch or skip the window by that much.
  // Consequence, and the right one: an entity already stopped when the page
  // loads is simply stopped -- no grace is invented for a stop nobody saw.
  var GRACE = {};

  function resolve(c, states) {
    if (c.entity) return c.entity;
    var f = c.entity_from;
    // `music: true` -- the player THIS screen shows, per hkMusic
    // (cards/hk-base.js).
    if (f && f.music) return window.hkMusic ? window.hkMusic.player({ states: states }) : null;
    if (!f || !f.selector) return null;
    var sel = states[f.selector];
    return sel && f.map ? (f.map[sel.state] || null) : null;
  }

  function one(c, states, ctx) {
    var kind = c.condition || (c.entity || c.entity_from ? 'state' : '');
    var id = resolve(c, states);
    var st = id && states[id];
    var v = st ? st.state : undefined;
    switch (kind) {
      case 'and': return met(c.conditions, states, ctx);
      case 'or': return (c.conditions || []).some(function (x) { return one(x, states, ctx); });
      case 'not': return !(c.conditions || []).some(function (x) { return one(x, states, ctx); });
      case 'state':
        if (c.state_not != null) {
          return [].concat(c.state_not).map(String).indexOf(String(v)) === -1;
        }
        var hit = v !== undefined && [].concat(c.state).map(String).indexOf(String(v)) !== -1;
        if (!c.grace) return hit;
        var key = id + '|' + [].concat(c.state).join(',');
        var g = GRACE[key] || (GRACE[key] = { was: false, left: 0 });
        if (hit) { g.was = true; g.left = 0; return true; }
        if (g.was) { g.was = false; g.left = ctx.now; }
        if (!g.left) return false;
        var until = g.left + Number(c.grace) * 1000;
        if (ctx.now >= until) { g.left = 0; return false; }
        ctx.next = Math.min(ctx.next, until);
        return true;
      case 'numeric_state':
        var n = Number(v);
        if (v === undefined || v === '' || !isFinite(n)) return false;
        if (c.above != null && !(n > Number(c.above))) return false;
        if (c.below != null && !(n < Number(c.below))) return false;
        return true;
      default:
        if (!warned[kind]) {
          warned[kind] = true;
          console.warn('[hk-popup] unsupported condition, treated as false:', c);
        }
        return false;
    }
  }

  // ------------------------------------------------------------- dismissal
  // `dismissable`: closing the sheet by hand keeps it closed ON THIS SCREEN
  // for the rest of this session. A shared input_boolean would be ONE switch
  // for the whole home: dismiss the player on the kitchen tablet and it would
  // vanish from every tablet and phone at once.
  //
  // THE SESSION ends when the trigger goes false (playback stopped past its
  // grace, no timer running) or when the dismiss_scope signature changes (a
  // different speaker is selected, a timer starts) -- either reopens it.
  //
  // SURVIVES A RELOAD, via localStorage. The stored record carries `seen`, the
  // last time this screen confirmed the session was still running; a record
  // older than STALE_MS is a session that ended while nothing was watching (a
  // phone put away, music stopped, started again hours later) and is ignored.
  // STALE_MS is minutes, not seconds, because a hidden page's timers are
  // throttled to about one a minute and the screensaver hides the page.
  var STALE_MS = 5 * 60 * 1000, TOUCH_MS = 20 * 1000;
  // How long a sheet opened BY THE URL is given to see its own trigger become
  // true before it closes itself. Long enough for a cold tablet to receive its
  // first full state dump, short enough that a stale hash is not a bar you
  // cannot get rid of. See the first-evaluation grace in _evalTrigger.
  var FIRST_CLOSE_MS = 5000;
  // The longest a sheet with a live camera stays invisible waiting for the
  // first frame (see _show: PREPARED UNSEEN). Typically ready in ~0.6 s.
  var PREP_MAX_MS = 1200;

  // THE SCREENSAVER ENDS THE SESSION: once WallPanel has started again, a
  // hand-closed bar reappears the next time the dashboard comes up.
  //
  // Without this a hand-closed bar stays closed essentially forever on a wall
  // tablet. STALE_MS cannot save it: the dismissed card refreshes `seen` every
  // TOUCH_MS, so a live page never goes stale -- that refresh exists so a
  // BACKGROUNDED page (a phone in a pocket) expires and a watched one does not.
  // Walking away and coming back is the one case where the record should be
  // forgotten, and the screensaver is precisely that event.
  //
  // `screensaverRunning` is a plain boolean property on WallPanel's
  // `wallpanel-view` element. The element lives inside nested shadow roots
  // and the screensaver's container div stays in the DOM whether or not it
  // is showing, so presence is NOT the signal -- the flag is.
  //
  // COSTS NOTHING WHEN NOT DISMISSED. This is only ever called from the
  // dismissable branch of _evalTrigger, which already re-evaluates on its own
  // TOUCH_MS timer while a record exists. No new timer, no observer, and no
  // work at all on a screen that has not closed the sheet by hand.
  var wpView = null, wpMissUntil = 0;
  function screensaverOn() {
    // HK Frontend's own screensaver (hk-saver.js) says so directly
    if (window.hkSaver && window.hkSaver.running && window.hkSaver.running()) return true;
    try {
      if (!wpView || !wpView.isConnected) {
        // A screen with no WallPanel (the phone, a desktop, the car) would
        // otherwise walk every shadow root on the page on every evaluation
        // while a dismissal record exists; remember the miss for a minute.
        if (Date.now() < wpMissUntil) return false;
        wpView = (function find(root) {
          var hit = root.querySelector('wallpanel-view');
          if (hit) return hit;
          var all = root.querySelectorAll('*');
          for (var i = 0; i < all.length; i++) {
            if (all[i].shadowRoot) { var h = find(all[i].shadowRoot); if (h) return h; }
          }
          return null;
        })(document);
        if (!wpView) wpMissUntil = Date.now() + 60000;
      }
      return !!(wpView && wpView.screensaverRunning);
    } catch (e) { return false; }   // no WallPanel here (phone, desktop, car)
  }

  // A NON-MODAL SHEET MUST NOT COVER THE APP CHROME. `.hkp` is position:fixed
  // inset:0, so it spans the whole window -- including HA's sidebar rail,
  // which the now-playing bar's album art and the timer strip's first pill
  // would sit straight on top of.
  //
  // A wall tablet that sets `kiosk_mode.hide_sidebar` never shows this: there
  // is nothing to overlap. But `admin_settings` un-hides it, so an admin
  // looking at a tablet dashboard in a browser sees it too -- and a dashboard
  // with no kiosk_mode always does.
  //
  // MODAL SHEETS ARE LEFT ALONE. Covering everything is what a modal is for,
  // and HA's own dialogs do the same. This is only for `modal: false`, whose
  // whole premise is that the rest of the UI stays usable underneath.
  //
  // Measured rather than read from a variable: HA exposes no reliable custom
  // property for the rail's width (--mdc-drawer-width and --app-drawer-width
  // both come back empty), and it differs between the collapsed rail and the
  // expanded drawer.
  function sidebarWidth() {
    try {
      var main = document.querySelector('home-assistant');
      main = main && main.shadowRoot && main.shadowRoot.querySelector('home-assistant-main');
      var sb = main && main.shadowRoot && main.shadowRoot.querySelector('ha-sidebar');
      if (!sb) return 0;
      var b = sb.getBoundingClientRect();
      // Only a rail actually drawn at the left edge counts. A hidden sidebar
      // measures 0, and one pushed off-screen must not inset anything.
      return (b.width > 0 && b.left <= 1 && b.height > 0) ? Math.round(b.right) : 0;
    } catch (e) { return 0; }
  }
  // THE BAR RUNS THE DASHBOARD'S FULL WIDTH while every menu item stays
  // reachable -- past Home Assistant's own sidebar only (hk-menu.js
  // publishes --hk-content-left), the docked menu's column included, not
  // past the menu (--hk-page-left). It lies over the menu's foot, and says
  // how much of the screen's bottom it covers (publishBar): the docked menu
  // pads its list by that much, so every row still scrolls up clear of it.
  function insetLeft() {
    var c = 0;
    try { c = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hk-content-left')) || 0; }
    catch (e) { c = 0; }
    return Math.max(sidebarWidth(), Math.round(c));
  }
  // --hk-bar-h on the root: from the bar's top edge to the bottom of the
  // window, while a non-modal sheet (the #media bar) is up; gone when it is
  // not. From LAYOUT (offsetTop in its full-window container), not from the
  // bounding box, which the open animation's translateY would shrink.
  function publishBar(el, sheet) {
    var de = document.documentElement;
    if (!de || !de.style) return;
    if (!el || !sheet || !sheet.isConnected) { de.style.removeProperty('--hk-bar-h'); return; }
    var h = Math.max(0, Math.round((el.clientHeight || window.innerHeight || 0) - (sheet.offsetTop || 0)));
    var v = h + 'px';
    if (de.style.getPropertyValue('--hk-bar-h') !== v) de.style.setProperty('--hk-bar-h', v);
  }

  var memStore = {};
  function dget(h) {
    try { var j = localStorage.getItem('hk-popup-dismissed' + h); return j ? JSON.parse(j) : null; }
    catch (e) { return memStore[h] || null; }
  }
  function dset(h, rec) {
    try {
      if (rec) localStorage.setItem('hk-popup-dismissed' + h, JSON.stringify(rec));
      else localStorage.removeItem('hk-popup-dismissed' + h);
    } catch (e) { if (rec) memStore[h] = rec; else delete memStore[h]; }
  }

  // Every hash any hk-popup owns, so a close can tell "switched to another
  // sheet" from "closed".
  var HASHES = {};
  // ...and how many of each are ON THE PAGE right now, which is what
  // hkPopup.hashes() answers. A pop-up only works in the view it lives in,
  // and HASHES never forgets one: on the Alarm page (or a Lights page after
  // the home view) '#alarm' would still be "there", so the alarm's detail
  // tap would push a hash nothing answers -- a dead tap, with HA's own
  // dialog swallowed too.
  var MOUNTED = {};
  function mounted() {
    return Object.keys(MOUNTED).filter(function (h) { return MOUNTED[h] > 0; });
  }

  // How many sheets are open on this screen, for anything underneath that
  // should stop repainting while covered (the camera strip). Broadcast as
  // `hk-popup-change` so a paused card can catch up the moment it is uncovered.
  //
  // TWO COUNTS, and the second is the one that matters. The camera strip
  // pauses its snapshot refresh while a sheet is up, because swapping a
  // decoded snapshot under #alarm's backdrop-filter makes the whole screen
  // flash on the strip's 10s beat. "The strip is under the dimmed backdrop
  // anyway, so nothing is lost" is true of a MODAL sheet and false of a
  // `modal: false` one, which dims nothing and covers ~80px of a 800px
  // screen.
  //
  // Counting every sheet, a non-modal now-playing bar that stays up would
  // freeze every snapshot tile for as long as it is up, while the one LIVE
  // tile kept running because it is not a snapshot. So `hkPopupOpen` still
  // counts every sheet, and `hkPopupCover` counts only the ones that
  // actually cover the page. Cards that pause to avoid repaint cost should
  // read hkPopupCover.
  function openCount(delta, covers) {
    window.hkPopupOpen = Math.max(0, (window.hkPopupOpen || 0) + delta);
    if (covers) {
      window.hkPopupCover = Math.max(0, (window.hkPopupCover || 0) + delta);
    }
    window.dispatchEvent(new CustomEvent('hk-popup-change',
      { detail: { open: window.hkPopupOpen, cover: window.hkPopupCover || 0 } }));
  }

  // EVERY ENTITY A CONFIG'S TRIGGER DEPENDS ON, collected once from the config.
  //
  // This is what lets `set hass` gate like every other card in the library.
  // Both halves of `entity_from` go in -- the SELECTOR (whose state chooses the
  // target) and EVERY entity its map can choose -- so a change to either the
  // choice or the chosen speaker wakes the card. `dismiss_scope` too, because
  // a change there is what re-opens a dismissed sheet.
  function triggerEntities(cfg) {
    var ids = [];
    (function walk(c) {
      if (!c) return;
      if (Array.isArray(c)) return c.forEach(walk);
      if (c.entity) ids.push(c.entity);
      var f = c.entity_from;
      if (f) {
        if (f.music && window.hkMusic) {
          window.hkMusic.speakers().forEach(function (s) { ids.push(s.entity); });
        }
        if (f.selector) ids.push(f.selector);
        if (f.map) Object.keys(f.map).forEach(function (k) { ids.push(f.map[k]); });
      }
      if (c.conditions) walk(c.conditions);
    })(cfg.trigger);
    (cfg.dismiss_scope || []).forEach(function (sc) {
      if (sc.entity) ids.push(sc.entity);
      if (sc.music && window.hkMusic) {
        window.hkMusic.speakers().forEach(function (s) { ids.push(s.entity); });
      }
    });
    // De-duplicated so the signature is stable and as short as it can be.
    return ids.filter(function (v, i) { return v && ids.indexOf(v) === i; });
  }

  function norm(h) { h = String(h || ''); return h && h.charAt(0) !== '#' ? '#' + h : h; }
  // IS THIS HASH ANOTHER SHEET'S? Two things own hashes: a YAML hk-popup-card
  // (HASHES) and the home's pop-up items, which hk-detail.js's router opens
  // (#doorbell, #alarm). Asking only the first, the now-playing bar on a
  // dashboard whose doorbell is an item would take the hash from the
  // doorbell sheet, close it under a ring, and count the ring as the user
  // dismissing the bar.
  function sheetHash(h) {
    if (!h) return false;
    if (HASHES[h]) return true;
    var D = window.hkDetail;
    return !!(D && typeof D.answers === 'function' && D.answers(h));
  }

  // A NEW ENTRY GETS ITS OWN (EMPTY) STATE, as HA's own navigate() does.
  // Copying history.state would let a pop-up opened over a detail sheet
  // inherit the sheet's {hkDetail} marker, and closing the sheet would then
  // take the pop-up's entry with it.
  function setHash(h) {
    var base = location.href.split('#')[0];
    if (h) history.pushState(null, '', base + h);
    else history.replaceState(history.state, '', base);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: !h } }));
  }

  function boot() {
    var C = window.hkCards;
    if (!C || !C.HkBase) return false;
    if (customElements.get('hk-popup-card')) return true;

    class HkPopupCard extends C.HkBase {
      static get CSS() { return ':host{display:none}'; }

      setConfig(config) {
        if (!config || !config.hash) throw new Error('hk-popup: `hash` is required');
        // `detail: <entity>` in place of cards: the hash opens that entity's
        // detail sheet (hk-detail.js) instead of a sheet of this card's own
        if (!config.detail && !Array.isArray(config.cards)) throw new Error('hk-popup: `cards` must be a list');
        super.setConfig(config);
        this._hash = norm(config.hash);
        HASHES[this._hash] = true;
        if (this._mountedAs && this._mountedAs !== this._hash) {   // re-configured on the page
          MOUNTED[this._mountedAs] = Math.max(0, (MOUNTED[this._mountedAs] || 0) - 1);
          MOUNTED[this._hash] = (MOUNTED[this._hash] || 0) + 1;
          this._mountedAs = this._hash;
        }
        this._trigIds = triggerEntities(config);
        this._trigSig = null;          // a new config always re-evaluates
      }

      getCardSize() { return 0; }
      _render() {}                     // the host draws nothing, ever
      _sigOf() { return null; }        // see set hass below

      // GATED LIKE EVERY OTHER CARD IN THIS LIBRARY.
      //
      // Ungated, _evalTrigger() runs on EVERY hass push. The frontend hands a
      // card a new hass ~10x a second, so the three pop-ups on a view run ~300
      // evaluations in 10s -- and #media's `dismissable` branch does a
      // synchronous localStorage.getItem + JSON.parse inside each one (150
      // reads in 15s), over a stretch in which the ENTIRE card library renders
      // 4 times. That is exactly what HkBase's gate exists to prevent.
      //
      // The signature is the last_updated of every entity the trigger and the
      // dismiss_scope name -- the same shape HkBase._sigOf uses. Everything
      // else that must re-evaluate is TIME, not state (a `grace` window
      // expiring, a dismissal's TOUCH_MS refresh), and _evalTrigger already
      // schedules itself for those through _graceTimer. So nothing is lost.
      //
      // A card with no trigger has no ids and no signature, and skips outright.
      set hass(h) {
        this._hass = h;
        if (this._open && this._kids) {
          this._kids.forEach(function (k) { k.hass = h; });
        }
        // NO TRIGGER AT ALL -> nothing to evaluate, ever. #alarm and #doorbell
        // are opened by their hash (an automation navigates the tablet to it),
        // so two of the three sheets on a view fall out here and never enter
        // _evalTrigger, which would only return on its own first line anyway.
        if (!this._config || !this._config.trigger) return;
        // A PENDING GRACE WINDOW BYPASSES THE GATE. `grace` and the dismissal's
        // TOUCH_MS refresh are due on TIME, not on a state change, so while one
        // is outstanding the answer can differ from last time with no entity
        // having moved. _graceTimer covers that on its own in a live browser,
        // but the gate must not be the only thing standing between a stopped
        // speaker and a sheet that closes -- tests/test_popup.js drives exactly
        // that case ("21 s after stopping: closed") through a hass push with a
        // fake clock, and it is the honest expression of the requirement.
        var ids = this._timePending ? null : this._trigIds;
        if (ids && ids.length) {
          // STATE *AND* last_updated. HkBase._sigOf uses last_updated alone,
          // which is right for a tile (it moves on an attribute change too).
          // Here it is not enough on its own: a state object without that
          // field -- every fixture in tests/test_popup.js, and anything that
          // synthesises a state -- would give a signature of `id=undefined;`
          // that NEVER changes, and the trigger would be dead. Conditions only
          // ever read `state`, so including it is both the honest dependency
          // and the thing that keeps the gate working when last_updated is
          // missing.
          // The FOCUS is an input too: it is this screen's own choice, so it
          // can change with no entity moving (see the hkMusic listener in
          // connectedCallback, which also forces a re-evaluation).
          var sig = window.hkMusic ? 'focus=' + window.hkMusic.focus() + ';' : '', st;
          for (var i = 0; i < ids.length; i++) {
            st = h && h.states[ids[i]];
            sig += ids[i] + '=' + (st ? st.state + '@' + st.last_updated : 'x') + ';';
          }
          if (sig === this._trigSig) return;
          this._trigSig = sig;
        }
        this._evalTrigger();
      }
      get hass() { return this._hass; }

      connectedCallback() {
        if (super.connectedCallback) super.connectedCallback();
        var self = this;
        if (this._hash && !this._mountedAs) {
          this._mountedAs = this._hash;
          MOUNTED[this._hash] = (MOUNTED[this._hash] || 0) + 1;
        }
        if (!this._onLoc) {
          this._onLoc = function () { self._sync(); };
        }
        ['location-changed', 'hashchange', 'popstate'].forEach(function (ev) {
          window.addEventListener(ev, self._onLoc);
        });
        // _evalTrigger bails while disconnected, so a card that has just come
        // back must re-evaluate even if no entity moved in the meantime.
        // Clearing the gate's signature is what guarantees the next hass does.
        this._trigSig = null;
        // A FOCUS CHANGE IS A TRIGGER CHANGE when the trigger follows the
        // music (`entity_from: {music: true}`): tapping another context on the
        // Play Music page must move the bar with it, and nothing in hass moved.
        if (!this._musicOff && window.hkMusic) {
          this._musicOff = window.hkMusic.onChange(function () {
            // The speaker list is part of the trigger's entity list: read it
            // again. A card configured before the music settings have arrived
            // keeps an EMPTY list, and with nothing to sign the gate in `set
            // hass` never engages -- every push would re-evaluate the trigger
            // for the life of the page.
            self._trigIds = triggerEntities(self._config);
            self._trigSig = null;
            if (self._hass) self._evalTrigger();
          });
        }
        this._sync();
        // ...and re-evaluate NOW rather than on the next hass push. Coming back
        // from the Play Music page, the hash is empty, so _sync has nothing to
        // match and only the trigger can re-open the sheet.
        if (this._hass) this._evalTrigger();
      }

      disconnectedCallback() {
        if (super.disconnectedCallback) super.disconnectedCallback();
        var self = this;
        if (this._mountedAs) {
          MOUNTED[this._mountedAs] = Math.max(0, (MOUNTED[this._mountedAs] || 0) - 1);
          this._mountedAs = null;
        }
        ['location-changed', 'hashchange', 'popstate'].forEach(function (ev) {
          window.removeEventListener(ev, self._onLoc);
        });
        if (this._musicOff) { this._musicOff(); this._musicOff = null; }
        clearTimeout(this._graceTimer);
        clearTimeout(this._dismissTimer);
        clearTimeout(this._firstTimer);
        if (this._onInset) {
          window.removeEventListener('resize', this._onInset);
          window.removeEventListener('hk-module-ready', this._onInset);
          this._onInset = null;
        }
        // The view went away (navigated to a page). Take the sheet down, but
        // leave the hash and run no close_action -- nobody closed it.
        this._close(false);
      }

      // Match the sheet to the URL.
      _sync() {
        if (!this.isConnected || !this._config) return;
        var want = location.hash === this._hash;
        if (this._config.detail) { this._syncDetail(want); return; }
        if (want && !this._open) this._show();
        else if (!want && this._open) {
          var h = location.hash;
          // NAVIGATING AWAY IS NOT A DISMISSAL, or the now-playing bar would
          // stay gone. Tapping the album art opens the Play Music page: that
          // clears the hash, this runs BEFORE disconnectedCallback can take
          // the sheet down quietly, and an empty hash on its own reads as
          // "the user closed it by hand". The bar would then write a dismissal
          // and stay shut on the way back until the track changed.
          //
          // The pathname is what separates the two. A hand close leaves the
          // page alone; a trip to another page does not.
          var moved = this._openPath && location.pathname !== this._openPath;
          this._close(!moved && !(h && h !== this._hash && sheetHash(h)));
        }
      }

      // A HASH THAT OPENS A DETAIL SHEET (#alarm). The hash keeps every way in
      // -- an alarm automation's ".../0#alarm", the room pages, hkPopup.open --
      // and the sheet is hk-detail's, so it is the same size, header and X as
      // every other. The hash's own history entry is the one Back leaves (the
      // sheet pushes none of its own: `hashed`); closing the sheet any other
      // way clears the hash, as closing one of this card's own sheets does.
      _syncDetail(want) {
        var D2 = window.hkDetail, self = this, hash = this._hash;
        if (want && !this._dopen && D2) {
          this._dopen = true;
          var src = this._config.name ? { name: this._config.name } : {};
          var ok = D2.open(this._config.detail, src, { direct: true, hashed: true, onClose: function () {
            self._dopen = false;
            if (location.hash === hash) setHash('');
          } });
          if (!ok) { this._dopen = false; if (location.hash === hash) setHash(''); }
        } else if (!want && this._dopen) {
          this._dopen = false;
          if (D2) D2.close(true);
        }
      }

      _scopeSig() {
        var st = this._hass.states;
        var hass = this._hass;
        return (this._config.dismiss_scope || []).map(function (sc) {
          if (sc.music) return window.hkMusic ? String(window.hkMusic.player(hass)) : '';
          var e = st[sc.entity], v = e ? e.state : '';
          if (sc.above != null) return Number(v) > Number(sc.above) ? '1' : '0';
          return v;
        }).join('|');
      }

      _evalTrigger() {
        var cfg = this._config, self = this;
        if (!cfg || !cfg.trigger || !this._hass || !this.isConnected) return;
        var ctx = { now: Date.now(), next: Infinity };
        var now = met([].concat(cfg.trigger), this._hass.states, ctx);
        var first = this._prevTrigger === undefined;
        var rose = now && !this._prevTrigger;
        this._prevTrigger = now;

        var dismissed = false;
        if (cfg.dismissable) {
          var rec = dget(this._hash);
          if (rec && (!now || rec.sig !== this._scopeSig() ||
                      ctx.now - rec.seen > STALE_MS || screensaverOn())) {
            dset(this._hash, null);
            rec = null;
          }
          if (rec) {
            dismissed = true;
            if (ctx.now - rec.seen > TOUCH_MS) { rec.seen = ctx.now; dset(this._hash, rec); }
            // Keep confirming while dismissed, even if no state changes arrive.
            //
            // ITS OWN TIMER, NOT ctx.next. ctx.next sets _timePending, and
            // _timePending makes `set hass` skip the gate -- which is right for a
            // 20s grace window and wrong for a dismissal, because a dismissal
            // lasts until somebody walks away. It would put this card back on the
            // ungated path the gate exists to avoid: ~10 evaluations a second,
            // each with a localStorage read.
            clearTimeout(this._dismissTimer);
            this._dismissTimer = setTimeout(function () { self._evalTrigger(); },
                                            TOUCH_MS);
          } else {
            clearTimeout(this._dismissTimer);
          }
        }

        clearTimeout(this._graceTimer);
        // Read by the gate in `set hass` above: true while this card owes
        // itself another look on the clock alone.
        this._timePending = ctx.next !== Infinity;
        if (this._timePending) {
          this._graceTimer = setTimeout(function () { self._evalTrigger(); },
                                        Math.max(50, ctx.next - Date.now() + 50));
        }

        var h = location.hash;
        if (h !== this._hash) {
          // LEVEL, not edge, for a dismissable sheet: it should be open whenever
          // the trigger holds and it has not been dismissed -- including after
          // a reload or a trip to a subview and back, which an edge never sees.
          // It does not take the screen from another sheet that is open.
          var other = sheetHash(h);
          if (now && !dismissed && (cfg.dismissable ? !other : rose)) setHash(this._hash);
        } else if (!now && cfg.trigger_close !== false) {
          // FIRST-EVALUATION GRACE, AND WHY IT NEEDS A TIMER.
          //
          // The rule is: never slam shut a sheet the URL asked for before its
          // own state has been seen. As a bare `&& !first` that leaves a page
          // loaded AT `#media` with nothing playing showing the bar FOREVER --
          // the first pass refuses to close, and the gate in `set hass` then
          // blocks every later push because, with the home idle, no trigger
          // entity ever moves again. Nothing gives it a second look.
          //
          // Invisible while #media is a modal (you tap it away). With a
          // persistent bar it is a bar that will not go away while no music is
          // playing. Loading /dashboard-home/0#media while idle reproduces it.
          //
          // So the grace is a DELAY rather than a permanent exemption.
          // Look again in FIRST_CLOSE_MS, by which point `first` is false and
          // the ordinary close runs. A hash the URL genuinely meant survives
          // the page settling; one left over from a trigger that has since
          // gone false does not.
          if (first) {
            clearTimeout(this._firstTimer);
            this._firstTimer = setTimeout(function () { self._evalTrigger(); },
                                          FIRST_CLOSE_MS);
          } else {
            this._triggerClosing = true;
            setHash('');
          }
        }
      }

      _build() {
        var self = this, cfg = this._config;
        this._kids = [];
        if (typeof window.loadCardHelpers !== 'function') {
          // Reached from `set hass`; a throw here would error the whole card.
          console.error('hk-popup: loadCardHelpers is not available; the sheet stays empty');
          return Promise.resolve();
        }
        return window.loadCardHelpers().then(function (helpers) {
          cfg.cards.forEach(function (cc) {
            var el = helpers.createCardElement(cc);
            if (self._hass) el.hass = self._hass;
            self._kids.push(el);
            self._sheet.appendChild(el);
          });
        });
      }

      _show() {
        var cfg = this._config, self = this;
        this._open = true;
        // The PAGE the sheet opened on -- see _sync. Leaving that page is not
        // a dismissal.
        this._openPath = location.pathname;
        openCount(1, this._config.modal !== false);
        // Keep a non-modal sheet clear of the sidebar, and keep it clear when
        // the window is resized or the drawer is expanded. One measurement per
        // open plus one listener while open; nothing at all for a modal.
        if (cfg.modal === false && !this._onInset) {
          this._onInset = function () {
            if (!self._el) return;
            self._el.style.left = insetLeft() + 'px';
            if (self._open) publishBar(self._el, self._sheet);
          };
          window.addEventListener('resize', this._onInset);
          // a menu docking or undocking moves the content edge without a resize
          window.addEventListener('hk-module-ready', this._onInset);
        }
        if (!this._el) {
          var ha = document.querySelector('home-assistant');
          this._mount = (ha && ha.shadowRoot) || document.body;
          var el = document.createElement('div');
          el.className = 'hkp' + (cfg.position === 'bottom' ? ' bottom' : '') +
                         (cfg.modal === false ? ' plain' : '');
          el.innerHTML = '<style>' + CSS + '</style><div class="bd"></div><div class="sheet"></div>';
          var sheet = el.querySelector('.sheet');
          var bottom = cfg.position === 'bottom';
          var r = cfg.radius || '42px';
          sheet.style.width = cfg.width || '900px';
          // `max_width` overrides the default inset. The default keeps a
          // centred dialog off the screen edges; the now-playing BAR wants
          // the opposite -- its own 18px padding IS the margin, so capping
          // the sheet at 100vw - 24 would add 12px to the sides and leave
          // them unequal with the bottom.
          // --hk-vw: see .hkp .sheet in CSS (the car's zoomed viewport).
          sheet.style.maxWidth = cfg.max_width ||
            'calc(var(--hk-vw, 100vw) - var(--hk-content-left, 0px) - 24px)';
          sheet.style.padding = cfg.padding || '18px';
          sheet.style.background = cfg.background || '#1c1c1e';
          var rad = bottom ? r + ' ' + r + ' 0 0' : r;
          if (cfg.background === 'transparent') sheet.style.overflowY = 'visible';
          // clip: the content IS the sheet (the doorbell camera). No box
          // around it -- the sheet's own radius cuts the content's corners.
          if (cfg.clip) sheet.style.overflow = 'hidden';
          // A SCROLLING SHEET IS ROUNDED BY clip-path, NOT border-radius.
          // border-radius on a scroll container is a ROUNDED overflow clip,
          // and Chrome (153, measured) then ignores the clip-path: path() of
          // any backdrop-filter inside it and filters the path's whole
          // bounding box: hk-glass's frost layer in #alarm draws one dark
          // square-cornered block behind the keypad and the locks instead of
          // a frost under each pill. clip-path: inset(round) rounds the
          // sheet, its background and its own blur exactly as border-radius
          // does, and leaves the scroll clip square. Stripe-tested: rounded
          // scroller -> bounding box; this -> per-pill.
          // A transparent sheet does not scroll-clip, and a `clip` sheet is a
          // camera (no glass inside, and its video was measured with the
          // radius as it is), so both keep border-radius.
          if (cfg.background === 'transparent' || cfg.clip) sheet.style.borderRadius = rad;
          else sheet.style.clipPath = 'inset(0 round ' + rad + ')';
          // blur: frosted glass. The sheet's background must be translucent for
          // it to show, and the backdrop dim must be light enough that there is
          // something behind to blur. It is on the SHEET only, never the
          // full-screen backdrop -- a fade-in blur there is a 0.4s hitch on open.
          if (cfg.blur) {
            var f = 'blur(' + cfg.blur + ') saturate(1.6)';
            sheet.style.backdropFilter = f;
            sheet.style.webkitBackdropFilter = f;
          }
          // vars: theme variables for the cards INSIDE, set on the sheet so
          // they inherit -- e.g. clearing a native card's own plate.
          var vars = cfg.vars || {};
          Object.keys(vars).forEach(function (k) {
            sheet.style.setProperty(k.slice(0, 2) === '--' ? k : '--' + k, String(vars[k]));
          });
          if (cfg.backdrop != null) {
            el.querySelector('.bd').style.background = 'rgba(17, 17, 17, ' + Number(cfg.backdrop) + ')';
          }
          sheet.addEventListener('pointerdown', function () { self._armAuto(); }, true);
          el.querySelector('.bd').addEventListener('click', function () {
            if (self._el && self._el.classList.contains('prep')) return;   // caught, not a close -- see .prep
            if (cfg.close_outside !== false) setHash('');
          });
          // THE X CLOSES EXACTLY AS A BACKDROP TAP DOES -- setHash(''), which
          // is the same path `dismissable` already hangs off, so a hand-closed
          // sheet stays closed on THIS screen until playback stops or the
          // dismiss_scope changes. No new dismissal logic; this is a visible
          // way into machinery otherwise reachable only by tapping the dim.
          if (cfg.close_button) {
            var x = document.createElement('div');
            x.className = 'x';
            x.setAttribute('role', 'button');
            x.setAttribute('aria-label', 'Close');
            x.setAttribute('tabindex', '0');
            x.innerHTML = '<ha-icon icon="mdi:close"></ha-icon>';
            x.addEventListener('click', function (e) {
              e.stopPropagation();
              setHash('');
            });
            sheet.appendChild(x);
          }
          // NO Escape handler, deliberately: a more-info dialog opened FROM the
          // sheet also closes on Escape, and one keypress would shut both.
          // The browser's back button closes the sheet (it is a URL).
          this._el = el;
          this._sheet = sheet;
        }
        var kidsReady = this._kids ? Promise.resolve() : this._build();
        if (this._kids) {
          this._kids.forEach(function (k) {
            if (self._hass) k.hass = self._hass;
            self._sheet.appendChild(k);
          });
        }
        // PREPARED UNSEEN. A live camera can blank the whole sheet for a
        // frame or three on an Android wall tablet -- twice per open: once
        // when the tablet starts its hardware video decoder (~0.3 s in,
        // snapshot still showing) and once when the first live frame is
        // drawn. Measured with adb screenrecord: video-only 3 of 3 opens,
        // audio-only 0 of 3, no stream 0 of 4 -- it is the decoder, and no
        // CSS on the sheet changes it. What does: both glitches happen
        // while the sheet is drawn at 1% (invisible, but drawn --
        // visibility:hidden only moves the second glitch to the reveal).
        // So a sheet whose cards say they prepare (hkPrepares) opens at 1%
        // and fades in once every such card's hkReady() resolves -- about
        // 0.6 s after the tap -- or after PREP_MAX_MS, whichever first.
        // A camera slow to send its first keyframe (up to ~4.5 s seen) gets
        // the snapshot at the cap.
        var prep = cfg.cards.some(function (cc) {
          var C = customElements.get(String(cc && cc.type || '').replace(/^custom:/, ''));
          return !!(C && C.hkPrepares);
        });
        var el = this._el, gen = this._prepGen = (this._prepGen || 0) + 1;
        el.classList.toggle('prep', prep);
        this._mount.appendChild(el);
        // AFTER the mount: a detached element measures nothing, and so would
        // the sidebar read taken before it.
        if (this._onInset) this._onInset();
        // The bar's height follows its content (a timer strip above the
        // player grows it): re-published whenever the sheet changes size.
        if (cfg.modal === false && this._sheet && typeof ResizeObserver === 'function') {
          if (!this._barRO) this._barRO = new ResizeObserver(function () { if (self._open) publishBar(self._el, self._sheet); });
          this._barRO.observe(this._sheet);
        }
        // Two frames: the first paints the closed state, so the transition runs.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { if (self._open) el.classList.add('open'); });
        });
        if (prep) {
          var reveal = function () { if (self._prepGen === gen) el.classList.remove('prep'); };
          var cap = setTimeout(reveal, PREP_MAX_MS);
          kidsReady.then(function () {
            var waits = (self._kids || []).filter(function (k) { return typeof k.hkReady === 'function'; })
              .map(function (k) { return k.hkReady(); });
            return Promise.all(waits);
          }).then(function () { clearTimeout(cap); reveal(); }, function () { clearTimeout(cap); reveal(); });
        }
        this._armAuto();
        kidsReady.catch(function (e) { console.error('[hk-popup] could not build', cfg.cards, e); });
      }

      // auto_close counts from the LAST TOUCH, not from the open. Counted
      // from the open, the doorbell sheet would close 60 s in whatever was
      // happening -- mid-way through a hold-to-talk reply. Any pointerdown
      // inside the sheet restarts it (wired where the sheet is built).
      _armAuto() {
        var self = this, ms = Number(this._config.auto_close);
        clearTimeout(this._auto);
        if (!(ms > 0) || !this._open) return;
        this._auto = setTimeout(function () {
          if (self._open && location.hash === self._hash) setHash('');
        }, ms);
      }

      // runAction: false when nobody closed it (view gone, switched to another
      // sheet) -- Bubble's close_action rule.
      _close(runAction) {
        if (!this._open) return;
        this._open = false;
        openCount(-1, this._config.modal !== false);
        if (this._config.modal === false) {
          if (this._barRO) this._barRO.disconnect();
          publishBar(null);
        }
        clearTimeout(this._auto);
        var el = this._el, kids = this._kids || [];
        if (el) {
          el.classList.remove('open');
          // Detach after the fade. A reopen inside the fade cancels this.
          var self = this;
          setTimeout(function () {
            if (self._open) return;
            kids.forEach(function (k) { if (k.parentNode) k.parentNode.removeChild(k); });
            if (el.parentNode) el.parentNode.removeChild(el);
          }, 320);
        }
        // A close by hand while the trigger still holds is a DISMISSAL. Not a
        // trigger close (the session ended), not a switch to another sheet,
        // not the view going away.
        if (runAction && this._config.dismissable && !this._triggerClosing &&
            this._prevTrigger === true && this._hass) {
          dset(this._hash, { sig: this._scopeSig(), seen: Date.now() });
          // START THE LOOP HERE, or it never starts at all. The record is
          // written AFTER the last _evalTrigger, so that run saw no record,
          // armed no timer, and left _timePending false -- and the gate in
          // `set hass` then blocks every push until a trigger entity moves.
          // The refresh-and-expire loop is what notices the screensaver, so
          // without this the dismissal would be effectively permanent.
          //
          // ARM THE TIMER, do NOT call _evalTrigger() here: that can undo the
          // close in the same tick. The first thing _evalTrigger does is
          // decide whether to DISCARD the record, and if the screensaver
          // happens to be up it discards the one just written and re-opens
          // the sheet. A finger cannot reach the X through the screensaver,
          // so that state is unreachable in practice -- but the close path
          // should not depend on that being true.
          var self2 = this;
          clearTimeout(this._dismissTimer);
          this._dismissTimer = setTimeout(function () { self2._evalTrigger(); },
                                          TOUCH_MS);
        }
        this._triggerClosing = false;
        if (runAction && this._config.close_action && this._hass) {
          this._act(this._config.close_action);
        }
      }
    }

    customElements.define('hk-popup-card', HkPopupCard);

    // hk-popup-group-card: SEVERAL POP-UPS FROM ONE FILE.
    // The camera pop-ups (#camera-driveway and the rest) belong on every
    // home page AND on the Cameras page. A shared file must be ONE card, and
    // wrapping them in a grid would add a box with margins wherever it went.
    // This holds the pop-ups and draws nothing -- display:none, like each
    // pop-up -- so an include adds no space anywhere. Each entry is an
    // ordinary hk-popup-card config (its `type` may be left out).
    class HkPopupGroupCard extends C.HkBase {
      static get CSS() { return ':host{display:none}'; }
      _sigOf() { return null; }              // each pop-up gates its own renders
      _render() {
        var h = this._hass, cfg = this._config || {};
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '';
          var root = this._root;
          this._kids = (Array.isArray(cfg.popups) ? cfg.popups : []).map(function (pc) {
            return C.create(Object.assign({ type: 'custom:hk-popup-card' }, pc));
          }).filter(Boolean);
          this._kids.forEach(function (k) { root.appendChild(k); });
        }
        if (h) this._kids.forEach(function (k) { k.hkSetHass(h); });
      }
    }
    customElements.define('hk-popup-group-card', HkPopupGroupCard);
    C.wireEditor('hk-popup-group-card', HkPopupGroupCard, [
      { name: 'popups', required: true, selector: { object: {} },
        helper: 'A YAML list of pop-ups, each with its own #name and cards.' }
    ], function () { return { popups: [] }; });
    // AN EDITOR, so the card picker does not offer the pop-up and then show
    // only a YAML box. What opens it and what is in it come first; the look
    // and the automatic behaviour are sections.
    C.wireEditor('hk-popup-card', HkPopupCard, [
      { name: 'hash', required: true, selector: { text: {} } },
      { name: 'cards', required: true, selector: { object: {} },
        helper: 'The cards inside the pop-up, as a YAML list.' },
      C.section('Appearance', [
        { type: 'grid', name: '', schema: [
          { name: 'position', selector: C.selOptions(['center', 'bottom']) },
          { name: 'width', selector: { text: {} }, helper: 'Default 900px.' },
          { name: 'padding', selector: { text: {} }, helper: 'Default 18px.' },
          { name: 'radius', selector: { text: {} }, helper: 'Default 42px.' },
          { name: 'background', selector: { text: {} }, helper: 'Default #1c1c1e. transparent shows the cards only.' },
          { name: 'blur', selector: { text: {} }, helper: 'e.g. 40px.' },
          { name: 'backdrop', selector: { number: { min: 0, max: 1, step: 0.05, mode: 'box' } } },
          { name: 'clip', selector: { boolean: {} } }
        ] },
        { name: 'vars', selector: { object: {} } }
      ], 'mdi:palette'),
      C.section('Opening and closing', [
        { type: 'grid', name: '', schema: [
          { name: 'auto_close', selector: { number: { min: 0, step: 1000, mode: 'box' } } },
          { name: 'close_outside', selector: { boolean: {} } },
          { name: 'trigger_close', selector: { boolean: {} } },
          { name: 'dismissable', selector: { boolean: {} } }
        ] },
        { name: 'trigger', selector: { object: {} } },
        { name: 'dismiss_scope', selector: { object: {} },
          helper: 'YAML list of entities; a change reopens a dismissed pop-up.' },
        { name: 'close_action', selector: { ui_action: {} } }
      ], 'mdi:gesture-tap')
    ], function () { return { hash: '#example', cards: [] }; });
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: 'hk-popup-card', name: 'HK Pop-up',
      description: 'A sheet that opens over the dashboard when the page address ends in its #name, or when its conditions are met.',
      preview: false
    });
    window.customCards.push({
      type: 'hk-popup-group-card', name: 'HK Pop-up Group',
      description: 'Several pop-ups kept together in one card, which takes no space on the page.',
      preview: false
    });
    // open(): what a camera tap uses to open its pop-up by hash. Asking for
    // the sheet that is already up is a no-op: a second entry would take two
    // Backs to close it. hashes(): the pop-ups on the page NOW (see MOUNTED).
    window.hkPopup = { version: '1.2.0',
      open: function (h) { h = norm(h); if (h && location.hash !== h) setHash(h); },
      hashes: mounted, met: met, _GRACE: GRACE, HkPopupCard: HkPopupCard };
    return true;
  }

  if (!boot()) window.addEventListener('hk-cards-ready', boot, { once: true });
})();
