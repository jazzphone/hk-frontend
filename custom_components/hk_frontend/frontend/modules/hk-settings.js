// hk-settings.js -- THE DASHBOARD SETTINGS, on every screen, before any card.
//
// Which entities the pages read -- the header's locks and contacts, the weather
// entity and its sensors, the sky's moon and holiday sources, the idle-return
// dashboards, the car browsers -- is chosen in Settings -> Devices & services ->
// HK Frontend -> Configure and stored in the integration (settings.py). This
// module holds it for the page: window.hkSettings.
//
//   hkSettings.get('weather.entity')          one value (or a fallback)
//   hkSettings.weatherId(states)              the weather entity to read
//   hkSettings.clock(states)                  { time: 'HH:MM', date: 'YYYY-MM-DD' }
//   hkSettings.moon(states)                   0..1 phase fraction
//   hkSettings.seasonName(states)             'Halloween' | 'Thanksgiving' | 'Christmas' | ''
//   hkSettings.seasonalOn(states)             false only when the gate is explicitly off
//   hkSettings.themeOn('thanksgiving')        may this sky theme run at all
//   hkSettings.onChange(fn)                   called after a change; returns unsubscribe
//
// WHERE THE VALUES COME FROM, in order:
//   1. `hk_frontend/settings/subscribe` over the page's own websocket -- now,
//      and again whenever anything is edited. A change also fires
//      `hk-module-ready`, which redraws every hk card (hk-base.js MODULE WAKE),
//      so an edit reaches an open screen with no reload.
//   2. Until the server answers: the copy the last answer left in
//      localStorage, so a reload paints with the real settings, not defaults.
//   3. With neither: DEFAULTS, which assume no particular house.
//
// A BOOTSTRAP MODULE (registered in __init__.py, first in the list), because
// the header builders and the sky are bootstrap modules too and read it at
// their first paint.
(function () {
  'use strict';
  if (window.hkSettings) return;

  // Mirror of settings.py DEFAULTS. The server's answer always carries every
  // key, so this only matters before the first answer on a fresh browser.
  var DEFAULTS = {
    security: { alarm: null, garage: [], locks: [], doors: [], windows: [] },
    clock: { time: 'sensor.time', date: 'sensor.date' },
    weather: { entity: null, feels_like: null, humidity: null, wind: null, gust: null, uv: null,
               forecast_daily: null, forecast_hourly: null, alerts: null, place: null, outside: null,
               // the Weather Radar Card's own options (YAML), over the tuned map
               radar: {} },
    sky: { moon: null, holidays: null, seasonal: null, birthdays: [], decorations: true,
           themes: ['halloween', 'thanksgiving', 'christmas', 'birthday', 'fourth-of-july',
                    'valentines-day', 'spring-garden', 'winter-wonderland', 'storybook-magic',
                    'space-night'],
           christmas_from: null, hemisphere: 'north',
           halloween_from: null, halloween_to: null, thanksgiving_from: null, thanksgiving_to: null,
           christmas_to: null, july4_from: null, july4_to: null,
           valentines_from: null, valentines_to: null, spring_from: null, spring_to: null,
           winter_from: null, winter_to: null,
           halloween_often: null, thanksgiving_often: null, christmas_often: null,
           spring_often: null, winter_often: null, storybook_per_month: null, space_per_month: null,
           spooky_often: null },
    idle: { dashboards: [], rooms: {}, 'default': null },
    car: { dashboards: [] },
    generated: { exclude_areas: [], exclude_devices: [], exclude_entities: [], include_entities: [] },
    features: { vacuum_script: null, alarm_bad_code: null, thermostats: [], temperature: null, power: null,
                house_timers: [] },
    menu: { dashboards: [], docked: [], dock_min: 1000, time_weather: [], button: 'auto', tab_position: '', glyph: 'sidebar', clock: true,
            order: 'az', categories: [], ha_sidebar: [] },
    rooms: { headings: true, status: ['temperature', 'humidity', 'outlets', 'blinds', 'fans', 'windows',
                                      'doors', 'locks', 'garage', 'motion', 'occupancy', 'leaks'] },
    look: { glass: 'clear', frost: 50, blur: 50, details: true, browse_view: 'music-browse', sky_switch: null,
            photos: 'media-source://media_source/local/photos', page_pills: {} },
    // Browse Music (Configure -> Browse Music). The Discover rows arrive as
    // the queries themselves (settings.py discover_rows); these are its
    // default five.
    browse: { hide: [], discover: [
      { key: 'recently_played', title: 'Recently played', media_type: 'track', order_by: 'last_played_desc' },
      { key: 'favourite_playlists', title: 'Favorite playlists', media_type: 'playlist', favorite: true },
      { key: 'most_played', title: 'Most played', media_type: 'album', order_by: 'play_count_desc' },
      { key: 'recently_added', title: 'Recently added', media_type: 'album', order_by: 'timestamp_added_desc' },
      { key: 'favourite_radio', title: 'Favorite radio', media_type: 'radio', favorite: true }
    ] }
  };
  var KEY = 'hk_settings';

  function merge(over) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (over && typeof over === 'object') {
      Object.keys(out).forEach(function (s) {
        var v = over[s];
        if (v && typeof v === 'object') {
          Object.keys(out[s]).forEach(function (k) { if (k in v) out[s][k] = v[k]; });
        }
      });
    }
    // THE DASHBOARD ITEMS, by url path (settings.py `boards`): a map
    // whose keys are the house's own dashboards, so it is taken whole rather
    // than key by key against a default -- the loop above would drop it.
    var b = over && over.boards;
    out.boards = (b && typeof b === 'object' && !Array.isArray(b)) ? JSON.parse(JSON.stringify(b)) : {};
    // WHAT COUNTS, resolved by the integration (kinds.py): kind -> entity ids.
    // Taken whole too; empty until a server that sends it answers.
    var kd = over && over.kinds;
    out.kinds = (kd && typeof kd === 'object' && !Array.isArray(kd)) ? JSON.parse(JSON.stringify(kd)) : {};
    // ACCESSORY SETTINGS (accessories.py): each accessory's name, icon, show
    // as, status and home, and each room's tile order. Taken whole.
    var ac = over && over.accessories;
    out.accessories = {
      entities: (ac && ac.entities && typeof ac.entities === 'object') ? JSON.parse(JSON.stringify(ac.entities)) : {},
      rooms: (ac && ac.rooms && typeof ac.rooms === 'object') ? JSON.parse(JSON.stringify(ac.rooms)) : {},
      into: (ac && ac.into && typeof ac.into === 'object') ? JSON.parse(JSON.stringify(ac.into)) : {},
      // a category page's own order (the Vacuums page, say)
      pages: (ac && ac.pages && typeof ac.pages === 'object') ? JSON.parse(JSON.stringify(ac.pages)) : {}
    };
    // THE HOUSE'S CUSTOM PAGES (settings.custom_pages): a list,
    // taken whole -- each its address, title, icon and view
    var cp = over && over.custom_pages;
    out.custom_pages = Array.isArray(cp) ? JSON.parse(JSON.stringify(cp)) : [];
    // THE HOUSE'S CUSTOM CHIPS (settings.custom_chips): likewise
    // -- each its key, name, where it sits and its card
    var cc = over && over.custom_chips;
    out.custom_chips = Array.isArray(cc) ? JSON.parse(JSON.stringify(cc)) : [];
    // THE FEATURES ADDED and set up (features/): music, live_tv,
    // clean_areas, alarm_pin -- their actions exist either way
    var ad = over && over.added;
    out.added = Array.isArray(ad) ? ad.filter(function (k) { return typeof k === 'string'; }) : [];
    // THE OPTIONAL HACS CARDS that are installed (settings.find_extras):
    // key -> the card's URL, or null. Taken whole.
    var ex = over && over.extras;
    out.extras = (ex && typeof ex === 'object' && !Array.isArray(ex)) ? JSON.parse(JSON.stringify(ex)) : {};
    // THE POP-UPS (settings.py `popups`): a list, taken whole.
    var pp = over && over.popups;
    out.popups = Array.isArray(pp) ? JSON.parse(JSON.stringify(pp)) : [];
    return out;
  }
  function load() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function store(v) {
    try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ }
  }

  var cur = merge(load());
  var listeners = [];

  // ------------------------------------------------------------ the glass look
  // look.glass (Screens page):
  //   clear    the original plate; the status chips blur themselves
  //   frosted  a frosted MATERIAL everywhere and no blur at all -- drawn once,
  //            costs nothing per frame
  //   blur     ONE shared blur layer behind every glass surface (hk-glass.js);
  //            nothing blurs itself
  //   blur_each  every glass surface blurs what is behind it (hkCards.M.glass
  //            reads --hk-glass-backdrop) -- for phones, iPads and
  //            computers: nothing to measure or line up, so a sheet opening, a
  //            press or a row scrolling can never leave the frost behind. NOT
  //            for wall tablets:
  // per-card backdrop-filter was measured unaffordable on entry-level Samsung
  // tablets (the cost is the NUMBER of blur surfaces: 22 of them halved the
  // frame rate and blanked cards); one shared layer held 90 fps. See
  // docs/settings.md.
  //
  // THE AMOUNTS (House -> Look; a dashboard's Screen page can set its own),
  // each 0-100 %, 50 -- the middle of the slider -- as designed:
  //   look.frost  how milky the Frosted material is: the white sheen and the
  //               gray tint scale together, the grain stays (0: grain only)
  //   look.blur   how strong both blur looks are: 50 is 20 px, 100 is 40, 0
  //               leaves only the darkening (saturate and brightness)
  //
  // THE MATERIAL IS SET HERE, not in hk-glass.js: this module loads before any
  // card draws and paints from its cached copy, so a frosted page never
  // flashes clear first. Every glass surface reads these through
  // hkCards.M.glass / the status chip's rule.
  var GRAIN = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'>' +
    '<filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/>' +
    '<feColorMatrix values=\'0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0\'/></filter>' +
    '<rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>")';
  // key: 'frost' | 'blur' -- this dashboard's own (its Screen page), else
  // the house's (look.*).
  function amount(key) {
    var b = boardHere(), v = b && b[key];
    var n = (v === null || v === undefined || v === '') ? Number(get('look.' + key)) : Number(v);
    return isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  }
  function boardHere() {
    var seg = '';
    try { seg = String(location.pathname).split('/')[1] || ''; } catch (e) { /* a test harness */ }
    return (cur.boards && cur.boards[seg]) || null;
  }
  function frost(n) {
    var f = n / 50, a = function (v) { return +Math.min(0.92, v * f).toFixed(3); };
    return GRAIN + ', linear-gradient(145deg, rgba(255,255,255,' + a(0.18) + '), rgba(255,255,255,' + a(0.09) + ')), ' +
      'linear-gradient(rgba(58,60,68,' + a(0.34) + '), rgba(58,60,68,' + a(0.34) + '))';
  }
  // Over a blur: the plate the status chips always had over their own.
  var OVER_BLUR = 'linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07))';
  // The chips' own blur (hk-chip.js), at the chosen strength: the shared
  // layer's (hk-glass.js reads --hk-blur-filter) and every plate's.
  function blurFilter(n) {
    return 'blur(' + +(20 * n / 50).toFixed(1) + 'px) saturate(1.4) brightness(0.82)';
  }
  var LOOKS = {
    clear:     function () { return {}; },
    frosted:   function () { var m = frost(amount('frost')); return { '--hk-glass-plate': m, '--hk-chip-plate': m, '--hk-chip-backdrop': 'none' }; },
    blur:      function () {
      return { '--hk-glass-plate': OVER_BLUR, '--hk-chip-backdrop': 'none', '--hk-blur-filter': blurFilter(amount('blur')) };
    },
    // every plate blurs itself, the chips too; hk-viewfade's fade gives way
    // to a hard cut
    blur_each: function () {
      var b = blurFilter(amount('blur'));
      return { '--hk-glass-plate': OVER_BLUR, '--hk-glass-backdrop': b, '--hk-chip-backdrop': b, '--hk-view-anim': 'none' };
    }
  };
  var LOOK_VARS = ['--hk-glass-plate', '--hk-chip-plate', '--hk-chip-backdrop', '--hk-glass-backdrop',
                   '--hk-view-anim', '--hk-blur-filter'];
  // A PREVIEW ON ONE SCREEN: ?hkglass=clear|frosted|blur|blur_each on the URL
  // (or hkSettings.previewGlass(), which the test probe uses) wears that look
  // on this page only, without changing the house's setting or the cache.
  var glassPreview = null;
  try {
    var gm = /[?&]hkglass=(clear|frosted|blur_each|blur)\b/.exec(location.search);
    if (gm) glassPreview = gm[1];
  } catch (e) { /* no location (a test harness) */ }
  // A DASHBOARD'S OWN LOOK: its item's Screen page, else the house's.
  // Re-applied as the page moves between dashboards (location-changed).
  function glass() {
    if (glassPreview) return glassPreview;
    var b = boardHere();
    if (b && LOOKS[b.glass]) return b.glass;
    var g = get('look.glass');
    return LOOKS[g] ? g : 'clear';
  }
  function applyLook() {
    var root = document.documentElement;
    if (!root || !root.style) return;
    var look = LOOKS[glass()]();
    LOOK_VARS.forEach(function (k) {
      if (look[k]) root.style.setProperty(k, look[k]); else root.style.removeProperty(k);
    });
    if (root.setAttribute) root.setAttribute('data-hk-glass', glass());
  }
  // Marks a glass surface for the shared blur layer. NOT inherited, so only
  // the plate itself carries it, never the text and icons inside.
  try {
    if (window.CSS && CSS.registerProperty) {
      CSS.registerProperty({ name: '--hk-glass-surface', syntax: '<integer>',
                             inherits: false, initialValue: '0' });
    }
  } catch (e) { /* already registered by an earlier load */ }
  var waiting = [];              // whenLive() callers
  var state = { version: 0, live: false, configured: null };

  function get(path, fallback) {
    var v = cur;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (v === null || v === undefined) break;
      v = v[parts[i]];
    }
    return (v === null || v === undefined) ? fallback : v;
  }

  function apply(payload) {
    var next = merge(payload);
    var changed = JSON.stringify(next) !== JSON.stringify(cur);
    cur = next;
    state.live = true;
    state.configured = !!(payload && payload.configured);
    store(payload);
    waiting.splice(0).forEach(function (fn) { try { fn(); } catch (e) { /* caller's */ } });
    if (!changed) return;
    state.version++;
    applyLook();
    lookNow = lookKey();
    listeners.slice().forEach(function (fn) {
      try { fn(cur); } catch (e) { console.error('[hk-settings] listener', e); }
    });
    announce();
  }

  function announce() {
    try {
      window.dispatchEvent(new CustomEvent('hk-module-ready', { detail: { module: 'hk-settings' } }));
    } catch (e) { /* no event bus (a test harness) */ }
  }

  // A SUBSCRIPTION THAT SURVIVES. home-assistant-js-websocket
  // re-subscribes by itself after a reconnect -- but a subscribe that FAILS is
  // dropped for good. And one fails after every Home Assistant restart on a
  // screen that reconnects early: the websocket is served from the moment the
  // frontend is up, before this integration has registered its commands, so
  // the answer is `unknown_command` and the page would never hear of another
  // edit until it was reloaded. So the resubscribe is ours: after every
  // reconnect ('ready'), and after a failure with a backoff (1 s .. 30 s).
  // Also used by hkMusic (hk-base.js). Returns a function that ends it.
  function subscribe(conn, msg, onEvent, label) {
    var gen = 0, timer = null, backoff = 1000, closed = false, unsub = null;
    function quiet(fn) {
      try { var r = fn(); if (r && typeof r.catch === 'function') r.catch(function () {}); }
      catch (e) { /* already gone */ }
    }
    function go() {
      if (closed) return;
      var my = ++gen;
      clearTimeout(timer);
      Promise.resolve().then(function () {
        return conn.subscribeMessage(function (ev) {
          if (my === gen && !closed) onEvent(ev);
        }, msg, { resubscribe: false });
      }).then(function (u) {
        if (my !== gen || closed) { quiet(u); return; }
        unsub = u;
        backoff = 1000;
      }, function (e) {
        if (my !== gen || closed) return;
        console.warn('[' + (label || msg.type) + '] not available, retrying in ' +
                     (backoff / 1000) + ' s (' + ((e && (e.message || e.code)) || e) + ')');
        timer = setTimeout(go, backoff);
        backoff = Math.min(backoff * 2, 30000);
      });
    }
    // A reconnect: the server has forgotten every subscription.
    function onReady() { unsub = null; backoff = 1000; go(); }
    if (typeof conn.addEventListener === 'function') conn.addEventListener('ready', onReady);
    go();
    return function close() {
      closed = true;
      clearTimeout(timer);
      if (typeof conn.removeEventListener === 'function') conn.removeEventListener('ready', onReady);
      if (unsub) quiet(unsub);
    };
  }

  // ATTACH once the frontend has a connection -- polled briefly at page load,
  // then slowly, because a page can come up before its connection does.
  var attached = false;
  function attach() {
    if (attached) return true;
    var ha = null;
    try { ha = document.querySelector('home-assistant'); } catch (e) { return false; }
    var conn = ha && ha.hass && ha.hass.connection;
    if (!conn || typeof conn.subscribeMessage !== 'function') return false;
    attached = true;
    subscribe(conn, { type: 'hk_frontend/settings/subscribe' }, apply, 'hk-settings');
    // WHAT THE HOUSE ASKS THIS SCREEN TO DO (hk_frontend.show_popup): handed
    // on as a window event; the detail sheet (hk-detail.js) decides whether
    // this screen is one of those asked, and opens the pop-up.
    subscribe(conn, { type: 'hk_frontend/events/subscribe' }, function (ev) {
      try { window.dispatchEvent(new CustomEvent('hk-house-event', { detail: ev })); } catch (e) { /* no bus */ }
    }, 'hk-events');
    return true;
  }
  if (!attach()) {
    // Every 100 ms for a minute, then every 2 s for as long as this is a Home
    // Assistant page (it has a <home-assistant> element) that has not
    // connected yet. A page that is not one -- a probe, a test -- stops.
    var tries = 0;
    var fast = setInterval(function () {
      if (attach()) { clearInterval(fast); return; }
      if (++tries < 600) return;
      clearInterval(fast);
      var ha = null;
      try { ha = document.querySelector('home-assistant'); } catch (e) { /* none */ }
      if (!ha) return;
      var slow = setInterval(function () { if (attach()) clearInterval(slow); }, 2000);
    }, 100);
  }

  // ------------------------------------------------------------ helpers
  function st(states, id) { return (id && states && states[id]) || null; }

  // The weather entity: the chosen one -- even if it is missing, so a broken
  // choice shows as '--' rather than silently reading another -- or, when
  // nothing is chosen, the first weather entity in the house.
  function weatherId(states) {
    var id = get('weather.entity');
    if (id) return id;
    var ids = Object.keys(states || {}).filter(function (k) { return k.indexOf('weather.') === 0; });
    ids.sort();
    return ids[0] || null;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // { time: 'HH:MM', date: 'YYYY-MM-DD' } from the Time & Date sensors when
  // they exist, else from this screen's own clock.
  function clock(states) {
    var t = st(states, get('clock.time')), d = st(states, get('clock.date'));
    var now = new Date();
    return {
      time: t ? t.state : pad(now.getHours()) + ':' + pad(now.getMinutes()),
      date: d ? d.state : now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    };
  }

  // 0 new, 0.5 full, back to 1. The chosen sensor, else the synodic month
  // counted from a known new moon (6 January 2000, 18:14 UTC) -- continuous, and
  // good to well under a percent.
  function moon(states, when) {
    var s = st(states, get('sky.moon'));
    if (s) {
      var v = Number(s.state);
      return isFinite(v) ? v : 0.5;
    }
    if (get('sky.moon')) return 0.5;       // chosen but missing: full
    var syn = 29.530588853 * 86400000;
    var ref = Date.UTC(2000, 0, 6, 18, 14);
    var f = (((when || new Date()).getTime() - ref) / syn) % 1;
    return f < 0 ? f + 1 : f;
  }

  // The holiday SEASON the sky dresses for: the chosen sensor's state, else
  // the same windows computed from the date -- Halloween Sep 22..Oct 31,
  // Thanksgiving Nov 1..Thanksgiving Day, Christmas the day after..Dec 25.
  function seasonName(states, when) {
    var id = get('sky.holidays');
    if (id) {
      var h = st(states, id);
      return ((h && h.state) || '').trim();
    }
    var d = when || new Date();
    // Christmas is tested before Thanksgiving, so a house that moves
    // Christmas into November wins it.
    var order = ['halloween', 'christmas', 'thanksgiving'];
    for (var i = 0; i < order.length; i++) {
      if (skyWindow(order[i], d).inside) {
        return order[i].charAt(0).toUpperCase() + order[i].slice(1);
      }
    }
    return '';
  }

  // ------------------------------------------------------ the sky calendar
  // WHEN each sky theme may run (Configure -> Seasonal sky -> Season dates /
  // Surprise dates). Every date is MM-DD and empty means built in:
  var BUILT_IN = {
    halloween: ['09-22', '10-31'], thanksgiving: ['11-01', 'thanksgiving'],
    // The garland stays out of early December: the decoration is eligible
    // for the last 18 days, which is what 12-07 is.
    christmas: ['12-07', '12-25'],
    july4: ['06-28', '07-04'], valentines: ['02-08', '02-14'],
    spring: ['03-20', '06-20'], winter: ['12-21', '03-19']
  };
  // The southern hemisphere's spring and winter are six months on.
  var SOUTH = { spring: ['09-22', '12-20'], winter: ['06-21', '09-21'] };

  function usThanksgiving(y) {
    var nov1 = new Date(y, 10, 1);
    return new Date(y, 10, 1 + (4 - nov1.getDay() + 7) % 7 + 21);   // 4th Thursday
  }
  function mmdd(v) {
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(String(v || '').trim());
    return m ? [Number(m[1]), Number(m[2])] : null;
  }
  // The date `v` names, in year y ('thanksgiving' is US Thanksgiving).
  function onYear(v, y) {
    if (v === 'thanksgiving') return usThanksgiving(y);
    var p = mmdd(v);
    return p ? new Date(y, p[0] - 1, p[1]) : null;
  }
  function day0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function between(a, b) { return Math.round((day0(b) - day0(a)) / 86400000); }

  // skyWindow('halloween', date) -> {inside, daysToEnd, length, from, to}
  //   inside     the date is within the window (a window may wrap the new
  //              year: 12-20 .. 01-05);
  //   daysToEnd  whole days to the window's last day (0 on it);
  //   length     whole days from its first day to its last.
  function skyWindow(theme, when) {
    var d = day0(when || new Date());
    var south = get('sky.hemisphere', 'north') === 'south';
    var dflt = (south && SOUTH[theme]) || BUILT_IN[theme];
    var from = get('sky.' + theme + '_from') || dflt[0];
    var to = get('sky.' + theme + '_to') || dflt[1];
    var y = d.getFullYear();
    // The window that contains d starts this year or last (a wrapping one);
    // its end is the first `to` on or after that start.
    var cands = [y, y - 1];
    for (var i = 0; i < cands.length; i++) {
      var start = onYear(from, cands[i]);
      if (!start) break;
      var end = onYear(to, cands[i]);
      if (!end) break;
      if (end < start) end = onYear(to, cands[i] + 1);
      if (d >= start && d <= end) {
        return { inside: true, daysToEnd: between(d, end), length: between(start, end),
                 from: start, to: end };
      }
    }
    return { inside: false, daysToEnd: -1, length: 0 };
  }

  // How often: a season 'every_day' | 'sometimes' | 'near_end'; spring and
  // winter 'often' | 'sometimes' | 'rarely'; storybook and space night, days
  // a month. Empty is the built-in 'sometimes' / once a month.
  function often(key, dflt) { return get('sky.' + key) || dflt; }

  // Is seasonal decoration allowed? The integration's own switch (Seasonal
  // decorations, stored as sky.decorations) must be on, and so must the
  // optional extra entity when one is chosen -- only an explicit 'off' of
  // that one says no.
  function seasonalOn(states) {
    if (get('sky.decorations') === false) return false;
    var g = st(states, get('sky.seasonal'));
    return !(g && g.state === 'off');
  }

  // THE UNIT A READING IS IN, for its label -- never assumed (never a fixed
  // "mph" or "°F" whatever the house measures in): a sensor's own
  // unit_of_measurement, else the weather entity's attribute for it
  // (wind_speed_unit, temperature_unit), else `fallback`.
  function unit(stateObj, attr, fallback) {
    var a = (stateObj && stateObj.attributes) || {};
    return a.unit_of_measurement || (attr && a[attr]) || fallback;
  }

  // May this sky theme run? Configure -> Seasonal sky -> Themes.
  function themeOn(id) {
    var t = get('sky.themes');
    return !Array.isArray(t) || t.indexOf(id) !== -1;
  }

  // The look from the cached copy, before any card draws.
  applyLook();
  // ...and again on moving to another dashboard, whose look may be its own.
  // The glass layer and the chips hear of it as they hear of any setting.
  // Compared as the look AND its amounts: two dashboards can share a look and
  // differ in how strong it is (each Screen's own Blur / Frost), and comparing
  // the name alone kept the first one's strength on the second.
  function lookKey() { return glass() + '|' + amount('blur') + '|' + amount('frost'); }
  var lookNow = lookKey();
  function onNav() {
    var g = lookKey();
    if (g === lookNow) return;
    lookNow = g;
    applyLook();
    listeners.slice().forEach(function (fn) {
      try { fn(cur); } catch (e) { console.error('[hk-settings] listener', e); }
    });
    announce();
  }
  try {
    window.addEventListener('location-changed', onNav);
    window.addEventListener('popstate', onNav);
  } catch (e) { /* no window events (a test harness) */ }

  // IS THIS PAGE A LOVELACE PANEL? Read off hass.panels -- a property, not a
  // walk of the document. null while hass is not up yet (treat as "maybe"),
  // else true/false. The sky, the view fade, the icon repair and the camera
  // poster ask this rather than walk every shadow root on the page, which
  // would cost as much on Settings and Logs as on a dashboard.
  function lovelacePanel() {
    var ha = document.querySelector('home-assistant');
    var panels = ha && ha.hass && ha.hass.panels;
    if (!panels) return null;
    var seg = location.pathname.split('/')[1] || 'lovelace';
    var p = panels[seg];
    return !!(p && p.component_name === 'lovelace');
  }

  window.hkSettings = {
    get: get,
    lovelacePanel: lovelacePanel,
    get version() { return state.version; },
    get live() { return state.live; },
    // Whether the integration has a config entry (null until it answers).
    get configured() { return state.configured; },
    // Resolves once the integration's own answer is in -- or after `ms`, on
    // the cached copy or the defaults. For code that runs ONCE (the generated
    // dashboard) and so cannot simply redraw when the answer arrives.
    whenLive: function (ms) {
      if (state.live) return Promise.resolve(true);
      return new Promise(function (resolve) {
        var done = false;
        var finish = function (v) { if (!done) { done = true; resolve(v); } };
        waiting.push(function () { finish(true); });
        setTimeout(function () { finish(false); }, ms || 3000);
      });
    },
    subscribe: subscribe,
    onChange: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    glass: glass,
    previewGlass: function (mode) {
      glassPreview = LOOKS[mode] ? mode : null;
      applyLook();
      listeners.slice().forEach(function (fn) {
        try { fn(cur); } catch (e) { console.error('[hk-settings] listener', e); }
      });
    },
    weatherId: weatherId,
    clock: clock,
    moon: moon,
    seasonName: seasonName,
    skyWindow: skyWindow,
    often: often,
    seasonalOn: seasonalOn,
    themeOn: themeOn,
    unit: unit,
    DEFAULTS: DEFAULTS,
    _apply: apply            // tests
  };
  announce();
})();
