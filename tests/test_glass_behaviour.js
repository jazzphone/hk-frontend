// hk-glass.js BEHAVIOR: the shared blur run for real against a small DOM
// that has geometry, with a virtual clock, timers and animation frames.
// test_glass.js checks the pure helpers and the source; this checks what the
// module DOES -- the hold and release of a new view, the press loop, the
// layer sizes, the row promotions -- each case a specific failure mode, so a
// regression that brings one back fails here.
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');

// ---- clock, timers, frames -------------------------------------------------
var T = 0, timers = [], tid = 0, rafq = [];
function setTimeout(fn, ms) { var id = ++tid; timers.push({ id: id, at: T + (ms || 0), fn: fn, iv: 0 }); return id; }
function setInterval(fn, ms) { var id = ++tid; timers.push({ id: id, at: T + ms, fn: fn, iv: ms }); return id; }
function clearTimeout(id) { timers = timers.filter(function (t) { return t.id !== id; }); }
var clearInterval = clearTimeout;
function requestAnimationFrame(fn) { rafq.push(fn); return rafq.length; }
var performance = { now: function () { return T; } };
function runTimers() {
  for (;;) {
    var due = timers.filter(function (t) { return t.at <= T; }).sort(function (a, b) { return a.at - b.at; })[0];
    if (!due) return;
    if (due.iv) due.at += due.iv; else timers = timers.filter(function (t) { return t !== due; });
    due.fn();
  }
}
var FRAME = 11;                                  // ~90 fps, a wall tablet's rate
function frame() { T += FRAME; runTimers(); var q = rafq; rafq = []; q.forEach(function (f) { f(T); }); }
function advance(ms) { var end = T + ms; while (T < end) frame(); }
globalThis.console = globalThis.console || { log: print, warn: print, error: print };
globalThis.window = globalThis;

