// hk-glass.js - the SHARED BLUR behind every glass surface (look.glass = blur).
//
// WHY ONE LAYER PER SCROLLER AND NOT ONE PER CARD. A backdrop-filter on each
// card, measured on an entry-level Samsung wall tablet (SM-X230): 22 blur
// surfaces (14 pills + 8 chips) took the main page from 90 to 45 fps still
// and ~30-45 scrolling, and blanked cards until they were scrolled -- tile
// memory running out. An 8px radius cost the same as 20px:
// on these tile-based GPUs the bill is the NUMBER of blur surfaces (a render
// pass and a backdrop texture each), not their size. One shared layer, cut to
// the cards' shapes with a clip-path, held 90 fps with every pill and chip
// frosted -- cheaper than the chips' own blur alone.
//
// WHY ONE LAYER PER MOVING CONTAINER. ONE sheet positioned against the
// document does not work: a page may scroll <body>, not the document, and
// each row scrolls sideways inside itself, so the pills would slide across a
// frost that stays put. So each layer lives INSIDE the container
// that carries its cards (the view, each sideways row, a pop-up sheet; see
// collect()), and the browser moves it with them on the compositor -- no
// JavaScript and no lag while scrolling. A page ends up with a handful of
// layers: its view, plus one per row of glass.
//
// HOW A SURFACE IS KNOWN. Every glass surface's rule carries
// `--hk-glass-surface: 1` (hkCards.M.glass, the status chip), a custom
// property registered NON-inherited by hk-settings.js, so only the plate
// itself has it. Cards join and leave from HkBase's connected/disconnected
// callbacks (window.__hkGlassCards); `glass: false` in a card's config keeps
// it out. Nothing is scanned page-wide, and a card written tomorrow joins the
// same way.
//
// THE LAYER sits at z-index -1 inside its container: painted after the sky
// (fixed, z -1, earlier in the tree) and before every card. Its backdrop root
// must be <html> -- anything that makes an ancestor its own compositing
// surface (filter, opacity < 1, an opacity ANIMATION still filling) cuts it
// off from the sky; test_viewfade.js guards the view fade's fill mode.
//
// THE FIRST PAINT IS FROSTED. hk-viewfade.js fades every view in over
// 170 ms, and for exactly that long the view IS a backdrop root, so a layer
// inside it blurs nothing -- then, the frame the fade ends, the frost would
// snap on at full strength (a leaf behind a pill sharp while the page fades
// in, then blurred). Measured in Chrome: module ready at 178 ms, first card
// 391 ms, first layer 415 ms -- the layer is not late; the fade hides it.
// Two things follow:
//
//   * EVERY NEW VIEW IS HELD (visibility:hidden, and its fade cancelled,
//     from the first card that joins it -- that runs during the view's own
//     render, before it has ever painted) until update() has placed its
//     layers and no card has joined for SETTLE_MS, then shown: cards and
//     frost in the same frame. A fresh load already cuts from Home
//     Assistant's loading screen; navigation is a hard cut to the complete
//     page (the fade is worth less than the pop it causes). HOLD_MS
//     backstop. Only while the look is blur: with clear or frosted nothing
//     here runs and hk-viewfade's fade runs as usual. A view update() has
//     already seen is never held later (see seen()).
//   * NO LAYER EVER FADES IN. With every view held and its fade cancelled,
//     a layer that bloomed from opacity 0 to 1 would be the ONLY fade left,
//     and it would run on every return to a page Home Assistant has kept
//     (Home, a subview visited before): those views are held once, on their
//     first visit, and never again, so their rebuilt layers would bloom in
//     over cards that are already showing. A layer is instead drawn at full
//     strength from the frame update() creates it -- the same frame as the
//     cards it frosts, because update() runs in the animation frame before
//     that paint. A pop-up's layer lives in its sheet and fades
//     with it -- but while the sheet's opacity is below 1 the sheet is a
//     backdrop root, so until the fade ends the frost samples only what the
//     sheet itself draws (the #alarm sheet blurs itself, so that is frost).
(function () {
  'use strict';
  if (window.hkGlass) return;

  var MAT = 'blur(20px) saturate(1.4) brightness(0.82)';
  var HOLD_MS = 2500;            // the backstop on the held first view
  // Cards arrive over several tasks on a fresh load (HA creates lazily
  // loaded cards asynchronously), and each burst grows the view and its
  // bands. The first view is released only once no card has joined for this
  // long, so it is shown complete rather than with its lower bands still to
  // come (measured: released at 107 ms with joins still landing, and the
  // bands added at 119 ms appeared after the page was visible).
  var SETTLE_MS = 120;
  var cards = window.__hkGlassCards = window.__hkGlassCards || new Set();

  // iOS WEBKIT DRAWS A LAYER INSIDE A SCROLLING ROW OVER EVERYTHING IN THE ROW
  // THAT IS NOT COMPOSITED ITSELF (the Home Assistant iPhone app, for one).
  // The chips and scenes rows show frost and no pills; rotating or opening
  // the sidebar (a full re-composite) brings them back. Measured on an
  // iPhone, one change at a time: hiding the row's layer -> pills; the row as
  // its own stacking context (isolation) -> no change; the layer at z-index 0
  // with the cards lifted to z-index 1 -> frost ON TOP of them. So z-order
  // does not decide it there. Giving each card in the row its own compositing
  // layer (will-change: transform) does: pills, frost behind. Each card is
  // promoted in the same update() that places its row's layer, so there is
  // no frame without.
  //
  // ON EVERY ENGINE, not just iOS: an iOS-only branch is one more thing to
  // drift and to troubleshoot. Chrome and macOS Safari do not need it, and it
  // costs them nothing measurable: on a wall tablet, alternating off/on, the
  // chips row scrolled at 86-90 fps either way and the whole page at 85-89,
  // p95 frame 11.1 ms in every run (19 cards promoted).
  // Only the cards in SIDEWAYS rows are promoted (collect(): `sideways`) --
  // not the page's grids, and not a pop-up sheet's cards, which scroll
  // vertically (or a whole panel of them would be promoted).
  // A promoted element that leaves the page gives it back at once (HA keeps
  // a visited view's elements, which would carry it into the clear look).
  var promoted = new Map();      // element -> its own will-change before (undone by unpromote/stop())
  // The row child that holds this plate: walk up from the plate until the
  // parent is the scrolling anchor. Nothing if the anchor is no longer above
  // it -- the walk would reach the document, which has no attributes.
  function promote(p) {
    var n = p.el;
    for (;;) {
      var up = flatParent(n);
      if (!up || up.nodeType !== 1) return;
      if (up === p.anchor) break;
      n = up;
    }
    if (promoted.has(n) || n.hasAttribute('data-hk-glass-layer')) return;
    promoted.set(n, n.style.willChange || '');
    n.style.willChange = 'transform';
  }
  function unpromote(was, n) { n.style.willChange = was; promoted.delete(n); }
  var plates = new Map();        // card -> [{el, anchor, scrolls, sideways, clips}]
  var layers = new Map();        // anchor (or DOC) -> {layers, posWas}
  var DOC = { doc: true };
  var VIEWS = ['HUI-VIEW', 'HUI-MASONRY-VIEW', 'HUI-SECTIONS-VIEW', 'HUI-PANEL-VIEW'];
  var active = false, queued = false, full = true, timer = null, ro = null;
  // Cards to collect() again on the next update: the ones that joined or
  // left. `full` re-collects every card (start, a resize, fonts loaded).
  var dirty = new Set();
  var stats = { layers: 0, rects: 0, updates: 0, lastMs: 0 };

  function flatParent(n) {
    if (n.assignedSlot) return n.assignedSlot;
    var p = n.parentNode;
    if (!p) return null;
    return p.nodeType === 11 ? p.host : p;
  }
  function marked(el) {
    try { return getComputedStyle(el).getPropertyValue('--hk-glass-surface').trim() === '1'; }
    catch (e) { return false; }
  }

  // A card's glass plates, each with its ANCHOR -- the element its layer lives
  // in -- and any clipping (overflow:hidden) boxes between plate and anchor.
  //
  // THE ANCHOR MUST MOVE WITH THE PLATE, so the browser carries the frost with
  // its cards on the compositor. Walking up from the plate:
  //   * a scroll container below <body>: the scroller itself -- the layer
  //     scrolls with its cards. A sideways row (overflow-x scrolls, overflow-y
  //     does not: `sideways`), or a pop-up sheet (hk-popup's .sheet is
  //     overflow-y:auto), whose layer then rides the sheet's open transform;
  //   * a position:fixed box that does not scroll: that box;
  //   * otherwise the page scrolls it, and WHICH element scrolls the page
  //     differs (<html> on some layouts, <body> with overflow:auto on others:
  //     a sheet pinned to the document leaves the pills sliding across a
  //     frost that stays put on a body-scrolling layout).
  //     So the anchor is the VIEW ELEMENT (hui-view): it moves with the page
  //     whichever element scrolls it, every card in the view shares it, and
  //     it comes after Home Assistant's view background (see below). With no
  //     view element, the highest positioned element below <body>.
  function collect(card) {
    var out = [], root = card.shadowRoot;
    if (!root) return out;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!marked(el)) continue;
      // Without a registered (non-inherited) property every descendant would
      // read 1; keep only the outermost.
      var p = flatParent(el);
      if (p && p.nodeType === 1 && root.contains(p) && marked(p)) continue;
      var clips = [], anchor = null, scrolls = false, sideways = false, highest = null, n = p;
      while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement) {
        var cs = getComputedStyle(n);
        var ox = cs.overflowX, oy = cs.overflowY;
        var sx = ox === 'auto' || ox === 'scroll', sy = oy === 'auto' || oy === 'scroll';
        if (cs.position === 'fixed') { anchor = n; break; }
        // (A vertical scroller's overflow-x COMPUTES to auto as well, so a
        // sideways row is the one that scrolls on x and not on y.)
        if (sx || sy) { anchor = n; scrolls = true; sideways = sx && !sy; break; }
        // THE VIEW ELEMENT, NOT ITS CONTAINER. hui-view-container holds
        // Home Assistant's own view background (hui-view-background: opaque,
        // z-index -1) BEFORE hui-view in the tree, so a layer anywhere in
        // front of it -- the container's shadow root, say -- is painted
        // UNDER that background and blurs a flat color, invisibly: the rows
        // blur (their layers come after the background) and the view's pills
        // do not. Inside hui-view, the layer comes after it.
        if (VIEWS.indexOf(n.tagName) >= 0) { anchor = n; break; }
        if (cs.position !== 'static') highest = n;
        if (ox !== 'visible' || oy !== 'visible') clips.push(n);
        n = flatParent(n);
      }
      if (!anchor) anchor = highest || DOC;
      out.push({ el: el, anchor: anchor, scrolls: scrolls, sideways: sideways, clips: clips });
    }
    return out;
  }

  function rrect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    var f = function (v) { return Math.round(v * 10) / 10; };
    return 'M' + f(x + r) + ',' + f(y) + 'H' + f(x + w - r) +
      'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + w) + ',' + f(y + r) + 'V' + f(y + h - r) +
      'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + w - r) + ',' + f(y + h) + 'H' + f(x + r) +
      'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x) + ',' + f(y + h - r) + 'V' + f(y + r) +
      'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + r) + ',' + f(y) + 'Z';
  }

  // BANDS, NOT ONE LAYER PER CONTAINER. A backdrop surface larger than the
  // GPU's max texture is silently NOT DRAWN: a wall tablet that reports
  // MAX_TEXTURE_SIZE 8192, under a view layer of 1920 x 8856 device px,
  // blurs only the small row layers. Every layer is therefore cut
  // into bands along its long side: never over 4096 device px (a size every
  // WebGL GPU supports) and about 4 megapixels each, so a tablet draws the one
  // or two bands on screen, not a page-tall texture. Cuts fall only in the
  // gaps between surfaces, so no pill is ever split across a seam.
  var MAX_DEVICE = 4096, BAND_AREA = 4e6;

  // shapes [{x,y,w,h,r}] over an extent W x H (CSS px) -> bands, each
  // {axis, start, len, cross, shapes}. Cut bands run from the first shape to
  // the last, never over glass-free space before or after them (pills only
  // in a page's top 110 px would otherwise make ONE band 6000 px tall --
  // 9000 device px, over a tablet's max texture). Pure: tested by
  // test_glass.js.
  function bands(shapes, W, H, dpr) {
    dpr = dpr || 1;
    var axis = null, cross = 0;
    if (H * dpr > MAX_DEVICE || W * H * dpr * dpr > BAND_AREA * 1.5) { axis = 'y'; cross = W; }
    if (W * dpr > MAX_DEVICE && (!axis || W > H)) { axis = 'x'; cross = H; }
    if (!axis) return [{ axis: 'y', start: 0, len: H, cross: W, shapes: shapes.slice() }];
    var len = Math.min(MAX_DEVICE, Math.max(1024, BAND_AREA / Math.max(1, cross * dpr))) / dpr;
    var at = axis === 'y' ? 'y' : 'x', size = axis === 'y' ? 'h' : 'w';
    var sorted = shapes.slice().sort(function (a, b) { return a[at] - b[at]; });
    var out = [], cur = null, reach = 0;
    sorted.forEach(function (sh) {
      var s0 = sh[at], s1 = sh[at] + sh[size];
      if (!cur) { cur = { axis: axis, start: s0, cross: cross, shapes: [] }; reach = s0; }
      // A band is full: cut in the gap before this shape, if there is one.
      else if (s0 >= reach && s1 - cur.start > len) {
        var cut = (reach + s0) / 2;
        cur.len = cut - cur.start; out.push(cur);
        cur = { axis: axis, start: cut, cross: cross, shapes: [] };
      }
      cur.shapes.push(sh);
      reach = Math.max(reach, s1);
    });
    if (cur) { cur.len = reach - cur.start; out.push(cur); }
    return out;
  }

  // An anchor's own TRANSFORM scale, from its computed `transform` (always
  // 'none', matrix() or matrix3d() once computed). A pop-up sheet opens from
  // scale(.98): measured on that first frame, every shape comes out 2% short
  // toward the sheet's corner, and a transform fires no ResizeObserver, so
  // the frost would sit up-and-left of the pills until the 2 s backstop.
  // Dividing by the scale puts the
  // shape where the pill is in the sheet's own layout, and the layer -- inside
  // the sheet -- then scales with it for the rest of the animation. Pure:
  // tested by test_glass.js.
  function transformScale(t) {
    var m = /^matrix(3d)?\(([^)]*)\)/.exec(t || '');
    if (!m) return { x: 1, y: 1 };
    var n = m[2].split(',').map(parseFloat);
    var a = n[0], b = n[1], c = m[1] ? n[4] : n[2], d = m[1] ? n[5] : n[3];
    return { x: Math.sqrt(a * a + b * b) || 1, y: Math.sqrt(c * c + d * d) || 1 };
  }

  // THE ANCHOR'S WHOLE SCALE: its own transform times every ancestor's. A
  // detail sheet's cards scroll in the sheet's .body, so that is their anchor
  // -- and the open transform (scale .98) is on .sheet, one level up.
  // Dividing out only the anchor's own leaves the frost behind a group
  // sheet's tiles ("2 Windows") cut 2% short toward the corner until the 2 s
  // backstop (measured in Chrome: a 162 px plate cut 158.8 wide). Read once
  // per anchor per pass
  // (`scaleMemo`); a pass measures a few anchors, each a short walk up.
  var scaleMemo = null;
  function scaleOf(A) {
    var m = scaleMemo && scaleMemo.get(A);
    if (m) return m;
    var x = 1, y = 1, n = A;
    while (n && n.nodeType === 1) {
      var t = getComputedStyle(n).transform;
      if (t && t !== 'none') { var ts = transformScale(t); x *= ts.x; y *= ts.y; }
      if (n === document.documentElement) break;
      n = flatParent(n);
    }
    m = { x: x, y: y };
    if (scaleMemo) scaleMemo.set(A, m);
    return m;
  }

  // The view an anchor sits in (or is).
  function viewOf(anchor) {
    var n = anchor === DOC ? null : anchor;
    while (n && n.nodeType === 1) {
      if (VIEWS.indexOf(n.tagName) >= 0) return n;
      n = flatParent(n);
    }
    return null;
  }
  // The view being held, or null. A view is held once, when its first card
  // joins; `data-hk-frost` on the element records that it has been (or that
  // update() has seen it painted, seen()), so a card joining later (a
  // conditional card appearing) does not hold it again.
  var gate = null, gateTimer = null, lastJoin = 0, settleTimer = null;
  function hold(card) {
    if (!active) return;
    var v = viewOf(card);
    if (!v) return;
    // Only joins INTO the held view delay its release: a pop-up's, a detail
    // sheet's or the screensaver's cards arriving meanwhile would keep a
    // page hidden until the backstop.
    if (v === gate) { lastJoin = performance.now(); return; }
    if (v.hasAttribute('data-hk-frost')) {
      // A PAGE HOME ASSISTANT KEPT, BACK: shown at once, before the tablet
      // had drawn it again -- its plates with nothing on them for a frame
      // (screen-recorded on the second visit to Lights). Faint until no
      // card on it has a render pending, then for AGAIN_FRAMES drawn, then
      // shown. It was once also at least 250 ms and 8 frames (a wall tablet
      // short of tile memory drew 4 frames in 468 ms, and the part it had
      // not drawn showed the moment the faint ended) -- a quarter second of
      // nothing on every return, and the tile shortage it waited out is
      // gone since the cloud ceiling became a canvas (TABLET-INVARIANTS
      // 16q; screen-recorded 2026-10-09). Only a page that left (`away`, set as its cards left
      // with it), never a card appearing on a page on screen.
      if (away.has(v)) { away.delete(v); faintAgain(v); }
      return;
    }
    // A newer view while one is still held (a second navigation inside the
    // settle): the old one is on its way out; let it go.
    if (gate) release();
    gate = v; lastJoin = performance.now();
    v.style.visibility = 'hidden';
    // hk-viewfade's animation would restart from 0 if this were ever cleared,
    // so it stays on the view for its life.
    v.style.animation = 'none';
    v.setAttribute('data-hk-frost', 'pending');
    gateTimer = setTimeout(release, HOLD_MS);
  }
  // Pages that left with their cards still in them (kept by Home Assistant).
  var away = new WeakSet(), AGAIN_FRAMES = 2;
  function faintAgain(v) {
    if (v.__hkFaint) return;
    v.__hkFaint = true;
    v.style.opacity = FAINT;
    var n = 0, drawn = 0;
    requestAnimationFrame(function next() {
      // while a card on it still has a render pending (its cards render
      // again as they come back), at most REVEAL_FRAMES; then AGAIN_FRAMES
      // drawn complete, so the tablet has rastered what it is about to show
      if (++n < REVEAL_FRAMES && pendingIn(v)) { requestAnimationFrame(next); return; }
      if (++drawn <= AGAIN_FRAMES) { requestAnimationFrame(next); return; }
      v.__hkFaint = false;
      if (v.style.opacity === FAINT) v.style.opacity = '';
    });
  }
  // ...AND WHERE THE PAGES GO: a view element put back into the page is a
  // page coming back (its cards' leaving was not always heard on a wall
  // tablet -- the first return from Lights showed half drawn). Only a VIEW
  // being inserted counts; a card appearing never inserts one.
  var viewMo = null, viewBox = null;
  function watchViews() {
    if (typeof MutationObserver === 'undefined') return;
    var box = viewContainer();
    if (!box || box === viewBox) return;
    if (viewMo) viewMo.disconnect();
    viewBox = box;
    viewMo = new MutationObserver(function (recs) {
      if (!active) return;
      recs.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes || [], function (n) {
          if (n.nodeType === 1 && VIEWS.indexOf(n.tagName) >= 0 && n.getAttribute('data-hk-frost') === 'done') {
            away.delete(n); faintAgain(n);
          }
        });
      });
    });
    viewMo.observe(box, { childList: true });
  }
  function viewContainer() {
    var ha = document.querySelector('home-assistant');
    var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
    var res = main && main.shadowRoot && main.shadowRoot.querySelector('partial-panel-resolver');
    var panel = res && res.querySelector('ha-panel-lovelace');
    var hr = panel && panel.shadowRoot && panel.shadowRoot.querySelector('hui-root');
    var root = hr && hr.shadowRoot;
    return (root && (root.querySelector('hui-view-container') || root.querySelector('#view'))) || null;
  }
  function release() {
    if (!gate) return;
    var v = gate;
    gate = null; revealing = null;
    clearTimeout(gateTimer); gateTimer = null;
    clearTimeout(settleTimer); settleTimer = null;
    v.style.visibility = '';
    if (v.style.opacity === FAINT) v.style.opacity = '';
    v.setAttribute('data-hk-frost', 'done');
  }
  // THE WHOLE PAGE, DRAWN, BEFORE IT SHOWS (2026-10-09). Settled joins say
  // the GLASS cards are in; the headings, the title and the cards inside
  // others may still be rendering -- the Lights page showed its cards
  // without a heading for a frame (headless), and on a wall tablet its
  // plates with nothing on them (screen-recorded). So: until no element in
  // the view has a render pending (Lit's isUpdatePending, or hasUpdated
  // false before its first), at most REVEAL_FRAMES; then two frames drawn
  // at FAINT -- too faint to see, but drawn, so the tablet has rastered it
  // (the photo screensaver's [prep], for the same reason) -- then shown.
  var FAINT = '0.004', REVEAL_FRAMES = 30, revealing = null;
  function pendingIn(v) {
    var stack = [v];
    while (stack.length) {
      var n = stack.pop();
      if (n !== v && (n.isUpdatePending === true || n.hasUpdated === false)) return true;
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) stack.push(kids[i]);
      if (n.shadowRoot) stack.push(n.shadowRoot);
    }
    return false;
  }
  function showWhenDrawn() {
    if (!gate || revealing === gate) return;
    var v = gate, n = 0;
    revealing = v;
    (function look() {
      if (gate !== v) return;
      if (++n < REVEAL_FRAMES && pendingIn(v)) { requestAnimationFrame(look); return; }
      v.style.opacity = FAINT;
      v.style.visibility = '';
      var f1 = false;                     // each step once
      requestAnimationFrame(function () {
        if (f1) return; f1 = true;
        requestAnimationFrame(function () { if (gate === v) release(); });
      });
    })();
  }
  // After an update: the held view may paint once the joins have settled;
  // until then, look again when they should have.
  function settled() {
    if (!gate) return;
    var wait = SETTLE_MS - (performance.now() - lastJoin);
    if (wait <= 0) { showWhenDrawn(); return; }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { settleTimer = null; schedule(false); }, wait + 5);
  }
  // A VIEW update() HAS SEEN IS NEVER HELD LATER. The
  // hold takes a view's first join to be its first render. Not so for a view
  // painted before the look became blur (a live settings change, a fresh
  // browser's first answer) or before this module loaded: its first join
  // here is a conditional chip appearing, and holding it would blank a page
  // somebody is reading for ~130 ms. Marked from start() and from every
  // collect().
  function seen(card) {
    var v = viewOf(card);
    if (v && !v.hasAttribute('data-hk-frost')) v.setAttribute('data-hk-frost', 'done');
  }

  function newLayer(anchor) {
    var layer = document.createElement('div');
    layer.setAttribute('data-hk-glass-layer', '');
    // --hk-blur-filter: the strength chosen under Configure -> Look
    // (hk-settings.js); MAT, its middle, without it.
    var f = 'var(--hk-blur-filter,' + MAT + ')';
    layer.style.cssText = 'position:absolute;left:0;top:0;z-index:-1;pointer-events:none;margin:0;' +
      'flex:none;backdrop-filter:' + f + ';-webkit-backdrop-filter:' + f;
    if (anchor === DOC) { document.body.appendChild(layer); }
    else {
      // A shadow host renders only slotted light children; its own shadow
      // tree always renders.
      var into = anchor.shadowRoot || anchor;
      into.insertBefore(layer, into.firstChild);
    }
    return layer;
  }
  function recFor(anchor) {
    var rec = layers.get(anchor);
    if (rec) {
      rec.layers = rec.layers.filter(function (l) { return l.isConnected; });
      return rec;
    }
    var posWas = null;
    // The layers' containing block must be the anchor (a row may be static).
    if (anchor !== DOC && getComputedStyle(anchor).position === 'static') {
      posWas = anchor.style.position || '';
      anchor.style.position = 'relative';
    }
    rec = { layers: [], posWas: posWas };
    layers.set(anchor, rec);
    if (ro && anchor !== DOC) ro.observe(anchor);
    return rec;
  }
  function dropLayer(anchor) {
    var rec = layers.get(anchor);
    if (!rec) return;
    rec.layers.forEach(function (l) { l.remove(); });
    if (rec.posWas !== null && anchor !== DOC) anchor.style.position = rec.posWas;
    if (ro && anchor !== DOC) { try { ro.unobserve(anchor); } catch (e) { /* gone */ } }
    layers.delete(anchor);
  }

  // ONE PLATE -> its shape in its anchor's coordinates, or null when it has
  // no visible box. Shared by the full pass and the press pass.
  function measure(p) {
    var r = p.el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (var j = 0; j < p.clips.length; j++) {
      var c = p.clips[j].getBoundingClientRect();
      x0 = Math.max(x0, c.left); y0 = Math.max(y0, c.top);
      x1 = Math.min(x1, c.right); y1 = Math.min(y1, c.bottom);
    }
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    // Into the anchor's own coordinates: its padding box, plus its scroll
    // offset when it is the scroller -- and in ITS units. Under CSS
    // `zoom` (the car dashboards: tesla-viewport.js zooms the document)
    // getBoundingClientRect is in zoomed screen pixels while the layer's
    // lengths are multiplied by the zoom again, so every shape would land
    // short of its pill (seen in Chrome at zoom 0.67).
    // currentCSSZoom is the effective zoom; exactly 1 without one.
    var A = p.anchor, k = 1, lx, ly;
    if (A === DOC) {
      k = document.documentElement.currentCSSZoom || 1;
      lx = function (v) { return v / k + window.scrollX / k; };
      ly = function (v) { return v / k + window.scrollY / k; };
    } else {
      var b = A.getBoundingClientRect(), kx, ky;
      if ('currentCSSZoom' in A) {
        // Zoom times the transforms on and above the anchor (a pop-up or a
        // detail sheet mid-open: see scaleOf).
        var ts = scaleOf(A);
        k = A.currentCSSZoom || 1; kx = k * ts.x; ky = k * ts.y;
      } else {
        // The ratio already carries both.
        kx = ky = (A.offsetWidth ? b.width / A.offsetWidth : 1) || 1;
      }
      var sx = p.scrolls ? A.scrollLeft : 0, sy = p.scrolls ? A.scrollTop : 0;
      lx = function (v) { return (v - b.left) / kx - A.clientLeft + sx; };
      ly = function (v) { return (v - b.top) / ky - A.clientTop + sy; };
    }
    var rad = parseFloat(getComputedStyle(p.el).borderTopLeftRadius) || 0;
    var X0 = lx(x0), Y0 = ly(y0);
    return { A: A, shape: { x: X0, y: Y0, w: lx(x1) - X0, h: ly(y1) - Y0, r: rad } };
  }

  // ONE ANCHOR'S LAYERS from its group of shapes: size, bands, clip paths.
  // Returns how many band layers it has.
  //
  // SIZED FROM THE SHAPES ALONE, never from the anchor's scrollWidth or
  // scrollHeight. The layer is itself scrollable overflow, so those read its
  // own size back and it could only grow: a row that lost a conditional chip
  // would still scroll out to its old width, and a page that got shorter
  // would keep its old height (measured in Chrome: a row of 200 px of cards
  // stayed 600 wide). The view's width is also clamped to the client box, so
  // a layer never widens a page that does not scroll sideways.
  function place(A, g, dpr) {
    var rec = recFor(A), right = 0, bottom = 0;
    g.shapes.forEach(function (sh) { right = Math.max(right, sh.x + sh.w); bottom = Math.max(bottom, sh.y + sh.h); });
    var W = Math.ceil(g.scrolls || A === DOC ? right : Math.min(right, A.clientWidth || right));
    var H = Math.ceil(bottom);
    var bs = bands(g.shapes, W, H, dpr);
    while (rec.layers.length < bs.length) rec.layers.push(newLayer(A));
    while (rec.layers.length > bs.length) rec.layers.pop().remove();
    bs.forEach(function (band, i) {
      var L = rec.layers[i], dy = band.axis === 'y' ? band.start : 0, dx = band.axis === 'x' ? band.start : 0;
      var w = band.axis === 'x' ? band.len : band.cross, h = band.axis === 'y' ? band.len : band.cross;
      L.style.left = dx + 'px'; L.style.top = dy + 'px';
      // Plain inline sizes: hk-row's phone rule sizes every row child but
      // this layer (:not([data-hk-glass-layer])), so there is nothing to beat.
      L.style.width = Math.ceil(w) + 'px';
      L.style.height = Math.ceil(h) + 'px';
      var path = "path('" + band.shapes.map(function (sh) {
        return rrect(sh.x - dx, sh.y - dy, sh.w, sh.h, sh.r);
      }).join('') + "')";
      if (L.getAttribute('data-path') !== path) {
        L.style.clipPath = band.shapes.length ? path : 'inset(100%)';
        L.setAttribute('data-path', path);
      }
    });
    return bs.length;
  }

  // THE LAST PASS, kept so a press can re-cut one card without re-measuring
  // the page: anchor -> {shapes (each tagged with its card), scrolls}.
  var lastGroups = null;

  function gone(p) { return !p.el.isConnected; }
  // A CARD IS COLLECTED AGAIN ONLY WHEN IT CHANGED: it joined or left
  // (`dirty`), a plate was replaced, or its tree changed size -- its first
  // render after joining, a rebuild, rows added. Not every card on every join
  // anywhere, and not every card with no glass surface (headings, pop-up
  // groups, the now-playing card, the detail panels) on every pass, the 2 s
  // backstop included: collect() reads the computed style of every element
  // in the card. Counting the elements is cheap.
  var sizeAt = new WeakMap();    // card -> its element count when last collected
  function treeSize(card) { return card.shadowRoot ? card.shadowRoot.querySelectorAll('*').length : 0; }
  function forget(card) {
    var ps = plates.get(card);
    if (ps && ro) ps.forEach(function (p) { try { ro.unobserve(p.el); } catch (e) { /* gone */ } });
    plates.delete(card);
  }
  function recollect(card) {
    forget(card);
    var ps = collect(card);
    plates.set(card, ps);
    if (ro) ps.forEach(function (p) { ro.observe(p.el); });
    sizeAt.set(card, treeSize(card));
    return ps;
  }

  function update() {
    queued = false;
    if (!active) return;
    watchViews();
    var t0 = performance.now();
    scaleMemo = new Map();
    var groups = new Map(), rects = 0;
    // A card that left the page (HkBase drops it from `cards` on disconnect)
    // leaves `plates` and the observer too, or every navigation on a wall
    // tablet grows both for as long as blur mode is on; a
    // promoted element that left gives its will-change back.
    promoted.forEach(function (was, n) { if (!n.isConnected) unpromote(was, n); });
    plates.forEach(function (ps, c) { if (!cards.has(c)) forget(c); });
    cards.forEach(function (card) {
      if (!card.isConnected) return;
      var ps = plates.get(card);
      if (full || dirty.has(card) || !ps || ps.some(gone) || sizeAt.get(card) !== treeSize(card)) {
        ps = recollect(card);
        seen(card);
      }
      ps.forEach(function (p) {
        if (p.sideways) promote(p);
        var m = measure(p);
        if (!m) return;
        if (!groups.has(m.A)) groups.set(m.A, { shapes: [], scrolls: p.scrolls });
        m.shape.card = card;
        groups.get(m.A).shapes.push(m.shape);
        rects++;
      });
    });
    full = false; dirty.clear();
    var count = 0, dpr = window.devicePixelRatio || 1;
    layers.forEach(function (rec, A) { if (!groups.has(A)) dropLayer(A); });
    groups.forEach(function (g, A) { count += place(A, g, dpr); });
    lastGroups = groups;
    scaleMemo = null;
    stats.layers = count; stats.anchors = layers.size; stats.rects = rects; stats.updates++;
    stats.promoted = promoted.size;   // row cards with their own layer (see promote)
    stats.lastMs = +(performance.now() - t0).toFixed(1);
    settled();                     // the first view, now frosted, may paint
  }

  // THE PRESS PASS: only the pressed cards are re-measured, and only their
  // anchors' layers are re-cut; every other shape comes from the last pass.
  // A pass over the page measured 7-9 ms on a wall tablet (every
  // glass card, getBoundingClientRect and computed style each) -- run on
  // every frame of a press, most of a 90 fps frame. A card that has left the
  // page or has nothing to measure is dropped from `list`; false when
  // nothing was re-cut, and the caller stops (it NEVER falls back to a full
  // update: after a tap that navigated, that would run every frame of the
  // tail).
  function pressUpdate(list) {
    if (!lastGroups) return false;
    var t0 = performance.now(), touched = new Set();
    scaleMemo = new Map();
    list.forEach(function (card) {
      var ps = card.isConnected && plates.get(card);
      if (ps && ps.length && ps.some(gone)) ps = recollect(card);   // rebuilt by the tap
      if (!ps || !ps.length) { list.delete(card); return; }
      var cut = new Set();
      ps.forEach(function (p) {
        var m = measure(p);
        var g = m && lastGroups.get(m.A);
        if (!g) return;
        if (!cut.has(m.A)) {
          g.shapes = g.shapes.filter(function (sh) { return sh.card !== card; });
          cut.add(m.A);
        }
        m.shape.card = card;
        g.shapes.push(m.shape);
        touched.add(m.A);
      });
    });
    scaleMemo = null;
    if (!touched.size) return false;
    var dpr = window.devicePixelRatio || 1;
    touched.forEach(function (A) { place(A, lastGroups.get(A), dpr); });
    stats.pressMs = +(performance.now() - t0).toFixed(2);
    return true;
  }

  function schedule(recollect) {
    if (recollect) full = true;
    if (!active || queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  // A PRESSED CARD SHRINKS (scale .96-.97 on :active, 120-140 ms) but its
  // cut-out in the shared layer would stay full size, showing a ring of frost
  // around every pill pushed in. No observer hears a
  // transform, so while a finger is on a glass card -- and for the release
  // animation after -- the shapes are re-cut every frame from the live
  // (transformed) boxes. getBoundingClientRect in the animation frame reads
  // this frame's transition value, so the frost moves in step. Idle
  // otherwise: nothing runs per frame when nobody is touching the screen.
  //
  // EVERY PRESSED CARD IS FOLLOWED, not only the last: a second tap inside
  // the first one's release would leave the first cut-out shrunk until the
  // 2 s backstop. The loop runs while any finger that went down on
  // a glass card is down, and PRESS_TAIL_MS after the last one lifts; it
  // stops early when no pressed card is left to measure (a tap that
  // navigated), and it always ends with one ordinary update.
  var pressed = new Set(), pointers = new Set(), pressUntil = 0, pressTicking = false, PRESS_TAIL_MS = 300;
  // The innermost glass card under the finger that has plates (a chip, not
  // the row card around it).
  function glassCardOf(e) {
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var ps = cards.has(path[i]) && plates.get(path[i]);
      if (ps && ps.length) return path[i];
    }
    return null;
  }
  function pressTick() {
    if (active && (pointers.size || performance.now() <= pressUntil) && pressUpdate(pressed)) {
      requestAnimationFrame(pressTick);
      return;
    }
    pressTicking = false; pressed.clear(); pointers.clear();
    schedule(false);
  }
  function onDown(e) {
    if (!active) return;
    var c = glassCardOf(e);
    if (!c) return;
    pressed.add(c); pointers.add(e.pointerId);
    if (pressTicking) return;
    pressTicking = true;
    requestAnimationFrame(pressTick);
  }
  function onUp(e) {
    if (!pointers.delete(e.pointerId)) return;
    if (!pointers.size) pressUntil = performance.now() + PRESS_TAIL_MS;
  }

  function start() {
    if (active) return;
    active = true; full = true;
    watchViews();
    window.addEventListener('location-changed', watchViews);
    // Every view already on the page has been painted: see seen().
    cards.forEach(function (c) { if (c.isConnected) seen(c); });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    try { ro = new ResizeObserver(function () { schedule(false); }); } catch (e) { ro = null; }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    // A backstop for layout moves nothing else reports (a card above grows
    // taller without anything here changing size): one pass that measures
    // every plate and collects nothing (7-9 ms on a wall tablet, see pressUpdate).
    // Not while nobody can see it: hidden, or behind the photo screensaver
    // (an overlay -- document.hidden stays false; hk-sky knows).
    timer = setInterval(function () {
      if (document.hidden || (window.hkSky && window.hkSky.asleep && window.hkSky.asleep())) return;
      schedule(false);
    }, 2000);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { schedule(true); });
    schedule(true);
  }
  function stop() {
    if (!active) return;
    active = false;
    release();
    window.removeEventListener('location-changed', watchViews);
    if (viewMo) { viewMo.disconnect(); viewMo = null; viewBox = null; }
    clearInterval(timer); timer = null;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    pressed.clear(); pointers.clear();
    if (ro) { ro.disconnect(); ro = null; }
    Array.from(layers.keys()).forEach(dropLayer);
    plates = new Map(); dirty.clear(); lastGroups = null;
    promoted.forEach(unpromote);
  }
  function onResize() { schedule(true); }
  function onVisible() { if (!document.hidden) schedule(false); }

  function sync() {
    var want = !!(window.hkSettings && window.hkSettings.glass && window.hkSettings.glass() === 'blur');
    if (want) start(); else stop();
  }

  window.hkGlass = {
    // HkBase calls this when a card joins or leaves (window.__hkGlassCards).
    // A card joining is the earliest moment a view is known to exist and to
    // be unpainted (its render is still running), which is when the first
    // view is held. Only this card is collected again.
    changed: function (card, on) {
      if (!active) return;
      if (!card) { schedule(true); return; }
      if (on) hold(card);
      else { var lv = viewOf(card); if (lv && !lv.isConnected) away.add(lv); }
      dirty.add(card);
      schedule(false);
    },
    stats: function () { return Object.assign({ active: active, cards: cards.size }, stats); },
    // One update now, without waiting for a frame (debugging; a hidden tab
    // runs no animation frames).
    refresh: function () { full = true; queued = false; update(); return this.stats(); },
    _rrect: rrect,     // tests
    _bands: bands,
    _transformScale: transformScale,
    _scaleOf: scaleOf,
    _holdMs: HOLD_MS
  };

  if (window.hkSettings && window.hkSettings.onChange) window.hkSettings.onChange(sync);
  sync();
})();
