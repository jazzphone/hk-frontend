// hk-menu.js -- THE MENU OF PAGES AND ROOMS, modeled on the Home app's sidebar.
//
// A panel that slides in from the left over the page: Home, the dashboard's
// own pages, and every room. On a dashboard only when its own item under
// Dashboards on HK Frontend's page says so (settings `boards`), so a house
// that never adds one gets nothing from this file.
//
// NOTHING HERE NAMES A ROOM OR A PAGE. The list is read from the dashboard it
// is on (docs/Menu.md):
//   * the first view is Home;
//   * a view with `area:` (one area or a list) is a room -- named by its own
//     title (else its area's name) and pictured by its area's icon in
//     Settings -> Areas, unless the view says otherwise;
//   * Categories: the pages the Home view's chips open, in chip order (with
//     no chips, every other view with a title, in the dashboard's order) --
//     or, when its item's Categories in the menu names some, those pages;
//   * `menu: top` lists a view beside Home, `menu: false` leaves it out, and
//     `menu_title:` renames an entry without renaming the view.
//
// THE WAY IN (hk-base.js `hkCards.menu.style()`), one style per dashboard:
//   chip -- hk-menu-button-card (usually the chip row's pinned lead) and the
//           round button hk-back-card draws beside its chevron;
//   tab  -- the slim EDGE TAB below, drawn here, on every page, centered on
//           the date line under the header clock (hk-header-card measures it),
//           or where Configure -> Tab position puts it;
//   docked -- its item's Menu: "Always open beside the page", with room:
//           the menu stays beside the page, and there is no button at all.
//   chip_scroll / chip_home -- the chip, and the tab slides in while the
//           chip is scrolled out of sight (chip_home: the tab outright on
//           every page but Home). See "the scrolled tab" below.
// And the clock itself opens the menu when "Tapping the clock opens the menu"
// is on (hk-header-card). Under 1,024 px (TAB_MIN in hk-base.js), and while
// an always-open menu is folded, the screen's "On Narrow Screens" choice
// decides: the round button (the default -- a phone's margin has
// little room for a tab), the chip then the tab once scrolled past, or the
// tab.
//
// IT CLOSES ITSELF when a row is chosen, when the scrim is tapped, on Escape,
// on any navigation or pop-up (the idle return included), when the screen is
// hidden, and after a minute untouched.
//
// Mounted ONCE, in <home-assistant>'s shadow root beside the pop-ups and
// sheets (hk-popup.js, hk-detail.js), so it outlives every page change -- its
// scroll position and open sections with it -- the way the Home app's
// sidebar does. Stacking: the tab (6) sits under the pop-ups (7) and the
// detail sheets (8); the open panel (9) over them, the persistent #media bar
// included.
(function () {
  'use strict';
  if (window.hkMenu) return;

  // THE FIRST LOAD AFTER AN UPDATE can pair this file with the previous
  // hk-base.js, still in the service worker's cache. The menu then stays out of the way for that one load rather
  // than throwing on a helper the old base does not have; the next load has
  // both.
  var NEEDS = ['on', 'style', 'docked', 'icon', 'clock', 'config', 'dash', 'dateY', 'homeButton', 'panel', 'viewTop',
               'board'];
  function fits(C) {
    var M = C && C.menu;
    return !!M && NEEDS.every(function (k) { return typeof M[k] === 'function'; });
  }
  function whenBase(fn) {
    function go() {
      if (fits(window.hkCards)) fn(window.hkCards);
      else if (window.console) console.info('hk-menu: hk-base.js is older than this menu; reload once more');
    }
    if (window.hkCards && window.hkCards.menu) return go();
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.menu) go();
    }, { once: true });
  }

  // ------------------------------------------------------------- the list
  // A PURE FUNCTION of the dashboard config, the areas and the settings, so
  // the tests can hold it to every rule above without a page.
  //   cfg    the dashboard's lovelace config ({ views: [...] })
  //   areas  hass.areas (area_id -> { name, icon })
  //   o      { dash, order: 'az'|'dashboard', user: hass.user.id,
  //            categories: [view paths] (empty: the chips' pages), ha: bool,
  //            chips: the screen's Chips (its chips card's kinds), chipsRow }
  function model(cfg, areas, o) {
    o = o || {};
    var views = (cfg && Array.isArray(cfg.views)) ? cfg.views : [];
    var out = { home: null, top: [], categories: [], rooms: [] };
    if (!views.length) return out;
    var dash = o.dash || '';
    // HA's own visibility: `visible: false`, or per user ([{ user: id }, ...]).
    // Nothing overrides it.
    function userCan(v) {
      if (v.visible === false) return false;
      if (Array.isArray(v.visible) && o.user) {
        return v.visible.some(function (u) { return u && (u.user === o.user || u === o.user); });
      }
      return true;
    }
    function menuOff(v) { return v.menu === false || v.menu === 'hidden'; }
    function pathOf(v, i) { return '/' + dash + '/' + (v.path || i); }
    var v0 = views[0];
    // CATEGORIES. By default the pages the Home view's chips open, in chip
    // order -- the chip row already is the house's list of what matters.
    // With no chips, every titled page. Chosen in Configure, those pages
    // (still in chip order, then the dashboard's).
    var chips = chipPaths(v0, dash, { views: views, chips: o.chips, row: o.chipsRow });
    var chosen = Array.isArray(o.categories) && o.categories.length ? o.categories : null;
    // A DASHBOARD'S PAGE ORDER (the screen's page order), as view paths:
    // when it is set, it orders the pages here too -- not the chips.
    var po = Array.isArray(o.pageOrder) ? o.pageOrder : [];
    // TOP OF THE MENU (the screen's own choice): the view paths
    // listed right under Home, above Categories. None chosen: the views that
    // say `menu: top` themselves (a generated screen's Weather, Cameras and
    // Live TV). A page chosen here shows even with its view's `menu: false`.
    // ['-'] (the settings page's "nothing at the top") matches no view.
    var topSet = Array.isArray(o.top) && o.top.length ? o.top.map(String) : null;
    function isTop(v, i) { return topSet ? topSet.indexOf(String(v.path || i)) !== -1 : v.menu === 'top'; }
    function chipRank(v, i) {
      var c = chips.indexOf(String(v.path || i));
      return c === -1 ? chips.length + i : c;
    }
    function rank(v, i) {
      if (!po.length) return chipRank(v, i);
      var j = po.indexOf(String(v.path || i));
      return j >= 0 ? j : po.length + chipRank(v, i);
    }
    function listed(v, i) {
      var key = String(v.path || i);
      if (chosen) return chosen.indexOf(key) !== -1;
      return !chips.length || chips.indexOf(key) !== -1;
    }
    out.home = { title: (v0 && v0.menu_title) || 'Home', icon: (v0 && v0.menu_icon) || 'mdi:home',
                 path: pathOf(v0 || {}, 0), index: 0, kind: 'home', paths: ['0', v0 && v0.path] };
    // "Home Assistant" (a screen's Menu -> Home Assistant): its own section,
    // between the top pages and Categories (haItems, drawn by the page).
    out.ha = !!o.ha;
    // Is the page at `i` in the menu? (top, or a listed category)
    function shows(v, i) {
      if (!v || !userCan(v)) return false;
      if (isTop(v, i)) return true;
      if (menuOff(v) && !(chosen && listed(v, i))) return false;
      return listed(v, i);
    }
    for (var i = 1; i < views.length; i++) {
      var v = views[i];
      if (!v) continue;
      var list = [].concat(v.area || (v.strategy && v.strategy.area) || []).filter(Boolean);
      if (!userCan(v)) continue;
      // A PAGE THAT FOLLOWS ANOTHER (Browse Music follows Play Music): in the
      // menu when its leader is, as its kind, right after it -- or where the
      // page order places it.
      if (v.menu_follows) {
        var li = -1;
        for (var k = 1; k < views.length; k++) if (views[k] && views[k].path === v.menu_follows) { li = k; break; }
        if (li < 0 || !shows(views[li], li) || !(v.menu_title || v.title)) continue;
        var lead = views[li], own = po.indexOf(String(v.path || i));
        var fit = { title: v.menu_title || v.title, icon: v.menu_icon || v.icon || PAGE_ICON, path: pathOf(v, i),
                    index: i, kind: isTop(lead, li) ? 'top' : 'category', paths: [String(i), v.path],
                    rank: own >= 0 ? own : rank(lead, li) + 0.5 };
        if (fit.kind === 'top') out.top.push(fit); else out.categories.push(fit);
        continue;
      }
      // an explicit choice outranks the view's own `menu: false`
      if (menuOff(v) && !(chosen && listed(v, i)) && !(topSet && isTop(v, i))) continue;
      if (list.length) {
        var a = (areas && areas[list[0]]) || {};
        // The page's own title first -- it is what the room's heading on Home
        // says, so the two can never spell it differently -- then the area's.
        out.rooms.push({ title: v.menu_title || v.title || a.name || list[0],
                         icon: v.menu_icon || v.icon || a.icon || ROOM_ICON,
                         path: pathOf(v, i), index: i, kind: 'room', areas: list, paths: [String(i), v.path] });
        continue;
      }
      var title = v.menu_title || v.title;
      if (!title) continue;
      var top = isTop(v, i);
      if (!top && !listed(v, i)) continue;
      var item = { title: title, icon: v.menu_icon || v.icon || PAGE_ICON, path: pathOf(v, i), index: i,
                   kind: top ? 'top' : 'category', paths: [String(i), v.path], rank: rank(v, i) };
      if (top) out.top.push(item);
      else out.categories.push(item);
    }
    out.categories.sort(function (x, y) { return x.rank - y.rank; });
    // ROOM ORDER (the dashboard item's "Rooms in the menu"): A to Z, or
    // `order` -- the item's Room order, a list of AREAS (drag-ordered in the
    // form), a room placed by the first of its areas that is listed; rooms
    // not in it follow in the dashboard's order. An empty list is simply the
    // dashboard's order ('dashboard', the older name, means the same).
    if (o.order === 'order' || o.order === 'dashboard') {
      // its own names: `rank` and `list` above are this function's too
      var roomRank = {}, order = Array.isArray(o.roomOrder) ? o.roomOrder : [];
      order.forEach(function (a, i) { if (!(a in roomRank)) roomRank[a] = i; });
      out.rooms.forEach(function (r, i) {
        var best = order.length;
        (r.areas || []).forEach(function (a) { if (a in roomRank && roomRank[a] < best) best = roomRank[a]; });
        r._rank = best; r._i = i;
      });
      out.rooms.sort(function (x, y) { return x._rank - y._rank || x._i - y._i; });
      out.rooms.forEach(function (r) { delete r._rank; delete r._i; });
    } else {
      out.rooms.sort(function (x, y) {
        return String(x.title).localeCompare(String(y.title), undefined, { sensitivity: 'base' });
      });
    }
    return out;
  }
  // WHERE THE EDGE TAB'S CENTER GOES, in px below the top of the page:
  //   pos    Configure -> Tab position: '' (level with the date line), '140px'
  //          (from the top of the page) or '20%' (of the page's visible height)
  //   dateY  the header's date line, when it has been measured (else 118, where
  //          it sits on a wall tablet)
  //   height the page's visible height
  // Always kept on screen: the tab's own half-height clear of either edge.
  function tabCentre(pos, dateY, height, tabH) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$/.exec(String(pos || ''));
    var y = m ? (m[2] === '%' ? height * parseFloat(m[1]) / 100 : parseFloat(m[1]))
              : (dateY === null || dateY === undefined ? 118 : dateY);
    var half = (tabH || 62) / 2 + 8;
    return Math.max(half, Math.min(Math.max(half, height - half), y));
  }

  // The pages the Home view's chips open, in the order the chips sit: every
  // hk-status-chip-card's navigate target, as a view path on this dashboard
  // (./lights, lights and /<dash>/lights all mean `lights`). A pop-up hash is
  // not a page.
  // A dashboard item's page order (settings `pages`: kinds, `browse`, custom
  // page addresses) as view paths. Empty: none set, the chips rule.
  var PAGE_PATHS = { weather: 'weather', cameras: 'cameras', live_tv: 'live-tv', security: 'security',
                     doors_windows: 'doors-windows', climate: 'climate', lights: 'lights', timers: 'timers',
                     vacuums: 'vacuums', music: 'playmusic', browse: 'music-browse', water: 'water' };
  function pagePaths(pages, custom) {
    if (!Array.isArray(pages) || !pages.length) return [];
    var out = [];
    pages.forEach(function (k) {
      var p = PAGE_PATHS[k] || (k !== 'rooms' && Array.isArray(custom) && custom.indexOf(k) >= 0 ? k : null);
      if (p && out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }
  // THE CHIPS CARD (hk-chips-card): one card that draws a chip
  // per kind -- the screen's own Chips (`o.chips`), else the card's `chips:`,
  // else every kind -- each opening the first of its pages (KIND_PAGES, as
  // hk-chip.js) the dashboard has. Its `extra:` chips are walked as written.
  // `o.row === false`: the screen shows no chip row. A chips card with
  // `in_menu: false` (a generated screen's) picks no Categories.
  // A COPY of hk-chip.js's tables (hkChip.kinds): this module loads at
  // bootstrap, before the card files, so it cannot wait for them. The chip
  // kind suite (test_chipkinds) holds the two copies equal.
  var KIND_ORDER = ['weather_alert', 'security', 'doors_windows', 'climate', 'lights', 'blinds',
                    'timers', 'vacuums', 'speakers', 'water', 'energy'];
  var KIND_PAGES = { weather_alert: ['weather'], security: ['security', 'alarm'],
                     doors_windows: ['doors-windows', 'doors'], climate: ['climate'], lights: ['lights'],
                     blinds: ['blinds', 'shades', 'climate'], timers: ['timers'], vacuums: ['vacuums'],
                     speakers: ['playmusic', 'speakers'], water: ['water', 'leaks'], energy: ['energy'] };
  function chipPaths(v0, dash, o) {
    o = o || {};
    var out = [], have = {};
    (o.views || []).forEach(function (v, i) { if (v) have[String(v.path || i)] = true; });
    (function walk(node, depth) {
      if (!node || typeof node !== 'object' || depth > 14) return;
      if (Array.isArray(node)) { node.forEach(function (n) { walk(n, depth + 1); }); return; }
      if (node.type === 'custom:hk-chips-card' && node.in_menu === false) return;
      if (node.type === 'custom:hk-chips-card' && o.row !== false) {
        var kinds = Array.isArray(o.chips) && o.chips.length ? o.chips
                  : Array.isArray(node.chips) && node.chips.length ? node.chips : KIND_ORDER;
        kinds.forEach(function (k) {
          var want = KIND_PAGES[k] || [];
          for (var i = 0; i < want.length; i++) {
            if (have[want[i]]) { if (out.indexOf(want[i]) === -1) out.push(want[i]); break; }
          }
        });
      }
      if (node.type === 'custom:hk-status-chip-card') {
        var t = node.tap_action || {};
        var p = String(t.navigation_path || '').split('#')[0].split('?')[0];
        if (t.action === 'navigate' && p) {
          var seg = p.replace(/^\.\//, '').split('/').filter(Boolean);
          var key = seg.length > 1 && seg[0] === dash ? seg[1] : seg[seg.length - 1];
          if (key && out.indexOf(key) === -1) out.push(key);
        }
      }
      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k) && typeof node[k] === 'object') walk(node[k], depth + 1);
      }
    })(v0 && v0.cards || v0 && v0.sections || [], 0);
    return out;
  }

  // The Home app's own room glyph (a square with its corner partitioned) is not in
  // SF Symbols' public set; a floor plan says the same thing.
  var ROOM_ICON = 'mdi:floor-plan';
  var PAGE_ICON = 'mdi:view-dashboard-outline';

  // Which row is the page on screen: its path or its index, on this dashboard.
  function isHere(item, pathname) {
    if (item.kind === 'ha') return false;
    var seg = String(pathname || '').split('/');
    var here = seg[2] || '';
    if (item.kind === 'home') return !here || item.paths.indexOf(here) !== -1;
    return !!here && item.paths.indexOf(here) !== -1;
  }

  // THE HOME ASSISTANT SECTION (a screen's Menu -> Home Assistant): Home
  // Assistant's own pages, above Categories. Pinned: Integrations,
  // Automations and Settings -- admins only, as Home Assistant has them --
  // then Notifications. "More" folds out the rest of this user's own Home
  // Assistant sidebar, in its order and titles, without what they hid (or
  // what they may not open). Then Show Menu (Home Assistant's own sidebar,
  // unless it is on screen already) and Profile. All of it is read live:
  // nothing here is stored in the dashboard.
  var HA_PINNED = [
    { title: 'Integrations', icon: 'mdi:devices', path: '/config/integrations/dashboard', panel: 'config/integrations' },
    { title: 'Automations', icon: 'mdi:robot', path: '/config/automation/dashboard', panel: 'config/automation' },
    { title: 'Settings', icon: 'mdi:cog', path: '/config/dashboard', panel: 'config', badge: 'settings' }
  ];
  function haItems(hass, prefs, o) {
    o = o || {};
    prefs = prefs || {};
    var admin = !!(hass && hass.user && hass.user.is_admin);
    var panels = (hass && hass.panels) || {};
    var name = function (t) {
      var s = '';
      try { s = hass.localize('panel.' + t); } catch (e) { /* no localize */ }
      return s || t;
    };
    var out = [], pinned = { config: 1 };
    HA_PINNED.forEach(function (p) {
      pinned[p.panel] = 1;
      if (admin) out.push({ title: p.title, icon: p.icon, kind: 'hapage', path: p.path, badge: p.badge || '', paths: [] });
    });
    out.push({ title: 'Notifications', icon: 'mdi:bell', kind: 'notif', badge: 'notif', paths: [] });
    var hidden = Array.isArray(prefs.hiddenPanels) ? prefs.hiddenPanels : [];
    var order = Array.isArray(prefs.panelOrder) ? prefs.panelOrder : [];
    var more = Object.keys(panels).filter(function (k) {
      var p = panels[k];
      return !!p && !!p.title && p.show_in_sidebar !== false && !pinned[k] &&
             hidden.indexOf(k) === -1 && (admin || !p.require_admin);
    }).map(function (k) {
      return { key: k, title: name(panels[k].title), icon: panels[k].icon || 'mdi:application-outline' };
    });
    // this user's order first, then the rest A to Z -- as Home Assistant does
    more.sort(function (a, b) {
      var ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      if (ia === -1 && ib === -1) return a.title.localeCompare(b.title);
      return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
    });
    if (more.length) {
      out.push({ title: 'More', icon: 'mdi:dots-horizontal-circle-outline', kind: 'more', open: !!o.moreOpen, paths: [] });
      if (o.moreOpen) {
        more.forEach(function (m) { out.push({ title: m.title, icon: m.icon, kind: 'sub', path: '/' + m.key, paths: [] }); });
      }
    }
    if (!o.sidebarShown) out.push({ title: 'Show Menu', icon: 'mdi:menu', kind: 'ha', path: null, paths: [] });
    out.push({ title: 'Profile', icon: 'mdi:account-circle', kind: 'hapage', path: '/profile/general', paths: [] });
    return out;
  }

  // An mdi: icon with an SF Symbol of the same name in the hk: glyph set
  // is drawn as that symbol (hk:), so the menu wears Apple's artwork where it
  // exists and Material's everywhere else.
  function glyph(icon) {
    var m = /^mdi:(.+)$/.exec(String(icon || ''));
    var g = window.hkGlyphs && window.hkGlyphs.icons;
    return (m && g && g[m[1]]) ? 'hk:' + m[1] : icon;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.hkMenu = { version: '1.1.0', _: { model: model, isHere: isHere, glyph: glyph, chipPaths: chipPaths, pagePaths: pagePaths,
                                           haItems: haItems,
                                           tabCentre: tabCentre, kinds: { ORDER: KIND_ORDER, PAGES: KIND_PAGES } } };

  whenBase(function (C) {
    var M = C.menu;

    // --------------------------------------------------------------- look
    // Numbers are the design, so they are named. Measured against the Home
    // app's iPad sidebar and fitted to a wall tablet's 1280 x 800 CSS px.
    var W = 300;              // panel width (a phone: 82vw at most)
    var TAB_W = 26, TAB_H = 62; // the edge tab, in the 34 px left margin
    var IDLE_MS = 60000;      // an open menu nobody touches closes itself
    // The time and weather's box inset: the list's 14 px plus a row's 14 px,
    // where the rows' glyphs and the section headings start. Their INK goes
    // 1 px further in (INK), which is where a glyph's ink actually begins.
    var NOW_PAD = 28, INK = 1;
    // The iPad band's roomier half (see publishLeft): 860 px of page and up.
    var BAND_WIDE = 860;
    var EASE = 'cubic-bezier(.32,.72,0,1)';   // UIKit's sheet curve
    var CSS = [
      ':host{all:initial}',
      '.root{position:fixed;left:0;top:0;width:0;height:0;z-index:6;',
      '  font-family:var(--paper-font-body1_-_font-family,"SF Pro",-apple-system,Roboto,sans-serif);',
      '  -webkit-font-smoothing:antialiased;color:#fff}',
      '.root.open{z-index:9}',
      '.scrim{position:fixed;inset:0;background:rgba(0,0,0,0.26);opacity:0;pointer-events:none;',
      '  transition:opacity .32s ease;-webkit-tap-highlight-color:transparent}',
      '.root.open .scrim{opacity:1;pointer-events:auto}',
      '.root.docked .scrim{display:none}',
      // THE PANEL. Its material is a layer of its own (.mat), so the panel is
      // not a backdrop root and the tab riding on its edge can still blur the
      // sky behind itself.
      // THE CLIP: the dashboard's own area. The panel slides out from ITS left
      // edge, so where Home Assistant's sidebar shows (no kiosk mode) a closed
      // panel is not left lying over it on a desktop.
      '.clip{position:fixed;left:var(--l,0px);top:var(--t,0px);right:0;height:var(--h,100vh);',
      '  overflow:hidden;pointer-events:none}',
      '.panel{position:absolute;left:0;top:0;height:100%;width:' + W + 'px;pointer-events:auto;',
      '  max-width:82vw;transform:translateX(-100%);transition:transform .38s ' + EASE + ';',
      '  display:flex;flex-direction:column;box-sizing:border-box;will-change:transform;',
      // the swipe that closes it (wireSwipe) is the page's to read: without
      // this a touch browser takes the sideways drag as its own after a few
      // pixels and sends pointercancel (down, move, move, cancel -- and the
      // menu stays open). Up and down still scroll.
      '  touch-action:pan-y}',
      '.root.open .panel,.root.docked .panel{transform:none}',
      '.mat{position:absolute;inset:0;background:rgba(22,26,42,0.56);',
      '  -webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);',
      '  border-right:1px solid rgba(255,255,255,0.10);pointer-events:none}',
      '.root.frosted .mat{background:rgba(34,38,56,0.95);-webkit-backdrop-filter:none;backdrop-filter:none}',
      // The open panel's shadow, under the tab (z -2): on .mat it would fall
      // over the tab, which sits BEHIND the material (below).
      '.panel::before{content:"";position:absolute;inset:0;z-index:-2;pointer-events:none;',
      '  transition:box-shadow .38s ' + EASE + '}',
      '.root.open .panel::before{box-shadow:14px 0 44px rgba(0,0,0,0.26)}',
      // THE LIST. 14 px in from both panel edges, so a selected row's pill has
      // the same margin all round; 44 px rows (Apple's touch minimum) with 2 px
      // between them, so two selections never touch.
      // CLEAR OF THE STATUS BAR (on an iPhone, "Home" would sit under the
      // time and the Dynamic Island). The Home Assistant app draws
      // the page edge to edge, so the list starts below the device's safe
      // area -- env(), zero where there is none -- and scrolls away under a
      // fade that ends there too. --hk-safe-top overrides it, for testing.
      '.list{position:relative;flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;',
      '  -webkit-overflow-scrolling:touch;scrollbar-width:none;box-sizing:border-box;',
      '  --safe:var(--hk-safe-top,env(safe-area-inset-top,0px));',
      '  padding:calc(22px + var(--safe)) 14px calc(28px + env(safe-area-inset-bottom,0px))',
      '    calc(14px + env(safe-area-inset-left,0px));',
      '  -webkit-mask-image:linear-gradient(transparent 0,transparent var(--safe),#000 calc(var(--safe) + 14px));',
      '  mask-image:linear-gradient(transparent 0,transparent var(--safe),#000 calc(var(--safe) + 14px))}',
      '.list::-webkit-scrollbar{display:none}',
      // THE NOW-PLAYING BAR LIES OVER A DOCKED MENU'S FOOT (it runs the
      // dashboard's full width, hk-popup.js), and says how much of the
      // screen's bottom it covers (--hk-bar-h): the list gets that much more
      // room at its end, so its last rows still scroll up clear of the bar.
      '.root.docked .list{padding-bottom:calc(28px + env(safe-area-inset-bottom,0px) + var(--hk-bar-h,0px))}',
      // THE TIME AND WEATHER (Configure: "Time and weather in the menu on
      // these dashboards"), only while the menu is docked. Fixed above the
      // list -- only the rows scroll, under the hairline -- and no plate of
      // its own (a box round it looks out of place). Two
      // short lines for 300 px: "1:12 PM" beside "76°", then "Sunday, Sep 27"
      // beside "Sunny · Feels 75°". Its ink starts on the column the rows'
      // glyphs and the section headings start on (x = 29) and ends where it
      // starts from the other edge (x = 271): paintNow() measures each line's
      // side bearing, since a "1" starts well inside its own box.
      '.now{position:relative;flex:none;display:grid;grid-template-columns:minmax(0,1fr) auto;',
      '  column-gap:12px;row-gap:5px;align-items:end;box-sizing:border-box;color:#fff;',
      '  padding:calc(30px + var(--hk-safe-top,env(safe-area-inset-top,0px))) ' + NOW_PAD + 'px 20px ' + NOW_PAD + 'px}',
      '.now[hidden],.rule[hidden]{display:none}',
      '.now .tm{display:flex;align-items:baseline;gap:4px;min-width:0;white-space:nowrap}',
      '.now .t{font-size:44px;font-weight:600;line-height:1;letter-spacing:0}',
      '.now .ap{font-size:16px;font-weight:500;line-height:1;color:rgba(255,255,255,0.72)}',
      '.now .wx{justify-self:end;display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;',
      '  -webkit-tap-highlight-color:transparent}',
      '.now .g{display:flex;width:28px;height:28px}',
      '.now .tp{font-size:32px;font-weight:500;line-height:1;letter-spacing:0}',
      '.now .d,.now .c{font-size:14px;font-weight:600;line-height:1.2;letter-spacing:0;color:rgba(255,255,255,0.66);',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.now .c{justify-self:end;text-align:right;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.rule{position:relative;flex:none;height:1px;margin:0 14px;background:rgba(255,255,255,0.14)}',
      // the safe area is the time's to clear, not the list's
      '.panel.has-now .list{--safe:0px}',
      '.row{display:flex;align-items:center;gap:14px;width:100%;height:44px;box-sizing:border-box;',
      '  padding:0 14px;border:0;border-radius:12px;background:none;color:rgba(255,255,255,0.95);',
      '  font:inherit;font-size:17px;font-weight:400;letter-spacing:-0.41px;text-align:left;',
      '  cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .15s ease}',
      '.row + .row{margin-top:2px}',
      '.row ha-icon{--mdc-icon-size:22px;width:22px;height:22px;flex:none;display:flex;color:#ff9f0a}',
      '.row span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.row.here{background:#ff9f0a;color:#fff}',
      '.row.here ha-icon{color:#fff}',
      // the Home Assistant section: iOS count bubbles, "More" and its rows
      '.row .bdg{flex:none;min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:11px;',
      '  background:#ff3b30;color:#fff;font-size:13px;font-weight:600;line-height:22px;text-align:center;letter-spacing:0}',
      '.row .bdg[hidden]{display:none}',
      '.row.more svg{flex:none;opacity:.45;transform:rotate(-90deg);transition:transform .2s ease}',
      '.row.more[aria-expanded="true"] svg{transform:none}',
      '.row.sub{height:40px;padding-left:50px;font-size:15px;color:rgba(255,255,255,0.85)}',
      '.row.sub ha-icon{--mdc-icon-size:20px;width:20px;height:20px;color:rgba(235,235,245,0.6)}',
      '@media (hover:hover){.row:not(.here):hover{background:rgba(255,255,255,0.07)}}',
      '.row:focus-visible,.sh:focus-visible,.tab:focus-visible{outline:2px solid rgba(255,255,255,0.7);outline-offset:-2px}',
      // SECTION HEADINGS: the Home app's "Categories" / "Rooms", which fold.
      '.sh{display:flex;align-items:center;justify-content:space-between;width:100%;height:36px;',
      '  box-sizing:border-box;margin:16px 0 2px;padding:0 14px;border:0;background:none;',
      '  color:rgba(235,235,245,0.60);font:inherit;font-size:15px;font-weight:600;letter-spacing:-0.24px;',
      '  cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.sh svg{transition:transform .2s ease}',
      '.sh.shut svg{transform:rotate(-90deg)}',
      // THE EDGE TAB rides on the panel's right edge: closed, it is all that
      // shows, in the page's left margin; open, it becomes the close handle.
      // Its touch area grows up, down and off the screen -- never right, where
      // the first column of tiles is 8 px away.
      // 26 px at EVERY width, a wall tablet's size: a 14 px tab on a phone is
      // hard to hit with a thumb. Narrower than a wall tablet's 29.6 px
      // margin -- an iPad held upright (18.9), a phone (16) -- it lies over
      // the first column's edge; it only shows there when the screen asks for
      // it (On Narrow Screens).
      // BEHIND THE MENU (z -1 in the panel): sliding in or out it passes
      // under the material's edge, never across it.
      '.tab{position:absolute;z-index:-1;left:100%;top:var(--tab-y,84px);width:' + TAB_W + 'px;height:' + TAB_H + 'px;',
      '  box-sizing:border-box;padding:0;margin:0;border:1px solid rgba(255,255,255,0.14);border-left:0;',
      '  border-radius:0 15px 15px 0;display:none;align-items:center;justify-content:center;',
      '  color:rgba(255,255,255,0.92);cursor:pointer;-webkit-tap-highlight-color:transparent;',
      // The chips' glass, with a thin neutral tint under it: 26 px of glass
      // over a seasonal leaf would take the leaf's color outright.
      '  background:linear-gradient(145deg,rgba(255,255,255,0.17),rgba(255,255,255,0.07)),rgba(26,30,46,0.24);',
      '  -webkit-backdrop-filter:blur(20px) saturate(1.15) brightness(0.86);',
      '  backdrop-filter:blur(20px) saturate(1.15) brightness(0.86);',
      '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 6px 18px rgba(0,0,0,0.12);',
      '  transition:transform .12s ease,filter .12s ease}',
      '.root.frosted .tab{-webkit-backdrop-filter:none;backdrop-filter:none;',
      '  background:linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.09)),rgba(58,60,68,0.55)}',
      '.root.tabbed .tab{display:flex}',
      // the scrolled tab: always there, out past the edge until the chip is
      // scrolled away (sync / scrolled below)
      '.root.tabscroll .tab{display:flex;transform:translateX(-100%);visibility:hidden;',
      '  transition:transform .22s ease,visibility 0s linear .22s,filter .12s ease}',
      '.root.tabscroll.tabbed .tab{transform:none;visibility:visible;',
      '  transition:transform .22s ease,visibility 0s,filter .12s ease}',
      '.root.docked .tab{display:none}',
      '.tab::before{content:"";position:absolute;top:-14px;bottom:-14px;left:-4px;right:0}',
      '.tab:active{filter:brightness(1.25)}',
      '.tab ha-icon{--mdc-icon-size:16px;width:16px;height:16px;display:flex;margin-left:-1px}',
      '.tab svg{display:none;margin-left:-1px}',
      '.root.open .tab ha-icon{display:none}',
      '.root.open .tab svg{display:block}',
      // A PHONE'S HOME WITH NO CHIP to hold the menu button: a round one of
      // its own, top left. The last resort; every other page has its back
      // button, which carries the menu button on a phone.
      '.fab{position:fixed;left:calc(var(--l,0px) + 12px);',
      '  top:calc(var(--t,0px) + 12px + var(--hk-safe-top,env(safe-area-inset-top,0px)));width:40px;height:40px;',
      '  border-radius:50%;border:1px solid rgba(255,255,255,0.14);display:none;align-items:center;',
      '  justify-content:center;padding:0;color:rgba(255,255,255,0.92);cursor:pointer;',
      '  background:linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,255,255,0.07));',
      '  -webkit-backdrop-filter:blur(20px) saturate(1.4) brightness(0.82);backdrop-filter:blur(20px) saturate(1.4) brightness(0.82)}',
      '.root.fabbed .fab{display:flex}',
      '.root.open .fab{display:none}',
      '.fab ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex}',
      '@media (prefers-reduced-motion:reduce){.panel,.scrim,.sh svg,.row.more svg,.root.tabscroll .tab{transition:none}}'
    ].join('\n');

    var CHEV_L = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"' +
      ' stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M15 4.5 L7.5 12 L15 19.5"/></svg>';
    var CHEV_D = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"' +
      ' stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M5 9 L12 16 L19 9"/></svg>';

    // ------------------------------------------------------------- state
    var S = { host: null, root: null, open: false, dash: null, idle: null, shut: {}, built: '' };
    try { S.shut = JSON.parse(localStorage.getItem('hk-menu-shut') || '{}') || {}; } catch (e) { S.shut = {}; }

    function haRoot() {
      var ha = document.querySelector('home-assistant');
      return (ha && ha.shadowRoot) || null;
    }
    function narrow() { return (window.innerWidth || 1280) < M.NARROW; }
    // Its item's Menu: "Always open beside the page", when there is room.
    function docked() { return M.docked(); }

    function mount() {
      if (S.host && S.host.isConnected) return true;
      var r = haRoot();
      if (!r) return false;
      S.host = document.createElement('div');
      S.host.id = 'hk-menu';
      var sr = S.host.attachShadow({ mode: 'open' });
      sr.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="root" part="root">' +
          '<div class="scrim"></div>' +
          '<div class="clip"><nav class="panel" aria-label="Menu" aria-hidden="true">' +
            '<div class="mat"></div>' +
            '<div class="now" hidden><div class="tm"><span class="t"></span><span class="ap"></span></div>' +
              '<div class="wx" role="link" aria-label="Weather"><span class="g"></span><span class="tp"></span></div>' +
              '<div class="d"></div><div class="c" role="link" aria-label="Weather"></div></div>' +
            '<div class="rule" hidden></div><div class="list"></div>' +
            '<button class="tab" aria-label="Menu" aria-expanded="false"><ha-icon></ha-icon>' + CHEV_L + '</button>' +
          '</nav></div>' +
          '<button class="fab" aria-label="Menu"><ha-icon></ha-icon></button>' +
        '</div>';
      S.root = sr.querySelector('.root');
      S.panel = sr.querySelector('.panel');
      S.list = sr.querySelector('.list');
      S.now = sr.querySelector('.now');
      S.rule = sr.querySelector('.rule');
      [sr.querySelector('.now .wx'), sr.querySelector('.now .c')].forEach(function (el) {
        el.addEventListener('click', function () { goWeather(); });
      });
      S.tab = sr.querySelector('.tab');
      S.fab = sr.querySelector('.fab');
      sr.querySelector('.scrim').addEventListener('click', function () { close(); });
      S.tab.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
      S.fab.addEventListener('click', function (e) { e.stopPropagation(); open(); });
      S.list.addEventListener('click', onList);
      // Anything done INSIDE the menu is activity: it keeps it open.
      ['pointerdown', 'wheel', 'keydown'].forEach(function (t) {
        S.panel.addEventListener(t, armIdle, { passive: true });
      });
      wireSwipe();
      r.appendChild(S.host);
      return true;
    }

    // THE PANEL COVERS THE DASHBOARD, not the whole window: on a desktop
    // Home Assistant's own sidebar stays visible to its left, and on a phone
    // the menu runs from the top of the screen like the Home app's.
    function place() {
      if (!S.root) return;
      // The SCREEN's height, not the panel's: the document is what scrolls,
      // so on a long page the panel is as tall as the page (thousands of px
      // on a phone) while the menu must fill only what is visible.
      var p = M.panel(), r = p && p.getBoundingClientRect ? p.getBoundingClientRect() : null;
      var l = r ? r.left : 0, t = r ? Math.max(0, r.top) : 0;
      var h = Math.max(0, (window.innerHeight || 800) - t);
      S.root.style.setProperty('--l', l + 'px');
      S.root.style.setProperty('--t', t + 'px');
      S.root.style.setProperty('--h', h + 'px');
      // THE TAB, centered on the date line (hk-header-card publishes it per
      // dashboard, from the top of the page); without one yet, where the Home
      // header's date sits on a wall tablet. The tab lives in the panel, whose
      // top is the dashboard's -- the page starts lower when HA's toolbar shows.
      var top = M.viewTop();
      var y = tabCentre(M.board().tab_position || '', M.dateY(),
                        Math.max(0, (window.innerHeight || 800) - Math.max(0, top)), TAB_H);
      S.root.style.setProperty('--tab-y', ((top - t) + y - TAB_H / 2) + 'px');
    }

    // WHERE THE DASHBOARD STARTS, for the sheets (hk-popup.js, hk-detail.js):
    //   --hk-content-left  past Home Assistant's own sidebar, when it shows.
    //                      A modal sheet centers in the rest -- the WHOLE
    //                      dashboard, this menu included, docked or not: the
    //                      menu is the dashboard's own, Home Assistant's
    //                      sidebar is not.
    //   --hk-page-left     ...and past this menu when it is docked: where a
    //                      sheet that is not modal (the now-playing bar) starts,
    //                      so it never lies over the menu's last rows.
    // Backdrops still cover everything; only the sheet moves.
    function publishLeft() {
      var p = M.panel(), r = p && p.getBoundingClientRect ? p.getBoundingClientRect() : null;
      var left = Math.max(0, r ? r.left : 0);
      var de = document.documentElement;
      if (!de || !de.style) return;
      var pageLeft = left + (S.root && docked() ? W : 0);
      [['--hk-content-left', left], ['--hk-page-left', pageLeft]].forEach(function (kv) {
        var v = Math.round(kv[1] * 10) / 10 + 'px';
        if (de.style.getPropertyValue(kv[0]) !== v) de.style.setProperty(kv[0], v);
      });
      // THE iPAD BAND IS THE PAGE'S WIDTH, NOT THE WINDOW'S. A
      // 1,280 px tablet with the menu docked has a 980 px page -- an iPad's
      // -- and takes the iPad pill (five across) and page layouts, which
      // css/hk-responsive.css applies under [data-hk-band] as well as under
      // its media query (which only knows the window).
      // "wide" from 860 px of page: a tablet with the menu open (980), an
      // iPad held sideways -- room for the tablet's own arrangement where the
      // iPad's was a squeeze (hk-responsive.css, [data-hk-band="wide"]).
      var pw = (window.innerWidth || 0) - pageLeft;
      var band = pw > M.NARROW && pw < M.TAB_MIN ? (pw >= BAND_WIDE ? 'wide' : 'narrow') : null;
      if (band !== de.getAttribute('data-hk-band')) {
        if (band) de.setAttribute('data-hk-band', band); else de.removeAttribute('data-hk-band');
      }
    }
    // The panel's size and place change without a window resize when Home
    // Assistant's sidebar expands or collapses; watched while the menu is on.
    function watchPanel() {
      var p = M.panel();
      if (!window.ResizeObserver || !p || S.watched === p) return;
      if (S.ro) S.ro.disconnect();
      S.ro = new ResizeObserver(function () { sync(); });
      S.ro.observe(p);
      S.watched = p;
    }

    function paintIcons() {
      var icon = M.icon();
      [S.tab, S.fab].forEach(function (b) {
        var i = b && b.querySelector('ha-icon');
        if (i && i.getAttribute('icon') !== icon) i.setAttribute('icon', icon);
      });
    }

    // Everything that can change which pieces show: called on every page
    // change, settings change, resize and hass push -- all cheap, all
    // idempotent.
    function sync() {
      var on = M.on();
      watchPanel();
      if (!on) {
        if (S.open) close(true);
        undock();
        if (S.root) S.root.className = 'root';
        paintNow();
        publishLeft();
        return;
      }
      if (!mount()) { publishLeft(); return; }
      var style = M.style(), dock = docked();
      var glass = document.documentElement.getAttribute('data-hk-glass');
      var home = isHome();
      var cls = ['root'];
      if (glass === 'frosted') cls.push('frosted');
      var tabAt = typeof M.tab === 'function' ? M.tab() : (style === 'tab' ? 'always' : 'never');
      if (dock) cls.push('docked');
      else if (tabAt === 'always') cls.push('tabbed');
      // While the menu is open the tab stays as it was when it opened:
      // otherwise the page scrolling behind an open menu moves the chip in
      // and out of sight, and the tab (its close handle) slides back and
      // forth over the menu. Closing looks again.
      else if (tabAt === 'scrolled') {
        cls.push('tabscroll');
        if (S.open ? S.root.classList.contains('tabbed') : chipGone()) cls.push('tabbed');
      }
      // a phone's Home with no chip to hold the button
      else if (style === 'chip' && narrow() && home && !homeHasChip()) cls.push('fabbed');
      if (S.open && !dock) cls.push('open');
      S.root.className = cls.join(' ');
      S.panel.setAttribute('aria-hidden', (S.open || dock) ? 'false' : 'true');
      S.tab.setAttribute('aria-expanded', S.open ? 'true' : 'false');
      paintIcons();
      place();
      if (dock) { dockTo(); if (listKey() !== S.built) build(); markHere(); }
      else undock();
      paintNow();
      publishLeft();
    }

    // ------------------------------------------------ the scrolled tab
    // Its item's Menu: "Chip, the tab once scrolled past" / "Chip on Home, tab
    // on the other pages" (hk-base.js menu.tab() says 'scrolled'): the tab
    // slides in while every round button on the page is out of sight, and
    // back out when one returns. The buttons are the cards' own <ha-card>s
    // (menu.chips()), looked at on scroll -- one or two rects a frame, and
    // only on such a dashboard.
    //
    // A page whose button has not drawn yet (just navigated) is given a
    // moment before the tab counts it as missing, so it does not flash in and
    // straight back out.
    var CHIP_WAIT = 600;
    function chipGone() {
      var els = typeof M.chips === 'function' ? M.chips() : [];
      if (!els.length) {
        if (!S.noChip) {
          S.noChip = Date.now();
          setTimeout(function () { if (S.noChip) sync(); }, CHIP_WAIT + 20);
        }
        return Date.now() - S.noChip >= CHIP_WAIT;
      }
      S.noChip = 0;
      // the top of what shows: under Home Assistant's toolbar, which stays
      // put while the page scrolls (viewTop is the page's top at rest)
      var p = M.panel(), r = p && p.getBoundingClientRect ? p.getBoundingClientRect() : null;
      var rest = r ? r.top + (window.scrollY || 0) : 0;
      var edge = Math.max(0, r ? r.top : 0) + Math.max(0, M.viewTop() - rest), vh = window.innerHeight || 800;
      return !els.some(function (el) {
        var r = el.getBoundingClientRect();
        var mid = (r.top + r.bottom) / 2;         // half of it gone counts as gone
        return r.width > 0 && mid > edge && mid < vh;
      });
    }
    function scrolled() {
      if (S.scrollRaf || !S.root || S.open || !S.root.classList.contains('tabscroll')) return;
      S.scrollRaf = requestAnimationFrame(function () {
        S.scrollRaf = 0;
        if (S.open || !S.root.classList.contains('tabscroll')) return;
        var gone = chipGone();
        if (gone !== S.root.classList.contains('tabbed')) S.root.classList.toggle('tabbed', gone);
      });
    }

    // ------------------------------------------------ the time and weather
    function nowOn() {
      return !!S.root && docked() && typeof M.hasTime === 'function' && M.hasTime();
    }
    function paintNow() {
      if (!S.root) return;
      var on = nowOn();
      S.panel.classList.toggle('has-now', on);
      S.now.hidden = !on;
      S.rule.hidden = !on;
      if (!on) { S.nowKey = ''; return; }
      var H = window.hkHeader, h = C.hass();
      if (!H || typeof H.now !== 'function' || !h || !h.states) return;
      var v = H.now(h.states);
      // wxReady: the home's weather glyphs arriving swaps the Material stand-in
      // for the real one, with no weather change to say so.
      var ready = H.wxReady ? H.wxReady() : '';
      var key = [v.time, v.ampm, v.date, v.state, v.night, v.temp, v.condition, v.feels, ready].join('|');
      if (key === S.nowKey) return;
      var glyph = v.state + '|' + v.night + '|' + ready;
      S.nowKey = key;
      var q = function (sel) { return S.now.querySelector(sel); };
      q('.t').textContent = v.time;
      q('.ap').textContent = v.ampm;
      q('.tp').textContent = v.temp;
      q('.d').textContent = v.date;
      if (S.nowGlyph !== glyph) { S.nowGlyph = glyph; q('.g').innerHTML = H.wxSvg(v.state, 28, { night: v.night }); }
      S.nowCond = v.condition;
      S.nowFeels = v.feels;
      fitNow();
    }
    // "Sunny · Feels 75°" beside the date, or "Sunny" alone when both will
    // not fit on the line -- the date is never the one squeezed. Then each
    // line's ink is put on the column (see the CSS note).
    //
    // SF PRO'S SIDE BEARINGS, MEASURED, in em, off a 4x render of the font
    // every screen loads from /hk/ at the optical size the page draws it --
    // not canvas measureText, which is not the same everywhere: Chrome's
    // canvas skips SF Pro's display optical size, so "79°" lands 0.5 px past
    // "Feels 79°" there and about 1 px short of it elsewhere. The font file
    // is the same on every screen; its bearings are too. Only the glyphs that
    // can start or end a line:
    var LB_TIME = { 1: .0398, 2: .0398, 3: .0398, 4: .0341, 5: .0511, 6: .0398, 7: .0284, 8: .0398, 9: .0455 }; // 600 44px
    var LB_DATE = { S: .0536, M: .0893, T: .0357, W: .0357, F: .0893 };                                    // 600 14px
    var RB_TEMP = .0496;                                                                                   // "°" 500 32px
    var RB_LINE = { '\u00b0': .0519, a: .0592, d: .0681, e: .0379, g: .0619, h: .0642, k: .0285, l: .0670,
                    n: .0592, r: .0246, s: .0525, t: .0391, w: .0374, y: .0257 };                           // 600 14px
    function fitNow() {
      var q = function (sel) { return S.now.querySelector(sel); };
      var c = q('.c'), d = q('.d');
      c.textContent = S.nowCond + (S.nowCond && S.nowFeels ? ' \u00b7 ' : '') + (S.nowFeels || '');
      if (S.nowFeels && d.scrollWidth > d.clientWidth + 1) c.textContent = S.nowCond || S.nowFeels;
      var first = function (t) { return String(t || '').charAt(0); };
      var last = function (t) { t = String(t || ''); return t.charAt(t.length - 1); };
      var em = function (table, ch, px, dflt) { return (table[ch] !== undefined ? table[ch] : dflt) * px; };
      q('.tm').style.marginLeft = (INK - em(LB_TIME, first(q('.t').textContent), 44, .04)).toFixed(2) + 'px';
      d.style.marginLeft = (INK - em(LB_DATE, first(d.textContent), 14, .05)).toFixed(2) + 'px';
      q('.wx').style.marginRight = (INK - RB_TEMP * 32).toFixed(2) + 'px';
      c.style.marginRight = (INK - em(RB_LINE, last(c.textContent).toLowerCase(), 14, .05)).toFixed(2) + 'px';
      if (!S.nowFonts && document.fonts && document.fonts.ready) {
        S.nowFonts = true;
        document.fonts.ready.then(function () { if (nowOn()) fitNow(); });
      }
    }
    // The weather opens the Weather page, as it does in the header -- the
    // dashboard's own `weather` view, when it has one.
    function goWeather() {
      var cfg = M.config(), dash = M.dash();
      var has = cfg && (cfg.views || []).some(function (v) { return v && v.path === 'weather'; });
      if (!has || !dash) return;
      var path = '/' + dash + '/weather';
      if (location.pathname === path) return;
      history.pushState(null, '', path);
      window.dispatchEvent(new CustomEvent('location-changed'));
    }

    function isHome() {
      var here = String(location.pathname).split('/')[2] || '';
      var cfg = M.config(), v0 = cfg && cfg.views && cfg.views[0];
      return !here || here === '0' || (v0 && v0.path === here);
    }
    // hk-base's answer: a written-out button or the chips card's lead.
    function homeHasChip() { return M.homeButton(); }

    // ---------------------------------------------------------- the list
    function listKey() {
      var cfg = M.config(), h = C.hass();
      var b = M.board();
      return [M.dash(), b.menu_rooms, JSON.stringify(b.room_order), b.ha_row,
              JSON.stringify(b.categories), JSON.stringify(b.menu_top || []), JSON.stringify(b.pages || []),
              JSON.stringify(b.chips || []), b.chips_row,
              haSidebarShown(),
              // the Home Assistant section: More folded or not, this user's
              // sidebar order, and the panels there are
              !!S.shut.ha_more, JSON.stringify(S.haPrefs || null), !!(h && h.user && h.user.is_admin),
              h && h.panels ? Object.keys(h.panels).join(',') : '',
              cfg ? (cfg.views || []).length : 0,
              JSON.stringify(h && h.areas ? Object.keys(h.areas).map(function (k) {
                return k + ':' + h.areas[k].name + ':' + (h.areas[k].icon || '');
              }) : [])].join('|') + '|' + (cfgId(cfg));
    }
    var CFGS = new WeakMap(), CFGN = 0;
    function cfgId(cfg) {
      if (!cfg || typeof cfg !== 'object') return 0;
      if (!CFGS.has(cfg)) CFGS.set(cfg, ++CFGN);
      return CFGS.get(cfg);
    }
    function build() {
      var cfg = M.config(), h = C.hass();
      var b = M.board();
      var m = model(cfg, h && h.areas, { dash: M.dash(), order: b.menu_rooms === 'order' ? 'order' : 'az',
                                          roomOrder: b.room_order,
                                          user: h && h.user && h.user.id,
                                          categories: b.categories,
                                          top: b.menu_top,
                                          chips: b.chips, chipsRow: b.chips_row,
                                          pageOrder: pagePaths(b.pages, b.custom_pages),
                                          ha: !!b.ha_row });
      S.items = [];
      var html = '';
      function row(it) {
        S.items.push(it);
        var cls = it.kind === 'sub' ? ' sub' : it.kind === 'more' ? ' more' : '';
        var tail = it.badge ? '<b class="bdg" data-badge="' + it.badge + '" hidden></b>' : it.kind === 'more' ? CHEV_D : '';
        return '<button class="row' + cls + '" data-i="' + (S.items.length - 1) + '"' +
          (it.kind === 'more' ? ' aria-expanded="' + !!it.open + '"' : '') + '><ha-icon icon="' +
          esc(glyph(it.icon)) + '"></ha-icon><span>' + esc(it.title) + '</span>' + tail + '</button>';
      }
      function section(key, title, items) {
        if (!items.length) return '';
        var shut = !!S.shut[key];
        return '<button class="sh' + (shut ? ' shut' : '') + '" data-sec="' + key + '" aria-expanded="' +
          (!shut) + '">' + esc(title) + CHEV_D + '</button>' + (shut ? '' : items.map(row).join(''));
      }
      if (m.home) html += row(m.home);
      html += m.top.map(row).join('');
      S.haOn = m.ha;
      haCounts(m.ha);
      if (m.ha) {
        haUpdates(h, true);
        html += section('ha', 'Home Assistant', haItems(h, S.haPrefs, { moreOpen: !!S.shut.ha_more,
                                                                        sidebarShown: haSidebarShown() }));
      }
      html += section('categories', 'Categories', m.categories);
      html += section('rooms', 'Rooms', m.rooms);
      var keep = S.list.scrollTop;
      S.list.innerHTML = html;
      S.list.scrollTop = keep;
      S.built = listKey();
      paintBadges();
    }

    // THE COUNTS, as Home Assistant's own sidebar keeps them: waiting
    // notifications (every user), and on Settings the updates ready to
    // install plus the repairs not ignored (admins). Subscribed only while a
    // screen shows the section, and painted in place -- a count never
    // rebuilds the list.
    var HC = { notif: 0, updates: 0, issues: 0, conn: null, un: [], at: 0 };
    function haCounts(on) {
      var h = C.hass(), conn = h && h.connection;
      if (!on || !conn) {
        HC.un.forEach(function (f) { try { f(); } catch (e) { /* gone */ } });
        HC.un = [];
        HC.conn = null;
        return;
      }
      if (HC.conn === conn) return;
      haCounts(false);
      HC.conn = conn;
      var keep = function (p) {
        Promise.resolve(p).then(function (un) {
          if (HC.conn === conn) HC.un.push(un); else { try { un(); } catch (e) { /* gone */ } }
        }, function () { /* refused: no count */ });
      };
      var seen = {};
      keep(conn.subscribeMessage(function (m) {
        if (m.type === 'current') seen = {};
        Object.keys(m.notifications || {}).forEach(function (id) {
          if (m.type === 'removed') delete seen[id]; else seen[id] = 1;
        });
        HC.notif = Object.keys(seen).length;
        paintBadges();
      }, { type: 'persistent_notification/subscribe' }));
      // this user's sidebar order and hidden items (More follows them)
      keep(conn.subscribeMessage(function (m) {
        S.haPrefs = (m && m.value) || null;
        if (docked() && listKey() !== S.built) { build(); markHere(); }
      }, { type: 'frontend/subscribe_user_data', key: 'sidebar' }));
      if (h.user && h.user.is_admin) {
        var issues = function () {
          conn.sendMessagePromise({ type: 'repairs/list_issues' }).then(function (r) {
            HC.issues = ((r && r.issues) || []).filter(function (x) { return !x.ignored; }).length;
            paintBadges();
          }, function () { /* no repairs */ });
        };
        issues();
        keep(conn.subscribeEvents(function () { clearTimeout(HC.it); HC.it = setTimeout(issues, 500); },
                                  'repairs_issue_registry_updated'));
      }
    }
    // updates: at most every 5 s, as Home Assistant's own sidebar counts them
    function haUpdates(h, now) {
      if (!(h && h.user && h.user.is_admin && h.states)) { HC.updates = 0; return; }
      var t = Date.now();
      if (!now && t - HC.at < 5000) return;
      HC.at = t;
      var n = 0, en = h.entities || {};
      for (var id in h.states) {
        if (id.lastIndexOf('update.', 0) !== 0) continue;
        var st = h.states[id];
        if (st.state === 'on' && ((st.attributes.supported_features || 0) & 1) && !(en[id] && en[id].hidden)) n++;
      }
      if (n !== HC.updates) { HC.updates = n; paintBadges(); }
    }
    function paintBadges() {
      if (!S.list) return;
      var n = { settings: HC.updates + HC.issues, notif: HC.notif };
      S.list.querySelectorAll('.bdg').forEach(function (b) {
        var v = n[b.getAttribute('data-badge')] || 0;
        var txt = v > 99 ? '99+' : String(v);
        if (b.textContent !== txt) b.textContent = txt;
        if (b.hidden !== !v) b.hidden = !v;
      });
    }
    function markHere() {
      if (!S.items) return;
      var rows = S.list.querySelectorAll('.row');
      for (var i = 0; i < rows.length; i++) {
        var it = S.items[+rows[i].getAttribute('data-i')];
        var here = !!it && isHere(it, location.pathname);
        rows[i].classList.toggle('here', here);
        if (here) rows[i].setAttribute('aria-current', 'page'); else rows[i].removeAttribute('aria-current');
      }
    }

    function onList(e) {
      var sh = e.target.closest && e.target.closest('.sh');
      if (sh) {
        var k = sh.getAttribute('data-sec');
        S.shut[k] = !S.shut[k];
        try { localStorage.setItem('hk-menu-shut', JSON.stringify(S.shut)); } catch (x) { /* private */ }
        build();
        markHere();
        return;
      }
      var r = e.target.closest && e.target.closest('.row');
      if (!r || !S.items) return;
      var it = S.items[+r.getAttribute('data-i')];
      if (!it) return;
      if (it.kind === 'ha') { close(true); openHaSidebar(); return; }
      if (it.kind === 'more') {
        S.shut.ha_more = !S.shut.ha_more;
        try { localStorage.setItem('hk-menu-shut', JSON.stringify(S.shut)); } catch (x) { /* private */ }
        build();
        markHere();
        return;
      }
      // Notifications: Home Assistant's own drawer, over the page
      if (it.kind === 'notif') {
        close(true);
        var hm = haParts().main;
        if (hm) hm.dispatchEvent(new CustomEvent('hass-show-notifications', { bubbles: true, composed: true }));
        return;
      }
      // A Home Assistant page: kiosk mode is lifted outside the dashboards
      // (syncOutside), so its own sidebar or header is the way back.
      if (it.kind === 'hapage' || it.kind === 'sub') {
        try { sessionStorage.setItem(ESCAPE_KEY, '1'); } catch (x) { /* private mode */ }
        HA.used = true;
        close(true);
        history.pushState(null, '', it.path);
        window.dispatchEvent(new CustomEvent('location-changed'));
        return;
      }
      // The selection moves at once, so the tap is answered before the page is.
      S.list.querySelectorAll('.row.here').forEach(function (x) { x.classList.remove('here'); });
      r.classList.add('here');
      if (!docked()) close(true);
      if (isHere(it, location.pathname)) return;
      history.pushState(null, '', it.path);
      window.dispatchEvent(new CustomEvent('location-changed'));
    }

    // ------------------------------------------ Home Assistant's own sidebar
    // THE "HOME ASSISTANT" ROW opens HA's sidebar -- Settings, the other
    // dashboards -- sliding over the page the way HA does it on a phone, even
    // on a wall tablet where kiosk mode hides it. Kiosk mode hides it with one
    // rule in home-assistant-main (the sidebar at 0 width, display none); for
    // as long as the drawer is open a rule of ours lifts that, the drawer is
    // HA's own modal one (its own dimmed backdrop, tap outside or Escape to
    // close) and the sidebar is expanded, labels and all. The moment it
    // closes -- or the page changes -- all three are put back, so kiosk mode
    // is exactly as it was. A phone is no different: kiosk mode hides the
    // sidebar there too.
    var HA = { active: false };
    function haParts() {
      var ha = document.querySelector('home-assistant');
      var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      var sr = main && main.shadowRoot;
      return { main: main, sr: sr, drawer: sr && sr.querySelector('ha-drawer'),
               sidebar: sr && sr.querySelector('ha-sidebar') };
    }
    // Home Assistant's sidebar already on screen beside the page (no kiosk
    // mode, a wide window): Show Menu would open what is there.
    function haSidebarShown() {
      if (HA.active) return false;
      var p = haParts();
      if (!p.sidebar || !p.drawer || p.drawer.type === 'modal') return false;
      try {
        return getComputedStyle(p.sidebar).display !== 'none' && p.sidebar.getBoundingClientRect().width > 0;
      } catch (e) { return false; }
    }
    function openHaSidebar() {
      var p = haParts();
      if (!p.drawer || !p.sidebar || HA.active) return;
      try { sessionStorage.setItem(ESCAPE_KEY, '1'); } catch (e) { /* private mode */ }
      // Two rules to lift: kiosk mode hides the sidebar in home-assistant-main
      // and, on a phone, HA's drawer as well, inside ha-drawer.
      var lift = liftRule(p.sr, ':host{--ha-sidebar-width:256px !important;--mdc-drawer-width:256px !important}' +
                             'ha-drawer > ha-sidebar{display:flex !important}');
      var lift2 = p.drawer.shadowRoot ? liftRule(p.drawer.shadowRoot, 'wa-drawer[open]{display:block !important}') : null;
      HA = { active: true, used: true, type: p.drawer.type, expand: p.sidebar.alwaysExpand, p: p, lift: [lift, lift2] };
      p.drawer.type = 'modal';
      p.sidebar.alwaysExpand = true;
      requestAnimationFrame(function () { requestAnimationFrame(function () { p.drawer.open = true; }); });
      // HA's drawer says it has closed by clearing `open`: watched, cheaply,
      // only while it is up.
      var seen = false;
      HA.poll = setInterval(function () {
        if (p.drawer.open) { seen = true; return; }
        if (seen) restoreHaSidebar();
      }, 250);
      HA.nav = function () { if (p.drawer.open) p.drawer.open = false; setTimeout(restoreHaSidebar, 350); };
      window.addEventListener('location-changed', HA.nav);
    }
    // OUTSIDE THE DASHBOARDS, HOME ASSISTANT IS HOME ASSISTANT.
    // kiosk-mode's rules outlive the dashboard that set them: open Settings
    // from the Home Assistant section and its sidebar stays hidden there, with no
    // way back but a reload -- and on a phone its ☰ opens a drawer kiosk mode
    // also hides. So once this browser has used the row (this session), every
    // page that is NOT a dashboard gets kiosk mode's rules switched off --
    // HA's own sidebar, or its ☰, is the way back -- and they are switched on
    // again the moment a dashboard is back. The rules are disabled in place
    // (media="not all"), never removed, so kiosk-mode's own bookkeeping is
    // untouched. A screen that never had the row -- a wall tablet -- never
    // gets here.
    var ESCAPE_KEY = 'hk-ha-row-used';
    function rowUsed() {
      try { return sessionStorage.getItem(ESCAPE_KEY) === '1'; } catch (e) { return !!HA.used; }
    }
    function onDashboard() {
      var el = document.querySelector('home-assistant'), h = el && el.hass;
      var p = h && h.panels && h.panelUrl ? h.panels[h.panelUrl] : null;
      return !p || p.component_name === 'lovelace';
    }
    function kioskRules() {
      var p = haParts(), out = [];
      [p.sr, p.drawer && p.drawer.shadowRoot].forEach(function (root) {
        if (root) out = out.concat([].slice.call(root.querySelectorAll('style[id^="kiosk_mode"]')));
      });
      return out;
    }
    function syncOutside() {
      var free = rowUsed() && !onDashboard();
      kioskRules().forEach(function (st) {
        if (free && st.getAttribute('data-hk-media') === null) {
          st.setAttribute('data-hk-media', st.getAttribute('media') || '');
          st.setAttribute('media', 'not all');
        } else if (!free && st.getAttribute('data-hk-media') !== null) {
          var m = st.getAttribute('data-hk-media');
          if (m) st.setAttribute('media', m); else st.removeAttribute('media');
          st.removeAttribute('data-hk-media');
        }
      });
    }
    function onPageChange() { syncOutside(); setTimeout(syncOutside, 150); setTimeout(syncOutside, 800); }
    ['location-changed', 'popstate'].forEach(function (ev) { window.addEventListener(ev, onPageChange); });

    function restoreHaSidebar() {
      if (!HA.active) return;
      var h = HA;
      HA = { active: false, used: true };
      clearInterval(h.poll);
      window.removeEventListener('location-changed', h.nav);
      // after the drawer's own close animation, so it does not snap shut
      setTimeout(function () {
        try { h.p.drawer.type = h.type || ''; h.p.sidebar.alwaysExpand = !!h.expand; } catch (e) { /* gone */ }
        h.lift.forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
      }, 300);
    }
    function liftRule(root, css) {
      var el = root.querySelector('style#hk-ha-sidebar') || document.createElement('style');
      el.id = 'hk-ha-sidebar';
      el.textContent = css;
      if (!el.parentNode) root.appendChild(el);
      return el;
    }

    // ----------------------------------------------------- open and close
    function open() {
      if (!M.on() || docked()) return;
      if (!mount()) return;
      if (listKey() !== S.built) build();
      markHere();
      S.open = true;
      sync();
      armIdle();
      var here = S.list.querySelector('.row.here');
      // A room far down the list is brought into view, not left off-screen.
      if (here && here.offsetTop > S.list.clientHeight - 60) {
        S.list.scrollTop = here.offsetTop - S.list.clientHeight / 2 + 22;
      }
    }
    function close(quiet) {
      if (!S.open) return;
      S.open = false;
      clearTimeout(S.idle);
      sync();
      if (!quiet && S.tab && S.root.classList.contains('tabbed')) S.tab.focus({ preventScroll: true });
    }
    function toggle() { if (S.open) close(); else open(); }
    function armIdle() {
      clearTimeout(S.idle);
      if (S.open) S.idle = setTimeout(function () { close(true); }, IDLE_MS);
    }

    // SWIPE IT AWAY, the iPad gesture: a drag that starts on the panel and
    // travels left more than it travels down closes it. Vertical drags are
    // the list's to scroll.
    function wireSwipe() {
      var g = null;
      S.panel.addEventListener('pointerdown', function (e) {
        if (!S.open || e.pointerType === 'mouse') return;
        g = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }, { passive: true });
      S.panel.addEventListener('pointermove', function (e) {
        if (!g || e.pointerId !== g.id) return;
        var dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        if (dx < -48 && Math.abs(dx) > 1.5 * Math.abs(dy)) { g = null; close(true); }
      }, { passive: true });
      ['pointerup', 'pointercancel'].forEach(function (t) {
        S.panel.addEventListener(t, function () { g = null; }, { passive: true });
      });
    }

    // DOCKED (Menu: "Always open beside the page"): the panel stays beside
    // the page and the view is pushed right by its width.
    function viewEl() {
      var p = M.panel(), root = p && p.shadowRoot && p.shadowRoot.querySelector('hui-root');
      return (root && root.shadowRoot && root.shadowRoot.querySelector('#view')) || null;
    }
    function dockTo() {
      var v = viewEl();
      if (v && v.style.marginLeft !== W + 'px') { v.style.marginLeft = W + 'px'; S.docked = v; }
    }
    function undock() {
      if (S.docked) { S.docked.style.marginLeft = ''; S.docked = null; }
    }

    // ------------------------------------------------------------ wiring
    function onNav() {
      if (S.open) close(true);
      sync();
      if (S.root && docked()) markHere();
    }
    window.addEventListener('location-changed', onNav);
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', function () { if (S.open) close(true); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.open) { e.stopPropagation(); close(); }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.open) close(true); });
    window.addEventListener('resize', function () { sync(); });
    window.addEventListener('hk-module-ready', function () { S.built = ''; sync(); });
    window.addEventListener('hk-menu-date', function () { place(); });
    // Captured at the document: the window's scroll, and any other scroller's
    // (a phone's <body> scrolls where overflow-x is `hidden`; scroll events
    // do not bubble, so a window listener never hears it).
    document.addEventListener('scroll', scrolled, { capture: true, passive: true });
    window.addEventListener('hk-menu-chip', scrolled);
    // The dashboard's config arrives (and changes) with the frontend's hass
    // pushes; a list built before it is rebuilt at the next open.
    C.onHass(function () {
      if (!S.root && M.on()) sync();
      else if (S.root && (M.dash() !== S.dash)) { S.dash = M.dash(); S.built = ''; sync(); }
      else if (S.root && S.nowKey) paintNow();      // the weather, a Time & Date sensor
      if (S.haOn) haUpdates(C.hass());
    });
    // THIS SCREEN'S OWN CLOCK moves without a push: looked at every 15 s,
    // written only when the minute has changed (paintNow compares).
    setInterval(function () { if (S.nowKey && !document.hidden) paintNow(); }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && S.root) paintNow(); });
    sync();
    setTimeout(sync, 1500);    // the panel element and config can land after us on a cold load

    window.hkMenu.open = open;
    window.hkMenu.close = close;
    window.hkMenu.toggle = toggle;
    window.hkMenu.isOpen = function () { return S.open; };
    window.hkMenu.sync = sync;
    window.hkMenu.openHaSidebar = openHaSidebar;
    window.hkMenu._.state = function () { return S; };
    window.dispatchEvent(new CustomEvent('hk-module-ready', { detail: { module: 'hk-menu' } }));
  });
})();