// ---- elements with boxes ---------------------------------------------------
function Style() {}
Object.defineProperty(Style.prototype, 'setProperty', { enumerable: false, value: function (k, v) { this[k] = v; } });
Object.defineProperty(Style.prototype, 'getPropertyValue', { enumerable: false, value: function (k) { return this[k] || ''; } });
var DOCUMENT_NODE = { nodeType: 9 };
function E(tag, cs, rect) {
  this.tagName = tag; this.nodeType = 1; this.children = []; this.parentNode = null;
  this.shadowRoot = null; this.style = new Style(); this.attrs = {};
  this._cs = cs || {}; this._rect = rect || null;
  this.scrollLeft = 0; this.scrollTop = 0; this.clientLeft = 0; this.clientTop = 0;
  this.currentCSSZoom = 1;
}
function SR(host) { this.nodeType = 11; this.host = host; this.children = []; this.parentNode = null; }
[E, SR].forEach(function (C) {
  C.prototype.appendChild = function (c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; };
  C.prototype.insertBefore = function (c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    var i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this; return c;
  };
  C.prototype.removeChild = function (c) { this.children = this.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; };
  Object.defineProperty(C.prototype, 'firstChild', { get: function () { return this.children[0] || null; } });
  C.prototype.querySelectorAll = function () {
    var out = [];
    (function w(n) { n.children.forEach(function (c) { out.push(c); w(c); }); })(this);
    return out;
  };
  C.prototype.contains = function (x) { for (var n = x; n; n = n.parentNode) if (n === this) return true; return false; };
});
E.prototype.attachShadow = function () { this.shadowRoot = new SR(this); return this.shadowRoot; };
E.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
E.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null; };
E.prototype.hasAttribute = function (k) { return k in this.attrs; };
E.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
Object.defineProperty(E.prototype, 'isConnected', { get: function () {
  for (var n = this; n; n = n.nodeType === 11 ? n.host : n.parentNode) if (n === DOCUMENT_NODE) return true;
  return false;
} });
E.prototype.getBoundingClientRect = function () {
  if (!this.isConnected || !this._rect) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  var r = typeof this._rect === 'function' ? this._rect() : this._rect;
  return { left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h, width: r.w, height: r.h };
};
function layersIn(el) { return (el.shadowRoot || el).children.filter(function (c) { return c.hasAttribute && c.hasAttribute('data-hk-glass-layer'); }); }
// What a browser reports: the content's extent, or an absolutely positioned
// layer's far edge, whichever is larger (the layer is scrollable overflow).
Object.defineProperty(E.prototype, 'scrollWidth', { get: function () {
  var m = this._contentW || (this._rect ? this.getBoundingClientRect().width : 0);
  layersIn(this).forEach(function (l) { m = Math.max(m, parseFloat(l.style.left) + parseFloat(l.style.width)); });
  return m;
} });
Object.defineProperty(E.prototype, 'scrollHeight', { get: function () {
  var m = this._contentH || (this._rect ? this.getBoundingClientRect().height : 0);
  layersIn(this).forEach(function (l) { m = Math.max(m, parseFloat(l.style.top) + parseFloat(l.style.height)); });
  return m;
} });
Object.defineProperty(E.prototype, 'clientWidth', { get: function () { return this._rect ? this.getBoundingClientRect().width : 0; } });
Object.defineProperty(E.prototype, 'offsetWidth', { get: function () { return this._rect ? Math.round(this.getBoundingClientRect().width) : 0; } });
var computed = 0;                                // getComputedStyle calls (collect()'s cost)
function getComputedStyle(el) {
  computed++;
  var c = el._cs || {};
  return {
    position: c.position || 'static', overflowX: c.overflowX || 'visible', overflowY: c.overflowY || 'visible',
    transform: c.transform || 'none', borderTopLeftRadius: c.radius || '0px',
    getPropertyValue: function (k) { return k === '--hk-glass-surface' ? (c.glass ? ' 1' : ' 0') : ''; }
  };
}
var docL = {};
var HTML = new E('HTML'), BODY = new E('BODY');
HTML.parentNode = DOCUMENT_NODE; HTML.appendChild(BODY);
var document = {
  documentElement: HTML, body: BODY, hidden: false,
  createElement: function (t) { return new E(t.toUpperCase()); },
  addEventListener: function (t, f) { (docL[t] = docL[t] || []).push(f); },
  removeEventListener: function (t, f) { docL[t] = (docL[t] || []).filter(function (x) { return x !== f; }); }
};
window.addEventListener = function () {};
window.removeEventListener = function () {};
window.devicePixelRatio = 1.5;                   // a 1920 x 1200 tablet at 1280 x 800 CSS
function ResizeObserver() {}
ResizeObserver.prototype.observe = ResizeObserver.prototype.unobserve = ResizeObserver.prototype.disconnect = function () {};

var LOOK = 'blur', settingsL = [];
window.hkSettings = { glass: function () { return LOOK; }, onChange: function (fn) { settingsL.push(fn); } };
function setLook(l) { LOOK = l; settingsL.forEach(function (f) { f(); }); }

