// hk-tabbar.js -- THE TAB BAR, after iOS 26's floating tab bar
// (docs/Tab-Bar.md): a pill of tabs floating above the bottom of the screen,
// with a round Rooms button beside it. A second way round a screen, beside
// the menu (hk-menu.js), not in place of it: a screen can have either, both
// or neither.
//
// NOTHING HERE NAMES A PAGE. The tabs are the menu's own list
// (hkMenu._.model): Home, then the menu's Categories in its order. What does
// not fit the width, and the pages at the top of the menu (Weather, Cameras,
// Live TV on a generated screen), are in a MORE sheet, and under them the
// rooms, in the menu's room order (or a Rooms button and sheet of their own:
// the menu's Rooms setting, roomsMode()). Per-user visibility, `menu: false`
// and a screen's Pages in Menu all apply, because it is the same list.
//
// WHERE IT SHOWS is the menu's to say (hk-base.js menu.tabBar): a screen's
// Menu "Tab Bar" -- the bar at every width, no side menu -- or its On Narrow
// Screens / When Folded "Tab Bar" -- the side menu where it fits and the bar
// where it would fold. The two never show together. Never in Home
// Assistant's edit mode, or off the dashboards.
//
// WHILE SCROLLING (`tab_bar_scroll`): shrink -- scrolling down folds the
// pill into one small round button holding the current page's icon, so it is
// never out of reach; hide -- it slides off the bottom; stay. Either way it
// comes back on any scroll up (UP px), at the top or the end of the page, on
// a page change, and (shrink) when the small button is tapped. A page too
// short to scroll never folds it.
//
// THE GLASS (`tab_bar_glass`): house -- the screen's own look (data-hk-glass,
// hk-settings.js): frosted stays frosted, every other look is one blur;
// blur -- ONE backdrop-filter for the bar (hk-glass.js measured that the bill
// is the number of blur surfaces, not their size); frosted -- a milky plate,
// no blur; clear -- a near-solid tint, no blur. Never see-through: a clear
// bar with no blur cannot be read over the tiles (mockups, 2026-10-05).
//
// THE PAGE MAKES ROOM: --hk-tabbar-h on <html> (the bar's top edge to the
// bottom of the window, while it shows) pads the view's bottom, so the last
// row scrolls clear of it, and puts the now-playing bar (hk-popup.js #media)
// above it, as iOS stacks its mini player over the tab bar.
//
// Mounted ONCE, in <home-assistant>'s shadow root beside the menu and the
// sheets, so it outlives every page change. Stacking: the bar at 6 (the
// menu's edge tab), under the pop-ups (7), the detail sheets (8) and the
// open menu (9); its own sheets open at 6 too, over the page.
(function () {
  'use strict';
  if (window.hkTabBar) return;

  // ---------------------------------------------------------------- sizes
  // Measured against iOS 26's tab bar and fitted to a 402 px iPhone: a tab
  // is never narrower than TAB_MIN_W (a 10.5 px label like "Security" is
  // ~44 px of ink) nor wider than TAB_MAX_W; at most MAX_TABS, More
  // included, however wide the screen.
  var TAB_MIN_W = 54, TAB_MAX_W = 96, MAX_TABS = 8;
  // A PHONE (under PHONE_W, hk-base.js MENU_NARROW) gets five at most, More
  // included, as Apple Music has: Home and three more were the comfortable
  // fit, four were cramped (2026-10-05)
  var PHONE_W = 640, PHONE_TABS = 5;
  // GUTTER: Apple Music's tab bar sits 21 pt in from each side of a 402 pt
  // iPhone (measured from a screenshot, 2026-10-05)
  // BAR_H and WIDEN after Apple Music on a 402 pt iPhone (screenshot,
  // 2026-10-05): a 60 pt bar, the selected tab's capsule ~76 x 53 pt -- ours
  // 77 x 54 (a 67 px tab plus 5 px each side)
  var GUTTER = 21, GAP = 10, ROUND = 62, PAD = 4, BAR_H = 60, LIFT = 14, TAB_GAP = 4, WIDEN = 5;
  // HOW HIGH IT FLOATS: 14 px, or on an iPhone down into the home indicator's
  // safe area as iOS's own tab bar sits (34 px of safe area: 22 px up)
  var LIFT_CSS = 'max(' + LIFT + 'px, calc(env(safe-area-inset-bottom, 0px) - 12px))';
  // THE SHEETS: at least this share of the window (on a phone, up to about
  // the middle of the page), and never under SHEET_MIN px
  var SHEET_SHARE = 0.55, SHEET_MIN = 300;
  // a sheet never comes closer than this to the top of the window: the page
  // that shows there is where a tap closes it
  var TOP_GAP = 96;
  // A TAB NARROWER THAN THIS (six on a phone: ~55 px) has no room for the
  // highlight's capsule -- it would be a cramped circle -- so the page you
  // are on is its icon and name in the highlight colour, as iOS draws it
  var PLATE_MIN = 64;
  var DOWN = 28, UP = 12, EDGE = 4, SHORT = 48;

  // ------------------------------------------------------------ the fit
  // How many tabs show, and whether there is a More, for `n` tabs (Home and
  // the categories), `top` pages at the top of the menu, on a screen `width`
  // wide, with or without the Rooms button (`button`); `extra`: More has
  // something of its own to hold either way (the rooms, In More). Pure, for
  // the tests.
  function fit(n, top, width, button, extra) {
    var avail = Math.max(0, width - 2 * GUTTER - (button ? ROUND + GAP : 0) - 2 * PAD);
    var most = width < PHONE_W ? PHONE_TABS : MAX_TABS;
    var slots = Math.max(1, Math.min(most, Math.floor((avail + TAB_GAP) / (TAB_MIN_W + TAB_GAP))));
    var more = top > 0 || n > slots || !!extra;
    var shown = more ? Math.max(0, Math.min(n, slots - 1)) : n;
    var cells = shown + (more ? 1 : 0);
    var inner = Math.min(avail, cells * TAB_MAX_W + Math.max(0, cells - 1) * TAB_GAP);
    var tab = cells ? (inner - Math.max(0, cells - 1) * TAB_GAP) / cells : 0;
    return { shown: shown, more: more, width: Math.round(inner + 2 * PAD), plate: tab >= PLATE_MIN };
  }

  // What the bar holds, from the menu's list (hkMenu._.model's answer).
  function parts(m, f) {
    var tabs = [m.home].concat(m.categories || []).filter(Boolean);
    var shown = tabs.slice(0, f.shown);
    var more = f.more ? (m.top || []).concat(tabs.slice(f.shown)) : [];
    return { tabs: shown, more: more, rooms: (m.rooms || []).slice() };
  }

  // ---------------------------------------------------------- scrolling
  // One step of the bar's state as the page scrolls: `st` { mode: 'full' |
  // 'small' | 'gone', down, up }, the scroll's change `dy`, where it is now
  // `y` and the most it can go `max`, and the setting. Pure, for the tests.
  function scrollStep(st, dy, y, max, setting) {
    var s = { mode: st.mode || 'full', down: st.down || 0, up: st.up || 0 };
    if (setting === 'stay' || max < SHORT) return { mode: 'full', down: 0, up: 0 };
    // the top (an iPhone's rubber band goes past it) and the end
    if (y <= EDGE || y >= max - EDGE) return { mode: 'full', down: 0, up: 0 };
    if (dy > 0) {
      s.down += dy; s.up = 0;
      if (s.mode === 'full' && s.down >= DOWN) s.mode = setting === 'hide' ? 'gone' : 'small';
    } else if (dy < 0) {
      s.up -= dy; s.down = 0;
      if (s.mode !== 'full' && s.up >= UP) { s.mode = 'full'; s.up = 0; }
    }
    return s;
  }

  // WHERE THE ROOMS ARE (the menu's Rooms setting): 'more' -- a section of
  // More, under its pages (the default); 'button' -- a round button of their
  // own beside the tabs, with a sheet of its own; 'off'. A boolean from
  // before 2026-10-05 evening: true is In More.
  function roomsMode(v) {
    if (v === false || v === 'off') return 'off';
    return v === 'button' ? 'button' : 'more';
  }

  // The bar's material for a setting and the screen's look.
  function material(setting, look) {
    if (setting === 'clear' || setting === 'frosted' || setting === 'blur') return setting;
    return look === 'frosted' ? 'frosted' : 'blur';
  }

  window.hkTabBar = { version: '1.0.0', _: { fit: fit, parts: parts, scrollStep: scrollStep, material: material,
                                             roomsMode: roomsMode,
                                             SIZES: { TAB_MIN_W: TAB_MIN_W, TAB_MAX_W: TAB_MAX_W, MAX_TABS: MAX_TABS,
                                                      GUTTER: GUTTER, GAP: GAP, ROUND: ROUND, PAD: PAD } } };

  function whenReady(fn) {
    var done = false;
    function go() {
      if (done) return;
      var C = window.hkCards;
      if (!C || !C.menu || typeof C.menu.board !== 'function' || !window.hkMenu || !window.hkMenu._) return;
      done = true;
      fn(C);
    }
    go();
    if (!done) {
      window.addEventListener('hk-cards-ready', go);
      window.addEventListener('hk-module-ready', go);
    }
  }

  whenReady(function (C) {
    var M = C.menu, H = window.hkMenu._;
    var EASE = 'cubic-bezier(.32,.72,0,1)';
    var CSS = [
      ':host{all:initial}',
      '.root{position:fixed;left:0;top:0;width:0;height:0;z-index:6;',
      '  font-family:var(--paper-font-body1_-_font-family,"SF Pro",-apple-system,Roboto,sans-serif);',
      '  -webkit-font-smoothing:antialiased;color:#fff;-webkit-tap-highlight-color:transparent}',
      // THE ROW: the pill and the Rooms button, over the dashboard (past Home
      // Assistant's sidebar), clear of an iPhone's home indicator
      '.row{position:fixed;left:calc(var(--hk-content-left,0px) + ' + GUTTER + 'px);right:' + GUTTER + 'px;',
      '  bottom:' + LIFT_CSS + ';display:none;justify-content:center;',
      '  align-items:center;gap:' + GAP + 'px;pointer-events:none;transition:transform .34s ' + EASE + '}',
      '.root.on .row{display:flex}',
      '.root.gone .row{transform:translateY(calc(100% + 8px + ' + LIFT_CSS + '))}',
      '.root.small .row{justify-content:space-between}',
      // THE MATERIAL (material()): one blur, a milky plate, or a near-solid tint
      '.g{pointer-events:auto;box-sizing:border-box;border:1px solid rgba(255,255,255,0.14);',
      '  box-shadow:0 8px 28px rgba(0,0,0,0.30),inset 0 1px 0 rgba(255,255,255,0.10)}',
      '.blur .g{background:linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04)),rgba(28,30,40,0.46);',
      '  -webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6)}',
      '.frosted .g{background:rgba(62,64,74,0.95)}',
      '.clear .g{background:rgba(24,24,28,0.93)}',
      // THE PILL
      // TAB_GAP between tabs: two highlights side by side (the page you are
      // on, the one under the pointer) never touch
      '.pill{position:relative;display:flex;align-items:stretch;gap:' + TAB_GAP + 'px;height:' + BAR_H + 'px;padding:' + (PAD - 1) + 'px;',
      '  border-radius:' + (BAR_H / 2) + 'px;width:var(--pill-w,auto);max-width:100%;overflow:hidden;',
      '  transition:width .34s ' + EASE + '}',
      '.tab{position:relative;z-index:0;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;',
      // 10 px in from each side: the capsule's round ends curve ~9 px in at
      // the label's foot, so a long name's ellipsis stays inside it
      '  border:0;margin:0;padding:0 10px;border-radius:' + ((BAR_H - 2 * (PAD - 1)) / 2) + 'px;background:none;color:rgba(255,255,255,0.94);',
      '  font:inherit;font-size:10.5px;font-weight:600;letter-spacing:0;cursor:pointer;transition:background-color .2s ease,opacity .2s ease}',
      '.tab ha-icon{--mdc-icon-size:24px;width:24px;height:24px;display:flex}',
      '.tab span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // THE PAGE YOU ARE ON: its capsule reaches WIDEN px past the tab on each
      // side, into the gaps, as Apple Music's does -- nothing else ever
      // lights up beside it (no hover), so it has the room. The end tabs
      // reach inward only, staying inside the bar.
      '.tab.here{color:var(--hk-accent,#ff9f0a)}',
      '.tab.here::before{content:"";position:absolute;z-index:-1;top:0;bottom:0;left:-' + WIDEN + 'px;right:-' + WIDEN + 'px;',
      '  border-radius:inherit;background:rgba(255,255,255,0.16)}',
      '.cur + .tab.here::before{left:0}',
      '.tab.here:last-child::before{right:0}',
      '.root.tight .tab.here::before{display:none}',
      '.tab:focus-visible,.roomsbtn:focus-visible,.cur:focus-visible,.it:focus-visible{outline:2px solid rgba(255,255,255,0.7);outline-offset:-2px}',
      // FOLDED (shrink): one round button with the current page's icon
      '.cur{display:none;flex:1;align-items:center;justify-content:center;border:0;padding:0;margin:0;background:none;',
      '  color:var(--hk-accent,#ff9f0a);cursor:pointer;border-radius:50%}',
      '.cur ha-icon{--mdc-icon-size:26px;width:26px;height:26px;display:flex}',
      '.root.small .pill{width:' + (BAR_H - 6) + 'px;height:' + (BAR_H - 6) + 'px;border-radius:50%}',
      '.root.small .tab{display:none}',
      '.root.small .cur{display:flex}',
      // THE ROOMS BUTTON
      '.roomsbtn{flex:none;width:' + ROUND + 'px;height:' + ROUND + 'px;border-radius:50%;display:none;align-items:center;',
      '  justify-content:center;padding:0;margin:0;color:rgba(255,255,255,0.94);cursor:pointer;',
      '  transition:width .34s ' + EASE + ',height .34s ' + EASE + '}',
      '.root.hasrooms .roomsbtn{display:flex}',
      '.roomsbtn ha-icon{--mdc-icon-size:26px;width:26px;height:26px;display:flex}',
      '.roomsbtn.here,.roomsbtn[aria-expanded="true"]{color:var(--hk-accent,#ff9f0a)}',
      '.root.small .roomsbtn{width:' + (BAR_H - 6) + 'px;height:' + (BAR_H - 6) + 'px}',
      '.tab:active,.roomsbtn:active,.cur:active{filter:brightness(1.25)}',
      // THE SHEETS (More, Rooms): above the bar, the page still showing
      '.scrim{position:fixed;inset:0;display:none;pointer-events:auto}',
      '.root.sheeted .scrim{display:block}',
      '.sheet{position:fixed;left:calc(var(--hk-content-left,0px) + ' + GUTTER + 'px);right:' + GUTTER + 'px;margin:0 auto;',
      '  bottom:calc(' + (BAR_H + 10) + 'px + ' + LIFT_CSS + ');max-width:560px;box-sizing:border-box;',
      // ...as tall as it needs, but always leaving TOP_GAP of the page above
      // it to tap out on
      '  max-height:calc(var(--hk-vh,100dvh) - ' + (BAR_H + 10 + TOP_GAP) + 'px - ' + LIFT_CSS + ' - env(safe-area-inset-top,0px));',
      '  display:flex;flex-direction:column;overflow:hidden;',
      '  border-radius:28px;padding:16px 12px 0;opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;',
      '  transition:opacity .22s ease,transform .3s ' + EASE + ',visibility 0s linear .3s;visibility:hidden}',
      // ONLY THE LIST SCROLLS, under a soft fade at its foot; the title stays
      '.body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
      '  scrollbar-width:none;padding:2px 0 16px}',
      '.body::-webkit-scrollbar{display:none}',
      '.body.scrolls{-webkit-mask-image:linear-gradient(#000 calc(100% - 28px),transparent);',
      '  mask-image:linear-gradient(#000 calc(100% - 28px),transparent);padding-bottom:28px}',
      '.sheet.open{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition:opacity .22s ease,transform .3s ' + EASE + '}',
      // a sheet over the tiles wants more body than the bar
      '.blur .sheet.g{background:linear-gradient(145deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03)),rgba(26,28,38,0.66);',
      '  -webkit-backdrop-filter:blur(30px) saturate(1.7);backdrop-filter:blur(30px) saturate(1.7)}',
      '.sheet h2{flex:none;margin:0 6px 12px;font-size:17px;font-weight:700;letter-spacing:-0.41px;color:#fff}',
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:16px 4px;align-content:start}',
      // the Rooms section in More, headed as the menu heads its sections
      '.sheet h3{margin:22px 6px 12px;font-size:15px;font-weight:600;letter-spacing:-0.24px;color:rgba(235,235,245,0.6)}',
      '.sheet h3[hidden],.grid[hidden]{display:none}',
      // MORE: the icon and its name, no plate (the Home Screen's look)
      '.it{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:7px;min-width:0;',
      '  box-sizing:border-box;padding:4px 2px;border:0;margin:0;border-radius:14px;background:none;',
      '  color:rgba(255,255,255,0.95);font:inherit;font-size:12.5px;font-weight:600;letter-spacing:-0.08px;',
      '  text-align:center;cursor:pointer;transition:background-color .15s ease}',
      '.it ha-icon{--mdc-icon-size:34px;width:34px;height:34px;flex:none;display:flex;color:var(--hk-accent,#ff9f0a)}',
      '.it span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.it.here span{color:var(--hk-accent,#ff9f0a)}',
      // ROOMS ON THEIR OWN SHEET (the Rooms button): each icon in a soft round
      // plate (Control Center's look). In More they look like its pages.
      '[data-sheet="rooms"] .roomgrid .it ha-icon{--mdc-icon-size:28px;width:58px;height:58px;border-radius:50%;',
      '  align-items:center;justify-content:center;background:rgba(255,255,255,0.12);transition:background-color .15s ease}',
      '[data-sheet="rooms"] .roomgrid .it.here ha-icon{background:var(--hk-accent,#ff9f0a);color:var(--hk-on-accent,#fff)}',
      '@media (hover:hover){.it:not(.here):hover{background:rgba(255,255,255,0.08)}',
      '  [data-sheet="rooms"] .roomgrid .it:not(.here):hover{background:none}',
      '  [data-sheet="rooms"] .roomgrid .it:not(.here):hover ha-icon{background:rgba(255,255,255,0.2)}}',
      '.it:active{filter:brightness(1.25)}',
      '@media (prefers-reduced-motion:reduce){.row,.pill,.roomsbtn,.sheet{transition:none}}'
    ].join('\n');

    var MORE_ICON = 'mdi:dots-horizontal', ROOMS_ICON = 'mdi:view-grid';

    var S = { host: null, root: null, on: false, mode: 'full', down: 0, up: 0, sheet: null, built: '',
              tabs: [], more: [], rooms: [], last: new WeakMap(), view: null, viewPad: null };

    function haRoot() {
      var ha = document.querySelector('home-assistant');
      return (ha && ha.shadowRoot) || null;
    }
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function icon(i) { return esc(H.glyph(i)); }

    function mount() {
      if (S.host && S.host.isConnected) return true;
      var r = haRoot();
      if (!r) return false;
      S.host = document.createElement('div');
      S.host.id = 'hk-tabbar';
      var sr = S.host.attachShadow({ mode: 'open' });
      sr.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="root">' +
          '<div class="scrim"></div>' +
          '<section class="sheet g" data-sheet="more" aria-label="More"><h2>More</h2><div class="body">' +
            '<div class="grid pages"></div><h3 hidden>Rooms</h3><div class="grid roomgrid" hidden></div></div></section>' +
          '<section class="sheet g" data-sheet="rooms" aria-label="Rooms"><h2>Rooms</h2><div class="body">' +
            '<div class="grid roomgrid"></div></div></section>' +
          '<div class="row">' +
            '<nav class="pill g" aria-label="Tab Bar"><button class="cur" aria-label="Show the tab bar"><ha-icon></ha-icon></button></nav>' +
            '<button class="roomsbtn g" aria-label="Rooms" aria-expanded="false"><ha-icon icon="' + icon(ROOMS_ICON) + '"></ha-icon></button>' +
          '</div>' +
        '</div>';
      S.root = sr.querySelector('.root');
      S.pill = sr.querySelector('.pill');
      S.cur = sr.querySelector('.cur');
      S.roomsBtn = sr.querySelector('.roomsbtn');
      S.sheets = { more: sr.querySelector('[data-sheet="more"]'), rooms: sr.querySelector('[data-sheet="rooms"]') };
      sr.querySelector('.scrim').addEventListener('click', function () { closeSheet(); });
      S.cur.addEventListener('click', function (e) { e.stopPropagation(); setMode('full'); });
      S.roomsBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleSheet('rooms'); });
      S.pill.addEventListener('click', onTab);
      Object.keys(S.sheets).forEach(function (k) { S.sheets[k].addEventListener('click', onSheet); });
      r.appendChild(S.host);
      return true;
    }

    // ------------------------------------------------------- when it shows
    function editing() {
      var p = M.panel();
      return !!(p && p.lovelace && p.lovelace.editMode);
    }
    // hk-base.js decides (menu.tabBar): the screen's Menu is Tab Bar, or its
    // narrow choice is and the side menu would fold here
    function wanted() {
      if (typeof M.tabBar !== 'function' || !M.tabBar()) return false;
      return !!M.config() && !editing();
    }

    // ---------------------------------------------------------- the list
    function model() {
      var cfg = M.config(), h = C.hass(), b = M.board();
      return H.model(cfg, h && h.areas, { dash: M.dash(), order: b.menu_rooms === 'order' ? 'order' : 'az',
                                          roomOrder: b.room_order, user: h && h.user && h.user.id,
                                          categories: b.categories, top: b.menu_top, chips: b.chips,
                                          chipsRow: b.chips_row, pageOrder: H.pagePaths(b.pages, b.custom_pages),
                                          ha: false });
    }
    var CFGS = new WeakMap(), CFGN = 0;
    function cfgId(cfg) {
      if (!cfg || typeof cfg !== 'object') return 0;
      if (!CFGS.has(cfg)) CFGS.set(cfg, ++CFGN);
      return CFGS.get(cfg);
    }
    function listKey(width) {
      var h = C.hass(), b = M.board();
      return [M.dash(), cfgId(M.config()), width, b.tab_bar_rooms, b.menu_rooms, JSON.stringify(b.room_order),
              JSON.stringify(b.categories), JSON.stringify(b.menu_top || []), JSON.stringify(b.pages || []),
              JSON.stringify(b.chips || []), b.chips_row, h && h.user && h.user.id,
              JSON.stringify(h && h.areas ? Object.keys(h.areas).map(function (k) {
                return k + ':' + h.areas[k].name + ':' + (h.areas[k].icon || '');
              }) : [])].join('|');
    }
    function build() {
      var b = M.board(), m = model();
      var width = (window.innerWidth || 0) - leftOf();
      var rm = m.rooms.length ? roomsMode(b.tab_bar_rooms) : 'off';
      var roomsOn = rm === 'button';
      var tabs = [m.home].concat(m.categories).filter(Boolean);
      var f = fit(tabs.length, m.top.length, width, roomsOn, rm === 'more');
      var p = parts(m, f);
      S.tabs = p.tabs; S.more = p.more; S.rooms = rm === 'off' ? [] : p.rooms; S.roomsMode = rm;
      var html = '';
      p.tabs.forEach(function (it, i) {
        html += '<button class="tab" data-t="' + i + '"><ha-icon icon="' + icon(it.icon) + '"></ha-icon><span>' +
          esc(it.title) + '</span></button>';
      });
      if (f.more) {
        html += '<button class="tab" data-t="more" aria-expanded="false"><ha-icon icon="' + icon(MORE_ICON) +
          '"></ha-icon><span>More</span></button>';
      }
      S.pill.querySelectorAll('.tab').forEach(function (x) { x.remove(); });
      S.pill.insertAdjacentHTML('beforeend', html);
      S.pill.style.setProperty('--pill-w', f.width + 'px');
      S.root.classList.toggle('hasrooms', roomsOn);
      S.tight = !f.plate;
      fill(S.sheets.more.querySelector('.pages'), S.more, 'p');
      var mr = S.sheets.more.querySelector('.roomgrid');
      fill(mr, rm === 'more' ? S.rooms : [], 'r');
      mr.hidden = S.sheets.more.querySelector('h3').hidden = rm !== 'more' || !S.more.length;
      if (rm === 'more' && !S.more.length) mr.hidden = false;      // only rooms: no heading
      S.sheets.more.querySelector('.pages').hidden = !S.more.length;
      fill(S.sheets.rooms.querySelector('.roomgrid'), rm === 'button' ? S.rooms : [], 'r');
      S.built = listKey(width);
    }
    function fill(grid, items, k) {
      grid.innerHTML = items.map(function (it, i) {
        return '<button class="it" data-k="' + k + '" data-i="' + i + '"><ha-icon icon="' + icon(it.icon) + '"></ha-icon><span>' +
          esc(it.title) + '</span></button>';
      }).join('');
    }
    function leftOf() {
      var v = 0;
      try { v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hk-content-left')) || 0; }
      catch (e) { v = 0; }
      if (!v) {
        var p = M.panel(), r = p && p.getBoundingClientRect ? p.getBoundingClientRect() : null;
        v = r ? Math.max(0, r.left) : 0;
      }
      return v;
    }

    // ------------------------------------------------- the current page
    function markHere() {
      var path = location.pathname, curIcon = null;
      S.pill.querySelectorAll('.tab').forEach(function (el) {
        var k = el.getAttribute('data-t');
        var here = k === 'more' ? S.more.concat(S.roomsMode === 'more' ? S.rooms : [])
                                    .some(function (it) { return H.isHere(it, path); })
                                : !!S.tabs[+k] && H.isHere(S.tabs[+k], path);
        el.classList.toggle('here', here);
        if (here) { el.setAttribute('aria-current', 'page'); curIcon = k === 'more' ? MORE_ICON : S.tabs[+k].icon; }
        else el.removeAttribute('aria-current');
      });
      var inRoom = S.rooms.some(function (it) { return H.isHere(it, path); });
      S.roomsBtn.classList.toggle('here', inRoom && S.roomsMode === 'button');
      Object.keys(S.sheets).forEach(function (k) {
        S.sheets[k].querySelectorAll('.it').forEach(function (el) {
          var it = (el.getAttribute('data-k') === 'r' ? S.rooms : S.more)[+el.getAttribute('data-i')];
          el.classList.toggle('here', !!it && H.isHere(it, path));
        });
      });
      // folded, the button shows where you are: the page's tab, More, a
      // room, else Home
      var ci = curIcon || (inRoom ? ROOMS_ICON : (S.tabs[0] && S.tabs[0].icon) || 'mdi:home');
      var ie = S.cur.querySelector('ha-icon'), want = H.glyph(ci);
      if (ie.getAttribute('icon') !== want) ie.setAttribute('icon', want);
    }

    // --------------------------------------------------------- choosing
    function go(it) {
      closeSheet();
      if (!it || H.isHere(it, location.pathname)) return;
      history.pushState(null, '', it.path);
      window.dispatchEvent(new CustomEvent('location-changed'));
    }
    function onTab(e) {
      var el = e.target.closest && e.target.closest('.tab');
      if (!el) return;
      e.stopPropagation();
      var k = el.getAttribute('data-t');
      if (k === 'more') { toggleSheet('more'); return; }
      go(S.tabs[+k]);
    }
    function onSheet(e) {
      var el = e.target.closest && e.target.closest('.it');
      if (!el) return;
      go((el.getAttribute('data-k') === 'r' ? S.rooms : S.more)[+el.getAttribute('data-i')]);
    }
    function toggleSheet(k) { if (S.sheet === k) closeSheet(); else openSheet(k); }
    function openSheet(k) {
      if (!S.sheets[k]) return;
      closeSheet(true);
      S.sheet = k;
      setMode('full');
      sizeSheets();
      S.sheets[k].classList.add('open');
      S.root.classList.add('sheeted');
      var btn = k === 'rooms' ? S.roomsBtn : S.pill.querySelector('[data-t="more"]');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      // the menu and the tab bar never both open
      if (window.hkMenu && typeof window.hkMenu.isOpen === 'function' && window.hkMenu.isOpen()) window.hkMenu.close(true);
    }
    // THE SHEETS' HEIGHT. Rooms in More: one sheet, as tall as it needs up
    // to the top gap, scrolling past that. A Rooms button: both sheets the
    // same height (More's, at least SHEET_SHARE of the window), so switching
    // between them nothing jumps. Measured at each opening -- the window, the
    // lists and the fonts can all have changed.
    function sizeSheets() {
      var more = S.sheets.more, rooms = S.sheets.rooms;
      [more, rooms].forEach(function (el) { el.style.height = ''; el.querySelector('.body').classList.remove('scrolls'); });
      if (S.roomsMode === 'button') {
        var room = parseFloat(getComputedStyle(more).maxHeight) || 0;
        var want = S.more.length ? more.scrollHeight : rooms.scrollHeight;
        var h = Math.round(Math.max(SHEET_MIN, want, (window.innerHeight || 0) * SHEET_SHARE));
        if (room) h = Math.min(h, room);
        [more, rooms].forEach(function (el) { el.style.height = h + 'px'; });
      }
      [more, rooms].forEach(function (el) {
        var g = el.querySelector('.body');
        g.classList.toggle('scrolls', g.scrollHeight > g.clientHeight + 1);
      });
    }
    function closeSheet(quiet) {
      if (!S.root) return;
      Object.keys(S.sheets).forEach(function (k) { S.sheets[k].classList.remove('open'); });
      S.root.classList.remove('sheeted');
      [S.roomsBtn, S.pill.querySelector('[data-t="more"]')].forEach(function (b) {
        if (b) b.setAttribute('aria-expanded', 'false');
      });
      S.sheet = null;
      void quiet;
    }

    // -------------------------------------------------------- scrolling
    function setMode(mode) {
      S.down = 0; S.up = 0;
      if (S.mode === mode) return;
      S.mode = mode;
      if (!S.root) return;
      S.root.classList.toggle('small', mode === 'small');
      S.root.classList.toggle('gone', mode === 'gone');
    }
    function onScroll(e) {
      if (!S.on || S.sheet) return;
      var t = e.target;
      var el = (t === document || t === document.documentElement) ? document.scrollingElement : t;
      if (!el || el.nodeType !== 1 || el === S.host) return;
      var y = el.scrollTop, max = el.scrollHeight - el.clientHeight;
      var prev = S.last.get(el);
      S.last.set(el, y);
      if (prev === undefined || prev === y) return;
      var b = M.board() || {};
      var st = scrollStep({ mode: S.mode, down: S.down, up: S.up }, y - prev, y, max, b.tab_bar_scroll);
      var was = S.mode;
      setMode(st.mode);
      if (st.mode === was) { S.down = st.down; S.up = st.up; }
    }

    // ------------------------------------------- the room it takes, below
    function viewEl() {
      var p = M.panel(), root = p && p.shadowRoot && p.shadowRoot.querySelector('hui-root');
      return (root && root.shadowRoot && root.shadowRoot.querySelector('#view')) || null;
    }
    function publish(on) {
      var de = document.documentElement;
      if (!de || !de.style) return;
      var v = on ? 'calc(' + (BAR_H + 10) + 'px + ' + LIFT_CSS + ')' : '';
      if (de.style.getPropertyValue('--hk-tabbar-h') !== v) {
        if (v) de.style.setProperty('--hk-tabbar-h', v);
        else de.style.removeProperty('--hk-tabbar-h');
      }
      // the view's own bottom padding, plus the bar's
      var view = on ? viewEl() : null;
      if (S.view && S.view !== view) { S.view.style.paddingBottom = S.viewPad || ''; S.view = null; }
      if (view && S.view !== view) {
        S.viewPad = view.style.paddingBottom;
        var base = getComputedStyle(view).paddingBottom || '0px';
        view.style.paddingBottom = 'calc(' + base + ' + var(--hk-tabbar-h,0px))';
        S.view = view;
      }
    }

    // ------------------------------------------------------------ sync
    // Everything that can change what shows: page changes, settings, resize,
    // hass pushes. Cheap and idempotent.
    function sync() {
      var on = wanted();
      if (!on) {
        if (S.root) { closeSheet(true); S.root.className = 'root'; }
        S.on = false;
        publish(false);
        return;
      }
      if (!mount()) return;
      var b = M.board() || {};
      var look = document.documentElement.getAttribute('data-hk-glass');
      var mat = material(b.tab_bar_glass, look);
      var a = typeof M.accent === 'function' ? M.accent() : null;
      if (a) { S.host.style.setProperty('--hk-accent', a.color); S.host.style.setProperty('--hk-on-accent', a.on); }
      var width = (window.innerWidth || 0) - leftOf();
      if (listKey(width) !== S.built) build();
      var cls = ['root', 'on', mat];
      if (S.roomsMode === 'button' && S.rooms.length) cls.push('hasrooms');
      if (S.tight) cls.push('tight');
      if (S.mode === 'small') cls.push('small');
      if (S.mode === 'gone') cls.push('gone');
      if (S.sheet) cls.push('sheeted');
      S.root.className = cls.join(' ');
      S.on = true;
      markHere();
      publish(true);
    }
    function onNav() {
      closeSheet(true);
      setMode('full');
      S.last = new WeakMap();
      sync();
      // a new view element arrives a moment after the navigation
      setTimeout(sync, 300);
    }
    window.addEventListener('location-changed', onNav);
    window.addEventListener('popstate', onNav);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.sheet) { e.stopPropagation(); closeSheet(); }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) closeSheet(true); });
    window.addEventListener('resize', function () { sync(); });
    window.addEventListener('hk-module-ready', function () { S.built = ''; sync(); });
    // the window's scroll, and <body>'s on a phone (scroll events do not
    // bubble: captured at the document, as hk-menu.js does)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    // HA pushes ~33 state changes a second: only what the list is made of
    // is looked at here -- the dashboard, its config and the areas, each by
    // identity (a new object only when it changed)
    C.onHass(function () {
      var h = C.hass(), cfg = M.config(), d = M.dash(), areas = h && h.areas;
      if (d === S.dash && cfg === S.cfg && areas === S.areas) return;
      S.dash = d; S.cfg = cfg; S.areas = areas;
      sync();
    });
    sync();
    setTimeout(sync, 1500);    // the panel and config can land after us on a cold load

    window.hkTabBar.sync = sync;
    window.hkTabBar.open = openSheet;
    window.hkTabBar.close = closeSheet;
    window.hkTabBar.mode = function () { return S.mode; };
    window.hkTabBar._.state = function () { return S; };
    window.dispatchEvent(new CustomEvent('hk-module-ready', { detail: { module: 'hk-tabbar' } }));
  });
})();
