// hk-saver.js -- HK Frontend's photo screensaver, for a wall tablet's own user.
//
// WHAT IT IS
// A generated wall tablet's screen (Screens -> the screen -> Behavior ->
// Photo Screensaver, with a Tablet User) gets `hk_screensaver:` in its
// dashboard config (hk-strategy.js hkSaver()); a YAML dashboard can write the
// same block, or get it from its screen's HK settings (fromSettings below).
// After the screen has been left alone for `starts_after` seconds -- or the
// moment its switch turns on -- the house's photos cross-fade
// full screen, with the clock, the weather, what is playing and the running
// timers over them (the same HK cards the header and the pages use). A touch
// takes it away again, and does not press whatever was under the finger.
//
// Written for HK Frontend from its own plan (hk_house/docs/PLAN-HK-SCREENSAVER.md)
// and from how the tablets behave; it replaces WallPanel (HACS), which a
// screen can still choose instead (screensaver_engine).
//
// THE SWITCH (input_boolean.wallpanel_screensaver_<room>, the name kept from
// the WallPanel days so no automation changes) is two-way, exactly as the
// house's tablet scripts and want sensor expect:
//   * the screensaver starting by itself turns it ON; a touch turns it OFF --
//     the only way a tablet gets back to photos while it is awake;
//   * the house turning it on (the sleep script, under Fully's dark) starts
//     the screensaver; turning it off (wake, the doorbell) stops it.
// Only the tablet's own user ever runs this, so only the tablet writes it: a
// desk opening the same dashboard never gets a screensaver and never touches
// the switch.
//
// WHAT IT COSTS. Nothing while the dashboard is in use: no element, no timer
// but one idle timeout, no listener work beyond noting the time. While the
// photos show, only the 3 s cross-fade animates, once per photo; the sky and
// every card behind the photos hold still (hk-sky `hidden`, hk-base
// `hk-asleep`), which on a wall tablet's WebView is what lets the page stop
// drawing frames between photos.
(function () {
  'use strict';
  if (window.hkSaver) return;              // hk-loader may import this twice

  // ------------------------------------------------------------ constants
  var FADE_IN_MS = 3000;                   // the screensaver appears
  var FADE_TOUCH_MS = 300;                 // a touch takes it away
  var FADE_SWITCH_MS = 100;                // the house turned the switch off
  var CROSSFADE_MS = 3000;                 // photo to photo
  var BLOCK_MS = 3000;                     // taps swallowed after a touch stop
  var EDGE = 0.15;                         // left/right 15 %: previous/next photo
  var LIST_TTL_MS = 30 * 60 * 1000;        // re-list the folder
  var LIST_MAX = 5000, LIST_DEPTH = 3;
  var ECHO_MS = 6000;                      // our own switch write coming back
  var MOVE_PX = 12;                        // a mouse has to MOVE, not jitter
  var ZOOM = 1.1;                          // Slow Zoom's end scale
  var DEFAULT_CARD_WIDTH = 600;
  // THE FORECAST DETAILS' ZONE: the meadow, below the land's tree line --
  // 35.6 % of the art from its bottom (the 2560x1600 landscapes). The art
  // covers the screen from the bottom, so that is 35.6 % of the height on a
  // screen no wider than 16:10, and of the width / 1.6 on a wider one. The
  // details are centred in it, up and down and side to side.
  var BAND_ZONE = 'max(35.6vh,22.25vw)';
  var BAND_PAD = 16;                       // ...never nearer the bottom than this
  // THE SAME BAND ON EVERY SCREEN: laid out as on a 1280x800 tablet (1280
  // less the 30 px sides) and, on a bigger screen, scaled up to it whole --
  // never its hours and days stretched apart, never left small
  var BAND_MAX = 1220, BAND_W = 1280, BAND_H = 800;
  // THE CALENDAR PANE (1.4, option `calendar`): 400 px down the right of a
  // 1280 x 800 tablet, scaled with the band on a bigger screen. The photos
  // (or the forecast) take the rest; beside the pane the forecast details
  // stand up, as on a phone, no wider than BAND_STACKED.
  var PANE_W = 400, BAND_STACKED = 680, BAND_PAD_STACKED = 30;
  // ...since 1.4.3 side by side there too, as on every other screen: today's column this wide (the
  // tablet's band has 300), the band as wide as the photos' room allows
  var BAND_NOW_BESIDE = 200, BAND_BESIDE_GUTTER = 30;
  // the forecast details fade in once in place (addBand)
  var BAND_REVEAL_MS = 260;
  var PANE_TOP = 74;                       // Home Status sits above the list (at least)
  var PANE_RESET_MS = 45000;               // untouched this long: back to today

  // ------------------------------------------------------------ pure helpers
  // (exported on hkSaver._ for tests/test_saver.js)
  function readCfg(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var n = function (v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; };
    return {
      user: typeof raw.user === 'string' ? raw.user : '',
      entity: typeof raw.entity === 'string' && /^(input_boolean|switch)\.[a-z0-9_]+$/.test(raw.entity) ? raw.entity : null,
      photos: typeof raw.photos === 'string' && raw.photos ? raw.photos : 'media-source://media_source/local/photos',
      // 0: only the switch starts it
      starts_after: raw.starts_after === 0 ? 0 : n(raw.starts_after, 5, 86400, 180),
      each_photo: n(raw.each_photo, 3, 3600, 30),
      order: raw.order === 'sorted' ? 'sorted' : 'random',
      fill: raw.fill !== false,
      zoom: raw.zoom === true,
      // photos (the forecast when there are none) or forecast
      show: raw.show === 'forecast' || raw.show === 'both' ? raw.show : 'photos',
      // Photos & Forecast: the forecast after this many photos
      forecast_every: n(raw.forecast_every, 2, 100, 5),
      // the forecast details (the band): on the forecast, and over the photos
      band: raw.band !== false,
      band_photos: raw.band_photos === true,
      // the calendar pane down the right (1.4), and the days it lists
      calendar: raw.calendar === true,
      calendar_days: n(raw.calendar_days, 1, 7, 2),
      // no photos: the forecast (default), or a dark screen
      fallback: raw.fallback !== false,
      cards: Array.isArray(raw.cards) ? raw.cards.filter(function (c) {
        return c && typeof c.type === 'string' && /^custom:hk-[a-z0-9-]+$/.test(c.type);
      }) : []
    };
  }
  // Whether THIS browser gets the screensaver: the dashboard asks for one,
  // and it is signed in as the tablet's user. ?hk_saver=off (and WallPanel's
  // old ?wp_enabled=false, which the house's tools use) turns it off for one
  // page; ?hk_saver=force ignores the user (testing).
  function gate(cfg, user, search) {
    if (!cfg) return false;
    var q = String(search || '');
    if (/[?&]hk_saver=off\b/.test(q) || /[?&]wp_enabled=false\b/.test(q)) return false;
    if (/[?&]hk_saver=force\b/.test(q)) return true;
    return !!(cfg.user && user && user === cfg.user);
  }
  function zoneOf(x, width) {
    if (!(width > 0)) return null;
    if (x < width * EDGE) return 'previous';
    if (x > width * (1 - EDGE)) return 'next';
    return null;
  }
  // How one photo sits on a screen: a portrait photo whole, over a blurred
  // copy of itself; a landscape one filling the screen, or whole (over the
  // copy) when Fill the Screen is off.
  function fitOf(w, h, fill) {
    var portrait = h > w;
    var fit = portrait || !fill ? 'contain' : 'cover';
    return { portrait: portrait, fit: fit, backdrop: fit === 'contain' };
  }
  function shuffle(list, rnd) {
    var a = list.slice();
    rnd = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // THE DECK: random is every photo once, in a shuffled order, before any
  // repeats (and the new round never opens on the photo the last one ended
  // with); sorted is the folder in order, round and round. previous() walks
  // back through what was shown.
  function Deck(order, rnd) {
    this.order = order; this.rnd = rnd || Math.random;
    this.items = []; this.round = []; this.pos = 0; this.history = []; this.back = 0;
  }
  Deck.prototype.set = function (items) {
    var had = this.items.map(function (x) { return x.id; }).join('\n');
    this.items = items.slice();
    if (this.items.map(function (x) { return x.id; }).join('\n') !== had) { this.round = []; this.pos = 0; }
  };
  Deck.prototype.next = function () {
    if (this.back > 0) {                  // stepping forward again after previous()
      this.back--;
      return this.history[this.history.length - 1 - this.back] || null;
    }
    if (!this.items.length) return null;
    if (this.pos >= this.round.length) {
      var last = this.history[this.history.length - 1];
      this.round = this.order === 'sorted'
        ? this.items.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; })
        : shuffle(this.items, this.rnd);
      if (this.order !== 'sorted' && last && this.round.length > 1 && this.round[0].id === last.id) {
        this.round.push(this.round.shift());
      }
      this.pos = 0;
    }
    var it = this.round[this.pos++];
    this.history.push(it);
    if (this.history.length > 50) this.history.shift();
    return it;
  };
  Deck.prototype.previous = function () {
    if (this.history.length - 1 - this.back <= 0) return null;
    this.back++;
    return this.history[this.history.length - 1 - this.back] || null;
  };
  function tagOf(type) { return String(type || '').replace(/^custom:/, ''); }
  function isImage(item) {
    if (!item) return false;
    if (item.media_class === 'image') return true;
    return /^image\//.test(String(item.media_content_type || ''));
  }

  // ------------------------------------------------------------ the page
  function hassNow() {
    var ha = document.querySelector('home-assistant');
    return (ha && ha.hass) || (window.hkCards && window.hkCards.hass && window.hkCards.hass()) || null;
  }
  // THE DASHBOARD'S CONFIG, read where the strategy guard reads it -- the
  // panel's own lovelace object is the authority, never a DOM marker.
  function panel() {
    var ha = document.querySelector('home-assistant');
    var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
    var p = main && main.shadowRoot && main.shadowRoot.querySelector('ha-panel-lovelace');
    if (p) return p;
    var r = main && main.shadowRoot && main.shadowRoot.querySelector('partial-panel-resolver');
    return (r && r.querySelector && r.querySelector('ha-panel-lovelace')) || null;
  }
  // the font the dashboard's view draws in (its theme is on the view)
  function viewFont() {
    try {
      var p = panel(), hr = p && p.shadowRoot && p.shadowRoot.querySelector('hui-root');
      var v = hr && hr.shadowRoot && hr.shadowRoot.querySelector('hui-view-container');
      return v ? getComputedStyle(v).fontFamily : '';
    } catch (e) { return ''; }
  }

  // ------------------------------------------------------------ state
  var cfg = null;              // the config in force (null: none here)
  var on = false;              // showing (or fading in)
  var startedBy = '';
  var host = null, root = null;
  var lastInput = Date.now();
  var idleT = null, slideT = null, blockUntil = 0, pendingSwitch = null;
  var deck = null, listAt = 0, listing = null, listKey = '';
  var layer = 0;               // which of the two photo layers is on top
  // THE FORECAST (1.3): the live sky over the season's land (hkSky.scene),
  // with the forecast band -- when a screen asks for it, or has no photos
  var mode = 'photos', fscene = null, fband = null, fTick = null, fSig = '';
  // THE CALENDAR PANE (option `calendar`): its element, its scroller, the
  // card in it, its width now, and the timer that scrolls it back to today
  var paneEl = null, paneSc = null, paneCard = null, paneW = 0, paneResetT = null;
  // Photos & Forecast: the forecast as one slide every `forecast_every`
  // photos, over the photos, its sky still whenever it is not on screen
  var fcShowing = false, sinceFc = 0;
  // HK Settings' preview (hkSaver.preview): shown in the settings page's frame
  // whoever is signed in, deaf to the real tablet's switch, never writing it,
  // and rebuilt whenever the options change
  var previewOn = false;
  var FC_TICK_MS = 5000;
  var unsubHass = null, cards = [];
  var shown = 0, failed = 0, lastPhoto = null;
  var force = false;           // hkSaver.force(true): ignore the user (tests)

  function user() { var h = hassNow(); return h && h.user && h.user.name; }
  // IN A FRAME (HK Settings' preview) it never runs on its own -- no idle
  // start, no switch, no touches -- only as the preview: the frame's query
  // (?wp_enabled=false) does not survive the dashboard's own navigation, and
  // an admin can be a screen's Tablet User.
  var framed = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  function allowed() {
    if (framed && !previewOn) return false;
    return !!cfg && (force || gate(cfg, user(), location.search));
  }
  function held() {
    // hk-idle is held while a detail sheet is open or Live TV plays: the
    // screensaver never covers someone watching or using a sheet
    var I = window.hkIdle;
    return !!(I && typeof I.held === 'function' && I.held().length);
  }

  // ------------------------------------------------------------ the switch
  function switchState() {
    var h = hassNow();
    var s = cfg && cfg.entity && h && h.states[cfg.entity];
    return s ? s.state : null;
  }
  function writeSwitch(want) {
    if (!cfg || !cfg.entity) return;
    // ONLY THE TABLET'S OWN USER WRITES IT -- never a forced test page
    // (?hk_saver=force, hkSaver.force()), whatever the gate lets it show
    if (!cfg.user || user() !== cfg.user || /[?&]hk_saver=force\b/.test(location.search) || force) return;
    var h = hassNow();
    if (!h || switchState() === want) return;
    pendingSwitch = { want: want, until: Date.now() + ECHO_MS };
    try {
      h.callService(cfg.entity.split('.')[0], want === 'on' ? 'turn_on' : 'turn_off', { entity_id: cfg.entity });
    } catch (e) { /* offline: the next state change sorts it out */ }
  }
  // A TOUCH ON THE SCREEN, told to the integration (screensaver.py): its
  // "Screen In Use" sensor and the switch's last_touch. At most every 10 s,
  // and only from the tablet's own user -- the same rule as the switch.
  var touchSent = 0;
  function reportTouch() {
    if (!cfg || !cfg.entity || !/^switch\./.test(cfg.entity)) return;
    if (!cfg.user || user() !== cfg.user || force || /[?&]hk_saver=force\b/.test(location.search)) return;
    var now = Date.now();
    if (now - touchSent < 10000) return;
    touchSent = now;
    var dash = String(location.pathname).split('/')[1] || '';
    callWS({ type: 'hk_frontend/screensaver/touch', dashboard: dash }).catch(function () { /* older integration */ });
  }

  // Every new hass: the switch decides, unless it is still echoing our own
  // write the other way.
  function onHass(h) {
    if (previewOn || !cfg || !cfg.entity || !allowed()) return;
    var st = switchState();
    if (pendingSwitch) {
      if (st === pendingSwitch.want || Date.now() > pendingSwitch.until) pendingSwitch = null;
      else return;
    }
    if (st === 'on' && !on) start('switch');
    else if (st === 'off' && on) stop('switch');
  }

  // ------------------------------------------------------------ idle
  function armIdle() {
    if (idleT) { clearTimeout(idleT); idleT = null; }
    if (on || !cfg || !allowed() || !(cfg.starts_after > 0)) return;
    var wait = Math.max(250, lastInput + cfg.starts_after * 1000 - Date.now());
    idleT = setTimeout(function () {
      idleT = null;
      if (on || !cfg || !allowed()) return;
      if (Date.now() - lastInput < cfg.starts_after * 1000) { armIdle(); return; }
      // not while hidden (the tab is not on screen), nor held: ask again
      // shortly rather than start behind somebody's back
      if (document.hidden || held()) { lastInput = Date.now() - cfg.starts_after * 1000 + 15000; armIdle(); return; }
      start('idle');
    }, wait);
  }

  // ------------------------------------------------------------ input
  var mx = null, my = null;
  // A TOUCH ON THE CALENDAR PANE scrolls it: the one place on the
  // screensaver a finger does not take it away
  function inPane(e) {
    if (!paneEl || !cfg || !cfg.calendar) return false;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(paneEl) >= 0) return true;
    var x = e.clientX != null ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
    return x != null && x >= (window.innerWidth || 0) - paneW;
  }
  function paneTouched() {
    if (paneResetT) clearTimeout(paneResetT);
    paneResetT = setTimeout(function () {
      paneResetT = null;
      if (paneSc) { try { paneSc.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { paneSc.scrollTop = 0; } }
    }, PANE_RESET_MS);
  }
  function onInput(e) {
    var t = e.type;
    if (on && t !== 'keydown' && inPane(e)) {
      if (t !== 'pointermove' && t !== 'mousemove') paneTouched();
      return;
    }
    if (on) {
      // A MOUSE has to move, a finger just has to land.
      if (t === 'pointermove' || t === 'mousemove') {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (mx === null) { mx = e.clientX; my = e.clientY; return; }
        if (Math.abs(e.clientX - mx) + Math.abs(e.clientY - my) < MOVE_PX) return;
        stop('touch'); return;
      }
      // ONE TAP, ONE STEP: a finger fires pointerdown, then touchstart, then
      // mousedown; where pointer events exist they alone count, or a tap on
      // an edge would skip two photos
      if ((t === 'touchstart' || t === 'mousedown') && window.PointerEvent) return;
      if (t === 'pointerdown' || t === 'touchstart' || t === 'mousedown') {
        var x = t === 'touchstart' ? (e.touches && e.touches[0] && e.touches[0].clientX) : e.clientX;
        // the edges of the PHOTOS: beside the calendar pane, its left edge
        var z = zoneOf(x, (window.innerWidth || 0) - (cfg && cfg.calendar ? paneW : 0));
        // (off the forecast slide too: the photo comes in under it first)
        if (z && mode !== 'forecast') { if (z === 'next') nextPhoto(); else previousPhoto(); }
        else stop('touch');
        return;
      }
      if (t === 'keydown' || t === 'wheel') stop('touch');
      return;
    }
    if (t === 'pointermove' || t === 'mousemove') {
      if (e.pointerType && e.pointerType !== 'mouse') return;
    }
    lastInput = Date.now();
    armIdle();
    if (t !== 'pointermove' && t !== 'mousemove') reportTouch();
  }
  ['pointerdown', 'touchstart', 'touchmove', 'wheel', 'keydown', 'click', 'mousedown', 'pointermove']
    .forEach(function (t) { window.addEventListener(t, onInput, { passive: true, capture: true }); });

  // ------------------------------------------------------------ the element
  var CSS = [
    ':host{position:fixed;inset:0;z-index:2147483000;display:block;background:#000;opacity:0;',
    '  transition:opacity var(--fade,3000ms) ease;touch-action:none;user-select:none;-webkit-user-select:none;',
    '  -webkit-tap-highlight-color:transparent;cursor:none;contain:strict;',
    // THE DASHBOARD'S FONT (SF Pro under HK Kiosk). This element hangs off
    // <body>, outside the view its theme is put on, so it does not inherit
    // it: it fell back to Roboto, whose weight-200 forecast numeral looks
    // squeezed beside the Weather page's. build() copies the view's font
    // onto --hk-saver-font; the theme's root variable is the fallback.
    '  font-family:var(--hk-saver-font,var(--ha-font-family-body,Roboto,Noto,sans-serif))}',
    ':host([on]){opacity:1}',
    // after a touch stop the element stays, invisible, to swallow taps
    ':host([blocking]){background:transparent;cursor:default}',
    // EVERY PHOTO LAYER IS ITS OWN COMPOSITING LAYER, ALL THE TIME. Without
    // will-change a layer exists only while its opacity is animating: the
    // cross-fade created two and dropped them 3 s later (headless: 214 -> 216
    // -> 214 layers at every photo), and each of those made the tablets'
    // WebView re-raster what sits over the photos -- the flicker around each
    // change that WallPanel had too (fixed there 2026-09-15 the same way).
    '.ph{position:absolute;inset:0;opacity:0;transition:opacity ' + CROSSFADE_MS + 'ms ease;will-change:opacity}',
    '.ph.top{opacity:1}',
    // the images paint INTO their layer: an <img> with a layer of its own
    // loses it whenever its src is let go after a fade, which is the same
    // churn one level down (headless, 2026-09-30). Only Slow Zoom, which
    // animates the image, gives it one.
    '.ph img{position:absolute;inset:0;width:100%;height:100%;display:block}',
    ':host([zoom]) .ph img.fg{will-change:transform}',
    '.ph img.bg{object-fit:cover;filter:blur(40px) brightness(80%);transform:scale(1.15)}',
    '.ph img.bg[hidden]{display:none}',
    '.ph img.fg{object-fit:var(--fit,cover)}',
    '.ph.zoom img.fg{animation:hk-saver-zoom var(--zd,33s) linear forwards}',
    '@keyframes hk-saver-zoom{from{transform:scale(1)}to{transform:scale(' + ZOOM + ')}}',
    // THE INFO BOX: where WallPanel put the cards, and how it dressed them,
    // measured on the tablets -- top-left, 600 px, bold white on the photo
    // with a deep shadow, everything aligned to the left edge. The now-playing
    // and timer cards pin themselves to their corners (position:fixed);
    // nothing here may transform or filter, or "fixed" would mean "in here".
    '.info{position:absolute;left:0;top:0;width:var(--hk-saver-card-width,' + DEFAULT_CARD_WIDTH + 'px);',
    '  padding:31px 0 0 30px;box-sizing:content-box;text-align:left;display:flex;flex-direction:column;gap:9px;',
    '  --ha-card-background:none;--ha-card-box-shadow:none;--ha-card-border-width:0px;',
    '  --primary-text-color:#ffffff;--secondary-text-color:#dddddd;color:#fff;',
    '  text-shadow:0px 2px 8px rgba(0,0,0,0.30),0px 6px 28px rgba(0,0,0,0.26),0px 12px 68px rgba(0,0,0,0.34);',
    '  --font-weight:bold;font-weight:bold;font-size:15px;letter-spacing:-0.23px;pointer-events:none}',
    '.info > *{display:block;flex:none}',
    // the forecast: no photo layers; the sky under everything; the band along
    // the bottom (the corner rows rise above it: --hk-ss-corner-bottom); the
    // band carries today's conditions, so the weather line leaves the clock
    ':host([forecast]) .ph{display:none}',
    // the forecast's own layer, over the photos: shown outright ([forecast]),
    // or faded in as one slide among the photos ([fcslide])
    // (opaque: the sky is drawn a moment after the layer is built, and no
    // photo may show through it meanwhile)
    '.fc{position:absolute;inset:0;opacity:0;pointer-events:none;will-change:opacity;background:#000;',
    '  transition:opacity ' + CROSSFADE_MS + 'ms ease}',
    ':host([forecast]) .fc,:host([fcslide]) .fc{opacity:1}',
    '.fsky{position:absolute;inset:0}',
    // the land under the band darkened toward the bottom: a sunlit meadow is
    // as bright as the band's text. Static (no blur), so it costs no frames.
    '.fcscrim{position:absolute;left:0;right:0;bottom:0;height:48%;pointer-events:none;',
    '  background:linear-gradient(to bottom,rgba(6,10,18,0) 0%,rgba(6,10,18,.5) 30%,rgba(6,10,18,.66) 100%)}',
    // column-reverse with auto margins: centred while it fits; a band
    // taller than the zone (a small screen) keeps to the bottom and grows up
    '.fcband{position:absolute;left:30px;right:30px;bottom:0;height:' + BAND_ZONE + ';box-sizing:border-box;',
    '  padding:' + BAND_PAD + 'px 0;display:flex;flex-direction:column-reverse;pointer-events:none}',
    '.fcband > *{margin:auto 0;flex:none;width:100%;max-width:' + BAND_MAX + 'px;align-self:center;',
    '  transform:translateX(var(--hk-band-shift,0px))}',
    // THE FORECAST DETAILS (the band: today, the hours, the days) on a layer
    // of their own, so they can show over the forecast OR the photos
    // (options band / band_photos); the weather line steps aside for them
    '.fcb{position:absolute;inset:0;opacity:0;pointer-events:none;will-change:opacity;',
    '  transition:opacity ' + CROSSFADE_MS + 'ms ease}',
    ':host([band]) .fcb{opacity:1}',
    // the band's glass never blurs what is behind it here: behind it the
    // photos and the forecast cross-fade, and a backdrop blur is redone on
    // every frame of that (the scrim gives the band its contrast instead)
    '.fcb{--hk-glass-backdrop:none}',
    // faded, not removed: with the band fading in and out over the same
    // time, removing it at once showed both (or neither) for 3 s
    // ...on a layer of its own for good: the fade alone made it one only
    // while fading (a layer made and dropped at every forecast slide)
    '.info > hk-weather-strip-card{transition:opacity ' + CROSSFADE_MS + 'ms ease;will-change:opacity}',
    ':host([band]) .info > hk-weather-strip-card{opacity:0}',
    // THE CALENDAR PANE ([cal]): the photo beside it, its own blurred copy
    // under the pane (the backdrop img, always shown), the forecast and its
    // details beside it too -- the sky held to its box, not the screen
    ':host([cal]) .ph img.fg{width:calc(100% - var(--hk-pane-w,0px))}',
    ':host([cal]) .ph img.bg[hidden]{display:block}',
    ':host([cal]) .fc,:host([cal]) .fcb{right:var(--hk-pane-w,0px)}',
    ':host([cal]) #hk-sky.own{position:absolute}',
    '.pane{position:absolute;top:0;right:0;bottom:0;width:var(--hk-pane-w,' + PANE_W + 'px);display:none;',
    '  border-left:1px solid rgba(255,255,255,0.10);background:linear-gradient(to bottom,rgba(8,12,22,0.30),rgba(8,12,22,0.60));',
    '  color:#fff;cursor:default}',
    ':host([cal]) .pane{display:block}',
    // on the forecast it is the night sky's navy, faded in and out with it
    // (a layer of its own for good, like every fading layer here)
    '.pane::before{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(14,22,40,0.97),rgba(8,12,22,0.99));',
    '  opacity:0;transition:opacity ' + CROSSFADE_MS + 'ms ease;will-change:opacity}',
    ':host([forecast]) .pane::before,:host([fcslide]) .pane::before{opacity:1}',
    // the list between Home Status (above) and what plays and the timers
    // (its foot, below), each as tall as it is now (paneStack)
    '.pane .sc{position:absolute;left:0;right:0;top:var(--hk-pane-top,' + PANE_TOP + 'px);bottom:var(--hk-pane-bottom,0px);overflow-y:auto;overflow-x:hidden;',
    '  padding:0 var(--hk-pane-pad,28px);box-sizing:border-box;border-top:1px solid rgba(255,255,255,0.10);touch-action:pan-y;',
    '  overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;',
    '  -webkit-mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 90px),transparent 100%);',
    '  mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 90px),transparent 100%)}',
    '.pane .sc::-webkit-scrollbar{display:none}',
    '@media (prefers-reduced-motion:reduce){.ph{transition:none}.ph.zoom img.fg{animation:none}}'
  ].join('\n');

  function build() {
    host = document.createElement('hk-screensaver');
    root = host.attachShadow({ mode: 'open' });
    var font = viewFont();
    if (font) host.style.setProperty('--hk-saver-font', font);
    var st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
    for (var i = 0; i < 2; i++) {
      var ph = document.createElement('div'); ph.className = 'ph';
      var bg = document.createElement('img'); bg.className = 'bg'; bg.alt = ''; bg.hidden = true;
      var fg = document.createElement('img'); fg.className = 'fg'; fg.alt = '';
      ph.appendChild(bg); ph.appendChild(fg); root.appendChild(ph);
    }
    var pane = document.createElement('div'); pane.className = 'pane';
    var sc = document.createElement('div'); sc.className = 'sc'; pane.appendChild(sc); root.appendChild(pane);
    paneEl = pane; paneSc = sc; paneCard = null;
    var info = document.createElement('div'); info.className = 'info'; root.appendChild(info);
    // taps on the screensaver itself: the window listener above has already
    // decided (edge zone or stop); here they are only kept from reaching
    // anything else
    ['click', 'pointerup', 'mouseup', 'touchend', 'contextmenu'].forEach(function (t) {
      host.addEventListener(t, function (e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); });
    });
    document.body.appendChild(host);
    buildCards(info);
  }
  function teardown() {
    leaveForecast();
    if (unsubHass) { unsubHass(); unsubHass = null; }
    cards = [];
    if (host) {
      // let the browser drop the decoded photos now, not at the next GC
      root.querySelectorAll('img').forEach(function (im) { im.removeAttribute('src'); });
      host.remove();
    }
    host = null; root = null; paneEl = null; paneSc = null; paneCard = null;
    if (paneT) { clearInterval(paneT); paneT = null; }
    if (paneResetT) { clearTimeout(paneResetT); paneResetT = null; }
  }
  var builtFor = null;
  function cfgKey() { try { return JSON.stringify(cfg); } catch (e) { return String(Math.random()); } }
  function buildCards(info) {
    var h = hassNow();
    cards = [];
    (cfg.cards || []).forEach(function (c) {
      var tag = tagOf(c.type);
      var make = function () {
        if (!host) return;
        try {
          var el = document.createElement(tag);
          var conf = Object.assign({}, c, { type: c.type });
          // Home Status at the top of the calendar pane: sized for it
          if (cfg.calendar && tag === 'hk-screensaver-status-card') { conf.line1_size = '22px'; conf.line_size = '16px'; conf.align = 'left'; }
          // ...and the timers in its foot
          if (cfg.calendar && tag === 'hk-timer-strip-card') conf.scale = Math.round(1.15 * scaleOf() * 100) / 100;
          el.setConfig(conf);
          if (h) el.hass = h;
          info.appendChild(el);
          cards.push(el);
        } catch (e) { console.warn('[hk-saver] card', tag, e); }
      };
      // the card files load after this module; by the time a screensaver
      // starts they are normally defined, but a page reloaded straight into
      // the sleep script may still be loading them
      if (customElements.get(tag)) make();
      else if (customElements.whenDefined) customElements.whenDefined(tag).then(make);
    });
    if (window.hkCards && window.hkCards.onHass) unsubHass = window.hkCards.onHass(onHassCards);
  }
  function onHassCards(h) { cards.forEach(function (c) { try { c.hass = h; } catch (e) { /* ignore */ } }); }

  // ------------------------------------------------------------ start / stop
  function start(reason) {
    if (on || !cfg || !allowed()) return false;
    if (idleT) { clearTimeout(idleT); idleT = null; }
    on = true; startedBy = reason || 'idle'; mx = null; my = null; blockUntil = 0;
    // BUILT FOR OTHER SETTINGS: its cards were set up for them (Home Status
    // sized for the calendar pane, or for the corner), and a host kept from
    // an earlier start kept them -- the pane turned off on HK Settings left
    // Home Status small, halfway along the top (2026-10-01). Built again.
    if (host && (host.hasAttribute('blocking') || builtFor !== cfgKey())) teardown();
    if (!host) { build(); builtFor = cfgKey(); }
    host.style.setProperty('--fade', FADE_IN_MS + 'ms');
    if (cfg.zoom) host.setAttribute('zoom', ''); else host.removeAttribute('zoom');
    host.removeAttribute('blocking');
    // the next frame, so the fade runs from 0
    requestAnimationFrame(function () { if (on && host) host.setAttribute('on', ''); });
    tellOthers();
    if (reason !== 'switch') writeSwitch('on');
    resetForecast();            // an element still fading out is reused
    setupPane();
    if (cfg.show === 'forecast') enterForecast();
    else { updateBand(); showNext(true); }
    return true;
  }
  function stop(reason) {
    if (!on) return false;
    on = false;
    if (slideT) { clearTimeout(slideT); slideT = null; }
    var ms = reason === 'switch' ? FADE_SWITCH_MS : FADE_TOUCH_MS;
    if (reason === 'touch') { writeSwitch('off'); blockUntil = Date.now() + BLOCK_MS; }
    tellOthers();
    var h = host;
    if (h) {
      h.style.setProperty('--fade', ms + 'ms');
      h.removeAttribute('on');
      if (reason === 'touch') h.setAttribute('blocking', '');
      var wait = reason === 'touch' ? Math.max(ms, BLOCK_MS) : ms;
      setTimeout(function () { if (!on && host === h) teardown(); }, wait + 50);
    }
    lastInput = Date.now();
    armIdle();
    return true;
  }
  // The sky, the cards and a dismissed pop-up's record all follow this.
  function tellOthers() {
    try { if (window.hkSky && window.hkSky.saverChanged) window.hkSky.saverChanged(); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('hk-saver', { detail: { on: on } })); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ photos
  function callWS(msg) {
    var h = hassNow();
    if (!h || !h.callWS) return Promise.reject(new Error('no connection'));
    return h.callWS(msg);
  }
  // Every image under the folder (sub-folders to LIST_DEPTH), at most LIST_MAX.
  function listPhotos() {
    var key = cfg.photos + '|' + cfg.order;
    if (deck && listKey === key && Date.now() - listAt < LIST_TTL_MS && deck.items.length) return Promise.resolve(deck);
    if (listing) return listing;
    var out = [];
    function walk(id, depth) {
      if (out.length >= LIST_MAX) return Promise.resolve();
      return callWS({ type: 'media_source/browse_media', media_content_id: id }).then(function (r) {
        var kids = (r && r.children) || [];
        var sub = [];
        kids.forEach(function (k) {
          if (out.length >= LIST_MAX) return;
          if (k.can_expand && depth < LIST_DEPTH) sub.push(k.media_content_id);
          else if (!k.can_expand && isImage(k)) out.push({ id: k.media_content_id, title: k.title || '' });
        });
        return sub.reduce(function (p, s) { return p.then(function () { return walk(s, depth + 1); }); }, Promise.resolve());
      });
    }
    listing = walk(cfg.photos, 0).then(function () {
      if (!deck || deck.order !== cfg.order) deck = new Deck(cfg.order);
      deck.set(out);
      listAt = Date.now(); listKey = key;
      return deck;
    }).catch(function (e) {
      console.warn('[hk-saver] photos', cfg.photos, e && e.message);
      if (!deck) deck = new Deck(cfg.order);
      listAt = Date.now() - LIST_TTL_MS + 60000;   // try again in a minute
      return deck;
    }).then(function (d) { listing = null; return d; });
    return listing;
  }
  function load(item) {
    return callWS({ type: 'media_source/resolve_media', media_content_id: item.id }).then(function (r) {
      var url = r && r.url;
      if (!url) throw new Error('no url');
      return new Promise(function (ok, fail) {
        var im = new Image();
        im.decoding = 'async';
        im.onload = function () {
          (im.decode ? im.decode().catch(function () { /* drawn anyway */ }) : Promise.resolve())
            .then(function () { ok({ url: url, w: im.naturalWidth, h: im.naturalHeight, item: item }); });
        };
        im.onerror = function () { fail(new Error('load')); };
        im.src = url;
      });
    });
  }
  var busy = false, queued = null;
  function showNext(first) { advance(function () { return deck && deck.next(); }, first); }
  function nextPhoto() { advance(function () { return deck && deck.next(); }); }
  function previousPhoto() { advance(function () { return deck && deck.previous(); }); }
  function advance(pick, first) {
    if (!on || mode === 'forecast') return;
    if (busy) { queued = pick; return; }
    busy = true;
    if (slideT) { clearTimeout(slideT); slideT = null; }
    var tries = 0;
    function attempt() {
      return listPhotos().then(function (d) {
        // NO PHOTOS (an empty folder, one that can't be read): the forecast
        if (!d || !d.items || !d.items.length) {
          if (on && (cfg.fallback || cfg.show === 'both')) enterForecast();
          return null;
        }
        var item = pick();
        if (!item) return null;
        return load(item).catch(function (e) {
          failed++;
          if (++tries < 3) { pick = function () { return d.next(); }; return attempt(); }
          throw e;
        });
      });
    }
    attempt().then(function (ph) {
      // OFF THE FORECAST SLIDE: the next photo is loaded first, put under
      // the forecast at once, and only then does the forecast fade -- to that
      // photo alone. Faded first, it showed the photo from before the
      // forecast, then the next one cross-fading in over it, both through the
      // fading forecast (the "photo behind the forecast").
      if (ph && on) paint(ph, first || fcShowing);
    }).catch(function () { /* nothing to show: stay on the last photo */ }).then(function () {
      if (mode !== 'forecast') hideForecastSlide();
      busy = false;
      if (!on) return;
      if (mode === 'forecast') { queued = null; return; }
      if (queued) { var q = queued; queued = null; advance(q); return; }
      schedule();
    });
  }
  function schedule() {
    if (slideT) clearTimeout(slideT);
    slideT = setTimeout(function () {
      slideT = null;
      if (!on || !cfg) return;             // stopped (its config gone) meanwhile
      // a hidden page (a backgrounded tab) does not turn photos
      if (document.hidden) { schedule(); return; }
      if (fcShowing) { showNext(false); return; }    // advance() takes the slide away
      if (cfg.show === 'both' && sinceFc >= cfg.forecast_every) { showForecastSlide(); schedule(); return; }
      showNext(false);
    }, cfg.each_photo * 1000);
  }
  function paint(ph, first) {
    if (!root) return;
    var layers = root.querySelectorAll('.ph');
    var next = layers[1 - layer], cur = layers[layer];
    var fit = fitOf(ph.w, ph.h, cfg.fill);
    var bg = next.querySelector('img.bg'), fg = next.querySelector('img.fg');
    next.classList.remove('zoom');
    next.style.setProperty('--fit', fit.fit);
    fg.src = ph.url;
    // (with the calendar pane the blurred copy is always there: it is the
    // pane's background)
    if (fit.backdrop || cfg.calendar) { bg.src = ph.url; bg.hidden = false; } else { bg.hidden = true; bg.removeAttribute('src'); }
    if (cfg.zoom) {
      next.style.setProperty('--zd', (cfg.each_photo * 1000 + CROSSFADE_MS) + 'ms');
      void next.offsetWidth;               // restart the zoom from 1
      next.classList.add('zoom');
    }
    // the first photo appears with the screensaver's own fade, not a cross-fade;
    // one put under the forecast slide is there at once -- and the photo it
    // replaces gone at once, or (the upper of the two layers) it would still
    // be fading out over the new one as the forecast goes
    if (first) { next.style.transition = cur.style.transition = 'none'; void next.offsetWidth; }
    next.classList.add('top');
    cur.classList.remove('top');
    if (first) requestAnimationFrame(function () { next.style.transition = cur.style.transition = ''; });
    layer = 1 - layer;
    shown++; sinceFc++; lastPhoto = ph.item.title || ph.item.id;
    // the old layer's photo can go once the cross-fade is over
    var old = cur;
    setTimeout(function () {
      if (!old.classList.contains('top')) {
        old.classList.remove('zoom');
        old.querySelectorAll('img').forEach(function (im) { im.removeAttribute('src'); });
      }
    }, CROSSFADE_MS + 100);
  }

  function restartPreview() {
    if (!previewOn || !on) return;
    on = false;
    if (slideT) { clearTimeout(slideT); slideT = null; }
    teardown();
    start('preview');
  }

  // ------------------------------------------------------------ the forecast
  // The forecast's layer: built the first time it is needed, then kept for
  // as long as the screensaver shows (Photos & Forecast brings it back every
  // few photos); its sky holds still whenever it is not on screen.
  function buildForecast() {
    if (!root || root.querySelector('.fc')) return;
    var fc = document.createElement('div');
    fc.className = 'fc';
    root.insertBefore(fc, root.querySelector('.info'));
    var sky = document.createElement('div');
    sky.className = 'fsky';
    fc.appendChild(sky);
    try { fscene = window.hkSky && window.hkSky.scene ? window.hkSky.scene(sky) : null; } catch (e) { fscene = null; }
    startTick();
  }
  // the details' layer, built the first time they are wanted
  function buildBand() {
    if (!root || root.querySelector('.fcb')) return;
    var fcb = document.createElement('div');
    fcb.className = 'fcb';
    root.insertBefore(fcb, root.querySelector('.info'));
    var scrim = document.createElement('div');
    scrim.className = 'fcscrim';
    fcb.appendChild(scrim);
    var band = document.createElement('div');
    band.className = 'fcband';
    fcb.appendChild(band);
    addBand(band);
    startTick();
  }
  function startTick() {
    if (!fTick) fTick = setInterval(function () { forecastTick(false); }, FC_TICK_MS);
  }
  // Whether the details show now: on the forecast (Forecast, the slide, the
  // no-photos fallback) by `band`; over the photos by `band_photos`.
  function bandWanted() {
    if (!on || !cfg) return false;
    return fcVisible() ? cfg.band !== false : cfg.band_photos === true;
  }
  function updateBand() {
    if (!host) return;
    var want = bandWanted();
    if (want) buildBand();
    if (want) host.setAttribute('band', ''); else host.removeAttribute('band');
  }
  function fcVisible() { return mode === 'forecast' || fcShowing; }
  // the whole screensaver: no photos, or Show: Forecast
  function enterForecast() {
    if (mode === 'forecast' || !root) return;
    mode = 'forecast';
    fcShowing = false;
    if (slideT) { clearTimeout(slideT); slideT = null; }
    host.removeAttribute('fcslide');
    host.setAttribute('forecast', '');
    buildForecast();
    updateBand();
    forecastTick(true);
  }
  // one slide among the photos (Photos & Forecast)
  function showForecastSlide() {
    if (!on || !root || mode === 'forecast') return;
    buildForecast();
    fcShowing = true; sinceFc = 0;
    host.setAttribute('fcslide', '');
    updateBand();
    forecastTick(true);
  }
  function hideForecastSlide() {
    if (!fcShowing) return;
    fcShowing = false;
    if (host) host.removeAttribute('fcslide');
    updateBand();
    forecastTick(false);
  }
  function leaveForecast() {
    if (fTick) { clearInterval(fTick); fTick = null; }
    if (fscene) { try { fscene.destroy(); } catch (e) { /* gone with the element */ } fscene = null; }
    if (fband) cards = cards.filter(function (c) { return c !== fband; });
    fband = null; fSig = ''; mode = 'photos'; fcShowing = false; sinceFc = 0;
  }
  function resetForecast() {
    leaveForecast();
    if (root) root.querySelectorAll('.fc,.fcb').forEach(function (n) { n.remove(); });
    if (host) {
      host.removeAttribute('forecast'); host.removeAttribute('fcslide'); host.removeAttribute('band');
      if (host.style.removeProperty) host.style.removeProperty('--hk-ss-corner-bottom');
    }
  }
  // ------------------------------------------------------------ the pane
  // the band's and the pane's scale: a 1280 x 800 tablet's layout, scaled up
  // whole on a bigger screen
  function scaleOf() {
    var W = window.innerWidth || 0, H = window.innerHeight || 0;
    if (!W) return 1;
    return Math.max(1, Math.floor(Math.min(W / BAND_W, (H || BAND_H) / BAND_H) * 100) / 100);
  }
  var PANE_VARS = ['--hk-pane-w', '--hk-ss-status-right', '--hk-ss-status-top', '--hk-ss-status-width', '--hk-pane-top',
                   '--hk-pane-bottom', '--hk-ss-now-left', '--hk-ss-now-max', '--hk-ss-now-bottom', '--hk-ss-np-art',
                   '--hk-ss-np-title', '--hk-ss-np-artist', '--hk-ss-np-gap', '--hk-ss-timers-left', '--hk-ss-timers-right',
                   '--hk-ss-timers-max', '--hk-ss-timers-bottom', '--hk-pane-pad'];
  var paneT = null;
  function setupPane() {
    if (!host) return;
    if (!cfg.calendar) {
      host.removeAttribute('cal');
      if (host.style.removeProperty) PANE_VARS.forEach(function (v) { host.style.removeProperty(v); });
      paneW = 0;
      if (paneT) { clearInterval(paneT); paneT = null; }
      if (paneCard) { cards = cards.filter(function (c) { return c !== paneCard; }); paneCard.remove(); paneCard = null; }
      return;
    }
    host.setAttribute('cal', '');
    layoutPane();
    // what Home Status, the music and the timers take comes and goes with
    // the house: measured again every moment (a few rect reads)
    if (!paneT) paneT = setInterval(function () { if (on) paneStack(); }, 1500);
    var tag = 'hk-calendar-pane-card', days = cfg.calendar_days;
    if (paneCard) {
      if ((paneCard._config || {}).days !== days) paneCard.setConfig({ type: 'custom:' + tag, days: days });
      return;
    }
    var make = function () {
      if (!host || !paneSc || paneCard || !cfg || !cfg.calendar) return;
      try {
        var el = document.createElement(tag);
        el.setConfig({ type: 'custom:' + tag, days: cfg.calendar_days });
        var h = hassNow();
        if (h) el.hass = h;
        paneSc.appendChild(el);
        cards.push(el);
        paneCard = el;
        layoutPane();
      } catch (e) { console.warn('[hk-saver] calendar pane', e); }
    };
    if (customElements.get(tag)) make();
    else if (customElements.whenDefined) customElements.whenDefined(tag).then(make);
  }
  // its width and Home Status's place in it, for this screen (and again
  // every few seconds: a tablet turned, a window resized)
  function layoutPane() {
    if (!host || !cfg || !cfg.calendar) return;
    var z = scaleOf(), w = Math.round(PANE_W * z);
    // the list scaled with the screen (its card may arrive after the width)
    if (paneCard && (paneCard.style.zoom || '1') !== String(z)) paneCard.style.zoom = z === 1 ? '' : String(z);
    if (w === paneW && host.style.getPropertyValue && host.style.getPropertyValue('--hk-pane-w')) return;
    paneW = w;
    // a new width for the pane is a new room for the band beside it
    if (fband && fband.isConnected) setTimeout(function () { if (fband && fband.isConnected) centerBand(fband); }, 0);
    var W = window.innerWidth || 0, px = function (n) { return Math.round(n * z) + 'px'; };
    host.style.setProperty('--hk-pane-w', w + 'px');
    // one margin for everything in the pane: the list, Home Status, its foot
    host.style.setProperty('--hk-pane-pad', px(28));
    // WHAT PLAYS AND THE TIMERS, in the pane's foot (hk-media.js,
    // hk-timers.js): on its 28 px margins, left-aligned with the list,
    // smaller than in a corner of the photos
    host.style.setProperty('--hk-ss-now-left', (W - w + Math.round(28 * z)) + 'px');
    host.style.setProperty('--hk-ss-now-max', (w - Math.round(56 * z)) + 'px');
    host.style.setProperty('--hk-ss-np-art', px(64));
    host.style.setProperty('--hk-ss-np-title', px(20));
    host.style.setProperty('--hk-ss-np-artist', px(16));
    host.style.setProperty('--hk-ss-np-gap', px(14));
    host.style.setProperty('--hk-ss-timers-left', (W - w + Math.round(28 * z)) + 'px');
    host.style.setProperty('--hk-ss-timers-right', px(28));
    host.style.setProperty('--hk-ss-timers-max', (w - Math.round(56 * z)) + 'px');
    host.style.setProperty('--hk-ss-status-right', Math.round(28 * z) + 'px');
    host.style.setProperty('--hk-ss-status-top', Math.round(26 * z) + 'px');
    host.style.setProperty('--hk-ss-status-width', (w - Math.round(56 * z)) + 'px');
    paneStack();
  }
  // THE PANE'S LIST between Home Status (one line, or two or three when
  // much is open) and its foot (what plays above the running timers, each
  // only while there is one): measured, so nothing overlaps whatever shows
  function paneStack() {
    if (!host || !root || !cfg || !cfg.calendar) return;
    var z = scaleOf(), pad = Math.round(22 * z), gap = Math.round(14 * z);
    var hOf = function (tag, sel) {
      var el = null;
      for (var i = 0; i < cards.length; i++) if (cards[i].localName === tag) { el = cards[i]; break; }
      var n = el && el.shadowRoot && el.shadowRoot.querySelector(sel);
      if (!n || !n.getBoundingClientRect) return null;
      var r = n.getBoundingClientRect();
      return r.height > 1 ? r : null;
    };
    var st = hOf('hk-screensaver-status-card', '.sscorner');
    var np = hOf('hk-screensaver-now-card', '.sscorner');
    var tm = hOf('hk-timer-strip-card', 'div[style*="position:fixed"]');
    var tH = tm ? Math.round(tm.height) : 0, nH = np ? Math.round(np.height) : 0;
    var set = function (k, v) { if (host.style.getPropertyValue(k) !== v) host.style.setProperty(k, v); };
    set('--hk-pane-top', Math.max(Math.round(PANE_TOP * z), st ? Math.round(st.bottom + 16 * z) : 0) + 'px');
    set('--hk-ss-timers-bottom', pad + 'px');
    set('--hk-ss-now-bottom', (pad + (tH ? tH + gap : 0)) + 'px');
    var stack = nH + tH + (nH && tH ? gap : 0);
    set('--hk-pane-bottom', (stack ? stack + pad + Math.round(18 * z) : 0) + 'px');
  }

  // the weather band: today's conditions, the next hours and the coming days
  function addBand(box) {
    var tag = 'hk-weather-band-card';
    var make = function () {
      if (!host || !box.isConnected) return;
      var h = hassNow(), HS = window.hkSettings;
      var wid = h && HS && HS.weatherId ? HS.weatherId(h.states) : null;
      if (!wid) return;
      try {
        var el = document.createElement(tag);
        // beside the calendar pane: today beside the hours and days, as on
        // the other screens, its column slimmer and fewer hours
        el.setConfig({ type: 'custom:' + tag, entity: wid, hours: cfg.calendar ? 8 : 12, days: 6, plain: true,
                       now_width: cfg.calendar ? BAND_NOW_BESIDE : undefined });
        if (h) el.hass = h;
        // NOT SEEN UNTIL IT IS IN PLACE: it can only be centred once it has
        // drawn (centerBand measures it), so it drew ~25 px off and jumped
        // a quarter second into the slide -- and beside the calendar pane
        // again when it redrew for its width (2026-10-01). Hidden until it is
        // where it stays, then faded in.
        el.style.opacity = '0';
        box.appendChild(el);
        cards.push(el);
        fband = el;
        var placed = function () {
          if (fband !== el || !el.isConnected) return;
          centerBand(el);
          el.style.transition = 'opacity ' + BAND_REVEAL_MS + 'ms ease';
          el.style.opacity = '';
        };
        // centred as soon as it has drawn, not at the next tick -- beside the
        // pane once more after it has redrawn for its width
        setTimeout(function () {
          if (fband !== el || !el.isConnected) return;
          centerBand(el);
          setTimeout(placed, cfg && cfg.calendar ? 400 : 0);
        }, 250);
      } catch (e) { console.warn('[hk-saver] forecast band', e); }
    };
    if (customElements.get(tag)) make();
    else if (customElements.whenDefined) customElements.whenDefined(tag).then(make);
  }
  // SIDE TO SIDE BY WHAT IS DRAWN, not by the card's box: its left column
  // is a fixed 300 px with today's stack centred in it, and its hours and
  // days are centred in their cells, so the box centred leaves more empty
  // screen on the left than on the right. The text's own left and right
  // edges are measured and the band shifted until the two margins match.
  function centerBand(card) {
    var sr = card.shadowRoot, W = window.innerWidth || 0, H = window.innerHeight || 0;
    if (!sr || !W) return;
    // THE PANE'S WIDTH FIRST: centred before the pane had measured itself,
    // the band was centred on the whole screen and ran under the pane
    if (cfg && cfg.calendar && !paneW) layoutPane();
    // the scale first (a bigger screen: the tablet's band, bigger) -- CSS
    // zoom, so it lays out as on the tablet and takes its scaled room
    var z = scaleOf();
    if (String(z) !== (card.style.zoom || '1')) card.style.zoom = z === 1 ? '' : String(z);
    // BESIDE THE CALENDAR PANE: the photos' (the land's) width is the room,
    // the band stands up no wider than BAND_STACKED, and its zone is the
    // meadow of the land as it covers that narrower box
    var RW = W - (cfg && cfg.calendar ? paneW : 0), box = card.parentNode;
    if (box && box.style) {
      if (cfg && cfg.calendar) {
        box.style.height = Math.round(Math.max(0.356 * H, 0.2225 * RW)) + 'px';
        box.style.padding = '';
        var mw = Math.max(BAND_STACKED, Math.round(RW / z) - 2 * BAND_BESIDE_GUTTER) + 'px';
        if (card.style.maxWidth !== mw) {
          card.style.maxWidth = mw;
          // the band redraws its columns for the new width a moment later
          // (its own ResizeObserver): centre it again once it has
          setTimeout(function () { if (fband === card && card.isConnected) centerBand(card); }, 350);
        }
      } else {
        box.style.height = ''; box.style.padding = ''; card.style.maxWidth = '';
      }
    }
    var lo = Infinity, hi = -Infinity;
    sr.querySelectorAll('.now > *, .cell > *').forEach(function (e) {
      var q = e.getBoundingClientRect();
      if (q.width) { lo = Math.min(lo, q.left); hi = Math.max(hi, q.right); }
    });
    if (!(hi > lo)) return;
    var cur = parseFloat(card.style.getPropertyValue('--hk-band-shift')) || 0;
    // (the shift is in the band's own pixels, which the zoom scales)
    var want = Math.round(cur + ((RW - hi) - lo) / 2 / z);
    if (Math.abs(want - cur) >= 1) card.style.setProperty('--hk-band-shift', want + 'px');
  }
  // Every few seconds: the sky follows the sun and the weather; it holds still
  // while the screen is dark (Fully Kiosk's own screensaver or screen off --
  // the page cannot tell, so Fully is asked -- or a hidden page); and the
  // corner rows stay above the band.
  function forecastTick(force) {
    var h = hassNow();
    if (fscene && h && h.states) {
      var HS = window.hkSettings, sun = h.states['sun.sun'];
      var wid = HS && HS.weatherId ? HS.weatherId(h.states) : null, w = wid && h.states[wid];
      var sig = (sun ? sun.last_updated : '') + '|' + (w ? w.last_updated : '') + '|' + Math.floor(Date.now() / 600000);
      if (force || sig !== fSig) {
        fSig = sig;
        try { fscene.update(h); } catch (e) { console.warn('[hk-saver] forecast sky', e); }
      }
    }
    var F = window.fully, dark = !!document.hidden;
    try {
      if (F && ((typeof F.isInScreensaver === 'function' && F.isInScreensaver()) ||
                (typeof F.getScreenOn === 'function' && F.getScreenOn() === false))) dark = true;
    } catch (e) { /* no Fully interface */ }
    // not on screen (between forecast slides) holds still too
    if (fscene) fscene.pause(dark || !fcVisible());
    layoutPane();
    if (host && root) {
      var b = fband && fband.isConnected ? fband : null, r = b && b.getBoundingClientRect();
      if (b) centerBand(b);
      if (host.hasAttribute('band') && r && r.height) host.style.setProperty('--hk-ss-corner-bottom', Math.round((window.innerHeight || 0) - r.top + 18) + 'px');
      else if (host.style.removeProperty) host.style.removeProperty('--hk-ss-corner-bottom');
    }
  }

  // ------------------------------------------------------------ the loop
  // The config follows the page: on each view change, and on each new hass
  // (cheap -- a property read, and the dashboard config object is the same
  // object until the dashboard changes).
  // A DASHBOARD HK FRONTEND DOES NOT DRAW (an existing dashboard given HK
  // settings) has no hk_screensaver in its config: its screen's settings
  // make the same block (hk-strategy.js saverBlock). Its own YAML's
  // hk_screensaver -- or a WallPanel block -- always wins.
  function fromSettings(conf) {
    if (!conf || conf.wallpanel) return null;
    var HS = window.hkSettings, S = window.hkStrategy;
    var all = HS && HS.get ? HS.get('boards', null) : null;
    var b = all && all[String(location.pathname).split('/')[1] || ''];
    return b && b.screensaver && S && S.saverBlock ? S.saverBlock(hassNow(), b) : null;
  }
  // compared as written: a block made from the settings is a new object
  // every time
  var lastRaw = '';
  function refresh() {
    var p = panel();
    var conf = p && p.lovelace && p.lovelace.config;
    var raw = conf && conf.hk_screensaver;
    if (conf && raw === undefined) raw = fromSettings(conf);
    var HS = window.hkSettings;
    if (HS && HS.lovelacePanel && HS.lovelacePanel() === false) raw = null;
    var key = raw ? JSON.stringify(raw) : '';
    if (key !== lastRaw) {
      lastRaw = key;
      cfg = readCfg(raw);
      // the preview follows the settings page: rebuilt with the new options
      if (previewOn && on && cfg) setTimeout(restartPreview, 0);
      // ...and a preview asked for before there was a config (the frame's
      // dashboard, or its settings, still arriving) starts once there is one
      if (previewOn && !on && cfg) setTimeout(function () { if (previewOn && !on && cfg) start('preview'); }, 0);
      if (!cfg && on) stop('config');
      if (deck && cfg && deck.order !== cfg.order) deck = null;
    }
    if (!cfg) { if (idleT) { clearTimeout(idleT); idleT = null; } return; }
    if (!allowed()) { if (on) stop('config'); if (idleT) { clearTimeout(idleT); idleT = null; } return; }
    if (!idleT && !on) armIdle();
  }
  var refreshedAt = 0;
  function refreshSoon() {
    // on every hass (~40 a second in a busy house) the switch is checked, but
    // the config only every 2 s: it changes when the dashboard does
    var now = Date.now();
    if (now - refreshedAt < 2000) return;
    refreshedAt = now;
    refresh();
  }
  window.addEventListener('location-changed', function () { setTimeout(refresh, 0); });
  window.addEventListener('popstate', function () { setTimeout(refresh, 0); });
  window.addEventListener('resize', function () { if (on) layoutPane(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { lastInput = Date.now(); armIdle(); }
  });
  var hubOff = null;
  function hookHass() {
    if (hubOff || !(window.hkCards && window.hkCards.onHass)) return false;
    hubOff = window.hkCards.onHass(function (h) { refreshSoon(); onHass(h); });
    return true;
  }
  // hk-base (the cards) loads after this module; until it does, poll lightly
  (function wait(n) {
    refresh();
    var h = hassNow();
    if (h) onHass(h);
    if (hookHass()) return;
    setTimeout(function () { wait(n + 1); }, n < 60 ? 1000 : 5000);
  })(0);

  window.hkSaver = {
    running: function () { return on; },
    // the forecast is what is showing (not photos)
    forecast: function () { return on && mode === 'forecast'; },
    // HK Settings' preview frame: show it now and keep it up; false takes it away
    preview: function (v) {
      previewOn = !!v;
      force = previewOn;
      refresh();
      if (previewOn && !on) start('preview');
      else if (!previewOn && on && startedBy === 'preview') stop('manual');
      return previewOn;
    },
    // Console / probe helpers. hkSaver.start() shows it now; stop() takes it
    // away (as a touch would, but without writing the switch).
    start: function () { refresh(); return start('manual'); },
    stop: function () { return stop('manual'); },
    next: nextPhoto,
    previous: previousPhoto,
    force: function (v) { force = !!v; refresh(); return force; },
    config: function () { return cfg; },
    stats: function () {
      return { on: on, startedBy: startedBy, allowed: allowed(), photos: deck ? deck.items.length : null,
               shown: shown, failed: failed, last: lastPhoto, cards: cards.length,
               idleIn: cfg && !on && cfg.starts_after ? Math.max(0, Math.round((lastInput + cfg.starts_after * 1000 - Date.now()) / 1000)) : null,
               blocking: Date.now() < blockUntil, switch: switchState(),
               mode: on ? mode : null, land: fscene && fscene.landShown ? fscene.landShown() || null : null,
               forecastSlide: on && fcShowing, sinceForecast: sinceFc, preview: previewOn,
               band: !!(host && host.hasAttribute('band')),
               calendar: !!(host && host.hasAttribute('cal')), paneW: paneW, paneCard: !!paneCard };
    },
    _: { readCfg: readCfg, gate: gate, zoneOf: zoneOf, fitOf: fitOf, shuffle: shuffle, Deck: Deck, isImage: isImage,
         // tests: the slide without real photos to count
         slide: { show: showForecastSlide, hide: hideForecastSlide, since: function (n) { sinceFc = n; }, schedule: function () { schedule(); } } }
  };
})();