// A view as Home Assistant builds it: hui-view > hk-grid-view (shadow) > cards.
function view() {
  var v = new E('HUI-VIEW', {}, { x: 0, y: 0, w: 1280, h: 2000 });
  var gv = new E('HK-GRID-VIEW', {}, { x: 0, y: 0, w: 1280, h: 2000 }); gv.attachShadow();
  v.appendChild(gv);
  BODY.appendChild(v);
  return { v: v, grid: gv.shadowRoot };
}
// A card with one glass plate (rect may be a function: a press animation).
function card(rect, opts) {
  opts = opts || {};
  var c = new E('HK-TILE-CARD', {}, rect); c.attachShadow();
  if (!opts.noPlate) { var p = new E('HA-CARD', { glass: 1, radius: '23.5px' }, rect); c.shadowRoot.appendChild(p); c._plate = p; }
  return c;
}
// A sideways row (hk-row-card's .row) holding cards.
function row(parent, y) {
  var host = new E('HK-ROW-CARD', {}, { x: 0, y: y, w: 1280, h: 104 }); host.attachShadow();
  var r = new E('DIV', { overflowX: 'auto', overflowY: 'hidden' }, { x: 0, y: y, w: 1280, h: 104 });
  host.shadowRoot.appendChild(r); parent.appendChild(host);
  return r;
}
var GL = window.__hkGlassCards = new Set();
// What HkBase's glassJoin does on connect / disconnect.
function join(c) { GL.add(c); if (window.hkGlass) window.hkGlass.changed(c, true); }
function leave(c) { GL.delete(c); if (window.hkGlass) window.hkGlass.changed(c, false); }
function add(parent, c) { parent.appendChild(c); join(c); return c; }
function drop(c) { c.remove(); leave(c); }
function fire(t, ev) { (docL[t] || []).slice().forEach(function (f) { f(ev); }); }
function pathOf(el) { var out = []; for (var n = el; n && n !== DOCUMENT_NODE; n = n.nodeType === 11 ? n.host : n.parentNode) out.push(n); return out; }
function down(c, id) { fire('pointerdown', { pointerId: id, composedPath: function () { return pathOf(c._plate); } }); }
function up(id) { fire('pointerup', { pointerId: id }); }
function pathOfLayer(el, i) { var L = layersIn(el)[i || 0]; return L ? L.getAttribute('data-path') : ''; }
function hidden(v) { return v.style.visibility === 'hidden'; }

var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }

// ---------------------------------------------------------------------------
print('=== a view painted before hk-glass loaded is never held later ===');
// HkBase joins cards whichever loads first; here the cards are on screen first.
var V0 = view();
var c0 = card({ x: 20, y: 40, w: 192, h: 70 }); V0.grid.appendChild(c0); GL.add(c0);
load(HK_ROOT + '/frontend/modules/hk-glass.js');
var G = window.hkGlass;
advance(100);
ok('the module starts with the blur look and frosts the view already there', G.stats().active && layersIn(V0.v).length === 1, G.stats());
add(V0.grid, card({ x: 20, y: 140, w: 192, h: 70 }));
ok('a conditional card appearing later does not hide the page', !hidden(V0.v), V0.v.style.visibility);
V0.v.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== a NEW view is held until frosted, then shown ===');
var V1 = view();
var t1 = T;
for (var i = 0; i < 6; i++) add(V1.grid, card({ x: 20 + i * 204, y: 40, w: 192, h: 70 }));
ok('hidden from the first join, its fade cancelled', hidden(V1.v) && V1.v.style.animation === 'none' &&
   V1.v.getAttribute('data-hk-frost') === 'pending');
