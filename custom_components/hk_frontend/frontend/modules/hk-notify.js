// hk-notify.js -- NOTIFICATIONS: a banner at the top of the screen when
// something happens at home, like an iPhone's (Features -> Notifications).
//
// THE HOUSE DECIDES WHEN, THE SCREEN WHETHER. The integration watches the
// accessories and sends each notification once, over the pop-ups' channel
// (hk-settings.js re-sends it as the window event hk-house-event, type
// "notification"); the snapshot is already taken. This screen then decides
// (decide()): a screen of HK Frontend's that allows notifications (its
// notify), not in Do Not Disturb (its notify_dnd, or All Screens' that came
// with it -- the hours, or an entity on; an Important one gets through), and
// over the screensaver only as its choice says (notify_saver: all, important,
// off). Asleep (the black), only one that wakes the screen -- the house wakes
// it (Sleep Screen) and the banner shows once it is up. The doorbell's (Not
// Where a Pop-up Shows): never over its pop-up, and held a moment where that
// pop-up may still open, so a wall tablet shows the pop-up alone.
//
// THE BANNER. On <body>, above everything -- the screensaver too
// (2147483000) -- and under HK's own black curtain (2147483647). One glass
// surface (the tab bar's look); the newest on top, the others stacked under
// it with "N more" and Clear All; N more fans them out. Each keeps its own
// time (stay seconds; 0 = until dismissed) and a finger on it holds it.
// Swiped up or sideways it goes; a tap opens it in place: the snapshot big,
// the accessory's buttons. A tap on the picture does its Tap Opens.
//
// Gestures: touch events for a finger, pointer events for a mouse only --
// pointer capture under a finger wedged the iPhone app (hk-menu.js).
(function () {
  'use strict';
  if (window.hkNotify) return;

  var Z = 2147483100;
  var POP_WAIT_MS = 4000;
  var SIGN_KEEP_MS = 8 * 60 * 1000;   // a signed snapshot path is good for 10 minutes       // a pop-up for the same thing may still open
  var WAKE_WAIT_MS = 25000;     // asleep: the house wakes the screen within this
  var HIDDEN_KEEP_MS = 10 * 60 * 1000;
  var PHONE_W = 640;
  var STACK_SHOWN = 3;
  var STACK_MAX = 12;
  var SWIPE_PX = 70;
  var SLOP = 10;

  // ---------------------------------------------------------------- pure
  function seg() { return String(location.pathname).split('/')[1] || ''; }
  function mins(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  // within from..to (local); wraps midnight; from == to is all day
  function inWindow(date, from, to) {
    var a = mins(from), b = mins(to);
    if (a === null || b === null) return false;
    var n = date.getHours() * 60 + date.getMinutes();
    if (a === b) return true;
    return a < b ? (n >= a && n < b) : (n >= a || n < b);
  }
  var ON_STATES = { on: 1, active: 1, home: 1, open: 1, playing: 1 };
  function dndOn(dnd, date, states) {
    if (!dnd) return false;
    if (dnd.schedule && inWindow(date, dnd.from, dnd.to)) return true;
    var w = dnd['while'] || [];
    for (var i = 0; i < w.length; i++) {
      var s = states && states[w[i]];
      if (s && ON_STATES[s.state]) return true;
    }
    return false;
  }
  // what this screen does with notification n:
  //   show | wake | wait-pop | drop:<why>
  function decide(n, c) {
    var b = c.board;
    if (!b) return 'drop:not-a-screen';
    if (b.notify === false) return 'drop:off';
    if (c.editing) return 'drop:editing';
    // sent to some screens or people only (an automation's own)
    if (n.dashboards && n.dashboards.length && n.dashboards.indexOf(c.dash) < 0) return 'drop:elsewhere';
    if (n.users && n.users.length && n.users.indexOf(c.user) < 0) return 'drop:elsewhere';
    if (n.test) {
      // as if it went off: one that wakes the screen wakes it (the house
      // wakes the tablet for a test too); past Do Not Disturb and the saver
      if (n.wake && (c.asleep || c.saver)) return 'wake';
      return c.asleep ? 'drop:asleep' : 'show';
    }
    var dnd = b.notify_dnd || n.dnd;
    if (!n.important && dndOn(dnd, c.now || new Date(), c.states)) return 'drop:dnd';
    if (c.asleep) return n.wake ? 'wake' : 'drop:asleep';
    if (c.saver) {
      if (n.wake) return 'wake';
      var ch = b.notify_saver || n.saver || 'important';
      if (ch === 'off') return 'drop:saver';
      if (ch === 'important' && !n.important) return 'drop:saver';
    }
    if (n.pop) {
      if (c.popOpen && c.popOpen(n.pop)) return 'drop:popup';
      if (c.popWould && c.popWould(n.pop)) return 'wait-pop';
    }
    return 'show';
  }
  function isPhone() {
    var C = window.hkCards;
    try { if (C && C.menu && typeof C.menu.phone === 'function') return !!C.menu.phone(); } catch (e) { /* not yet */ }
    return (window.innerWidth || 1000) < PHONE_W;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(ts, now) {
    var s = Math.max(0, Math.round(((now || Date.now()) - ts) / 1000));
    if (s < 60) return 'now';
    var m = Math.round(s / 60);
    return m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago';
  }

  // ------------------------------------------------------------- context
  function haEl() { return document.querySelector('home-assistant'); }
  function hass() { var h = haEl(); return h && h.hass; }
  function board() {
    var S = window.hkSettings;
    var all = S && typeof S.get === 'function' ? S.get('boards', {}) : null;
    return (all && all[seg()]) || null;
  }
  function editing() {
    var C = window.hkCards;
    try {
      var p = C && C.menu && typeof C.menu.panel === 'function' ? C.menu.panel() : null;
      return !!(p && p.lovelace && p.lovelace.editMode);
    } catch (e) { return false; }
  }
  var black = false;
  window.addEventListener('hk-black', function (e) { black = !!(e && e.detail && e.detail.on); });
  function asleep() {
    return black || !!(window.hkSaver && typeof window.hkSaver.black === 'function' && window.hkSaver.black());
  }
  function saverOn() { return !!(window.hkSaver && typeof window.hkSaver.running === 'function' && window.hkSaver.running()); }
  function popOpen(h) {
    var D = window.hkDetail && window.hkDetail._ && window.hkDetail._.state && window.hkDetail._.state();
    return location.hash === '#' + h && !!(D ? D.el : true);
  }
  function popWould(h) {
    return !!(window.hkDetail && typeof window.hkDetail.answers === 'function' && window.hkDetail.answers('#' + h));
  }
  function context() {
    var h = hass();
    return { board: board(), editing: editing(), asleep: asleep(), saver: saverOn(), now: new Date(), dash: seg(),
             user: h && h.user ? h.user.id : null,
             states: h ? h.states : {}, popOpen: popOpen, popWould: popWould };
  }

  // ------------------------------------------------------------- the host
  var CSS = [
    ':host{all:initial}',
    '.layer{position:fixed;left:0;right:0;top:0;height:0;z-index:' + Z + ';pointer-events:none;',
    '  font-family:-apple-system,"SF Pro Text","SF Pro Display",system-ui,"Segoe UI",Roboto,sans-serif;color:#fff;',
    '  --top:max(18px, calc(env(safe-area-inset-top, 0px) + 8px));--w:min(600px, calc(100vw - 32px));--r:30px;--pad:16px 18px 16px 16px;--gap:16px;--ic:50px;--f1:20px;--f2:18px;--th:70px;--cw:min(680px, calc(100vw - 32px))}',
    // UNDER THE DYNAMIC ISLAND / A CAMERA CUTOUT: Home Assistant's page is
    // viewport-fit=cover, so the Companion app (iPhone) and Android report
    // them as the safe area's top -- the banner sits 8 px under it, as the
    // tab bar does (hk-tabbar.js TOP_CSS)
    '.layer.phone{--top:max(8px, calc(env(safe-area-inset-top, 0px) + 8px));--w:min(420px, calc(100vw - 16px));--r:26px;--pad:12px 14px 12px 12px;--gap:11px;--ic:38px;--f1:15.5px;--f2:15px;--th:50px;--cw:min(420px, calc(100vw - 16px))}',
    '.nb{position:absolute;left:50%;top:var(--top);width:var(--w);transform:translateX(-50%);box-sizing:border-box;display:flex;align-items:center;gap:var(--gap);',
    '  padding:var(--pad);border-radius:var(--r);pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none;',
    '  border:1px solid rgba(255,255,255,0.16);box-shadow:0 12px 40px rgba(0,0,0,0.32),inset 0 1px 0 rgba(255,255,255,0.18);',
    '  transition:transform .55s cubic-bezier(.2,1.12,.35,1),opacity .35s ease,background .3s;will-change:transform}',
    '.glass .nb,.glass .nxc{background:linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04)),rgba(30,32,40,0.46);',
    '  -webkit-backdrop-filter:blur(26px) saturate(1.7);backdrop-filter:blur(26px) saturate(1.7)}',
    '.frosted .nb,.frosted .nxc{background:rgba(62,64,74,0.95)}',
    '.clear .nb,.clear .nxc{background:rgba(24,24,28,0.93)}',
    '.nb.imp{border-color:rgba(255,105,97,0.55)}',
    '.nb.enter{transform:translate(-50%,calc(-100% - var(--top) - 24px)) scale(.96);opacity:.6}',
    '.nb.leave{transform:translate(-50%,calc(-100% - var(--top) - 24px)) scale(.96)!important;opacity:0;transition:transform .38s cubic-bezier(.4,0,.8,.4),opacity .38s}',
    '.nb.gone-l{transform:translate(-160%,0)!important;opacity:0;transition:transform .3s ease-in,opacity .3s}',
    '.nb.gone-r{transform:translate(60%,0)!important;opacity:0;transition:transform .3s ease-in,opacity .3s}',
    '.nb.drag{transition:none}',
    '.nb.behind{pointer-events:none}',
    '.nb.behind > *{opacity:0}',
    '.ic{flex:none;width:var(--ic);height:var(--ic);border-radius:calc(var(--ic) * .26);display:grid;place-items:center;position:relative;overflow:hidden}',
    '.ic ha-icon{--mdc-icon-size:calc(var(--ic) * .6);color:#fff;display:block}',
    '.ic.av{border-radius:50%;background:linear-gradient(180deg,#a3a9b5,#7b8190);font-weight:600;font-size:calc(var(--ic) * .4);letter-spacing:.3px}',
    '.ic img{width:100%;height:100%;object-fit:cover;display:block}',
    '.tx{flex:1;min-width:0}',
    '.imp-tag{font-size:calc(var(--f2) * .72);font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#ff8a80;margin-bottom:2px}',
    '.imp-tag.test{color:#8ec5ff}',
    '.t1{font-weight:650;font-size:var(--f1);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.t2{font-size:var(--f2);line-height:1.25;opacity:.92;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.rt{flex:none;align-self:stretch;display:flex;flex-direction:column;align-items:flex-end;gap:6px}',
    '.when{font-size:calc(var(--f2) * .86);opacity:.55;line-height:1.1}',
    '.th{width:var(--th);height:var(--th);border-radius:calc(var(--th) * .16);object-fit:cover;display:block;background:rgba(255,255,255,0.08);box-shadow:0 0 0 .5px rgba(255,255,255,.2)}',
    '.ctl{position:absolute;left:50%;transform:translate(-50%,6px);display:flex;gap:8px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s,top .35s cubic-bezier(.2,1.1,.35,1)}',
    '.ctl.on{opacity:1;pointer-events:auto;transform:translate(-50%,0)}',
    '.ctl button{border:1px solid rgba(255,255,255,0.16);font:inherit;font-size:calc(var(--f2) * .9);font-weight:600;color:#fff;padding:8px 16px;border-radius:999px;cursor:pointer;',
    '  background:rgba(50,52,60,0.6);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);box-shadow:0 6px 20px rgba(0,0,0,.25)}',
    '.frosted .ctl button{background:rgba(62,64,74,0.95)}.clear .ctl button{background:rgba(24,24,28,0.93)}',
    '.nx{position:fixed;inset:0;z-index:' + (Z + 1) + ';display:flex;justify-content:center;align-items:flex-start;padding-top:var(--top);pointer-events:auto;',
    '  background:rgba(0,0,0,0.28);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);opacity:0;transition:opacity .3s}',
    '.nx.on{opacity:1}',
    '.nxc{width:var(--cw);box-sizing:border-box;border-radius:var(--r);overflow:hidden;border:1px solid rgba(255,255,255,0.16);',
    '  box-shadow:0 24px 70px rgba(0,0,0,0.45);transform:translateY(-14px) scale(.94);transition:transform .45s cubic-bezier(.2,1.1,.35,1)}',
    '.nx.on .nxc{transform:none}',
    '.nxh{display:flex;align-items:center;gap:var(--gap);padding:var(--pad)}',
    '.x{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.14);display:grid;place-items:center;cursor:pointer;font-size:18px;border:0;color:#fff}',
    '.pic{position:relative;margin:0 12px;border-radius:calc(var(--r) - 12px);overflow:hidden;aspect-ratio:16/9;background:#111;cursor:pointer}',
    '.pic img{width:100%;height:100%;object-fit:cover;display:block}',
    '.pic .lbl{position:absolute;left:12px;bottom:12px;font-size:14px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,0.45)}',
    '.pic .go{position:absolute;right:12px;bottom:12px;font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,0.45)}',
    '.acts{display:flex;gap:10px;padding:14px 12px 12px}',
    '.acts button{flex:1;border:0;font:inherit;font-size:calc(var(--f2) * .95);font-weight:600;color:#fff;padding:14px 10px;border-radius:calc(var(--r) - 14px);',
    '  background:rgba(255,255,255,0.13);cursor:pointer;display:flex;gap:8px;align-items:center;justify-content:center}',
    '.acts button ha-icon{--mdc-icon-size:22px}',
    '.acts button.pri{background:rgba(255,255,255,0.9);color:#111}',
    '.acts button.red{background:rgba(255,69,58,0.85)}',
    '@media (prefers-reduced-motion: reduce){.nb,.nx,.nxc,.ctl{transition:opacity .2s!important}.nb.enter{transform:translateX(-50%)}}'
  ].join('\n');

  var host = null, root = null, layer = null, ctl = null;
  function look() {
    var g = document.documentElement.getAttribute('data-hk-glass') || 'blur';
    return g === 'frosted' ? 'frosted' : g === 'clear' ? 'clear' : 'glass';
  }
  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'hk-notify';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style><div class="layer"><div class="ctl"></div></div>';
    layer = root.querySelector('.layer');
    ctl = root.querySelector('.ctl');
    ctl.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.dataset.c === 'clear') clearAll();
      else { fan = b.dataset.c === 'fan'; layout(); }
    });
    document.body.appendChild(host);
  }
  function restyle() {
    if (!layer) return;
    layer.className = 'layer ' + look() + (isPhone() ? ' phone' : '');
  }

  // ------------------------------------------------------------ the stack
  var stack = [];          // newest first: {n, el, t, until, shownAt}
  var fan = false;
  var open = null;

  function iconHtml(n) {
    if (n.kind === 'people' && n.picture) return '<div class="ic av"><img src="' + esc(n.picture) + '" alt=""></div>';
    if (n.kind === 'people') return '<div class="ic av">' + esc(n.initials || '') + '</div>';
    return '<div class="ic" style="background:' + esc(n.tint || '#8e8e93') + '"><ha-icon icon="' + esc(n.icon || 'hk:bell') + '"></ha-icon></div>';
  }
  function bannerHtml(n) {
    return iconHtml(n) + '<div class="tx">' + (n.important || n.test ? '<div class="imp-tag' + (n.test && !n.important ? ' test' : '') + '">' +
      (n.test ? 'Test' + (n.important ? ' · Important' : '') : 'Important') + '</div>' : '') +
      '<div class="t1">' + esc(n.title) + '</div><div class="t2">' + esc(n.message) + '</div></div>' +
      '<div class="rt"><div class="when">' + ago(n._at) + '</div>' + (n.snap ? '<img class="th" alt="">' : '') + '</div>';
  }
  var signed = {};
  function snapUrl(n) {
    if (!n.snap) return Promise.resolve(null);
    var got = signed[n.snap];
    if (got && Date.now() - got.at < SIGN_KEEP_MS) return Promise.resolve(got.url);
    var h = hass();
    if (!h || !h.callWS) return Promise.resolve(null);
    return h.callWS({ type: 'hk_notify/snap/sign', snaps: [n.snap] }).then(function (r) {
      var u = r && r.signed && r.signed[n.snap];
      if (u) signed[n.snap] = { url: u, at: Date.now() };
      return u || null;
    }, function () { return null; });
  }
  function fillSnap(el, n) {
    var img = el.querySelector('img.th, .pic img');
    if (!img) return;
    var gone = function () {
      if (img.classList.contains('th')) img.remove();
      else if (img.parentNode) img.parentNode.style.display = 'none';
    };
    img.onerror = gone;          // kept SNAP_TTL (10 minutes): later, no picture
    snapUrl(n).then(function (u) { if (u) img.src = u; else gone(); });
  }

  function show(n) {
    ensure();
    restyle();
    n._at = n._at || Date.now();
    if (open) closeOpen(false);
    var el = document.createElement('div');
    el.className = 'nb enter' + (n.important ? ' imp' : '');
    el.innerHTML = bannerHtml(n);
    layer.appendChild(el);
    var item = { n: n, el: el, t: null };
    stack.unshift(item);
    // at most STACK_MAX: the oldest go (an unattended tablet piling up
    // Until Dismissed ones keeps its layers in check)
    while (stack.length > STACK_MAX) {
      var old = stack.pop();
      clearTimeout(old.t);
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
    fillSnap(el, n);
    bind(item);
    layout();
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('enter'); layout(); }); });
    arm(item);
    chime(n);
    return item;
  }
  function layout() {
    if (!layer) return;
    if (stack.length < 2) fan = false;
    var y = 0;
    stack.forEach(function (it, i) {
      var el = it.el;
      el.style.zIndex = String(100 - i);
      el.classList.toggle('behind', !fan && i > 0);
      if (el.classList.contains('enter') || el.classList.contains('leave')) { if (fan) y += el.offsetHeight + 10; return; }
      if (i === 0 || fan) el.style.transformOrigin = '';
      if (fan) { el.style.transform = 'translate(-50%,' + y + 'px)'; el.style.opacity = '1'; el.style.background = ''; y += el.offsetHeight + 10; }
      else if (i === 0) { el.style.transform = ''; el.style.opacity = ''; el.style.background = ''; }
      else if (i < STACK_SHOWN) {
        // each peeks out under the one above, whatever its own height: its
        // bottom edge 12 px under the top banner's, per step (scaled from it)
        var h0 = stack[0].el.offsetHeight, hi = el.offsetHeight;
        el.style.transformOrigin = '50% 100%';
        el.style.transform = 'translate(-50%,' + (h0 - hi + i * 12) + 'px) scale(' + (1 - i * 0.055) + ')';
        el.style.opacity = '1';
        el.style.background = look() === 'glass' ? (i === 1 ? 'rgba(62,62,68,0.82)' : 'rgba(48,48,54,0.78)') : '';
      } else { el.style.transform = 'translate(-50%,22px) scale(.9)'; el.style.opacity = '0'; }
    });
    var n = stack.length;
    if (n < 2) { ctl.classList.remove('on'); return; }
    var h0 = stack[0].el.offsetHeight || 80;
    var top = parseFloat(getComputedStyle(stack[0].el).top) || 18;
    ctl.style.top = (top + (fan ? y : h0 + 36)) + 'px';
    ctl.innerHTML = fan ? '<button data-c="less">Show Less</button><button data-c="clear">✕ Clear All</button>'
                        : '<button data-c="fan">' + (n - 1) + ' more</button><button data-c="clear">✕ Clear All</button>';
    ctl.classList.add('on');
  }
  function arm(it) {
    clearTimeout(it.t);
    var s = +it.n.stay;
    if (!(s > 0)) return;          // until dismissed
    var left = s * 1000 - (it.held || 0);
    it.since = Date.now();
    it.t = setTimeout(function () { dismiss(it); }, Math.max(1000, left));
  }
  function hold(it) {
    if (!it.t) return;
    clearTimeout(it.t);
    it.t = null;
    it.held = (it.held || 0) + (Date.now() - (it.since || Date.now()));
  }
  function dismiss(it, dir) {
    var i = stack.indexOf(it);
    if (i < 0) return;
    clearTimeout(it.t);
    stack.splice(i, 1);
    var el = it.el;
    if (dir) { el.style.transform = ''; el.classList.add(dir < 0 ? 'gone-l' : 'gone-r'); }
    else { el.style.transform = ''; el.classList.add('leave'); }
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    setTimeout(layout, fan ? 120 : 0);
  }
  function clearAll() {
    fan = false;
    stack.slice().forEach(function (it, i) { setTimeout(function () { dismiss(it); }, i * 60); });
  }

  // ------------------------------------------------------------- gestures
  function bind(it) {
    var el = it.el, g = null;
    function start(x, y) {
      if (!fan && stack[0] !== it) return false;
      g = { x: x, y: y, dx: 0, dy: 0, axis: null, base: fan ? el.style.transform : '' };
      el.classList.add('drag');
      hold(it);
      return true;
    }
    function move(x, y) {
      if (!g) return;
      g.dx = x - g.x; g.dy = y - g.y;
      if (!g.axis && Math.max(Math.abs(g.dx), Math.abs(g.dy)) > SLOP) g.axis = Math.abs(g.dx) > Math.abs(g.dy) ? 'x' : 'y';
      if (g.axis === 'x') { el.style.transform = (g.base || 'translateX(-50%)') + ' translateX(' + g.dx + 'px)'; el.style.opacity = String(Math.max(0.25, 1 - Math.abs(g.dx) / 500)); }
      else if (g.axis === 'y' && !fan) el.style.transform = 'translate(-50%,' + (g.dy < 0 ? g.dy : g.dy * 0.35) + 'px)';
    }
    function end() {
      if (!g) return;
      var s = g; g = null;
      el.classList.remove('drag');
      saverTouch();
      if (s.axis === 'x' && Math.abs(s.dx) > SWIPE_PX) { dismiss(it, s.dx); return; }
      if (s.axis === 'y' && !fan && s.dy < -30) { dismiss(it); return; }
      el.style.opacity = '';
      if (!s.axis || (s.axis === 'y' && !fan && s.dy > 36)) { layout(); openIt(it); return; }
      layout();
      arm(it);
    }
    el.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      if (t && start(t.clientX, t.clientY)) e.stopPropagation();
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0];
      if (t && g) { e.preventDefault(); move(t.clientX, t.clientY); }
    }, { passive: false });
    el.addEventListener('touchend', function (e) { if (g) { e.preventDefault(); end(); } });
    el.addEventListener('touchcancel', function () { if (g) { g.axis = 'none'; end(); } });
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (!start(e.clientX, e.clientY)) return;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    });
    el.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') move(e.clientX, e.clientY); });
    el.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse') end(); });
    el.addEventListener('pointercancel', function (e) { if (e.pointerType === 'mouse' && g) { g.axis = 'none'; end(); } });
  }
  function saverTouch() {
    if (saverOn() && window.hkSaver && typeof window.hkSaver.touched === 'function') window.hkSaver.touched();
  }

  // ------------------------------------------------------------- opened
  function actionsOf(n) {
    var out = (n.buttons || []).map(function (b, i) { return { id: b.id, label: b.label, icon: b.icon, pri: i === 0 }; });
    if (!out.length) out.push({ id: 'dismiss', label: n.important ? 'Dismiss' : 'OK', icon: 'hk:check-bold', red: !!n.important });
    return out;
  }
  function openIt(it) {
    var n = it.n;
    // nothing more to show: its Tap Opens straight away
    if (!n.snap && !(n.buttons && n.buttons.length)) {
      if (n.tap !== 'none') { dismiss(it); tapOpens(n); } else arm(it);
      return;
    }
    hold(it);
    var nx = document.createElement('div');
    nx.className = 'nx';
    nx.innerHTML = '<div class="nxc"><div class="nxh">' + iconHtml(n) + '<div class="tx">' +
      (n.important ? '<div class="imp-tag">Important</div>' : '') + '<div class="t1">' + esc(n.title) + '</div><div class="t2">' +
      esc(n.message) + '</div></div><button class="x" data-x aria-label="Close">✕</button></div>' +
      (n.snap ? '<div class="pic" data-pic><img alt=""><div class="lbl">' + esc(timeOf(n)) + '</div>' +
        (n.tap === 'camera' ? '<div class="go">▶ Live</div>' : '') + '</div>' : '') +
      '<div class="acts">' + actionsOf(n).map(function (a) {
        return '<button class="' + (a.pri ? 'pri' : a.red ? 'red' : '') + '" data-a="' + esc(a.id) + '"><ha-icon icon="' + esc(a.icon || 'hk:check-bold') + '"></ha-icon>' + esc(a.label) + '</button>';
      }).join('') + '</div></div>';
    layer.appendChild(nx);
    fillSnap(nx, n);
    it.el.style.opacity = '0';
    open = { it: it, nx: nx };
    requestAnimationFrame(function () { requestAnimationFrame(function () { nx.classList.add('on'); }); });
    nx.addEventListener('click', function (e) {
      saverTouch();
      var a = e.target.closest && e.target.closest('[data-a]');
      if (a) { act(n, a.dataset.a); closeOpen(true); return; }
      if (e.target.closest && e.target.closest('[data-pic]')) { closeOpen(true); tapOpens(n); return; }
      if ((e.target.closest && e.target.closest('[data-x]')) || !(e.target.closest && e.target.closest('.nxc'))) closeOpen(true);
    });
  }
  function timeOf(n) {
    // the house's time (ts), else when this screen got it -- never "Invalid Date"
    var t = n.ts ? n.ts * 1000 : n._at;
    if (!t || isNaN(t)) return '';
    try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function closeOpen(gone) {
    var o = open;
    if (!o) return;
    open = null;
    o.nx.classList.remove('on');
    setTimeout(function () { if (o.nx.parentNode) o.nx.parentNode.removeChild(o.nx); }, 300);
    if (gone) dismiss(o.it);
    else { o.it.el.style.opacity = ''; arm(o.it); }
  }
  function wakeSaver() {
    if (saverOn() && window.hkSaver && typeof window.hkSaver.wake === 'function') window.hkSaver.wake();
  }
  function sheet(id) {
    if (!id) return;
    wakeSaver();
    if (window.hkDetail && typeof window.hkDetail.open === 'function') { try { window.hkDetail.open(id); return; } catch (e) { /* below */ } }
    var h = haEl();
    if (h) h.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  function tapOpens(n) {
    if (n.tap === 'camera' && n.camera) sheet(n.camera);
    else if (n.tap === 'sheet') sheet(n.entity);
  }
  function act(n, id) {
    var h = hass();
    if (id === 'camera') { sheet(n.camera); return; }
    if (!h || !h.callService) return;
    if (id === 'close') h.callService('cover', 'close_cover', { entity_id: n.entity });
    else if (id === 'open') h.callService('cover', 'open_cover', { entity_id: n.entity });
    else if (id === 'lock') h.callService('lock', 'lock', { entity_id: n.entity });
  }

  // --------------------------------------------------------------- chime
  var audio = null;
  function chime(n) {
    if (!n.chime || isPhone()) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = audio || new AC();
      // not allowed to play yet (no tap since the page loaded): nothing
      // queued -- a suspended clock would stack them all up for later
      if (audio.state !== 'running') { if (audio.resume) audio.resume(); return; }
      var t0 = audio.currentTime + 0.02;
      var notes = n.important ? [[880, 0], [1175, 0.16], [880, 0.5], [1175, 0.66]] : [[988, 0], [1319, 0.13]];
      notes.forEach(function (p) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t0 + p[1]);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + p[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[1] + 0.45);
        o.connect(g); g.connect(audio.destination);
        o.start(t0 + p[1]); o.stop(t0 + p[1] + 0.5);
      });
    } catch (e) { /* no sound here */ }
  }

  // --------------------------------------------------------- arrivals
  var hidden = [];
  function arrive(n) {
    n._at = Date.now();
    if (document.visibilityState === 'hidden') { hidden.push(n); if (hidden.length > STACK_MAX) hidden.shift(); return; }
    route(n, context());
  }
  function route(n, c) {
    var what = decide(n, c);
    if (what === 'show') { show(n); return; }
    if (what === 'wake') { wakeSaver(); whenAwake(function () { show(n); }); return; }
    if (what === 'wait-pop') {
      var t0 = Date.now();
      (function check() {
        if (popOpen(n.pop)) return;                    // the pop-up came: it alone
        if (Date.now() - t0 >= POP_WAIT_MS) { show(n); return; }
        setTimeout(check, 250);
      })();
    }
  }
  function whenAwake(fn) {
    if (!asleep()) { fn(); return; }
    var done = false;
    function go(e) {
      if (done || (e && e.detail && e.detail.on)) return;
      done = true;
      window.removeEventListener('hk-black', go);
      fn();
    }
    window.addEventListener('hk-black', go);
    setTimeout(function () { if (!done) { done = true; window.removeEventListener('hk-black', go); } }, WAKE_WAIT_MS);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !hidden.length) return;
    var now = Date.now(), keep = hidden.filter(function (n) {
      var life = (+n.stay > 0 ? n.stay * 1000 : HIDDEN_KEEP_MS);
      return now - n._at < life;
    });
    hidden = [];
    keep.forEach(function (n) { route(n, context()); });
  });
  window.addEventListener('hk-house-event', function (ev) {
    var n = ev && ev.detail;
    if (n && n.type === 'notification') arrive(n);
  });
  window.addEventListener('resize', function () { restyle(); layout(); });
  // "now" becomes "2m ago" on a banner that stays
  setInterval(function () {
    stack.forEach(function (it) { var w = it.el.querySelector('.when'); if (w) w.textContent = ago(it.n._at); });
  }, 30000);

  window.hkNotify = {
    // the screensaver lets a finger on a banner be the banner's (hk-saver.js)
    owns: function (e) {
      if (!host) return false;
      var p = e && typeof e.composedPath === 'function' ? e.composedPath() : [];
      return p.indexOf(host) >= 0 && (stack.length > 0 || !!open);
    },
    show: function (n) { return show(n); },
    shown: function () { return stack.map(function (it) { return it.n; }); },
    clear: clearAll,
    _: { decide: decide, dndOn: dndOn, inWindow: inWindow, ago: ago, actionsOf: actionsOf, route: route,
         state: function () { return { stack: stack, fan: fan, open: open, black: black }; } }
  };
  try { window.dispatchEvent(new CustomEvent('hk-module-ready', { detail: { module: 'notify' } })); } catch (e) { /* none */ }
})();
