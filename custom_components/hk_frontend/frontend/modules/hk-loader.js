// hk-loader.js - imports the order-independent dashboard modules (MODULES
// below: stats, charts, sky, idle, viewfade, glass, timers, campost).
//
// WHY THIS EXISTS
// The bootstrap list -- the files every page loads before any card renders --
// is registered by custom_components/hk_frontend/__init__.py
// (add_extra_js_url), and changing THAT LIST needs a Home Assistant restart.
// This file is one entry in it, and adding a module HERE is live on the next
// page load: /hk/ is served with Cache-Control: no-cache, so every file
// revalidates (ETag -> 304) and an edit to any of them is live on a refresh.
//
// WHAT BELONGS IN HERE: modules that do nothing at load time except assign a
// window global (window.hkSky, window.hkStats, ...), which cards read lazily
// while rendering -- so the imports can run in parallel, in any order.
//
// WHAT DOES NOT: the other bootstrap entries in __init__.py, which must run
// BEFORE the first card renders --
//   hk-settings.js    the dashboard settings every page reads at first paint;
//   hk-icons.js       registers the hk: iconset (ha-icon caches a miss for the
//                     life of the page, so it cannot be late);
//   tesla-viewport.js pins the layout width in a car browser (late = a reflow);
//   hk-tap.js         registers --hk-ring as an <angle> before the first tap;
//   hk-header.js      the header builders, painted first.
//
// Before adding a module here, check it has nothing to do before first render.
(function () {
  'use strict';

  var MODULES = ['hk-stats.js', 'hk-charts.js', 'hk-sky.js', 'hk-idle.js',
                 'hk-viewfade.js',
                 // The shared blur layer (look.glass = blur). Cards join it
                 // from HkBase whichever of the two loads first.
                 'hk-glass.js',
                 // The timer countdowns. They appear inside both
                 // hk-timer-strip-card and hk-timers-card, so the module
                 // belongs here rather than being loaded by one card.
                 'hk-timers.js',
                 // Hands the cameras page the strip's cached thumbnail as its
                 // video poster. Measured: HA's own poster loses the race to
                 // the live stream on most cameras, so the page is dark from
                 // 425ms until the stream starts.
                 'hk-campost.js',
                 // The menu of pages and rooms (Configure -> Menu and room
                 // pages). Draws nothing on a dashboard without it; nothing to
                 // do before first paint, so it waits for the cards.
                 'hk-menu.js'];

  // NO GRID-LAYOUT PATCH MODULE. An inline box containing block content makes
  // every section creep 6px per tap in Safari; hk-grid-card and hk-grid-view
  // declare `display: block` themselves, so that shape cannot occur and there
  // is nothing for a module to adopt into layout-card's shadow root. A patch
  // module whose ramp only settles once it has patched something would also
  // spin through every tick on every navigation, finding nothing.

  function load(stamp) {
    return Promise.all(MODULES.map(function (m) {
      // Import order is not significant: hk-charts.js reaches for
      // window.hkStats only when a card calls it, never at load time. So these
      // go in parallel.
      //
      // `stamp` is only used by hkReload() below. A normal page load passes
      // nothing, so the URL is stable and the browser can serve the module
      // from cache after a 304 -- which is the whole point of /hk/.
      var url = '/hk/modules/' + m + (stamp ? '?t=' + stamp : '');
      return import(url).catch(function (err) {
        // FALL BACK TO A <script> TAG, because a failed import() must stay
        // survivable.
        //
        // These modules assign globals (window.hkSky, window.hkStats, ...);
        // none of them export anything, so a classic script loads them just
        // as well as a module does. On a client where import() does not
        // resolve, this is what actually loads them; without it the sky
        // simply fails to appear there, with no error anyone could see.
        //
        // So the fallback belongs here, once, for every module, rather than
        // in a card that happens to carry one.
        console.warn('[hk-loader] import failed for ' + url + ', trying <script>', err);
        return new Promise(function (resolve) {
          var sc = document.createElement('script');
          sc.src = url;
          sc.onload = function () { resolve(); };
          sc.onerror = function () {
            console.error('[hk-loader] could not load ' + url + ' either way');
            resolve();                      // never block the other modules
          };
          document.head.appendChild(sc);
        });
      });
    }));
  }

  // Exposed for the browser console during development: hkReload() re-imports
  // every module with a fresh stamp, so an edit can be picked up without even
  // a page refresh. The stamp is needed HERE and only here -- a module already
  // evaluated in this document is not re-executed for the same URL, 304 or
  // not. Only hk-stats and hk-charts replace their globals; the others guard
  // on `if (window.hkX) return` and need a page reload.
  window.hkReload = function () { return load(Date.now()); };

  load(null);

  // ------------------------------------------------------------ ?hkprobe=1
  // The layout probe, loaded ONLY when the URL asks for it, so it costs a
  // normal page load nothing -- not a request, not a byte.
  //
  // WHY IT IS HERE AND NOT PASTED INTO A CONSOLE. Some layout bugs reproduce
  // only in one browser on one machine (Safari on a Mac, say). Driving that
  // browser's inspector remotely is rarely possible, and pasting a script by
  // hand is its own failure mode. A URL is the one instruction that survives
  // being handed over: open the page with ?hkprobe=1, touch the thing, read
  // the panel, press the button.
  try {
    // ?hkprobe=1 is the layout probe; ?hkprobe=<name> loads
    // /hk/pages/dev/<name>.js instead (letters, digits and dashes only), so a
    // new probe needs a file, not another branch here.
    var pm = /[?&]hkprobe=([^&#]*)/.exec(location.search);
    if (pm) {
      var pn = /^[a-z0-9-]+$/i.test(pm[1]) && pm[1] !== '1' ? pm[1] : 'hk-probe';
      var pu = '/hk/pages/dev/' + pn + '.js?t=' + Date.now();
      import(pu)
        .catch(function () {
          var sc = document.createElement('script');
          sc.src = pu;
          document.head.appendChild(sc);
        });
    }
  } catch (e) { /* a probe must never break a page load */ }
})();