frame();
ok('...still hidden once its layer is placed (the joins have not settled)', hidden(V1.v) && layersIn(V1.v).length === 1);
while (hidden(V1.v) && T - t1 < 3000) frame();
ok('shown ~SETTLE_MS after the last join, not at the backstop', T - t1 >= 120 && T - t1 < 200, T - t1);
ok('...remembered as done', V1.v.getAttribute('data-hk-frost') === 'done');
V1.v.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== joins OUTSIDE the held view do not keep it hidden ===');
var V2 = view(), t2 = T;
add(V2.grid, card({ x: 20, y: 40, w: 192, h: 70 }));
var elsewhere = new E('DIV', { position: 'fixed' }, { x: 0, y: 0, w: 10, h: 10 }); BODY.appendChild(elsewhere);
var outside = [];
while (hidden(V2.v) && T - t2 < 3000) {
  // a pop-up's / detail sheet's / screensaver's card attaching every ~100 ms
  if (Math.round(T - t2) % 99 < FRAME) outside.push(add(elsewhere, card({ x: 0, y: 0, w: 5, h: 5 }, { noPlate: true })));
  frame();
}
ok('released on its own settle, not the 2.5 s backstop', T - t2 < 300, T - t2);
V2.v.remove(); elsewhere.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== a view on screen when the blur is switched on is never held ===');
setLook('clear'); advance(50);
var V3 = view();
add(V3.grid, card({ x: 20, y: 40, w: 192, h: 70 }));
advance(200);
ok('clear: nothing held, nothing layered', !hidden(V3.v) && layersIn(V3.v).length === 0);
setLook('blur'); advance(100);
ok('blur switched on live: the view is frosted in place', layersIn(V3.v).length === 1 && !hidden(V3.v));
add(V3.grid, card({ x: 20, y: 140, w: 192, h: 70 }));
ok('a conditional card appearing does not hide the page', !hidden(V3.v), V3.v.style.visibility);
V3.v.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== a tap that navigates does not run a full pass per frame ===');
var V4 = view(), taps = [];
for (i = 0; i < 20; i++) taps.push(add(V4.grid, card({ x: 20 + (i % 6) * 204, y: 40 + Math.floor(i / 6) * 82, w: 192, h: 70 })));
advance(400);
down(taps[0], 1);
var u4 = G.stats().updates; advance(88);
ok('while the card is pressed: no full pass, the press pass runs', G.stats().updates === u4 && G.stats().pressMs !== undefined,
   { updates: G.stats().updates - u4 });
up(1);
// the click navigates: the old view goes, the new one arrives
V4.v.remove(); taps.forEach(leave);
var V4b = view(); add(V4b.grid, card({ x: 20, y: 40, w: 192, h: 70 }));
var b4 = G.stats().updates; advance(330);
ok('the 300 ms tail after it runs at most the new view\'s own passes', G.stats().updates - b4 <= 3, G.stats().updates - b4);
advance(300);
ok('...and the press loop has stopped (nothing queued for the next frame)', rafq.length === 0, rafq.length);
V4b.v.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== a second tap inside the first one\'s release ===');
var V5 = view(), sA = 1, sB = 1;
function scaled(x, y, w, h, s) { return function () { var S = s(); return { x: x + w * (1 - S) / 2, y: y + h * (1 - S) / 2, w: w * S, h: h * S }; }; }
var A = add(V5.grid, card(scaled(20, 40, 192, 70, function () { return sA; })));
var B = add(V5.grid, card(scaled(224, 40, 192, 70, function () { return sB; })));
advance(400);
var FULL_A = 'M43.5,40', SMALL_A = 'M47.3,';      // A's first point, whole and at .96
down(A, 1); sA = 0.96; advance(150);
ok('the pressed card\'s cut-out shrinks with it', pathOfLayer(V5.v).indexOf(SMALL_A) >= 0);
up(1); down(B, 2); sB = 0.96;                    // B tapped the moment A lifts
advance(30); sA = 1; advance(22);                // A's release ends; B still held
ok('A is still followed while B is held: its cut-out is whole again', pathOfLayer(V5.v).indexOf(FULL_A) >= 0,
   pathOfLayer(V5.v).slice(0, 60));
advance(100); up(2); advance(40); sB = 1; advance(400);
ok('after both, both cut-outs are whole without waiting for the 2 s backstop',
   pathOfLayer(V5.v).indexOf(FULL_A) >= 0 && pathOfLayer(V5.v).indexOf('M247.5,40') >= 0);
V5.v.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== layers are sized from their shapes, never from scrollWidth ===');
var V6 = view(), r6 = row(V6.grid, 40), chips = [];
for (i = 0; i < 10; i++) chips.push(add(r6, card({ x: 10 + i * 204, y: 47, w: 192, h: 70 })));
r6._contentW = 10 + 10 * 204;
advance(300);
var w0 = parseFloat(layersIn(r6)[0].style.width);
chips.slice(5).forEach(drop); r6._contentW = 10 + 5 * 204;
advance(300);
var w1 = parseFloat(layersIn(r6)[0].style.width);
ok('a row that loses cards gives the width back (no scrolling into an empty end)',
   w0 > 2000 && w1 <= r6._contentW, { before: w0, after: w1, content: r6._contentW });
