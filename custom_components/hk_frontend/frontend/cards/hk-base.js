// hk-base.js -- the foundation every hk card file builds on.
//
// HkBase (the card base class: render gating, the tap contract, actions,
// confirmations), the shared material, the config-editor helpers, register()
// and firstOf() for defining a card, create() for nesting one card inside
// another, and the camera thumbnail cache. Publishes all of it as
// window.hkCards and fires `hk-cards-ready`, which every card file waits for.
//
// The cards themselves live in the other files under cards/. The event is
// named for window.hkCards, and every card file listens for it.
//
// WHY LOCAL CARDS AT ALL
//
// WHY THIS FILE EXISTS
// Some of what a dashboard holds is the HOUSE's state -- a lock, a timer, an
// alarm -- and belongs in entities, where automations, the phone app and voice
// can all reach it. Some of it is only ever ONE PERSON'S, for a few seconds,
// on ONE screen: the digits half-typed into a keypad, the rooms ticked before
// pressing Clean. Modelling that second kind as entities has three costs, and
// this file exists so that none of them is paid:
//
//   1. IT IS GLOBAL. An input_text keypad buffer is one buffer for the whole
//      house: two people typing on two tablets overwrite each other. A set of
//      input_boolean area helpers is worse -- a collision there
//      dispatches a robot to somebody else's selection.
//   2. IT IS A ROUND TRIP. Every keystroke is a service call, a state write,
//      a WebSocket broadcast to every connected client, and a re-render --
//      and a re-render that replaces an <input> takes the caret with it.
//   3. IT IS RECORDED, or has to be explicitly excluded; otherwise every
//      tick writes history rows.
//
// WHAT DOES *NOT* MOVE HERE
// The security boundary. The Alarm PIN feature's panel checks the
// entered code and forwards to the real alarm panel; that stays server-side, because a
// card cannot enforce anything -- anyone can call the service directly. A
// card collects the code. HA decides if it is right.
//
// THE LOOK
// Every surface here is the Home app's material. It is NOT hardcoded: the
// HK Kiosk theme (theme/hk_kiosk_theme.yaml) publishes it as
// --hk-glass-bg / --hk-glass-border / --hk-glass-shadow-sm / -lg /
// --hk-glass-radius / --hk-well-bg, so the theme is the single source and
// this file inherits it. The literals in the var() fallbacks are only for a
// card placed on a view with some other theme; if you change the material,
// change the THEME. (A few per-size shadow names -- -pill, -scene, -tall,
// -chip -- are read with a fallback but not published by the theme; they
// resolve to their literals until a theme defines them.)
//
// Geometry, by contrast, is measured off the Home app, and the numbers are
// load-bearing -- see the notes in hk-tile.js before touching any of them.
(function () {
  'use strict';

  if (window.hkCards) return;          // hk-loader may import this twice
  window.hkCards = { version: '1.1.0' };

  // -------------------------------------------------------------- material
  // One string, shared by every card below. var() with a literal fallback:
  // the theme supplies these on any HK Kiosk view, and the fallback keeps
  // a card honest anywhere else.
  var M = {
    // --hk-glass-plate is the look (hk-settings.js: clear / frosted / blur);
    // unset, the theme's plate, then the literal.
    bg:      'var(--hk-glass-plate, var(--hk-glass-bg, linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.056))))',
    border:  'var(--hk-glass-border, 1px solid rgba(255,255,255,0.13))',
    shSm:    'var(--hk-glass-shadow-sm, 0 8px 22px rgba(0,0,0,0.12))',
    radius:  'var(--hk-glass-radius, 23.5px)',
    well:    'var(--hk-well-bg, rgba(0,0,0,0.14))'
  };
  // A GLASS SURFACE: the material, plus the marker hk-glass.js looks for to
  // cut the shared blur layer to this shape (look.glass = blur). Use it as a
  // whole declaration: `'.x{' + M.glass + ';...}'`. Every surface that is
  // glass should use it, and then joins the look with no other work.
  //
  // ...and its own blur, for the one look that has one: "Blur each card"
  // (look.glass = blur_each) sets --hk-glass-backdrop, and every
  // plate blurs what is behind it -- the way the status chips always have.
  // Unset (every other look), `none`: no layer, no cost. A card configured
  // `glass: false` sets it to none on its host (glassJoin), so a detail
  // sheet's panels, which sit on the sheet's own blur, never add another.
  M.glass = 'background:' + M.bg + ';--hk-glass-surface:1;' +
    'backdrop-filter:var(--hk-glass-backdrop,none);-webkit-backdrop-filter:var(--hk-glass-backdrop,none)';

  // A length option as CSS: numbers are px (`pad_left: 22`), strings pass
  // through (`pad_left: 22px`); null for nothing.
  function px(v) {
    if (v == null || v === '') return null;
    return typeof v === 'number' ? v + 'px' : String(v);
  }
  // The sideways BLEED of a `margin` shorthand: how far its left and right
  // sides pull the box out (positive numbers), or null when neither side is
  // negative or a side is not a plain px length. hk-row-card and
  // hk-grid-card publish this so the phone can clamp it to the gutter.
  function bleedSides(margin) {
    if (margin == null) return null;
    var t = String(margin).trim().split(/\s+/), l, r;
    if (t.length < 1 || t.length > 4) return null;
    r = t.length === 1 ? t[0] : t[1];
    l = t.length === 4 ? t[3] : r;
    var n = function (s) { var m = /^(-?[\d.]+)(px)?$/.exec(s); return m ? parseFloat(m[1]) : NaN; };
    var L = n(l), R = n(r);
    if (isNaN(L) || isNaN(R) || (L >= 0 && R >= 0)) return null;
    return { l: Math.max(0, -L), r: Math.max(0, -R) };
  }

  // TEXT GOING INTO MARKUP: & < > " ' as entities, null and undefined as
  // nothing. Safe in text and inside a quoted attribute.
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // A <div> THAT IS A BUTTON: role, focusable, and a tap or Enter / Space
  // runs `fn`. A tap hands `fn` its click event; the keys call it with none.
  // Returns the element.
  function button(el, fn) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', fn);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
    return el;
  }

  // The first letter capitalised and the rest left alone ("heat cool" ->
  // "Heat cool") -- hk-tile's `sentence` label mode. The word-by-word
  // title-casings (hk-tile's `titled`, the fan label, hk-chip's label_case,
  // hk-control's _pretty, hk-header's titleCase) are different rules.
  function sentenceCase(v) {
    var s = String(v);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------- palette
  // What a colour NAME in a card config means: `icon_color: orange` on a
  // tile, `color: teal` on a control, `colour: blue` on a chart. One table of
  // hues, shared by hk-tile.js, hk-control.js and hk-charts.js.
  //
  // THE DIFFERENCES ARE KEPT, BY NAME, not settled here: each family keeps
  // its own alpha and its own gray, and which is right is a visual call.
  //
  //   icon    glyphs and wells -- hk-tile's NAME_MAP, and every card that
  //           resolves a name through it. Alpha 0.98, gray 0.80, and it also
  //           knows grey, white and black.
  //   accent  hk-control's `color:` (well, slider fill, active segment).
  //           Alpha 0.96, gray 0.85; no grey / white / black, so those three
  //           still reach CSS as keywords.
  //   chart   hk-charts' fills, as the rgb triples it softens. Its gray is
  //           Apple's system gray (142, 142, 147), not the icon gray; no
  //           grey / white / black, so those fall back to orange like any
  //           unknown name.
  var HUE = {
    yellow: [255, 204, 0],   orange: [255, 159, 10], blue:   [86, 189, 228],
    green:  [48, 209, 88],   red:    [255, 69, 58],  purple: [191, 90, 242],
    pink:   [255, 55, 95],   teal:   [64, 200, 224], cyan:   [50, 173, 230],
    brown:  [172, 142, 104], mint:   [99, 230, 226]
  };
  // The alpha is a string, so '0.80' stays '0.80' in the output.
  function paint(alpha, more) {
    var out = {};
    Object.keys(HUE).forEach(function (k) {
      out[k] = 'rgba(' + HUE[k].join(', ') + ', ' + alpha + ')';
    });
    return Object.assign(out, more);
  }
  var PALETTE = {
    icon: paint('0.98', {
      gray:  'rgba(200, 200, 200, 0.80)', grey: 'rgba(200, 200, 200, 0.80)',
      white: 'rgba(255, 255, 255, 0.95)', black: 'rgba(0, 0, 0, 0.95)'
    }),
    accent: paint('0.96', { gray: 'rgba(200, 200, 200, 0.85)' }),
    chart: Object.assign({}, HUE, { gray: [142, 142, 147] })
  };

  // ARTWORK THROUGH HOME ASSISTANT. Almost every album cover
  // Music Assistant names is on Apple's CDN (is1-ssl.mzstatic.com), which a
  // wall tablet without internet cannot reach even with the hosts allowed by name -- the CDN
  // answers each lookup with different addresses. So an image on ANOTHER
  // host is not loaded from there: HK Frontend signs a path to its own
  // /api/hk_frontend/art (art.py), where HA fetches it, scales it to `size`
  // and serves it from the page's own origin -- no internet on the tablet, no
  // mixed content over https. Signing is batched: every tile painted in one
  // task goes in one websocket call. A server without the command (an older
  // HK Frontend) answers with an error, and the tile loads the URL directly.
  var ART_RESIGN_MS = 20 * 3600 * 1000;       // the server signs for 24 h
  var artSigned = new Map();                  // size + ' ' + url -> {path, at}
  var artQueues = {};                         // size -> {waiters: Map, timer}
  function artRemote(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    try { return new URL(url).host !== location.host; } catch (e) { return false; }
  }
  // A SIGNATURE DIES WITH THE HA THAT MADE IT. HA signs
  // with a secret it draws at start-up and never saves, so after a restart
  // every path kept here is a 401 -- for up to ART_RESIGN_MS, on every tile
  // the browser had not already cached -- and each 401 is a line in the ban
  // log. So the cache is forgotten two ways: the socket's `ready` (it came
  // BACK, i.e. HA restarted -- home-assistant-js-websocket fires it on every
  // reconnect) clears it all, and an <img> that errors on a signed path
  // drops its own entry and asks for ONE fresh signature (_artImage).
  //
  // STATES THE NEW SERVER HAS NOT SENT YET. The same
  // `ready` comes before the resubscribe's snapshot, and Home Assistant's
  // websocket client keeps every pre-restart state object until the new
  // server sends that entity again -- for a Protect camera ~12 s later, its
  // entity_picture carrying a token the new HA never issued. HA also rebuilds
  // every card on a reconnect, so each new camera strip would spend one
  // request per camera on a dead token (a ban-log line each) and mount its
  // live tile on a camera HA does not
  // have yet ("Camera not found"). So the objects the page holds at `ready`
  // are marked; whatever the new server sends is a NEW object, so after a
  // mere network blip (everything re-sent at once) nothing is held back.
  var artConn = null, STALE = null, staleEpoch = 0;
  function artWatch(hass) {
    var conn = hass && hass.connection;
    if (!conn || conn === artConn || typeof conn.addEventListener !== 'function') return;
    artConn = conn;
    conn.addEventListener('ready', function () {
      artSigned.clear();
      var h = window.hkCards.hass(), s = h && h.states, set = new WeakSet();
      if (s) for (var k in s) if (s[k] && typeof s[k] === 'object') set.add(s[k]);
      STALE = set;
      staleEpoch++;
    });
  }
  // true while `st` is a state the server that is up now has not sent
  window.hkCards.stale = function (st) { return !!(STALE && st && STALE.has(st)); };
  // 0 until the first reconnect: a card can skip the question entirely
  window.hkCards.staleEpoch = function () { return staleEpoch; };
  function artForget(url, size) { artSigned.delete(size + ' ' + url); }
  function artSign(hass, url, size, cb) {
    artWatch(hass);
    var key = size + ' ' + url, hit = artSigned.get(key);
    if (hit && Date.now() - hit.at < ART_RESIGN_MS) { cb(hit.path); return; }
    if (!hass || !hass.callWS) { cb(url); return; }
    var q = artQueues[size] || (artQueues[size] = { waiters: new Map(), timer: null });
    if (!q.waiters.has(url)) q.waiters.set(url, []);
    q.waiters.get(url).push(cb);
    if (q.timer) return;
    q.timer = setTimeout(function () {
      delete artQueues[size];
      var urls = Array.from(q.waiters.keys());
      if (artSigned.size > 3000) artSigned.clear();
      for (var i = 0; i < urls.length; i += 200) (function (batch) {
        Promise.resolve(hass.callWS({ type: 'hk_frontend/art/sign', urls: batch, size: size }))
          .then(function (res) {
            var got = (res && res.signed) || {};
            batch.forEach(function (u) {
              if (got[u]) artSigned.set(size + ' ' + u, { path: got[u], at: Date.now() });
              q.waiters.get(u).forEach(function (f) { f(got[u] || u); });
            });
          }, function () {
            batch.forEach(function (u) { q.waiters.get(u).forEach(function (f) { f(u); }); });
          });
      })(urls.slice(i, i + 200));
    }, 0);
  }

  // HOW LONG AN ARTWORK URL GETS BEFORE THE PLACEHOLDER WINS. See _artImage.
  //
  // 6 seconds, and the number is bounded on both sides by measurement rather
  // than taste. Below it: the slowest artwork that does load on a home
  // network (measured across a whole library) answers in well under a
  // second. Above it: a wall dashboard that shows a
  // row of empty squares for longer than this reads as broken, and a
  // tablet without internet answers a public CDN with "never" -- the request
  // hangs rather than being refused -- so every millisecond past the point of
  // doubt is a millisecond of looking wrong.
  var ART_TIMEOUT = 6000;

  // The SELECTED plate is a solid white, not glass. That contrast is the whole
  // signal and it is what the Home app does -- glass-on-glass is unreadable at
  // arm's length on a wall.
  var SELECTED_BG   = 'rgba(255, 255, 255, 0.96)';
  var SELECTED_TEXT = 'rgba(0, 0, 0, 0.88)';
  var IDLE_TEXT     = 'rgba(255, 255, 255, 0.86)';

  // ------------------------------------------------------- confirmation
  //
  // `tap_action: {confirmation: {text: ...}}` -- a home battery's circuit
  // switches, say, because flipping the wrong breaker from a wall tablet
  // is not an undo-able mistake.
  //
  // WHY NOT HA's OWN DIALOG. HA confirms through `showConfirmationDialog`,
  // which fires a `show-dialog` event carrying a `dialogImport` closure over
  // an internal frontend module. A custom card cannot produce that closure,
  // and if `dialog-box` happens not to be defined yet the event resolves
  // nothing and the tap silently does nothing at all -- a failure that
  // looks like success.
  //
  // WHY NOT `confirm()`. Fully Kiosk can suppress JS dialogs outright. That
  // turns a guarded switch into either a dead control or an unguarded one,
  // and which of the two you get is a per-tablet setting nothing in this
  // frontend owns.
  //
  // So the sheet is ours: one element, reused, appended to document.body so
  // no card's `overflow:hidden` can clip it. Escape and the backdrop cancel.
  //
  // TWO CHOICES, NOT ONE (opts). A circuit switch asks a
  // yes/no question where "no" means "do nothing", and Cancel says that
  // perfectly. Play Music asks a question where BOTH answers are actions --
  // "start here and stop the other rooms" or "start here and leave them" --
  // and the common answer is the one Cancel would have been. A sheet where
  // the frequent choice is spelled "Cancel" teaches people to dismiss it.
  //
  // opts: { detail, yes, no, onNo }. With no opts this is the plain
  // Cancel/Confirm sheet.
  // Escape and the backdrop always mean "neither" -- that is the only way out
  // once both buttons commit to something.
  var _sheet = null;
  // ------------------------------------------------------- chooseSheet
  //
  // A LIST TO PICK ONE OF, in the same material as confirmSheet below.
  //
  // Built for a pill that stands for several choices: six decade playlists
  // behind one tile rather than six more tiles in a row that already holds
  // five.
  //
  // ITS OWN ELEMENT, not a mode of confirmSheet. They share a look and nothing
  // else -- one asks a yes/no about a sentence, this offers a list -- and
  // folding both into one function would mean every future change to either
  // reasoning about the other. The styling is duplicated deliberately and is
  // ~15 lines; a shared stylesheet for two sheets would be the harder thing to
  // follow.
  //
  // DISMISSABLE THREE WAYS, like confirmSheet: the backdrop, Escape, and a
  // Cancel row. A sheet on a wall tablet with no way out is the dead end this
  // dashboard is built to avoid.
  var _choose = null;
  function chooseSheet(title, options, onPick, opts) {
    opts = opts || {};
    if (!_choose) {
      _choose = document.createElement('div');
      _choose.id = 'hk-choose';
      _choose.innerHTML =
        '<style>' +
        '#hk-choose{position:fixed;inset:0;z-index:9999;display:none;' +
        '  align-items:center;justify-content:center;' +
        '  background:rgba(0,0,0,0.45);font-family:var(--ha-font-family-body,inherit)}' +
        '#hk-choose[data-open]{display:flex}' +
        // --hk-vh: the car's real window height, set only on the zoomed
        // Tesla dashboard (tesla-viewport.js), where 78vh is zoomed too and
        // is ~52% of the screen. Unset everywhere else: plain 100vh.
        '#hk-choose .box{width:340px;max-height:calc(var(--hk-vh, 100vh) * .78);border-radius:16px;' +
        '  overflow:hidden;background:rgba(42,42,44,0.94);' +
        '  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);' +
        '  color:#fff;text-align:center;display:flex;flex-direction:column;' +
        '  box-shadow:0 24px 64px rgba(0,0,0,0.55),0 2px 10px rgba(0,0,0,0.35)}' +
        '#hk-choose .txt{padding:22px 24px 16px;font-size:15px;font-weight:600;' +
        '  line-height:1.35;color:rgba(255,255,255,0.95)}' +
        // The list scrolls if it ever outgrows the sheet; six fit without it.
        '#hk-choose .list{overflow-y:auto;-webkit-overflow-scrolling:touch}' +
        '#hk-choose .opt{appearance:none;border:0;background:none;width:100%;' +
        '  color:#0a84ff;font:inherit;font-size:17px;padding:15px 20px;' +
        '  cursor:pointer;display:block;' +
        '  box-shadow:inset 0 0.5px 0 rgba(255,255,255,0.18)}' +
        '#hk-choose .opt:active{background:rgba(255,255,255,0.08)}' +
        // Cancel is the last row and reads as the way out, not as a seventh
        // decade -- 600 against the options' regular weight, the same device
        // iOS uses to separate a sheet's dismissal from its choices.
        '#hk-choose .cancel{font-weight:600;' +
        '  box-shadow:inset 0 0.5px 0 rgba(255,255,255,0.18)}' +
        '</style>' +
        '<div class="box"><div class="txt"></div>' +
        '<div class="list"></div>' +
        '<button class="opt cancel" data-cancel>Cancel</button></div>';
      document.body.appendChild(_choose);
    }
    var close = function () {
      _choose.removeAttribute('data-open');
      document.removeEventListener('keydown', esc, true);
    };
    var esc = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    _choose.querySelector('.txt').textContent = title || 'Choose';
    _choose.querySelector('[data-cancel]').textContent = opts.cancel || 'Cancel';
    _choose.querySelector('[data-cancel]').onclick = close;
    _choose.onclick = function (e) { if (e.target === _choose) close(); };
    var list = _choose.querySelector('.list');
    list.innerHTML = '';
    (options || []).forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.textContent = o.name;
      b.setAttribute('data-hk-name', o.name);
      b.onclick = function () { close(); onPick(o); };
      list.appendChild(b);
    });
    _choose.setAttribute('data-open', '1');
    document.addEventListener('keydown', esc, true);
    return _choose;
  }

  // NEVER A ONE-TAP TOGGLE: what opens the house, arms or disarms it, or runs
  // the water and the heat. A garage (or gate, or door) cover is a door; a
  // shade is not.
  var NEVER_TOGGLE = { lock: 1, alarm_control_panel: 1, valve: 1, climate: 1, water_heater: 1,
                       siren: 1, vacuum: 1, camera: 1 };
  var DOOR_COVERS = { garage: 1, gate: 1, door: 1 };
  function neverToggles(hass, id) {
    if (!id || typeof id !== 'string') return false;
    var d = id.split('.')[0];
    if (NEVER_TOGGLE[d]) return true;
    if (d !== 'cover') return false;
    var st = hass && hass.states && hass.states[id];
    return !!(st && st.attributes && DOOR_COVERS[st.attributes.device_class]);
  }

  function confirmSheet(text, onOk, opts) {
    opts = opts || {};
    if (!_sheet) {
      _sheet = document.createElement('div');
      _sheet.id = 'hk-confirm';
      _sheet.innerHTML =
        '<style>' +
        '#hk-confirm{position:fixed;inset:0;z-index:9999;display:none;' +
        '  align-items:center;justify-content:center;' +
        '  background:rgba(0,0,0,0.45);font-family:var(--ha-font-family-body,inherit)}' +
        '#hk-confirm[data-open]{display:flex}' +
        // A LIFT, like everything else on these pages: every card, pill and
        // tile carries a shadow, so without one this sheet would read as
        // painted on rather than above. Deeper than a card's
        // `0 6px 18px` because it floats much further off the page.
        // 340px, and the padding below is generous with it: at 270 with 16px
        // sides, "Leave Playing" leaves about 14px each side of its half --
        // which on a wall reads as text that only just fits rather than a
        // deliberate button.
        '#hk-confirm .box{width:340px;border-radius:16px;overflow:hidden;' +
        '  background:rgba(42,42,44,0.94);backdrop-filter:blur(20px);' +
        '  -webkit-backdrop-filter:blur(20px);color:#fff;text-align:center;' +
        '  box-shadow:0 24px 64px rgba(0,0,0,0.55),' +
        '             0 2px 10px rgba(0,0,0,0.35)}' +
        '#hk-confirm .txt{padding:22px 24px 18px;font-size:15px;font-weight:600;' +
        '  line-height:1.35;color:rgba(255,255,255,0.95)}' +
        // A second line for WHAT the question is about -- the rooms and what
        // they are playing. Collapsed to nothing when unused, so a sheet
        // without one is unchanged to the pixel.
        '#hk-confirm .det{display:none;padding:0 24px 20px;font-size:13px;' +
        '  font-weight:500;line-height:1.4;color:rgba(255,255,255,0.62)}' +
        '#hk-confirm .det[data-on]{display:block}' +
        // The title owns the gap when it is alone; when a detail line follows
        // it, the detail owns the bottom and the title gives some back, or
        // the two lines drift apart into separate paragraphs.
        '#hk-confirm .txt + .det[data-on]{margin-top:-8px}' +
        // THE ROW STAYS FULL-BLEED, with the hairline divider. Inset button
        // plates stop the sheet reading as the system alert it is copied
        // from. The margin is bought with the box WIDTH instead: the labels are
        // centred in their halves, so a wider sheet gives them more air
        // without changing what the sheet is.
        '#hk-confirm .row{display:grid;grid-template-columns:1fr 1fr;' +
        '  border-top:0.5px solid rgba(255,255,255,0.18)}' +
        '#hk-confirm button{appearance:none;border:0;background:none;color:#0a84ff;' +
        '  font-family:inherit;font-size:17px;padding:14px 12px;cursor:pointer;' +
        '  white-space:nowrap}' +
        // NO BOLD ON EITHER BUTTON. The iOS convention emboldens the
        // default, and on a two-action pair that quietly recommends one half
        // -- often the destructive one. The divider separates them and the
        // words say what they do, so both buttons are one weight everywhere
        // and nothing is being recommended by typography.
        '#hk-confirm button + button{border-left:0.5px solid rgba(255,255,255,0.18)}' +
        '</style>' +
        '<div class="box" role="alertdialog" aria-modal="true">' +
        '<div class="txt"></div><div class="det"></div>' +
        '<div class="row"><button data-no>Cancel</button>' +
        '<button data-yes>Confirm</button></div></div>';
      document.body.appendChild(_sheet);
    }
    var close = function () {
      _sheet.removeAttribute('data-open');
      document.removeEventListener('keydown', esc, true);
    };
    var esc = function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    // Rebound every time: the handler closes over THIS call's onOk.
    _sheet.querySelector('[data-no]').onclick = function () {
      close();
      if (opts.onNo) opts.onNo();
    };
    _sheet.querySelector('[data-yes]').onclick = function () { close(); onOk(); };
    // Only the backdrop itself, never a click that bubbled out of the box.
    _sheet.onclick = function (e) { if (e.target === _sheet) close(); };
    _sheet.querySelector('.txt').textContent = text || 'Are you sure?';
    _sheet.querySelector('[data-no]').textContent = opts.no || 'Cancel';
    _sheet.querySelector('[data-yes]').textContent = opts.yes || 'Confirm';
    var det = _sheet.querySelector('.det');
    det.textContent = opts.detail || '';
    if (opts.detail) det.setAttribute('data-on', '1');
    else det.removeAttribute('data-on');
    _sheet.setAttribute('data-open', '1');
    document.addEventListener('keydown', esc, true);
    return _sheet;
  }

  // ------------------------------------------------ the snapshot cache
  //
  // PAINT THE LAST FRAME WE SAW, INSTANTLY, while the fresh one is fetched.
  //
  // MEASURED: a strip's nine tiles fill in
  // between 463ms and 2427ms from a cold load, and the cameras page's stills
  // take 1.6-3.1s EACH. That is not this code -- it is how long UniFi Protect
  // takes to produce a snapshot, measured straight off /api/camera_proxy. No
  // amount of loading earlier makes Protect answer faster, so the only way to
  // have something on screen at 0ms is to already have it.
  //
  // A THUMBNAIL, NOT THE FRAME. 160px wide at JPEG q0.5 is ~4KB against the
  // real still's ~34KB, so all nine fit in ~40KB of localStorage instead of
  // ~400. It is soft, and it should be: it is a placeholder that gets replaced
  // within a couple of seconds, and it must not be mistakable for live.
  //
  // THE AGE LABEL IS WHAT KEEPS IT HONEST. A cached frame restores the slot's
  // `at` timestamp too, so a tile painted from cache reads "4m" or "2h" until
  // the fresh one lands and resets it to "now". Showing an old picture with no
  // label would be worse than showing black.
  //
  // Every access is wrapped: localStorage throws outright in some contexts
  // (private windows, a browser set to block site data, thumbnail capture),
  // and a camera strip must not take the page down with it.
  var SNAP_KEY = 'hk-snap-v1';
  // 160, and the softness is WANTED. 320 would spare the cameras page's
  // 399x224 tiles a 2.5x upscale, but the soft frame is better: it reads as
  // a visual identifier of which
  // camera is which while the real one loads, and cannot be mistaken for live.
  // Nine cameras measure 37,643 bytes at 160 against 115,067 at 320.
  var SNAP_W = 160;              // thumbnail width; height follows the aspect
  var SNAP_MIN_GAP = 5 * 60 * 1000;   // write at most this often per camera

  // HOW STALE A CACHED FRAME MAY BE BEFORE IT IS A LIE.
  //
  // The strip can show an old frame safely because it draws an AGE LABEL over
  // every tile -- "1m", "2h" -- so nothing is presented as live that is not.
  // The cameras page has no such label, and a picture of the front door from
  // three hours ago shown as if it were live is worse than a black tile for
  // the second it takes the stream to start. This is a security surface.
  //
  // So the page only uses a cached frame while it is FRESH, which in practice
  // means "the dashboard was on screen a moment ago" -- exactly the case where
  // the wait is most annoying. Past that it gets HA's own poster and black,
  // as it would with no cache at all.
  var SNAP_FRESH = 2 * 60 * 1000;

  function snapCacheAll() {
    try {
      return JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {};
    } catch (e) { return {}; }
  }

  // `maxAge` is opt-in: the strip passes nothing (any age will do, the label
  // tells the truth) and the cameras page passes SNAP_FRESH.
  function snapCacheGet(entity, maxAge) {
    var all = snapCacheAll();
    var hit = all[entity];
    if (!hit || !hit.d) return null;
    if (maxAge && (Date.now() - hit.t) > maxAge) return null;
    return hit;
  }

  // Called from a successful load. Cheap on the common path: it reads the map,
  // sees a recent entry and returns before touching a canvas.
  function snapCachePut(entity, img) {
    try {
      var all = snapCacheAll();
      var prev = all[entity];
      if (prev && (Date.now() - prev.t) < SNAP_MIN_GAP) return;
      if (!img.naturalWidth) return;
      var h = Math.max(1, Math.round(SNAP_W * img.naturalHeight / img.naturalWidth));
      var cv = document.createElement('canvas');
      cv.width = SNAP_W; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, SNAP_W, h);
      // SAME ORIGIN, so the canvas is not tainted: camera_proxy is served by
      // HA itself. A cross-origin still would throw here and be swallowed.
      all[entity] = { d: cv.toDataURL('image/jpeg', 0.5), t: Date.now() };
      localStorage.setItem(SNAP_KEY, JSON.stringify(all));
    } catch (e) {
      // Quota, a tainted canvas, or no storage at all. The strip works
      // without the cache; it just starts black again.
    }
  }

  var BASE_CSS = [
    // Every hk card clears the WebView tap highlight itself too, rather than
    // relying on an ancestor HA happens to style (see hk-popup.js).
    ':host{display:block;-webkit-tap-highlight-color:transparent}',
    // Font is inherited from the theme's --ha-font-family-body, which crosses
    // shadow boundaries -- which is how every card gets SF Pro for free.
    '*{box-sizing:border-box;font-family:inherit}',
    // BEHIND THE PHOTO SCREENSAVER every animation in a card holds still: a
    // fan's spinning glyph, a pulse, a scrolling label. Nothing can be seen or
    // touched behind WallPanel, and on a wall tablet's Android WebView ANY
    // running animation keeps the page drawing a frame per screen refresh --
    // the fan glyphs alone were 30-50% of a core on an otherwise idle tablet
    // (measured 2026-09-29). hk-sky marks the cards (hk-asleep, below); they
    // resume where they were the moment the photos go. NOT the music progress
    // bar: it is a CSS animation started at the song's position, so pausing it
    // would leave it behind the song after the wake.
    ':host([hk-asleep]) *:not(.prog-fill){animation-play-state:paused!important}',

    // ---- the 40px selectable pill ----------------------------------------
    '.pill{height:40px;border-radius:20px;padding:0 14px;margin:0;',
    '  display:grid;grid-template-columns:minmax(0,1fr);align-content:center;',
    '  ' + M.glass + ';border:' + M.border + ';',
    '  box-shadow:0 6px 18px rgba(0,0,0,0.10);',
    '  cursor:pointer;user-select:none;',
    '  transition:background-color .22s ease, transform .12s ease}',
    '.pill:active{transform:scale(0.96)}',
    '.pill > span{justify-self:center;font-size:13.5px;font-weight:600;',
    '  letter-spacing:-0.1px;white-space:nowrap;overflow:hidden;',
    '  text-overflow:ellipsis;color:' + IDLE_TEXT + ';transition:color .22s ease}',
    '.pill[aria-pressed="true"]{background:' + SELECTED_BG + '}',
    '.pill[aria-pressed="true"] > span{color:' + SELECTED_TEXT + '}',

    // ---- the 70px action tile --------------------------------------------
    // --hk-pill: 192 everywhere but an iPad held upright (css/hk-responsive.css).
    '.tile{height:70px;width:var(--hk-pill,192px);min-width:var(--hk-pill,192px);max-width:var(--hk-pill,192px);',
    '  border-radius:' + M.radius + ';padding:10.7px 12.8px 10.7px 10.3px;margin:0;',
    '  ' + M.glass + ';border:' + M.border + ';box-shadow:' + M.shSm + ';',
    '  display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;',
    '  align-items:center;align-content:center;cursor:pointer;user-select:none;',
    '  transition:transform .12s ease}',
    '.tile:active{transform:scale(0.97)}',
    // Matches .start on the timer keypad. Set while a submission is in flight
    // so the tile reads as inert rather than as tappable-and-ignored.
    '.tile[aria-disabled="true"]{opacity:0.45;pointer-events:none}',
    '.tile .well{width:42px;height:42px;border-radius:50%;background:' + M.well + ';',
    '  display:flex;align-items:center;justify-content:center;align-self:center;justify-self:center}',
    // display:flex, so the glyph sits in the middle of its circle, on
    // EVERY tile.
    //
    // ha-icon renders its glyph as an INLINE-level child, so it is placed on
    // a baseline inside a line box built from the inherited line-height
    // (22.4px) against a 23px icon -- and the half-leading pushes it down.
    // The well is already a flex box and centres the ha-icon perfectly; it
    // is the next level down that drifts.
    //
    // Without it, measured on six category pills, the glyph sits
    // consistently 0.81px BELOW the circle's centre. Small, and on a wall tablet at
    // dPR 1.5-2.0 that is 1.2-1.6 device pixels of a 42px circle -- which
    // is exactly the kind of thing that reads as "slightly wrong" without
    // being nameable.
    //
    // Same family as the 5px offset that made the speaker pills' play glyph
    // sit low (see hk-media.js _pill, which solved it by dropping ha-icon
    // for an inline <svg>). Making the ha-icon a flex container removes
    // baseline alignment entirely, which is the cause rather than the
    // symptom -- a -0.81px nudge would be a number nobody could justify
    // later.
    '.tile .well ha-icon{--mdc-icon-size:23px;width:23px;height:23px;',
    '  display:flex;align-items:center;justify-content:center}',
    '.tile .txt{justify-self:stretch;text-align:left;align-self:center;',
    '  font-weight:600;font-size:15px;line-height:1.1;letter-spacing:-0.23px;',
    '  color:rgba(255,255,255,0.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

    // ---- action status line (see _setStatus, below) ----------------------
    //
    // ONE ROW, IN THE FLOW, RESERVED WHETHER OR NOT IT SAYS ANYTHING. It is
    // not a toast and not an overlay: a toast on a wall tablet is read by
    // nobody, because the person who pressed the key has already looked up at
    // the room. Holding the row means the card does not resize when a message
    // arrives, which is what would actually pull the eye back to it.
    //
    // The four kinds are deliberately not four colours of "error". `sent` and
    // `warn` are the pair that matters: see the comment on _setStatus.
    '.hk-status{min-height:20px;margin:0 4px 10px 4px;font-size:13.5px;',
    '  font-weight:600;letter-spacing:-0.1px;line-height:20px;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    '  color:transparent;transition:color .18s ease}',
    '.hk-status[data-kind="pending"]{color:rgba(255,255,255,0.55)}',
    '.hk-status[data-kind="sent"]{color:rgba(255,255,255,0.72)}',
    '.hk-status[data-kind="warn"]{color:var(--hk-warn, #FFB340)}',
    '.hk-status[data-kind="failed"]{color:var(--hk-fail, #FF6961)}',
    '@media (prefers-reduced-motion: reduce){.hk-status{transition:none}}',

    // ---- section heading (transcribed from hk_section_heading) -----------
    '.head{font-size:22px;font-weight:700;letter-spacing:-0.4px;',
    '  color:rgba(255,255,255,0.95);padding:0 4px 10px 4px}',

    '@media (prefers-reduced-motion: reduce){',
    '  .pill,.pill:active,.pill > span,.tile,.tile:active{transition:none;transform:none}}',
    // ================================================ PHONE: FILL THE TRACK
    // Below 640px the room grids switch to `repeat(auto-fill, minmax(168px,
    // 1fr))` (see frontend/css/hk-responsive.css), so the track is no longer
    // 192px and a pill pinned to 192px would overflow it. Here the pill fills
    // whatever track it is given instead.
    //
    // WHY `calc(100% + 8px)` AND NOT `100%`: layout-card gives every grid child
    // 4px side margins, so the cell is always 8px narrower than the track
    // (layout-card's card_margin cannot change it). At 1280 the pill is 192px in a 184px
    // cell -- it already overflows by exactly 8px, and that is what makes the
    // visible gap come out at the intended 12px. Plain `100%` would shrink
    // every pill to the cell and change the gap.
    //
    // `--hk-cell-bleed` exists because that 8px is NOT universal: inside
    // hk-row-card the child is sized directly with no layout-card margin, so
    // that card sets the bleed to 0 for its own children. Default 8px = the
    // grid case.
    //
    // No max-width: capping at 192px makes the track wider than the pill on a
    // large phone and the gap jumps 12px -> 25px. Verified 375/402/440/1280.
    '@media (max-width: 640px){',
    // NO `:host{width:100%}` HERE. These hosts are already `display:block`, so
    // an auto width fills the grid area MINUS the 4px side margins layout-card
    // gives every child -- which is exactly the 184px cell the 192px pill is
    // built to overflow by 8. Forcing width:100% resolves against the full
    // grid AREA instead and every tile comes out 8px too wide (190.95 measured
    // against a 182.95 track), eating the 12px gap down to 4px.
    '  :host{max-width:none !important}',
    '  .tile{width:calc(100% + var(--hk-cell-bleed, 8px));min-width:0;max-width:none}',
    '}',
  ].join('');

  // ------------------------------------------------------------------ base
  // The three methods Lovelace actually requires. Nothing here reaches into
  // HA internals -- that is the whole reason a card like this ages well while
  // hk-icons.js (which pokes ha-icon._legacy) needs watching.
  // ONE STYLESHEET PER CLASS, NOT PER INSTANCE.
  //
  // A <style> element per card is fine for a handful of cards and wrong at
  // the scale the card library reaches: one home view can hold 300 cards,
  // and that is 300 copies of the same CSS to parse and hold.
  //
  // hasOwnProperty, not a plain lookup: static properties are INHERITED, so a
  // subclass would otherwise find HkBase's sheet and every card in the file
  // would share the base's CSS with none of its own.
  function sheetFor(ctor) {
    if (!Object.prototype.hasOwnProperty.call(ctor, '_hkSheet')) {
      var sheet = null;
      try {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(BASE_CSS + (ctor.CSS || ''));
      } catch (e) {
        sheet = null;              // older engine -> <style> fallback below
      }
      ctor._hkSheet = sheet;
    }
    return ctor._hkSheet;
  }

  // ------------------------------------------------------------ MODULE WAKE
  // The card files and the modules they call (hk-tile's palette, hkChart,
  // hkStats, hkTimers, hkHeader) load in parallel, in no fixed order. A card
  // that draws before a module has run draws a fallback -- raw CSS colours, an
  // empty chart, no countdowns -- and the re-render gate then keeps that frame,
  // because no ENTITY changed -- a chip that stays wrong until a reload.
  //
  // Each module announces itself with `hk-module-ready` once its global is set.
  // That bumps GEN, which every card's gate compares, and redraws every live
  // card now. So "which modules are loaded" is an input to every card like any
  // entity, and a card is redrawn when that input changes -- not on a timer and
  // not on the hope that some unrelated state changes soon. A card on a cached,
  // detached view catches up on its next hass, because its _hkGen is behind.
  var GEN = { n: 0 };
  var LIVE = [];
  function track(el) {
    if (el._hkTracked || typeof WeakRef !== 'function') return;
    el._hkTracked = true;
    LIVE.push(new WeakRef(el));
  }
  window.addEventListener('hk-module-ready', function () {
    GEN.n++;
    LIVE = LIVE.filter(function (r) { return !!r.deref(); });
    LIVE.forEach(function (r) {
      var el = r.deref();
      if (el && el.isConnected && el._config && el._hass) {
        try { el.requestUpdate(); } catch (e) { console.error('[hk-cards] wake', e); }
      }
    });
  });

  // THE SHARED BLUR'S MEMBERS (look.glass = blur; modules/hk-glass.js). A card
  // joins while it is on the page, unless its config says `glass: false`.
  // The set is global because hk-glass.js may load before or after this file.
  var GLASS = window.__hkGlassCards = window.__hkGlassCards || new Set();

  // THE CARDS ON THE PAGE, for the screensaver pause (BASE_CSS, hk-asleep).
  // hk-sky knows when the tablet's screensaver is up; it sets
  // window.__hkAsleep and fires `hk-asleep` on window whenever that changes,
  // whichever of the two files loaded first. A card joining while asleep is
  // marked at once.
  var ON_PAGE = window.__hkCardsOnPage = window.__hkCardsOnPage || new Set();
  function markAsleep(card) {
    // Touch the attribute only when it changes: nearly every card joins awake.
    var on = !!window.__hkAsleep;
    if (on === !!card._hkAsleep) return;
    card._hkAsleep = on;
    if (on) card.setAttribute('hk-asleep', ''); else card.removeAttribute('hk-asleep');
  }
  window.addEventListener('hk-asleep', function () { ON_PAGE.forEach(markAsleep); });
  function glassJoin(card, on) {
    var off = !!(card._config && card._config.glass === false);
    // Out of "Blur each card" too, and everything inside it (the variable
    // inherits into child cards' shadow roots).
    if (card.style) {
      if (off) card.style.setProperty('--hk-glass-backdrop', 'none');
      else if (card.style.getPropertyValue('--hk-glass-backdrop')) card.style.removeProperty('--hk-glass-backdrop');
    }
    var join = on && !off;
    if (join === GLASS.has(card)) return;
    if (join) GLASS.add(card); else GLASS.delete(card);
    // The card goes along: on a fresh page load hk-glass holds the first view
    // unpainted until its frost is placed, and this join is how it learns of
    // the view before the view's first paint.
    if (window.hkGlass) window.hkGlass.changed(card, join);
  }

  // THE HASS HUB: the newest hass object any card was handed,
  // for things that are not cards and so are never handed one -- the detail
  // sheets (hk-detail.js) live outside the dashboard and still need every
  // state change. The frontend passes every card the SAME object per update,
  // so this is one identity compare per card per update, and the listeners
  // run once per new object, not once per card.
  var HUB = { last: null, fns: new Set() };
  function hubSeen(h) {
    if (!h || h === HUB.last) return;
    HUB.last = h;
    artWatch(h);                   // the reconnect hook (above), from the first hass
    HUB.fns.forEach(function (fn) {
      try { fn(h); } catch (e) { console.error('[hk-cards] hass listener', e); }
    });
  }
  // for a card whose own `set hass` does not call HkBase's (hk-camera-mosaic-card)
  window.hkCards.seen = hubSeen;
  window.hkCards.onHass = function (fn) {
    HUB.fns.add(fn);
    return function () { HUB.fns.delete(fn); };
  };
  // THE ROOT ELEMENT FIRST. The hub is only as fresh as the hk cards on the
  // screen: on a view or dashboard with none (Home Assistant's own cards) it
  // keeps whatever the last hk card saw -- a sheet opened there can be 70 s
  // stale and never move. <home-assistant>
  // holds the frontend's current object always; the hub is the fallback for
  // a page without one (the test harness).
  window.hkCards.hass = function () {
    var ha = document.querySelector && document.querySelector('home-assistant');
    return (ha && ha.hass) || HUB.last;
  };

  class HkBase extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      var sheet = sheetFor(this.constructor);
      if (sheet && this.shadowRoot.adoptedStyleSheets) {
        this.shadowRoot.adoptedStyleSheets = [sheet];
      } else {
        // Kept so a browser without constructable stylesheets still renders.
        this._style = document.createElement('style');
        this._style.textContent = BASE_CSS + (this.constructor.CSS || '');
        this.shadowRoot.append(this._style);
      }
      this._root = document.createElement('div');
      this.shadowRoot.append(this._root);
      this._hass = null;
      this._hkSig = null;
    }

    setConfig(config) {
      this._config = Object.assign({}, config);
      this._hkSig = null;                        // config change always redraws
      // ...and REBUILDS. Most cards build their DOM once, behind `_built`, from
      // the config they had then (a heading's link, a key's style, an info
      // block's type). The card editor's preview calls setConfig on the SAME
      // element for every edit, so without this the preview would keep the
      // first config's structure and the editor would look broken until a reload.
      // tests/render-audit's reconfig check holds every card to it.
      this._built = false;
      this._onConfig && this._onConfig();
      this._render();
      if (this.isConnected) glassJoin(this, true);   // `glass: false` may have changed
    }

    // RE-RENDER GATING, IN THE BASE CLASS, BY DEFAULT.
    //
    // `set hass(h) { this._hass = h; this._render(); }` would render on
    // EVERY state change in the house. MEASURED on a wall tablet: the
    // frontend hands a card a new hass object ~12x a second, and about 1% of
    // those change what a given card shows. Rendering on all of them is ~90x
    // the work, so a card without gating makes the tablets
    // SLOWER. That is why this lives here and not in each card: it has to be
    // the default, not something every new card remembers.
    //
    // _hkSig, not _sig: HkTimersCard already keeps its own _sig inside
    // _render(), and the two must not collide.
    set hass(h) {
      this._hass = h;
      hubSeen(h);
      track(this);
      var sig = this._sigOf();
      if (sig !== null && sig === this._hkSig && this._hkGen === GEN.n) return;
      this._hkSig = sig;
      this._hkGen = GEN.n;
      this._render();
    }
    get hass() { return this._hass; }

    // Default signature: the last_updated of every entity the config names.
    // last_updated moves when the state OR any attribute changes, which is
    // exactly "this entity's data is different", and nothing else.
    //
    // Returning NULL means "always render" and is the safe answer when the
    // dependencies cannot be inferred -- the correct behaviour for
    // any card that does not declare its entities. Override in a card that
    // reads entities the config does not list.
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      var ids = [];
      if (c.entity) ids.push(c.entity);
      if (Array.isArray(c.entities)) {
        c.entities.forEach(function (e) {
          ids.push(typeof e === 'string' ? e : (e && e.entity));
        });
      }
      // `group:` -- a tile that stands for several entities (the average
      // brightness of two lights, the count on in a bathroom). Declared here
      // so EVERY card gets the wake for free: a group tile whose members were
      // not in the signature renders once and then freezes -- the same trap as
      // the chips'.
      if (Array.isArray(c.group)) ids = ids.concat(c.group);
      if (!ids.length) return null;
      var out = '';
      for (var i = 0; i < ids.length; i++) {
        var st = ids[i] && h.states[ids[i]];
        out += (ids[i] || '') + '=' + (st ? st.last_updated : 'x') + ';';
      }
      return out;
    }

    // THE hk-stats.js / hk-charts.js WAKE BRIDGE.
    //
    // Those modules resolve their history fetches asynchronously and then call
    // `card.requestUpdate()` to redraw whatever was waiting on the data. That
    // is a LitElement API; these cards are not Lit, so without this a card
    // that asks for statistics renders once with no data and NEVER updates --
    // the data arrives in ~100ms and then sits in the cache unread.
    //
    // It draws NOW rather than waiting for the gate, which would decide
    // nothing had changed (the ENTITY did not change -- the fetch completed)
    // and drop the render. Arguments are ignored; the bridge passes a property
    // name only because a Lit card's requestUpdate takes one.
    requestUpdate() { this.redraw(); }

    // REDRAW NOW, for a change the states do not show: data that arrived (a
    // channel list, artwork, a module), a choice made on the card. It draws,
    // and remembers the signature it drew at. Clearing _hkSig and calling
    // _render() instead drew the card AGAIN on the next push that changed
    // nothing -- a whole second build of the Live TV guide after every
    // channel fetch (the render audit's churn check, 2026-09-29).
    redraw() {
      this._hkSig = this._hass ? this._sigOf() : null;
      this._hkGen = GEN.n;
      this._render();
    }

    // ---------------------------------------------------------- actions
    //
    // THE CARD'S TAP AND THE ICON'S TAP ARE DIFFERENT ACTIONS, and they live
    // in the base class so no card loses the distinction: on the wall the
    // glyph toggles and the name opens detail. Collapsing that into one makes
    // every light more-info only -- no style changes, and the lights stop
    // turning on when tapped. A computed-style check cannot see behaviour; it
    // has to be carried on purpose.
    //
    // NO CARD HAS A HOLD: a long press falls through to the click and does
    // what a tap does.
    //
    // `defaultMoreInfo` is what an ABSENT action means: a card's own tap
    // opens detail, an inner element's tap does nothing unless configured.
    _bind(el, tapKey) {
      var self = this;
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        self._act((self._config || {})[tapKey], tapKey === 'tap_action');
      });
    }

    _act(spec, defaultMoreInfo) {
      var cfg = this._config || {};
      if (!spec && !defaultMoreInfo) return;
      spec = spec || { action: 'more-info' };
      var action = spec.action;
      if (action === 'none') return;
      // A door, the alarm, the water or the heat is NEVER one tap: whatever a
      // card's config says, `toggle` on one of these opens its detail instead
      // (homeassistant.toggle on a lock UNLOCKS it).
      if (action === 'toggle' && neverToggles(this._hass, cfg.entity)) {
        spec = { action: 'more-info' };
        action = 'more-info';
      }
      // Ask first, then run the SAME path -- `_confirmed` is the only thing
      // that differs on the second pass, so there is no duplicate action code
      // to drift out of step with the guarded one.
      if (spec.confirmation && !spec._hkConfirmed) {
        var self = this;
        var again = Object.assign({}, spec, { _hkConfirmed: true });
        confirmSheet(spec.confirmation.text, function () {
          self._act(again, defaultMoreInfo);
        });
        return;
      }
      if (action === 'toggle') {
        this._call('homeassistant', 'toggle', { entity_id: cfg.entity });
        return;
      }
      if (action === 'navigate' && spec.navigation_path) {
        var p = spec.navigation_path;
        var seg = String(location.pathname).split('/')[1];
        // navigation_path_map: a dashboard where "./x" is the wrong answer
        // -- say, an energy dashboard whose battery page is a separate
        // dashboard of its own. Keyed on the url_path segment, so
        // the exception is data rather than a branch in every call site.
        var map = spec.navigation_path_map;
        if (map && Object.prototype.hasOwnProperty.call(map, seg)) {
          p = map[seg];
        }
        // "./x" is relative to the CURRENT dashboard, which is how one shared
        // config navigates correctly on every dashboard.
        if (p.slice(0, 2) === './') {
          p = '/' + seg + '/' + p.slice(2);
        }
        history.pushState(null, '', p);
        window.dispatchEvent(new CustomEvent('location-changed'));
        return;
      }
      // `url` is rare, and falling through to more-info would be the wrong
      // page rather than a visible error.
      // A NEW TAB, not this one. An Apple Music tile opens a player
      // page and the dashboard has to still be there behind it -- navigating
      // in place strands a wall tablet on a page with no way back.
      if (action === 'url' && spec.url_path) {
        window.open(spec.url_path, spec.target || '_blank');
        return;
      }
      if (action === 'call-service' || action === 'perform-action') {
        var svc = spec.service || spec.perform_action || '';
        // A `[[[ ]]]` service name is a button-card template these cards do not
        // evaluate. Falling through the split() below would do NOTHING at
        // all -- a tile dead on tap. Fail loudly instead.
        if (svc.indexOf('[[[') !== -1) {
          console.error('hk-card: service is a button-card JS template, which ' +
                        'this card cannot evaluate:', svc, this._config);
          return;
        }
        var parts = svc.split('.');
        if (parts.length === 2) {
          var data = Object.assign({}, spec.data || {}, spec.target || {});
          this._call(parts[0], parts[1], data);
        }
        return;
      }
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        bubbles: true, composed: true, detail: { entityId: cfg.entity }
      }));
    }

    getCardSize() { return 3; }

    // EVERY SERVICE CALL GOES THROUGH HERE. `this._hass.callService(...)`
    // written as a statement drops the promise it returns on the floor: a
    // call that REJECTS -- a dropped socket on a tablet's wifi, a script
    // renamed out from under a tile, bad variables, an exception inside the
    // script -- does nothing at all. No log, no UI change. The tap looks like
    // it worked and did not.
    //
    // Silent failure is the pattern worth killing, not any one instance of it.
    //
    // Returns the promise, so a caller that needs to know -- the timer keypad
    // and the area picker both do, so as not to throw away the user's
    // input before finding out -- can attach to it. A caller that does not
    // need to know can ignore it and still gets the logging.
    //
    // NOTE WHAT THIS DOES NOT PROMISE. Resolving means Home Assistant ACCEPTED
    // the call, not that the device did anything. For `script.turn_on` it does
    // not even mean the script finished -- that returns as soon as the script
    // starts. Proving a device acted needs the entity state afterwards and is
    // deliberately not attempted here.
    _call(domain, service, data) {
      if (!this._hass || !this._hass.callService) return Promise.resolve();
      var p;
      try {
        p = this._hass.callService(domain, service, data);
      } catch (e) {
        p = Promise.reject(e);
      }
      // RESOLVES WITH A BOOLEAN AND NEVER REJECTS. Rethrowing is the natural
      // shape -- and it would make every fire-and-forget call site a
      // potential unhandled rejection that each has to remember to .catch().
      // Getting that wrong would swap one silent failure for a noisier one.
      // `true` means accepted, `false` means
      // it did not go; a caller that ignores the result still gets the log.
      return Promise.resolve(p).then(function () { return true; }, function (err) {
        console.error('hk-card: ' + domain + '.' + service + ' failed', data, err);
        return false;
      });
    }

    // _call, BUT KEEPING THE ERROR: {ok, error}. For a service that returns no
    // response yet can refuse -- an alarm panel rejecting a code -- where the
    // caller needs to know WHY it did not go.
    _callErr(domain, service, data) {
      if (!this._hass || !this._hass.callService) {
        return Promise.resolve({ ok: false, error: 'not connected' });
      }
      var p;
      try {
        // notifyOnError false: the caller shows the refusal itself (the
        // keypad's "Wrong code"); HA's toast on top of it would say it twice.
        p = this._hass.callService(domain, service, data, undefined, false);
      } catch (e) {
        p = Promise.reject(e);
      }
      return Promise.resolve(p).then(function () { return { ok: true }; }, function (err) {
        console.error('hk-card: ' + domain + '.' + service + ' failed', data, err);
        return { ok: false, error: (err && (err.message || err.code)) || String(err) };
      });
    }

    // _call, BUT WAITING FOR THE ANSWER. A script called directly
    // -- `script.x`, not `script.turn_on` -- runs to the end before the call
    // returns, and one that ends in `stop: ... response_variable:` hands that
    // variable back. That is how a music request reports its outcome to the
    // screen that made it: non-admin users (every wall tablet) may not
    // subscribe to custom events, but they may read a service response.
    //
    // THIS ONLY WORKS ON A BLOCKING CALL. `script.turn_on` returns the moment
    // the script starts and can carry no response; the script must be called
    // as its own action (script.quick_timer_create, not script.turn_on with an
    // entity_id) so HA waits for it and collects what it returned.
    //
    // Same contract as _call: never rejects. {ok, response, error}, where
    // `response` is {} when the call went but answered nothing (an older HA,
    // or a script with no response) -- "accepted, outcome unknown".
    _callResp(domain, service, data) {
      if (!this._hass || !this._hass.callService) {
        return Promise.resolve({ ok: false, error: 'not connected' });
      }
      var p;
      try {
        // The 6th argument is returnResponse. The 4th (target) is undefined:
        // `data` already carries it. The 5th (notifyOnError) is FALSE -- HA's
        // own error toast is the wrong surface here, the card shows the
        // failure itself.
        p = this._hass.callService(domain, service, data, undefined, false, true);
      } catch (e) {
        p = Promise.reject(e);
      }
      return Promise.resolve(p).then(function (res) {
        return { ok: true, response: (res && res.response) || {} };
      }, function (err) {
        console.error('hk-card: ' + domain + '.' + service + ' failed', data, err);
        return { ok: false, error: (err && (err.message || err.code)) || String(err) };
      });
    }

    // ------------------------------------------------- ARTWORK THAT MAY NEVER ANSWER
    //
    // `img.onerror` DOES NOT FIRE WHEN A HOST SIMPLY DOES NOT REPLY, and a
    // wall tablet with no internet meets exactly that on album art.
    //
    // Music Assistant hands out artwork as the PROVIDER's own url -- measured
    // across one large library, over 90% of them are
    // is1-ssl.mzstatic.com (Apple's CDN), a few r2.theaudiodb.com, and the
    // rest Music Assistant's own :8095 proxy. From a tablet with no route
    // to the public internet, Apple and
    // TheAudioDB both HANG -- no response, no refusal, no error event -- while
    // Home Assistant and MA's own :8095 answer fine.
    //
    // A dropped packet is not a failed load. The <img> sits there pending
    // forever, `error` never fires, and the placeholder the card carefully
    // installed in its error handler is never reached. Every tile stays an
    // empty grey square, permanently, with nothing anywhere saying why -- and
    // it looks perfect in Chrome on a machine that HAS internet.
    //
    // So a timeout, which is the only thing that can tell those two apart from
    // in here. The rule: no transient state may last
    // forever. This one resolves within ART_TIMEOUT either way.
    //
    // CANCELLED BY CLEARING src. Without that the request stays outstanding on
    // a page that may draw two hundred of these, and a scroll through the
    // library would leave the connection pool full of sockets waiting on a
    // host that is never going to speak.
    // `size` is the pixels the tile draws at; HA scales to it (art.py).
    _artImage(url, box, iconHtml, size) {
      var img = document.createElement('img');
      var done = false;
      var fail = function () {
        if (done) return;
        done = true;
        clearTimeout(t);
        // Stop the pending request before replacing the node it belongs to.
        try { img.src = ''; } catch (e) { /* not worth failing a paint over */ }
        box.innerHTML = iconHtml;
      };
      var t = setTimeout(function () {
        // `complete && naturalWidth` is the one honest test for "it arrived":
        // `complete` alone is also true for an image that failed.
        if (img.complete && img.naturalWidth > 0) { done = true; return; }
        fail();
      }, ART_TIMEOUT);
      img.addEventListener('load', function () { done = true; clearTimeout(t); });
      // A SIGNED PATH THAT ERRORS GETS ONE FRESH SIGNATURE (see artWatch):
      // after a restart the kept path is a 401, and a new one is the cure.
      // Once only -- `resigned` -- so an image that is simply missing costs
      // one extra request, never a loop; the second error is the placeholder.
      var self = this, sz = size || 300, signed = false, resigned = false;
      var put = function (p) { if (!done) { signed = p !== url; img.src = p; } };
      img.addEventListener('error', function () {
        if (signed && !resigned && !done) {
          resigned = true;
          artForget(url, sz);
          artSign(self._hass, url, sz, put);
          return;
        }
        fail();
      });
      img.alt = '';
      if (artRemote(url)) artSign(this._hass, url, sz, put);
      else img.src = url;
      box.appendChild(img);
      return img;
    }

    // ------------------------------------------------- ACTION FEEDBACK
    //
    // For the FORM-STYLE cards only -- the ones where you enter something and
    // then press a button: the timer keypad, the vacuum area picker. A tile
    // that toggles a lamp needs none of this; the lamp is the feedback, and
    // adding a status line to 300 tiles would be noise, not information.
    //
    // FOUR STATES, AND THE MIDDLE PAIR IS THE WHOLE POINT:
    //
    //   pending   the call is out, the button is inert
    //   sent      Home Assistant ACCEPTED it
    //   warn      accepted, and then the OUTCOME came back negative
    //   failed    dispatch rejected; the input is untouched, press again
    //
    // `sent` is not `done`. _call resolves `true` when HA took the call, and
    // for `script.turn_on` that means the script STARTED -- see the note on
    // _call. A quick timer fired into a full rack of slots returns `true` and
    // starts nothing. That gap is exactly what `warn` is for, and a card that
    // can observe its own outcome should report it rather than leaving `sent`
    // on screen as if it had worked.
    //
    // A card opts in by rendering _statusNode() somewhere in its tree. Cards
    // that never call _setStatus are completely unaffected.

    // The row itself. Build it once during _render and leave it in place --
    // it holds its height empty, so nothing moves when a message lands.
    _statusNode() {
      var d = document.createElement('div');
      d.className = 'hk-status';
      // A screen reader should ANNOUNCE this without the focus moving: the
      // keypad keeps focus on the button that was just pressed.
      d.setAttribute('role', 'status');
      d.setAttribute('aria-live', 'polite');
      this._paintStatus(d);
      return d;
    }

    // `ttl` clears the message after a while. Pass it for the states that are
    // merely informative (`sent`); do NOT pass one for `failed` or `warn`,
    // which describe something the person still has to act on and must not
    // disappear while they are reading it.
    _setStatus(kind, text, ttl) {
      if (this._hkStatusT) { clearTimeout(this._hkStatusT); this._hkStatusT = null; }
      this._hkStatus = kind ? { kind: kind, text: text || '' } : null;
      this._paintStatus();
      if (kind && ttl) {
        var self = this;
        this._hkStatusT = setTimeout(function () {
          self._hkStatusT = null;
          self._hkStatus = null;
          self._paintStatus();
        }, ttl);
      }
    }

    // Writes the row WITHOUT re-rendering the card. The timer keypad's <input>
    // and its caret do not survive a rebuild, and a status message must never
    // be the thing that eats what somebody is typing.
    _paintStatus(node) {
      var el = node || (this._root && this._root.querySelector('.hk-status'));
      if (!el) return;
      var s = this._hkStatus;
      el.textContent = s ? s.text : '';
      if (s) el.setAttribute('data-kind', s.kind);
      else el.removeAttribute('data-kind');
    }

    // THE DUPLICATE-SUBMISSION GUARD, in one place rather than re-typed per
    // card. Returns false when a submission is already in flight, so the
    // caller can simply `if (!this._begin()) return;`.
    _begin(text) {
      if (this._busy) return false;
      this._busy = true;
      this._setStatus('pending', text || 'Sending…');
      // REPAINT, so the button can show it is inert. _setStatus alone only
      // writes the status row, and a Start button that still says "Start" is
      // the thing that gets pressed twice. _render is the right call for both
      // shapes of card: one that builds once repaints through it, one that
      // rebuilds does so.
      this._render();
      return true;
    }

    // Always pair with _begin. Clears the guard BEFORE the caller repaints, so
    // a card that renders from inside the callback draws an idle button.
    _end() { this._busy = false; }

    // ------------------------------------------------------- TEARDOWN
    //
    // A CARD SAYS WHEN IT IS DONE. hk-stats holds subscriber sets so it can
    // wake whoever asked for a fetch, and without this it learns about a
    // dead card only reactively: notify() prunes what it happens to walk, and a
    // high-water sweep bounds a set when it gets implausibly large. Both are
    // bounded and neither is wrong, but nothing happens until the NEXT
    // response -- up to fifteen minutes for a daily chart, or never, for a
    // card nobody asks about again.
    //
    // release() is O(the sets this card joined), not a scan of anything. It is
    // safe on a card that never subscribed, and a card that is re-attached
    // subscribes again on its next render.
    //
    // A CARD THAT OVERRIDES THIS MUST CHAIN. Several do, for their own timers and
    // observers; tests/test_dispatch.js asserts every one of them calls
    // super.disconnectedCallback(). The hk-stats backstop still catches a card
    // that is replaced wholesale without ever disconnecting.
    disconnectedCallback() {
      glassJoin(this, false);
      ON_PAGE.delete(this);
      if (this._hkStatusT) { clearTimeout(this._hkStatusT); this._hkStatusT = null; }
      if (window.hkStats && window.hkStats.release && window.hkStats.release(this)) {
        this._hkStatsLost = true;
      }
    }

    // THE OTHER HALF OF RELEASE. A card released while still waiting on a
    // fetch has lost its only wake-up, and re-attaching changes nothing the
    // render gate can see -- same entity, same signature -- so it would sit on
    // "Loading" until its sensor moved. Redraw once on the way back in: the
    // render asks hk-stats again, which either draws from the cache or
    // subscribes afresh. Only cards that were actually waiting pay for this.
    //
    // A CARD THAT OVERRIDES THIS MUST CHAIN, like disconnectedCallback.
    connectedCallback() {
      glassJoin(this, true);
      ON_PAGE.add(this);
      markAsleep(this);
      if (!this._hkStatsLost) return;
      this._hkStatsLost = false;
      if (this._hass && this._config) this.requestUpdate();
    }

    _st(id) { return this._hass && this._hass.states[id]; }
    _render() { /* subclasses */ }
  }


  // ========================================================= CONFIG EDITORS
  //
  // Many of these configs are written by hand in YAML -- one shared file
  // reaching several dashboards is what stops them drifting apart. An
  // editor is still worth having: it is what the card
  // PICKER and the preview pane use, which is how a card gets dropped onto a
  // page without looking up its options first.
  //
  // ha-form does the work. Two things about it that this depends on, both
  // verified against the served frontend rather than assumed:
  //   * it PRESERVES keys that are not in the schema (`type` above all), and
  //     emits the whole merged object -- so there is no manual merge here.
  //   * every selector these schemas use exists: entity, text, icon, select,
  //     boolean, object (a YAML sub-editor) and ui_action.
  //
  // The one rule the card set keeps: options must be
  // LEGIBLE AND FEW. A schema that needs a scrollbar is a card with too many
  // options, not a card that needs a bigger form.
  // WORDS ARE US ENGLISH, matching the rest of Home Assistant's UI ("color",
  // "Favorite"). The CONFIG KEYS keep their spelling (icon_color, colour in
  // chart opts) -- those are data, and renaming them would break every YAML
  // file. Only what a person reads is US English.
  //
  // A field missing from HK_LABELS falls back to a humanized key ("min_hour_col"
  // -> "Min hour col") so nothing ever shows a raw snake_case name; a schema
  // entry may also carry its own `label` / `helper` when a word means something
  // different on one card (the vacuum's `room` is a SENSOR, a tile's is text).
  var HK_LABELS = {
    // the status chips (hk-chip.js): a kind, and the row's lists
    kind: 'Kind', quiet: 'Only when there is something to report', chips: 'Chips',
    scenes: 'Scenes', looks: 'How each looks',
    // shared by most cards
    entity: 'Entity', name: 'Name', icon: 'Icon', icon_states: 'Icon for each state',
    icon_size: 'Icon size', icon_color: 'Icon color', bare_icon: 'Hide icon circle',
    bare_icon_color: 'Icon color without circle', well_background: 'Icon circle color',
    room: 'Room name', label: 'Status text (fixed)', label_mode: 'Status text',
    label_map: 'Status text for each state', label_default: 'Status text fallback',
    animation: 'Icon animation', layout: 'Layout', elevated: 'Drop shadow',
    color: 'Color',
    option: 'Lit when state is', navigation_path: 'Link to page',
    chevron: 'Link text', height: 'Height', padding: 'Padding', margin: 'Margin',
    width: 'Width', gap: 'Gap', grid_rows: 'Row height',
    group: 'Group members', group_lit: 'Tile lights up when',
    tap_action: 'Tap action',
    icon_tap_action: 'Icon tap action',
    // readings
    value: 'Value (fixed text)', mode: 'Show', value_mode: 'Value format',
    value_attribute: 'Read attribute', value_suffix: 'Value suffix',
    value_peer: 'Energy meter sensor', idle_text: 'Idle text',
    power: 'Power sensor', stat: 'Energy statistic', peers: 'Compare with',
    label_entity: 'Status from entity', label_suffix: 'Status suffix',
    label_decimals: 'Status decimals', icon_color_steps: 'Icon color by value',
    charge: 'Charging power sensor', discharge: 'Discharging power sensor',
    stored: 'Stored energy sensor', runtime: 'Backup runtime sensor',
    reserve: 'Backup reserve level', limit: 'Charge limit',
    opts: 'Chart options', trace: 'Graph options',
    // controls
    control: 'Control type', bare: 'No glass background', entity_from: 'Follow a selector',
    // layout
    card: 'Card', material: 'Background', phone: 'On a phone', parents: 'Parent pages', variant: 'Style',
    fill: 'Fill color', icon_colors: 'Icon color for each state',
    card_width: 'Card width', phone_card_width: 'Card width on phones',
    phone_gap: 'Gap on phones', pad_top: 'Top padding', pad_bottom: 'Bottom padding',
    pad_left: 'Left padding', pad_right: 'Right padding', cards: 'Cards',
    temperature: 'Temperature sensor', downstairs: 'Downstairs thermostat',
    upstairs: 'Upstairs thermostat', garage: 'Garage door',
    // weather and clock
    weather_path: 'Weather page', alarm_path: 'Security page', title: 'Title',
    source: 'Source name', caption: 'Caption', speed: 'Wind speed sensor',
    gust: 'Wind gust sensor', sun: 'Sun entity', phase: 'Moon phase sensor',
    uv: 'UV index sensor', hours: 'Hours to show', days: 'Days to show',
    min_hour_col: 'Narrowest hour column (px)', min_day_col: 'Narrowest day column (px)',
    plain: 'No plate (white text, shadowed)', narrow: 'Stood up (as on a phone)',
    place: 'Location label', time_size: 'Time size', ampm_size: 'AM/PM size',
    date_size: 'Date size', date_color: 'Date color', shadow: 'Text shadow',
    date_format: 'Date format', time_line_height: 'Time line height',
    main_size: 'Temperature size',
    detail_size: 'Detail text size', glyph_size: 'Weather icon size',
    dim_color: 'Secondary text color',
    // media
    meta_card: 'Controls card', browse_url: 'Browse page',
    players: 'Players, in priority order', selector: 'Selector',
    // home
    start_script: 'Clean script', floors: 'Floors and areas', order: 'Room order',
    create_script: 'Start timer script', name_chips: 'Suggested names',
    timers: 'Timers', empty_text: 'Text when nothing is running', tint: 'Accent color',
    bad_code_entity: 'Wrong code flag', battery: 'Battery sensor',
    progress: 'Cleaning progress sensor', error: 'Error sensor',
    dock_error: 'Dock error sensor', scale: 'Size', fixed: 'Pin to bottom of screen',
    plated: 'Glass behind each timer', chips: 'Chips',
    // cameras
    seam: 'Gap between images (px)', refresh: 'Snapshot refresh (seconds)',
    radius: 'Corner radius', seam_color: 'Gap color',
    // pop-up
    hash: 'Opens on', position: 'Position', background: 'Background',
    blur: 'Background blur', backdrop: 'Page dimming', clip: 'Clip to corners',
    vars: 'Card style variables', auto_close: 'Close after (ms)',
    close_outside: 'Close when tapping outside', trigger: 'Open when',
    trigger_close: 'Close when no longer true', dismissable: 'Stay closed once dismissed',
    dismiss_scope: 'Show again when these change', close_action: 'Action on close'
  };

  // One line under the field, only where the label cannot carry the meaning.
  var HK_HELPERS = {
    kind: 'Counts what Configure -> What counts finds for it. Leave empty for a chip of your own (an entity).',
    chips: 'The row when this dashboard\'s settings (under Dashboards) name none. Empty: every kind the house has.',
    scenes: 'The row when this dashboard\'s settings name none. Empty: every scene, A to Z.',
    looks: 'YAML: entity: {name, icon, icon_color, tap_action}.',
    icon_size: 'CSS size, e.g. 30px. Leave empty for the default.',
    icon_states: 'YAML: state: icon. Quote on and off, e.g. "on": hk:lightbulb-on',
    bare_icon: 'While on, draw the icon without the colored circle behind it.',
    well_background: 'e.g. transparent. Leave empty for the default.',
    label: 'Replaces the status text completely.',
    label_mode: 'How the state becomes the status text under the name.',
    group: 'Other entities this tile stands for. Used by the "group" status texts.',
    group_lit: 'Light the tile from the main entity, or when any group member is on.',
    icon_tap_action: 'Tapping the icon does this; the rest of the tile uses Tap action.',
    room: 'Shown small, above the name.',
    option: 'Leave empty to light when on. Enter a state (e.g. Everywhere) to light when the entity equals it.',
    navigation_path: 'e.g. ./cameras. A path starting with ./ works on every dashboard.',
    chevron: 'Extra text after the title, e.g. "Details›".',
    grid_rows: 'CSS height of the heading row, e.g. 44px.',
    height: 'CSS height, e.g. 44px.', padding: 'CSS padding, e.g. 0px 0px 0px 3px.',
    margin: 'CSS margin, e.g. 0px 0px 12px 0px.', width: 'CSS width, e.g. 184px.',
    value: 'Shows this text instead of the reading.',
    value_mode: 'Leave empty to show the state as it is.',
    value_attribute: 'Temperature format: read this attribute instead of the state.',
    value_suffix: 'Temperature format: default °F.',
    value_peer: 'Cost format: the kWh meter shown after the price.',
    idle_text: 'Runtime and flow formats: shown when nothing is running.',
    power: 'Live power reading. Defaults to the entity.',
    stat: 'Today\'s energy, shown under the name.',
    peers: 'Other devices to compare today\'s use against.',
    label_entity: 'Status text is this entity\'s state instead.',
    icon_color_steps: 'YAML list, first match wins: - above: 60 / color: green, then - color: red. above is strict (more than 60), at_least inclusive -- as in a chip\'s when.',
    charge: 'Flow format: shown with + while charging.',
    discharge: 'Flow format: shown with − while discharging.',
    reserve: 'Number entity for the backup reserve %.', limit: 'Number entity for the charge limit %.',
    opts: 'YAML passed to the chart, e.g. colour: orange.',
    trace: 'YAML: hours: 3, colour: orange, title: Whole Home Power',
    control: 'Normally picked from the entity type.',
    bare: 'For use inside another card that already has a background.',
    entity_from: 'YAML: selector: input_select.x and map: {Option: entity}. Replaces Entity.',
    card: 'Any card, in YAML, e.g. type: energy-usage-graph',
    parents: 'YAML: page: parent page, for pages not opened from the dashboard, e.g. music-browse: playmusic',
    fill: 'Filled style only, e.g. rgba(255, 159, 10, 0.95).',
    icon_colors: 'Entity state type only. YAML: state: color.',
    temperature: 'Climate type only.', downstairs: 'Climate type only.', upstairs: 'Climate type only.',
    garage: 'Security type only.',
    phone_card_width: 'Used on screens narrower than 640px.', phone_gap: 'Used on screens narrower than 640px.',
    cards: 'The cards in the row, as a YAML list.',
    weather_path: 'Opened by tapping the weather. Default ./weather',
    alarm_path: 'Opened by tapping the security summary. Default ./alarm',
    title: 'Default: Severe Weather.', source: 'Default: National Weather Service.',
    speed: 'For Wind.', gust: 'For Wind.', sun: 'For Sunrise / sunset.',
    phase: 'For Moon. Empty: the built-in phase, the same one the live sky draws.', uv: 'For UV index.',
    min_hour_col: 'Hours are dropped rather than squeezed narrower than this.',
    min_day_col: 'Days are dropped rather than squeezed narrower than this.',
    plain: 'Drawn straight on what is behind it, as on the screensaver.',
    narrow: 'Today’s conditions above the hours and the days, whatever the width.',
    place: 'Shown at the top, e.g. HOME · SPRINGFIELD. Empty: Configure -> Weather, else the home name',
    meta_card: 'Drawn under the title — usually HK Media Controls following the same selector.',
    browse_url: 'Opened by the Browse button.',
    players: 'The first one playing is shown. List speaker groups before their members.',
    start_script: 'Optional. Receives the selected area ids. Empty: HK Clean Areas sends each vacuum the areas on its room map.',
    floors: 'Empty: the rooms Clean Areas offers (HK Settings → Features → Clean Areas), by floor, kept up to date. Or a YAML list: name, areas: [{id, name}] (id is the Home Assistant area id).',
    order: 'Optional, for automatic rooms: the order to show them in on each floor. Empty: this screen\'s Room order when it is used on pages, else A to Z.',
    create_script: 'Optional. Receives the duration and name. Empty: script.quick_timer_create (the shipped quick-timer helpers).', name_chips: 'Names offered as one-tap choices.',
    timers: 'YAML list: entity, label, glyph, label_entity.',
    bad_code_entity: 'Optional. Only for a panel that fails silently on a wrong code: an on/off entity turned on briefly when a code is rejected. A panel that refuses the code shows "Wrong code" without it.',
    progress: 'Percent complete while cleaning.',
    scale: '1 is normal size.', fixed: 'For the screensaver.',
    seam: 'Space between the camera images.', refresh: 'How often the snapshots update. 0 turns it off.',
    hash: 'The page address ending that opens it, e.g. #doorbell',
    backdrop: '0 to 1. Default 0.8.', auto_close: 'e.g. 60000 for one minute.',
    trigger: 'YAML list of conditions. Opens by itself when they become true.',
    dismissable: 'Closed by hand, it stays closed on this screen until the conditions end.',
    vars: 'YAML: CSS variable: value, e.g. ha-card-background: transparent'
  };

  // Readable names for the fixed choices. A value missing here is humanized.
  var HK_OPTION_LABELS = {
    // tile status texts
    on_off: 'On / Off', state: 'State (Open, Locked…)', sentence: 'State as a sentence',
    title: 'State in Title Case', on_off_sentence: 'On / Off, else the state',
    open_closed: 'Open / Closed', leak: 'Leak / Dry', alarm: 'Alarm (Home, Away…)',
    brightness: 'Brightness %', humidity: 'Humidity target', vacuum: 'Vacuum status',
    position: 'Position %', duration: 'Timer duration', group_brightness: 'Group: average brightness',
    group_count: 'Group: number on', setpoint: 'Target temperature',
    setpoint_verb: 'Target temperature with mode (Cool to 72°)',
    source_first: 'Source, else playback state',
    // other choices
    spin: 'Spin while on', none: 'None', entity: 'The entity is on', any: 'Any group member is on',
    hero: 'Value', pct: 'Percent', rank: 'Power use',
    temperature: 'Temperature', power: 'Power', runtime: 'Runtime', cost: 'Cost', flow: 'Charge / discharge',
    glass: 'Glass', flat: 'Flat', filled: 'Filled',
    climate: 'Climate', security: 'Security', number: 'Slider', media_player: 'Media controls',
    wind: 'Wind', sun: 'Sunrise / sunset', moon: 'Moon', uv: 'UV index',
    weekday: 'Sunday, September 13th', monthday: 'September, 13th',
    center: 'Center', bottom: 'Bottom'
  };

  function humanize(key) {
    return sentenceCase(String(key || '').replace(/_/g, ' '));
  }

  // The colour names the tile colour map understands. custom_value stays on
  // because several tiles pass a literal rgba() instead of a name.
  var HK_COLOURS = ['yellow', 'orange', 'blue', 'green', 'red', 'purple',
                    'pink', 'teal', 'cyan', 'brown', 'gray', 'mint', 'white',
                    'black'];

  function selColour() {
    return { select: { mode: 'dropdown', custom_value: true,
                       options: HK_COLOURS.map(function (c) {
                         return { value: c, label: sentenceCase(c) };
                       }) } };
  }

  // values: strings (named through HK_OPTION_LABELS) or [value, label] pairs.
  // custom_value stays on so a hand-written value outside the list still shows
  // rather than being blanked by the dropdown.
  function selOptions(values) {
    return { select: { mode: 'dropdown', custom_value: true,
                       options: values.map(function (v) {
                         return Array.isArray(v) ? { value: v[0], label: v[1] }
                           : { value: v, label: HK_OPTION_LABELS[v] || humanize(v) };
                       }) } };
  }

  // A collapsible group of fields whose values stay FLAT in the config -- the
  // YAML does not change shape. Verified against the served frontend: ha-form
  // passes the whole data object to an expandable with `flatten` or no name.
  function section(title, schema, icon, expanded) {
    return { type: 'expandable', name: '', flatten: true, title: title,
             icon: icon, expanded: !!expanded, schema: schema };
  }

  function hkEditor(tag, schema) {
    var etag = tag + '-editor';
    if (customElements.get(etag)) return etag;

    class HkConfigEditor extends HTMLElement {
      setConfig(config) {
        this._config = Object.assign({}, config);
        this._render();
      }
      set hass(h) {
        this._hass = h;
        if (this._form) this._form.hass = h;
      }
      get hass() { return this._hass; }

      _render() {
        if (!this._form) {
          this._form = document.createElement('ha-form');
          // A schema entry's own label/helper wins -- including an EMPTY
          // helper, which means "none here" rather than "use the shared one".
          this._form.computeLabel = function (s) {
            return ('label' in s) ? s.label : (HK_LABELS[s.name] || humanize(s.name));
          };
          this._form.computeHelper = function (s) {
            return ('helper' in s) ? s.helper : ((s.name && HK_HELPERS[s.name]) || '');
          };
          this._form.addEventListener('value-changed', this._changed.bind(this));
          this.appendChild(this._form);
        }
        this._form.hass = this._hass;
        this._form.schema = schema;
        this._form.data = this._config || {};
      }

      _changed(ev) {
        ev.stopPropagation();
        var cfg = Object.assign({}, ev.detail.value);
        // A cleared field should DISAPPEAR from the YAML rather than persist as
        // an empty string -- these configs are read by hand.
        Object.keys(cfg).forEach(function (k) {
          if (cfg[k] === '' || cfg[k] === null || cfg[k] === undefined) delete cfg[k];
        });
        this.dispatchEvent(new CustomEvent('config-changed', {
          detail: { config: cfg }, bubbles: true, composed: true
        }));
      }
    }

    customElements.define(etag, HkConfigEditor);
    return etag;
  }

  window.hkCards.editor = hkEditor;
  window.hkCards.LABELS = HK_LABELS;
  window.hkCards.COLOURS = HK_COLOURS;
  window.hkCards.selColour = selColour;
  window.hkCards.selOptions = selOptions;
  window.hkCards.section = section;
  window.hkCards.HELPERS = HK_HELPERS;
  window.hkCards.OPTION_LABELS = HK_OPTION_LABELS;

  // ------------------------------------------------------- nested cards
  //
  // A card that draws ANOTHER card inside itself -- the player's progress bar
  // and volume slider are an hk-media-control-card on the player's own glass.
  //
  // THE ORDER IS THE WHOLE POINT. A custom element that is not upgraded yet
  // has no setConfig, and HA's own cards throw if they are handed `hass`
  // before a config. So: create, wait for the definition if need be, then
  // setConfig, and only then start forwarding hass. `setHass` is a function on
  // the returned element rather than a plain property assignment so a caller
  // can hand it hass on every render without knowing whether it is ready yet.
  function create(cfg) {
    if (!cfg || !cfg.type) return null;
    var t = String(cfg.type);
    var tag = t.indexOf('custom:') === 0 ? t.slice(7) : ('hui-' + t + '-card');
    var el = document.createElement(tag);
    var ready = false, pending = null;
    function configure() {
      try {
        el.setConfig(cfg);
        ready = true;
        if (pending) { el.hass = pending; pending = null; }
      } catch (e) {
        console.error('[hk] nested card setConfig failed', e, cfg);
      }
    }
    el.hkSetHass = function (h) {
      if (ready) el.hass = h; else pending = h;
    };
    if (typeof el.setConfig === 'function') configure();
    else if (window.customElements && customElements.whenDefined) {
      customElements.whenDefined(tag).then(configure, function () {
        console.error('[hk] nested card type never defined:', tag);
      });
    }
    return el;
  }
  // Exported for hk-campost.js, which reuses this cache as the cameras
  // page's video poster.
  window.hkCards.snapCache = { get: snapCacheGet, put: snapCachePut,
                               FRESH: SNAP_FRESH };
  window.hkCards.create = create;
  window.hkCards.BASE_CSS = BASE_CSS;
  window.hkCards.confirmSheet = confirmSheet;
  window.hkCards.neverToggles = neverToggles;
  // The door-like cover classes, so hk-detail.js draws a door as a door
  // (the lock's ring) from the same list this guard uses.
  window.hkCards.DOOR_COVERS = DOOR_COVERS;
  window.hkCards.chooseSheet = chooseSheet;
  window.hkCards.M = M;
  window.hkCards.PALETTE = PALETTE;
  window.hkCards.px = px;
  window.hkCards.bleedSides = bleedSides;
  window.hkCards.esc = esc;
  window.hkCards._artRemote = artRemote;       // tests
  window.hkCards._artSign = artSign;
  window.hkCards.button = button;
  window.hkCards.sentenceCase = sentenceCase;
  window.hkCards.HkBase = HkBase;

  // ------------------------------------------------ defining a card
  // register(): define the element, wire its editor from a schema, give the
  // picker a stub, list it in the card picker. Every card file uses it.
  function register(tag, Ctor, name, description, schema, stub) {
    if (!customElements.get(tag)) customElements.define(tag, Ctor);
    if (schema) {
      var etag = hkEditor(tag, schema);
      Ctor.getConfigElement = function () { return document.createElement(etag); };
    }
    // hasOwnProperty, NOT a truthiness check: these cards EXTEND one another,
    // so HkLightCard inherits HkTileCard's static getStubConfig through the
    // prototype chain and a plain `!Ctor.getStubConfig` guard reads as "already
    // has one". The picker would then offer a switch as the stub for the light,
    // fan and cover cards.
    if (stub && !Object.prototype.hasOwnProperty.call(Ctor, 'getStubConfig')) {
      Ctor.getStubConfig = stub;
    }
    window.customCards = window.customCards || [];
    window.customCards.push({ type: tag, name: name, description: description, preview: true });
  }

  // wireEditor(): editor + stub for a card that defines ITSELF (the older,
  // purpose-built cards call customElements.define in their own section).
  function wireEditor(tag, Ctor, schema, stub) {
    if (!Object.prototype.hasOwnProperty.call(Ctor, 'getConfigElement')) {
      var etag = hkEditor(tag, schema);
      Ctor.getConfigElement = function () { return document.createElement(etag); };
    }
    if (stub && !Object.prototype.hasOwnProperty.call(Ctor, 'getStubConfig')) {
      Ctor.getStubConfig = stub;
    }
  }

  // The picker calls getStubConfig to build its preview, so it has to name an
  // entity that actually exists in THIS house or the preview renders empty.
  function firstOf(hass, domain) {
    var ids = hass ? Object.keys(hass.states) : [];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i].indexOf(domain + '.') === 0) return ids[i];
    }
    return domain + '.example';
  }

  // ------------------------------------------------ morph(): update in place
  // Bring `el`'s children in line with `html` by CHANGING what differs -- a
  // text node's value, an attribute -- and replacing a node only where the
  // structure itself changed. Never `el.innerHTML = html` for something that
  // re-renders on a timer.
  //
  // WHY. A wall header that rebuilds its whole clock + weather block every
  // minute via innerHTML flickers: on a tablet's Android WebView, recreating
  // the elements -- the SVG glyph, the drop-shadowed text -- recreates their
  // compositing layers, once a minute, when the clock ticks. morph() turns the minute
  // tick into a single text-node change.
  function morph(el, html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    syncChildren(el, tpl.content);
  }
  function syncChildren(live, next) {
    var want = Array.prototype.slice.call(next.childNodes);
    for (var i = 0; i < want.length; i++) {
      var cur = live.childNodes[i];
      if (!cur) { live.appendChild(want[i]); continue; }
      if (!syncNode(cur, want[i])) live.replaceChild(want[i], cur);
    }
    while (live.childNodes.length > want.length) live.removeChild(live.lastChild);
  }
  function syncNode(cur, want) {
    if (cur.nodeType !== want.nodeType || cur.nodeName !== want.nodeName) return false;
    if (cur.nodeType === 3 || cur.nodeType === 8) {
      if (cur.nodeValue !== want.nodeValue) cur.nodeValue = want.nodeValue;
      return true;
    }
    if (cur.nodeType !== 1) return false;
    var i, a;
    for (i = cur.attributes.length - 1; i >= 0; i--) {
      a = cur.attributes[i].name;
      if (!want.hasAttribute(a)) cur.removeAttribute(a);
    }
    for (i = 0; i < want.attributes.length; i++) {
      a = want.attributes[i];
      if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
    }
    syncChildren(cur, want);
    return true;
  }

  // ================================================ hkMusic: the music model
  //
  // THE ONE ANSWER TO "WHAT IS THIS SCREEN ABOUT". Three jobs that a single
  // shared selector (an input_select) cannot do at once, kept apart:
  //
  //   TRUTH    what is playing where. contexts(): derived from Music
  //            Assistant's own states every time, never stored, so it cannot
  //            go stale and cannot disagree with the house.
  //   FOCUS    which of those this SCREEN shows. Per user -- each wall tablet
  //            is its own HA user -- kept in HA's own per-user store
  //            (frontend/set_user_data), so it survives a reload and a cache
  //            clear, and one tablet never rewrites another's page.
  //   COMMAND  which player a button acts on. Not here at all: every call
  //            names its player explicitly, so a tap acts on what was drawn.
  //
  // resolve() NEVER STRANDS A SCREEN. In order:
  //   1. the focused key, or the context it is part of, if that is playing
  //      or paused;
  //   2. the focused key while a request for it is in flight (HOLD) -- a
  //      playlist takes ~12s to start, and without this the page would show
  //      some other room's music for those twelve seconds;
  //   3. otherwise, music that STARTED since the focus was set -- this
  //      tablet's own room first, then the newest -- "follow whatever
  //      starts playing", per screen and with nothing written.
  //      ONLY NEW STARTS: Music Assistant turns a
  //      paused AirPlay room IDLE ~30 s after the pause, and "follow anything
  //      playing" would then yank the screen onto music that had been playing
  //      all along. A screen with no focus at all follows whatever plays;
  //   4. otherwise the focused key idle ("Ready on"), else the tablet's home
  //      room, else nothing.
  //
  // An unknown key (a renamed or removed speaker) is simply ignored, so the
  // worst a bad stored value can do is fall through to rule 3 or 4.

  // THE CONFIGURATION COMES FROM THE INTEGRATION. Speakers,
  // presets, floors, playlists and this user's home room are set up in the UI
  // (Settings -> Devices & services -> HK Frontend) and arrive over the
  // `hk_music/subscribe` websocket command -- now, and again whenever
  // anything is edited, with no reload. Until it arrives everything resolves
  // to "nothing", which every card already draws.
  var MUSIC = { configured: false, speakers: [], floors: [], playlists: [], home: null };

  var MUSIC_KEY = 'hk_music_focus';
  // Longer than the slowest measured playlist start (12.7s) with room for a
  // regroup ahead of it; bounded, so a request that never lands cannot pin a
  // screen to a silent room.
  var MUSIC_HOLD = 45000;

  var hkMusic = (function () {
    var byEntity = {};
    function index() {
      byEntity = {};
      MUSIC.speakers.forEach(function (s) { byEntity[s.entity] = s; });
    }
    index();
    // `seen`: the contexts already playing when this focus was chosen, by
    // key -> since. Taken on the first resolve after a change, because a
    // choice has no hass of its own. Only music NOT in it can pull a screen
    // whose own music has gone quiet.
    var focus = { key: null, at: 0, hold: 0, seen: null };
    var listeners = [];
    var conn = null, writing = 0;

    function known(e) { return !!(e && byEntity[e]); }
    function isGroup(e) { return !!(byEntity[e] && byEntity[e].members); }
    function rooms() { return MUSIC.speakers.filter(function (s) { return !s.members; }); }
    function presets() { return MUSIC.speakers.filter(function (s) { return !!s.members; }); }
    function nameOf(e) { return (byEntity[e] && byEntity[e].name) || e; }
    // THIS USER'S room -- each wall tablet signs in as its own user, and the
    // integration's options map users to rooms.
    function home() { return known(MUSIC.home) ? MUSIC.home : null; }
    function active(st) { return !!st && (st.state === 'playing' || st.state === 'paused'); }

    // localStorage is only the FIRST PAINT, before the server answers. It can
    // throw (private mode, blocked storage) and may be empty; both are fine.
    try {
      var raw = window.localStorage && localStorage.getItem(MUSIC_KEY);
      var v0 = raw && JSON.parse(raw);
      // NOT checked against the speakers here: they arrive from the
      // integration AFTER this runs. resolve() ignores a key it does not know.
      if (v0 && typeof v0.key === 'string') { focus.key = v0.key; focus.at = v0.at || 0; }
    } catch (e) { /* no storage: the server copy or the home room will do */ }

    function emit() {
      listeners.slice().forEach(function (fn) {
        try { fn(); } catch (e) { console.error('[hkMusic] listener failed', e); }
      });
    }

    // EVERY SEPARATE THING THE HOUSE IS PLAYING, derived fresh each call.
    //   preset  an MA sync group that is active with ALL of its rooms active
    //   group   an ad-hoc join, keyed by its LEADER (group_members[0])
    //   room    one room on its own
    // A sync group is recognised by its OWN state, not by a room list that
    // happens to match, and it only claims its rooms when every one of them is
    // actually active -- a stale `paused` group must not hide a room that has
    // since started playing something else.
    function contexts(hass) {
      var states = (hass && hass.states) || {};
      var seen = {}, out = [];
      function ctx(key, kind, members, st) {
        var a = (st && st.attributes) || {};
        return {
          key: key, kind: kind, leader: members[0], members: members,
          playing: !!st && st.state === 'playing', state: st ? st.state : 'unknown',
          title: a.media_title || '', artist: a.media_artist || '',
          image: a.entity_picture_local || a.entity_picture || null,
          since: Date.parse(st && st.last_changed) || 0
        };
      }
      presets().forEach(function (g) {
        var st = states[g.entity];
        if (!active(st)) return;
        if (g.members.some(function (m) { return seen[m] || !active(states[m]); })) return;
        g.members.forEach(function (m) { seen[m] = 1; });
        out.push(ctx(g.entity, 'preset', g.members.slice(), st));
      });
      rooms().forEach(function (r) {
        if (seen[r.entity]) return;
        var st = states[r.entity];
        if (!active(st)) return;
        var gm = ((st.attributes || {}).group_members || []).filter(function (e) {
          return known(e) && !isGroup(e);
        });
        var members = gm.length > 1 ? gm : [r.entity];
        members.forEach(function (m) { seen[m] = 1; });
        var lead = members[0];
        out.push(ctx(lead, members.length > 1 ? 'group' : 'room', members,
                     states[lead] || st));
      });
      return out;
    }

    function label(c, key) {
      if (!c) return key ? nameOf(key) : '';
      if (c.kind === 'preset') return nameOf(c.key);
      // "Kitchen + Loft" at two, "Kitchen +3" beyond -- the picker's
      // convention, and everyone's: a five-room list does not fit, and two
      // names do.
      var n = c.members.length;
      if (n === 2) return nameOf(c.members[0]) + ' + ' + nameOf(c.members[1]);
      return n > 2 ? nameOf(c.leader) + ' +' + (n - 1) : nameOf(c.leader);
    }

    // {player, context, reason, name}. `reason` says which rule answered, so a
    // card -- and a person debugging one -- can tell "you chose this" from
    // "this is what is playing".
    function resolve(hass) {
      var ctxs = contexts(hass);
      var now = Date.now();
      var key = known(focus.key) ? focus.key : null;
      // FIRST RESOLVE AFTER A CHOICE: remember what was already playing, so
      // only something that starts later can pull this screen away.
      if (key && focus.seen === null) {
        focus.seen = {};
        ctxs.forEach(function (c) { if (c.playing) focus.seen[c.key] = c.since; });
      }
      var mine = key && ctxs.filter(function (c) {
        return c.key === key || c.members.indexOf(key) >= 0;
      })[0];
      if (mine) return { player: mine.key, context: mine, reason: 'focus', name: label(mine) };
      if (key && now < focus.hold) return { player: key, context: null, reason: 'pending', name: nameOf(key) };
      var seen = key ? focus.seen : null;
      var playing = ctxs.filter(function (c) {
        return c.playing && (!seen || seen[c.key] !== c.since);
      });
      if (playing.length) {
        var h = home();
        playing.sort(function (a, b) {
          var ah = h && a.members.indexOf(h) >= 0 ? 1 : 0;
          var bh = h && b.members.indexOf(h) >= 0 ? 1 : 0;
          return (bh - ah) || (b.since - a.since);
        });
        return { player: playing[0].key, context: playing[0], reason: 'following',
                 name: label(playing[0]) };
      }
      var fall = key || home();
      return { player: fall, context: null, reason: key ? 'idle' : (fall ? 'home' : 'none'),
               name: fall ? nameOf(fall) : '' };
    }

    // An explicit choice: a context card tapped, or a request sent. `hold`
    // keeps it on screen while the request is still landing.
    function setFocus(key, opts) {
      if (!known(key)) return false;
      var now = Date.now();
      focus.key = key; focus.at = now; focus.seen = null;
      focus.hold = opts && opts.hold ? now + MUSIC_HOLD : 0;
      try { if (window.localStorage) localStorage.setItem(MUSIC_KEY, JSON.stringify({ key: key, at: now })); }
      catch (e) { /* first-paint copy only */ }
      if (conn && conn.sendMessagePromise) {
        writing++;
        conn.sendMessagePromise({ type: 'frontend/set_user_data', key: MUSIC_KEY,
                                  value: { key: key, at: now } })
          .catch(function (e) { console.error('[hkMusic] could not save focus', e); })
          .then(function () { writing--; });
      }
      emit();
      return true;
    }
    // A request that failed must not keep holding a silent room on screen.
    function release(key) {
      if (focus.key === key && focus.hold) { focus.hold = 0; emit(); }
    }

    // The server copy, followed live: the same user on another screen (your
    // phone and Chrome are one user) moves with it. Ignored while this screen
    // is mid-write, so its own older value cannot bounce back over a newer one.
    // The integration's answer: a new configuration replaces the old one
    // whole. A stored focus that is no longer a speaker is simply ignored by
    // resolve(), so an edit can never leave a screen pointing at nothing.
    function configure(cfg) {
      MUSIC = {
        configured: !!(cfg && cfg.configured),
        speakers: (cfg && cfg.speakers) || [],
        floors: (cfg && cfg.floors) || [],
        playlists: (cfg && cfg.playlists) || [],
        home: (cfg && cfg.home) || null,
        volume: cfg && cfg.volume,
        library: (cfg && cfg.library_entry) || null
      };
      index();
      emit();
    }

    // ONE SET OF SUBSCRIPTIONS PER CONNECTION, retried (hkSettings.subscribe):
    // a subscribe that fails -- the page reconnected while Home Assistant was
    // still starting -- would otherwise leave every music card empty until a reload.
    function sub(c, msg, fn, label) {
      var s = window.hkSettings && window.hkSettings.subscribe;
      if (s) return s(c, msg, fn, label);
      c.subscribeMessage(fn, msg).catch(function (e) {    // a harness without hk-settings
        console.error('[' + label + '] not available', e);
      });
      return function () {};
    }

    function attach(hass) {
      var c = hass && hass.connection;
      if (!c || c === conn || !c.subscribeMessage) return;
      conn = c;
      sub(c, { type: 'hk_music/subscribe' }, configure, 'hkMusic');
      sub(c, { type: 'frontend/subscribe_user_data', key: MUSIC_KEY }, function (ev) {
        var v = ev && ev.value;
        // A key is taken even if the speaker list has not arrived yet (the
        // two subscriptions answer in either order); resolve() validates it.
        if (writing || !v || typeof v.key !== 'string' || v.key === focus.key) return;
        focus.key = v.key; focus.at = v.at || 0; focus.hold = 0; focus.seen = null;
        try { if (window.localStorage) localStorage.setItem(MUSIC_KEY, JSON.stringify(v)); }
        catch (e) { /* first-paint copy only */ }
        emit();
      }, 'hkMusic focus');
    }

    // ATTACHED BY THE PAGE, not only by the music cards: a Speakers chip
    // (count: {music: true}) or a popup opened by `entity_from: {music: true}`
    // needs the speaker list on a page with no music card on it.
    (function () {
      var tries = 0;
      function selfAttach() {
        var ha = null;
        try { ha = document.querySelector('home-assistant'); } catch (e) { return true; }
        if (!(ha && ha.hass && ha.hass.connection)) return false;
        attach(ha.hass);
        return true;
      }
      if (selfAttach()) return;
      var t = setInterval(function () {
        if (selfAttach() || ++tries >= 300) clearInterval(t);   // a minute; cards attach too
      }, 200);
    })();

    function onChange(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    return {
      speakers: function () { return MUSIC.speakers.slice(); },
      rooms: rooms, presets: presets, known: known, isGroup: isGroup,
      nameOf: nameOf, home: home, contexts: contexts, resolve: resolve,
      player: function (hass) { return resolve(hass).player; },
      label: label, setFocus: setFocus, release: release, attach: attach,
      onChange: onChange, focus: function () { return focus.key; },
      configured: function () { return MUSIC.configured; },
      floors: function () { return MUSIC.floors.slice(); },
      playlists: function () { return MUSIC.playlists.slice(); },
      libraryEntry: function () { return MUSIC.library || null; },
      HOLD: MUSIC_HOLD,
      // Tests only: start from a clean slate, and hand in a configuration.
      _reset: function () { focus = { key: null, at: 0, hold: 0, seen: null }; listeners = []; conn = null; writing = 0; },
      _configure: configure
    };
  })();
  window.hkMusic = hkMusic;

  window.hkCards.morph = morph;
  // The dashboard settings (modules/hk-settings.js): the entity a card falls
  // back to when its own config names none. Read at call time.
  window.hkCards.setting = function (path, fallback) {
    var HS = window.hkSettings;
    return HS ? HS.get(path, fallback) : fallback;
  };
  // Is one of HK Frontend's features added and set up -- 'music', 'live_tv',
  // 'clean_areas', 'alarm_pin'? (The settings feed's `added`: a feature's
  // actions are registered whether or not it is added, so they cannot say.)
  window.hkCards.added = function (kind) {
    var a = window.hkCards.setting('added', null);
    return Array.isArray(a) && a.indexOf(kind) >= 0;
  };
  // ============================================================ THE MENU'S STATE
  //
  // modules/hk-menu.js draws the menu of pages and rooms. These say whether
  // THIS dashboard has it and which button opens it, for the cards that draw
  // a way in -- hk-menu-button-card (the pinned chip), hk-back-card (the round
  // button beside the chevron) and hk-header-card (the clock). One answer for
  // all of them, read from the settings and the dashboard's own config, so a
  // dashboard can never show the chip on one page and the edge tab on the
  // next.
  //
  //   style()  'chip' | 'tab' | null (no menu on this dashboard)
  //            chip -- the round button: the chip at the start of the chip
  //                    row on Home, beside the back chevron everywhere else
  //            tab  -- hk-menu.js's edge tab, on every page; no round buttons
  //   Automatic is the chip when the dashboard's HOME view carries a menu
  //   button card, else the tab. Phones always get the chip: a 16 px margin
  //   has no room for a tab without covering the tiles.
  function panelLovelace() {
    try {
      var ha = document.querySelector('home-assistant');
      var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      return (main && main.shadowRoot && main.shadowRoot.querySelector('ha-panel-lovelace')) || null;
    } catch (e) { return null; }
  }
  function lovelaceConfig() {
    var p = panelLovelace();
    return (p && p.lovelace && p.lovelace.config) || null;
  }
  function dashSeg() { return String(location.pathname).split('/')[1] || ''; }
  var MENU_NARROW = 640;
  function menuNarrow() { return (window.innerWidth || 1280) < MENU_NARROW; }
  // THE EDGE TAB NEEDS A MARGIN TO LIVE IN: 26 px of it, beside a page
  // margin of 2% + 4 px -- 29.6 px on a 1280 wall tablet, 26.7 on an iPad
  // held sideways, but 18.9 on an iPad mini held upright, where the tab would
  // lie against the first chip and the weather. Below 1,024
  // px the dashboard uses the round button instead, as a phone always has.
  var TAB_MIN = 1024;
  // An always-open menu needs room for it: its item's "Always open when the
  // dashboard is at least" (dock_min, 1,000 px -- the menu's
  // 300 beside three tile columns: open on an iPad held sideways, folded on an
  // iPad mini held upright). Narrower, the menu folds into the dashboard's
  // button and comes back when there is room.
  var MENU_DOCK = 1000;
  function dockMin() {
    var v = Number(boardOf(dashSeg()).dock_min);
    return isFinite(v) && v > 0 ? v : MENU_DOCK;
  }
  // EACH DASHBOARD'S OWN MENU SETTINGS: the dashboard items
  // under Dashboards on the integration's page, handed over as `boards`, by
  // url path (settings.py board()). A dashboard with no item has no menu.
  // Before any item exists -- a house that has not migrated, the tests -- the
  // same answers come from the older house-wide lists (menu.dashboards,
  // menu.docked, ...), which settings.py still fills in from the items for a
  // screen running an older copy of this file.
  var BOARD = { menu: 'auto', dock_min: MENU_DOCK, time_weather: 'page', ha_row: false,
                categories: [], tab_position: '', tab_size: 'large', room_order: [], menu_rooms: 'az', home_rooms: 'as_is',
                page_rooms: 'floor',
                // 1.7: Home, Pages, Screen (settings.py BOARD_DEFAULTS). chips_quiet
                // null = the chip row's own default (hk-chip.js QUIET_DEFAULT).
                chips_row: true, chips: [], chips_quiet: null, chips_extra: [], camera_strip: true, cameras: [],
                camera_live: '',
                scenes_row: true, scenes: [], scenes_pages: [], favorites: [], pages: [],
                glass: 'house', frost: null, blur: null, sky: true, idle_return: false, idle_room: '', car: false, kiosk: false,
                popups: true, now_playing: false, screensaver: false, tablet_user: '', custom_pages: [],
                // the button below TAB_MIN and while an open menu is
                // folded; the pages at the top of the menu (empty: the views' own)
                narrow: 'chip', menu_top: [], phone_header: 'header', chips_custom: [], home_page: true, home_view: '' };
  function boardOf(dash) {
    var all = msetting('boards', null), out = {}, k;
    for (k in BOARD) out[k] = BOARD[k];
    if (all && typeof all === 'object' && Object.keys(all).length) {
      var b = all[dash];
      if (!b || typeof b !== 'object') { out.menu = 'off'; return out; }
      for (k in BOARD) if (b[k] !== undefined && b[k] !== null) out[k] = b[k];
      return out;
    }
    var L = function (key) { var v = msetting('menu.' + key, []); return Array.isArray(v) ? v : []; };
    var on = L('dashboards').indexOf(dash) !== -1, open = on && L('docked').indexOf(dash) !== -1;
    var btn = msetting('menu.button', 'auto');
    out.menu = !on ? 'off' : open ? 'open' : (btn === 'chip' || btn === 'tab') ? btn : 'auto';
    out.dock_min = msetting('menu.dock_min', MENU_DOCK);
    out.time_weather = L('time_weather').indexOf(dash) !== -1 ? 'menu' : 'page';
    out.ha_row = L('ha_sidebar').indexOf(dash) !== -1;
    out.categories = L('categories');
    out.tab_position = msetting('menu.tab_position', '') || '';
    out.menu_rooms = msetting('menu.order', 'az') === 'dashboard' ? 'order' : 'az';
    return out;
  }
  function panelWidth() {
    var p = panelLovelace(), r = p && p.getBoundingClientRect ? p.getBoundingClientRect() : null;
    return (r && r.width) || window.innerWidth || 0;
  }
  // Anywhere in a view's config: a chip row's `lead:`, a grid's `cards:`, a
  // conditional's `card:`. Bounded, because a config is data we did not write.
  function holdsCard(node, type, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return false;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) if (holdsCard(node[i], type, depth + 1)) return true;
      return false;
    }
    if (node.type === type) return true;
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k) && typeof node[k] === 'object' &&
          holdsCard(node[k], type, depth + 1)) return true;
    }
    return false;
  }
  // A MENU BUTTON IN A VIEW: written out, or the chips card's -- hk-chips-card
  // puts one at the start of its row unless its `lead` is false (hk-chip.js).
  // Counting only a written-out one, hk-menu.js would find no button on a
  // phone's Home whose chip row is hk-chips-card, and pin its own round one
  // over the weather: two menu buttons.
  function holdsMenuButton(node, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return false;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) if (holdsMenuButton(node[i], depth + 1)) return true;
      return false;
    }
    if (node.type === 'custom:hk-menu-button-card') return true;
    if (node.type === 'custom:hk-chips-card' && node.lead !== false &&
        (!node.lead || holdsMenuButton(node.lead, depth + 1))) return true;
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k) && typeof node[k] === 'object' &&
          holdsMenuButton(node[k], depth + 1)) return true;
    }
    return false;
  }
  // No room for the edge tab: a phone, or any window under TAB_MIN.
  function tabless() { return menuNarrow() || (window.innerWidth || 1280) < TAB_MIN; }
  // ON NARROW SCREENS (the screen's own setting): where the tab has no
  // room, and wherever an always-open menu has folded -- the chip,
  // the chip then the tab once scrolled past, or the tab.
  function narrowStyle() {
    var n = boardOf(dashSeg()).narrow;
    return n === 'tab' || n === 'chip_scroll' ? n : 'chip';
  }
  function folded() { return tabless() || boardOf(dashSeg()).menu === 'open'; }
  // Is Home the page showing? (its path, or none, or 0)
  function homeHere() {
    var here = String(location.pathname).split('/')[2] || '';
    var cfg = lovelaceConfig(), v0 = cfg && cfg.views && cfg.views[0];
    return !here || here === '0' || !!(v0 && v0.path === here);
  }
  var CHIPS = new Set();
  var homeButton = { cfg: null, v: false };
  function homeHasButton() {
    var cfg = lovelaceConfig();
    if (!cfg) return false;
    if (homeButton.cfg !== cfg) {
      var v0 = cfg.views && cfg.views[0];
      homeButton = { cfg: cfg, v: !!v0 && holdsMenuButton(v0, 0) };
    }
    return homeButton.v;
  }
  function msetting(path, fallback) {
    var HS = window.hkSettings;
    return HS ? HS.get(path, fallback) : fallback;
  }
  // A view is a ROOM PAGE when it names an area: `area:` (one, or a list for
  // a room that spans two -- a backyard and its deck), or the room strategy's.
  function areasOfView(v) {
    var a = v && (v.area || (v.strategy && v.strategy.area));
    return a ? [].concat(a).filter(Boolean) : [];
  }
  var roomPages = { cfg: null, map: {} };
  function roomIndex(area) {
    var cfg = lovelaceConfig();
    if (!cfg || !Array.isArray(cfg.views)) return null;
    if (roomPages.cfg !== cfg) {
      var map = {};
      cfg.views.forEach(function (v, i) {
        if (!i) return;                            // Home is never a room page
        areasOfView(v).forEach(function (a) { if (!(a in map)) map[a] = i; });
      });
      roomPages = { cfg: cfg, map: map };
    }
    var i = roomPages.map[area];
    return i === undefined ? null : i;
  }
  var dateLines = {};
  // v2: measured from the top of the PAGE (under any Home Assistant toolbar),
  // not of the panel -- a first load paints the toolbar for a moment before
  // kiosk mode hides it, and a v1 value taken then sat 56 px low.
  var DATE_KEY = 'hk-menu-date2:';
  // THE TOP OF THE PAGE AT REST, in the viewport, scroll or no scroll: the
  // dashboard panel's top plus Home Assistant's toolbar while it shows (kiosk
  // mode hides it). The document is what scrolls, so the panel's own rect
  // moves with it and the scroll has to be added back. Without it a menu sync
  // while the page is scrolled (any change in the page's height is one) puts
  // the edge tab that far up, and it stays there: measured, tab top 87 at
  // rest, -313 after a sync at scrollY 400, still -313 back at the top.
  function viewTop() {
    var p = panelLovelace();
    if (!p || !p.getBoundingClientRect) return 0;
    var top = p.getBoundingClientRect().top + (window.scrollY || 0);
    try {
      var root = p.shadowRoot && p.shadowRoot.querySelector('hui-root');
      var h = root && root.shadowRoot && root.shadowRoot.querySelector('.header');
      if (h && getComputedStyle(h).display !== 'none') top += h.getBoundingClientRect().height;
    } catch (e) { /* no toolbar to find */ }
    return top;
  }
  var menuState = {
    // this dashboard's own settings (boardOf above)
    board: function () { return boardOf(dashSeg()); },
    on: function () { return boardOf(dashSeg()).menu !== 'off'; },
    // Shown beside the page all the time (its item's Menu: "Always open
    // beside the page"), when there is room for it.
    docked: function () {
      if (!menuState.on() || menuNarrow()) return false;
      return boardOf(dashSeg()).menu === 'open' && panelWidth() >= dockMin();
    },
    // The time, date and weather at the top of the menu (its item's "Time
    // and weather": in the menu) -- only while it is docked here; the Home
    // header (hk-weather.js) steps aside for it.
    hasTime: function () {
      return menuState.docked() && boardOf(dashSeg()).time_weather === 'menu';
    },
    // 'tab', 'chip', or 'docked' -- a menu that is always there needs no
    // button at all: no tab, no chip, no round button beside the chevron.
    // Folded, an always-open menu -- and any menu under TAB_MIN -- is the
    // screen's "On Narrow Screens" choice (narrowStyle above).
    //
    // TWO MIXES:
    //   chip_scroll  the chip everywhere; the edge tab slides in while the
    //                chip is scrolled out of sight
    //   chip_home    the chip on Home (sliding to the tab the same way), the
    //                tab on every other page
    // Where the tab has no room (under TAB_MIN) the narrow choice decides.
    style: function () {
      if (!menuState.on()) return null;
      if (menuState.docked()) return 'docked';
      if (folded()) return narrowStyle() === 'tab' ? 'tab' : 'chip';
      var b = boardOf(dashSeg()).menu;
      if (b === 'chip' || b === 'tab') return b;
      if (b === 'chip_scroll') return 'chip';
      if (b === 'chip_home') return homeHere() ? 'chip' : 'tab';
      return homeHasButton() ? 'chip' : 'tab';
    },
    // Does a round button draw at this card? where: 'home' -- the menu chip
    // (hk-menu-button-card, Home's chip row lead); 'page' -- beside a
    // sub-page's back chevron. Answered by the CARD'S place, not the page
    // showing: Home's view stays cached while a sub-page is up, and must
    // come back with its chip.
    round: function (where) {
      var s = menuState.style();
      if (s !== 'chip' && s !== 'tab') return false;
      if (folded()) return narrowStyle() !== 'tab';
      if (boardOf(dashSeg()).menu === 'chip_home') return where === 'home';
      return s === 'chip';
    },
    // The edge tab here: 'always', 'scrolled' (only while every round button
    // on the page is out of sight -- hk-menu.js watches them) or 'never'.
    tab: function () {
      var s = menuState.style();
      if (s === 'tab') return 'always';
      if (s !== 'chip') return 'never';
      if (folded()) return narrowStyle() === 'chip_scroll' ? 'scrolled' : 'never';
      var b = boardOf(dashSeg()).menu;
      return b === 'chip_scroll' || b === 'chip_home' ? 'scrolled' : 'never';
    },
    // The round buttons on the page now (their <ha-card>s), for the
    // scrolled tab. A card that draws one hands itself over when it draws or
    // is attached again (a cached view comes back without drawing), and takes
    // itself back when it leaves the page (chipGone) -- held any longer, every
    // card a rebuild or a chip-row replan discarded stayed alive with the
    // whole state snapshot it last had (4,195 entities).
    chipShown: function (card) {
      if (!card) return;
      CHIPS.add(card);
      window.dispatchEvent(new CustomEvent('hk-menu-chip'));
    },
    chipGone: function (card) { CHIPS.delete(card); },
    chips: function () {
      var out = [];
      CHIPS.forEach(function (card) {
        var el = card.shadowRoot && card.shadowRoot.querySelector('[data-hk-role="menu"]');
        if (!el) CHIPS.delete(card);
        else if (el.isConnected) out.push(el);
      });
      return out;
    },
    // the button's picture: the iPad sidebar glyph, or three lines
    icon: function () { return msetting('menu.glyph', 'sidebar') === 'lines' ? 'hk:menu' : 'hk:dock-left'; },
    clock: function () {
      return menuState.on() && !menuState.docked() && msetting('menu.clock', true) !== false;
    },
    open: function () { if (window.hkMenu) window.hkMenu.open(); },
    toggle: function () { if (window.hkMenu) window.hkMenu.toggle(); },
    // a card that draws a way in signs on this, so it redraws when any of it changes
    sig: function () {
      return [menuState.on(), menuState.style(), boardOf(dashSeg()).menu, menuState.icon(),
              menuState.clock()].join('|');
    },
    // Where a room heading for `area` leads: this dashboard's room page for
    // it, while "Room headings open their room page" is on. null: stay a
    // plain heading.
    roomPath: function (area) {
      if (!area || msetting('rooms.headings', true) === false) return null;
      var i = roomIndex(area);
      if (i === null) return null;
      var v = lovelaceConfig().views[i];
      return '/' + dashSeg() + '/' + (v.path || i);
    },
    // THE DATE LINE, for the edge tab: hk-header-card measures where its
    // date's optical centre sits (px below the top of the dashboard's panel)
    // and publishes it here; hk-menu.js centres the tab on it. Kept per
    // dashboard, and across reloads, so a page opened straight onto a room
    // puts the tab where Home will.
    publishDate: function (y) {
      var d = dashSeg();
      if (dateLines[d] !== undefined && Math.abs(dateLines[d] - y) < 0.25) return;
      dateLines[d] = y;
      try { localStorage.setItem(DATE_KEY + d, String(Math.round(y * 10) / 10)); } catch (e) { /* private */ }
      window.dispatchEvent(new CustomEvent('hk-menu-date', { detail: { dash: d, y: y } }));
    },
    dateY: function () {
      var d = dashSeg();
      if (dateLines[d] === undefined) {
        try {
          var v = parseFloat(localStorage.getItem(DATE_KEY + d));
          if (isFinite(v)) dateLines[d] = v;
        } catch (e) { /* private */ }
      }
      return dateLines[d] === undefined ? null : dateLines[d];
    },
    areasOfView: areasOfView,
    viewTop: viewTop,
    config: lovelaceConfig, panel: panelLovelace, dash: dashSeg, holdsCard: holdsCard,
    homeButton: homeHasButton,
    NARROW: MENU_NARROW, DOCK: MENU_DOCK, TAB_MIN: TAB_MIN
  };
  window.hkCards.menu = menuState;
  // CROSSING THE PHONE WIDTH changes the style (a tab becomes the chip), so
  // every card redraws -- the same wake a settings change uses. Rare: a phone
  // turned sideways, a desktop window dragged narrow.
  try {
    window.matchMedia('(max-width: ' + (MENU_NARROW - 0.02) + 'px)').addEventListener('change', function () {
      window.dispatchEvent(new CustomEvent('hk-module-ready', { detail: { module: 'hk-narrow' } }));
    });
  } catch (e) { /* no matchMedia (a test harness) */ }
  // ...and so does a docked menu appearing or going, or the tab giving way
  // to the round button, as a window is resized across MENU_DOCK or TAB_MIN:
  // the buttons come and go with them.
  var dockWas = null, dockRaf = 0;
  window.addEventListener('resize', function () {
    if (dockRaf) return;
    dockRaf = requestAnimationFrame(function () {
      dockRaf = 0;
      var d = menuState.style();
      if (dockWas !== null && d !== dockWas) {
        window.dispatchEvent(new CustomEvent('hk-module-ready', { detail: { module: 'hk-dock' } }));
      }
      dockWas = d;
    });
  });

  window.hkCards.register = register;
  window.hkCards.wireEditor = wireEditor;
  window.hkCards.firstOf = firstOf;
  window.hkCards.SELECTED_BG = SELECTED_BG;
  window.hkCards.SELECTED_TEXT = SELECTED_TEXT;

  window.dispatchEvent(new Event('hk-cards-ready'));
})();
