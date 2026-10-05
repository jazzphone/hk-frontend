// Fade a Lovelace view in when it opens.
//
// WHY. Home Assistant swaps views as a HARD CUT: background, cards and header
// all change in one frame. Measured with the CPU throttled 6x to stand in for
// a wall tablet, content paints in 45-114ms depending on the page (a room view
// of a few hundred cards included) -- so the pages are not SLOW, they are
// abrupt. A short fade is what makes a page read as
// having opened rather than blinked.
//
// OPACITY ONLY, AND THAT IS DELIBERATE. The obvious version also slides the
// view a few pixels, but `transform` on an ancestor creates a containing block
// and changes what `backdrop-filter` samples (so, WHILE it runs, does the
// opacity fade itself -- which is why it must not outlive the fade; see the
// fill mode below) -- and the chips, the pop-up sheets and the shared blur
// layer all use it. A transform
// would have risked the glass going flat for the duration of every transition,
// which is a worse artifact than the one being fixed.
//
// The sky is NOT affected: it is a sibling of hui-view inside
// hui-view-container, not a child, so it stays put while the view fades over
// it. That is also why the fade cannot be put on the container.
//
// WHILE THIS RUNS, THE SHARED BLUR IS BLIND: hui-view is a backdrop root for
// the 170 ms, so hk-glass.js's layers inside it sample nothing -- the frost
// could only ever arrive after the fade, as a pop. So WITH THE BLUR LOOK THIS
// FADE DOES NOT RUN: hk-glass holds every new view unpainted until its
// layers are placed and cancels this animation on it (a hard cut to the
// complete page). With the clear and frosted looks
// nothing in hk-glass runs and this fade is what it always was.
(function () {
  'use strict';
  if (window.hkViewFade) return;

  var MS = 170;
  var CSS =
    'hui-view,hui-masonry-view,hui-sections-view,hui-panel-view{' +
    // BACKWARDS, NOT BOTH. `both` keeps the finished animation's opacity:1
    // applied for the life of the view, and Chromium treats an element whose
    // opacity comes from an animation as its own compositing surface -- a
    // BACKDROP ROOT. The sky is outside hui-view, so every backdrop-filter
    // inside it (the chips, the #media sheet) would blur an empty surface and
    // the chips' glass would go silently flat. `backwards` still holds opacity:0 before the first
    // frame (no flash), and once the fade ends the animation is gone.
    // --hk-view-anim: none from hk-settings.js with "Blur each card": for
    // these 170 ms the view is a backdrop root and every card's own blur
    // samples nothing, so the frost would snap on as the fade ended -- a hard
    // cut instead, as the shared blur's hold gives (a variable, because this
    // sheet lives in hui-root's shadow root, where no <html> selector
    // reaches).
    '  animation:var(--hk-view-anim,hk-view-in ' + MS + 'ms cubic-bezier(0.2,0,0,1) backwards)}' +
    '@keyframes hk-view-in{from{opacity:0}to{opacity:1}}' +
    // A tablet that reports reduce-motion gets nothing -- and note that a
    // Samsung can report `reduce` with every animation scale at 1x until it is
    // rebooted, so this must degrade to a
    // plain cut rather than to something half-applied.
    '@media (prefers-reduced-motion: reduce){' +
    '  hui-view,hui-masonry-view,hui-sections-view,hui-panel-view{animation:none}}';

  var sheet = null;
  function styleSheet() {
    if (sheet) return sheet;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
    } catch (e) {
      sheet = null;                      // no constructable stylesheets: give up
    }
    return sheet;
  }

  // hui-view lives in hui-root's SHADOW root, so a document stylesheet cannot
  // reach it. Adopt into that root instead -- the same approach hk-sky.js uses
  // for the layer it inserts there. Found by its known path (as hk-kiosk.js
  // finds it); a walk of the whole page only if that path is gone (a Home
  // Assistant that has moved its parts).
  function parts() {
    var ha = document.querySelector('home-assistant');
    var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
    var resolver = main && main.shadowRoot && main.shadowRoot.querySelector('partial-panel-resolver');
    var panel = resolver && resolver.querySelector('ha-panel-lovelace');
    var hr = panel && panel.shadowRoot && panel.shadowRoot.querySelector('hui-root');
    return { main: main, resolver: resolver, panel: panel, root: (hr && hr.shadowRoot) || null };
  }
  function walkRoot() {
    var seen = new Set(), found = null;
    (function walk(r, d) {
      if (!r || d > 30 || found) return;
      var kids = r.querySelectorAll ? r.querySelectorAll('*') : [];
      for (var i = 0; i < kids.length; i++) {
        var e = kids[i];
        if (e.tagName === 'HUI-ROOT' && e.shadowRoot) { found = e.shadowRoot; return; }
        if (e.shadowRoot && !seen.has(e.shadowRoot)) { seen.add(e.shadowRoot); walk(e.shadowRoot, d + 1); }
      }
    })(document, 0);
    return found;
  }

  function apply() {
    var p = parts();
    watch(p);
    // Only a Lovelace panel has a hui-root.
    var HS = window.hkSettings;
    if (HS && HS.lovelacePanel && HS.lovelacePanel() === false) return false;
    var root = p.root || (p.main && p.resolver ? null : walkRoot()), s = styleSheet();
    if (!root || !s || !root.adoptedStyleSheets) return false;
    if (root.adoptedStyleSheets.indexOf(s) >= 0) return true;
    root.adoptedStyleSheets = root.adoptedStyleSheets.concat([s]);
    return true;
  }

  // A NEW DASHBOARD IS A NEW hui-root. Another dashboard is a new
  // ha-panel-lovelace in the panel resolver, and it draws its hui-root only
  // once its config is in -- after location-changed, so a look at that moment
  // found the old one (measured headless, 2026-10-04: home -> kitchen and back,
  // neither new hui-root had the fade). Watched where they change, the
  // resolver's children and the panel's, never the whole page.
  var seen = { resolver: null, panel: null }, mo = null;
  function watch(p) {
    if (typeof MutationObserver === 'undefined') return;
    var r = p.resolver || null, pn = (p.panel && p.panel.shadowRoot) || null;
    if (r === seen.resolver && pn === seen.panel) return;
    if (mo) mo.disconnect();
    mo = new MutationObserver(function () { apply(); });
    if (r) mo.observe(r, { childList: true });
    if (pn) mo.observe(pn, { childList: true });
    seen = { resolver: r, panel: pn };
  }

  // Until Home Assistant's page is there (a cold tablet can take a while):
  // every 250 ms for 10 s, then every 2 s while this is its page. Once the
  // resolver is watched, the observer has it.
  (function wait(n) {
    apply();
    if (seen.resolver) return;
    if (n >= 40 && !document.querySelector('home-assistant')) return;
    setTimeout(function () { wait(n + 1); }, n < 40 ? 250 : 2000);
  })(0);
  window.addEventListener('location-changed', apply);
  window.addEventListener('popstate', apply);

  window.hkViewFade = { apply: apply, ms: MS, _css: CSS };
})();