var tall = [];
for (i = 0; i < 20; i++) tall.push(add(V6.grid, card({ x: 20, y: 200 + i * 82, w: 192, h: 70 })));
advance(300);
var h0 = Math.max.apply(null, layersIn(V6.v).map(function (l) { return parseFloat(l.style.top) + parseFloat(l.style.height); }));
tall.slice(5).forEach(drop);
advance(300);
var h1 = Math.max.apply(null, layersIn(V6.v).map(function (l) { return parseFloat(l.style.top) + parseFloat(l.style.height); }));
ok('a page that gets shorter gives the height back', h1 <= 200 + 4 * 82 + 70 + 1 && h0 > h1, { before: h0, after: h1 });
V6.v.remove(); Array.from(GL).forEach(leave); advance(300);

var Bn = G._bands, topRow = [], botRow = [];
for (i = 0; i < 6; i++) topRow.push({ x: 20 + i * 204, y: 40, w: 192, h: 70, r: 23.5 });
for (i = 0; i < 6; i++) botRow.push({ x: 20 + i * 204, y: 5800, w: 192, h: 70, r: 23.5 });
var bt = Bn(topRow, 1280, 6000, 1.5), bb = Bn(botRow, 1280, 6000, 1.5);
ok('pills only at the top of a 6000 px extent: a band as tall as the pills, not the page',
   bt.length === 1 && bt[0].start === 40 && bt[0].len === 70, bt.map(function (b) { return [b.start, b.len]; }));
ok('pills only at the bottom: the band starts at them, not at 0',
   bb.length === 1 && bb[0].start === 5800 && bb[0].len * 1.5 <= 4096, bb.map(function (b) { return [b.start, b.len]; }));

// ---------------------------------------------------------------------------
print('\n=== will-change: sideways rows only, and given back ===');
var V7 = view(), r7 = row(V7.grid, 40);
var rc = add(r7, card({ x: 20, y: 47, w: 192, h: 70 }));
var own = add(r7, card({ x: 224, y: 47, w: 192, h: 70 })); own.style.willChange = 'opacity';
advance(300);
ok('a card in a sideways row gets its own layer', rc.style.willChange === 'transform' && own.style.willChange === 'transform');
var fx = new E('DIV', { position: 'fixed' }, { x: 0, y: 0, w: 1280, h: 800 });
// hk-popup's .sheet: overflow-y:auto, and overflow-x COMPUTES to auto with it
var sheet = new E('DIV', { position: 'relative', overflowX: 'auto', overflowY: 'auto' }, { x: 190, y: 100, w: 900, h: 480 });
BODY.appendChild(fx); fx.appendChild(sheet);
var sc = add(sheet, card({ x: 210, y: 170, w: 192, h: 70 }));
advance(100);
ok('a pop-up sheet\'s card is frosted in the sheet but NOT promoted',
   layersIn(sheet).length === 1 && !sc.style.willChange, { layers: layersIn(sheet).length, wc: sc.style.willChange });
V7.v.remove(); leave(rc); leave(own); advance(50);
ok('a promoted card that leaves the page gives it back at once (HA keeps the view)',
   rc.style.willChange === '' && own.style.willChange === 'opacity', [rc.style.willChange, own.style.willChange]);
setLook('clear'); advance(50);
BODY.appendChild(V7.v); GL.add(rc); GL.add(own);   // revisited in the clear look
ok('...so a revisit in the clear look carries none', rc.style.willChange === '');
V7.v.remove(); GL.delete(rc); GL.delete(own); fx.remove(); leave(sc);
setLook('blur'); advance(300);

// ---------------------------------------------------------------------------
print('\n=== cards are collected again only when they change ===');
var V8 = view(), plain = [];
for (i = 0; i < 10; i++) {
  var pc = card({ x: 0, y: 300 + i * 50, w: 1200, h: 40 }, { noPlate: true });
  for (var k = 0; k < 8; k++) pc.shadowRoot.appendChild(new E('DIV'));
  plain.push(add(V8.grid, pc));
}
var g8 = add(V8.grid, card({ x: 20, y: 40, w: 192, h: 70 }));
advance(300);
var cs0 = computed; advance(5 * 2000 + 50);       // five backstop passes at rest
ok('at rest, a pass reads no card\'s tree again (only each plate\'s radius and anchor)',
   computed - cs0 <= 5 * 2 * 2, computed - cs0);
var late = new E('HA-CARD', { glass: 1, radius: '20px' }, { x: 0, y: 300, w: 300, h: 40 });
plain[0].shadowRoot.appendChild(late);           // a card that renders its plate late
advance(2050);
ok('...but a card whose tree changed is collected again: its late plate is frosted',
   (pathOfLayer(V8.v).match(/M/g) || []).length === 2, pathOfLayer(V8.v).slice(0, 80));
V8.v.remove(); Array.from(GL).forEach(leave); advance(300);

// ---------------------------------------------------------------------------
print('\n=== a detail sheet mid-open: the scale is on the sheet, the scroller inside ===');
// hk-detail: .sheet (scale .98 while it opens, translateY 24) > .body
// (overflow-y:auto, the cards' anchor) > the group's tiles. The boxes are what
// a browser reports mid-open: the body 2% smaller, a tile 204 px in at 98%.
var dfx = new E('DIV', { position: 'fixed' }, { x: 0, y: 0, w: 1280, h: 800 });
var dsheet = new E('DIV', { position: 'relative', transform: 'matrix(0.98, 0, 0, 0.98, 0, 24)' },
                   { x: 419.2, y: 84, w: 450.8, h: 666.4 });
var dbody = new E('DIV', { position: 'relative', overflowX: 'auto', overflowY: 'auto' },
                  { x: 429, y: 142.8, w: 431, h: 588 });
BODY.appendChild(dfx); dfx.appendChild(dsheet); dsheet.appendChild(dbody);
var dt = add(dbody, card({ x: 429 + 204 * 0.98, y: 142.8 + 2 * 0.98, w: 192 * 0.98, h: 70 * 0.98 }));
advance(100);
ok('the frost is cut in the sheet\'s own layout: 204 px in, 192 wide, as the tile will be',
   /^path\('M227\.5,2H372\.5A23\.5/.test(pathOfLayer(dbody)), pathOfLayer(dbody).slice(0, 40));
ok('scaleOf multiplies the anchor\'s and its ancestors\' transforms',
   Math.abs(G._scaleOf(dbody).x - 0.98) < 1e-9 && G._scaleOf(dsheet).y === 0.98 && G._scaleOf(dfx).x === 1);
dfx.remove(); leave(dt); advance(300);

// ---------------------------------------------------------------------------
print('\n=== a plate whose row is no longer above it ===');
var V9 = view(), r9 = row(V9.grid, 40);
var mv = add(r9, card({ x: 20, y: 47, w: 192, h: 70 }));
advance(300);
var plainDiv = new E('DIV', {}, { x: 0, y: 200, w: 1280, h: 100 }); V9.grid.appendChild(plainDiv);
plainDiv.children.push(mv); mv.parentNode.removeChild(mv); mv.parentNode = plainDiv; plainDiv.children = [mv];
var threw = null;
try { advance(2050); } catch (e) { threw = String(e); }
ok('promote() stops at the document instead of throwing inside update()', threw === null, threw);
V9.v.remove(); Array.from(GL).forEach(leave); advance(300);

print(fail ? 'FAIL ' + fail + ' GLASS BEHAVIOUR TESTS' : 'ALL ' + pass + ' GLASS BEHAVIOUR TESTS PASS');
if (fail) throw new Error('glass behaviour tests failed');
