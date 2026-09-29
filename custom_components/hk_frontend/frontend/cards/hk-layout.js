// hk-layout.js -- building blocks: frame, spacer, back chevron, flat key, info block, grid
//
// hk-frame-card (native HA cards on our glass, lazy `module:` loading),
// hk-spacer-card, hk-back-card, hk-key-card, hk-info-card, hk-grid-card and
// the hk-grid-view view type.
//
// One file per family of cards, so each file's name says what is in it.
// Shared pieces -- HkBase, the editor helpers, register(), create(), the
// snapshot cache -- come from hk-base.js through window.hkCards.
(function () {
  'use strict';

  // hk-base.js is a Lovelace resource fetched in PARALLEL with this one, so
  // wait for its ready EVENT (never poll: rAF does not fire in a hidden tab,
  // and a tablet behind the screensaver would define nothing -- see
  // hk-base.js).
  function whenBase(fn) {
    if (window.hkCards && window.hkCards.register) return fn(window.hkCards);
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.register) fn(window.hkCards);
      else console.error('[hk-layout] hk-cards-ready fired without hk-base.js');
    }, { once: true });
  }

  whenBase(function (C) {
  if (window.hkLayout) return;                  // double-load guard
  var HkBase = C.HkBase, M = C.M, register = C.register, firstOf = C.firstOf,
      create = C.create;

  // -------------------------------------------------------- hk-frame
  //
  // WEARS OUR MATERIAL ON SOMEBODY ELSE'S CARD. It hosts one native HA card
  // and sets the five --ha-card-* custom properties on it, which is all
  // ha-card reads for its plate.
  //
  // WHY NOT `theme:`. That is the documented hook and it is what the camera
  // page uses, but it DOES NOT FIRE FOR A LAZILY-LOADED CARD. MEASURED on the
  // energy page: energy-* cards with a `theme:` in their config, in the same
  // HUI-CARD -> HUI-GRID-CARD chain the camera page uses, carry ONE inline
  // property against a camera card's hundreds. hui-card applies the theme to its child element once, when the
  // config changes; the energy cards live in a chunk that has not loaded yet
  // at that moment, so the call lands on nothing and never retries.
  //
  // WHAT THIS CANNOT REACH, so nobody re-litigates it: the chart's own type
  // scale, its tooltip, and the date picker's chip row are drawn from HA's
  // component styles and have no theme variables at all. A framed card reads
  // as an HA card wearing our plate -- which is the point, but it is not the
  // same as one of ours.
  // `module:` -- A THIRD-PARTY CARD THAT LOADS ONLY WHERE IT IS USED.
  //
  // A Lovelace resource loads on EVERY dashboard page, used or not.
  // weather-radar-card is 457 KB for one card on one subview, so it need
  // not be a resource: the frame imports
  // it the first time the Weather page builds this card, waits for the element
  // to be defined, and only then asks HA to create it. Before the import
  // HA's createCardElement would build an error card for an unknown tag.
  //
  // import() with a <script type=module> fallback, the same pair hk-loader.js
  // uses, because a WebView that refuses a dynamic import still runs a module
  // tag. One promise per URL, so two framed cards never import twice.
  //
  // CACHE NOTE: /hacsfiles/ is served with max-age 31 days, and the resource
  // registry's ?hacstag= is what busts it on a HACS update -- a module URL
  // has none. After updating the card in HACS, bump `?v=` on the module URL
  // in the YAML.
  var MODULES = {};
  function loadModule(url, type) {
    var tag = String(type || '').replace(/^custom:/, '');
    if (tag && customElements.get(tag)) return Promise.resolve();
    if (!MODULES[url]) {
      MODULES[url] = new Promise(function (resolve, reject) {
        import(url).then(resolve, function () {
          var sc = document.createElement('script');
          sc.type = 'module';
          sc.src = url;
          sc.onload = resolve;
          sc.onerror = reject;
          document.head.appendChild(sc);
        });
      });
    }
    return MODULES[url].then(function () {
      return tag ? customElements.whenDefined(tag) : null;
    });
  }

  class HkFrameCard extends HkBase {
    static get CSS() {
      return [
        ':host{display:block}',
        // The frame itself paints NOTHING. The child's own ha-card is the
        // plate; drawing a second one behind it would show as a shoulder in
        // every corner, the same way a tinted plate behind a rounded camera
        // does.
        '.frame{display:block;margin:0}',
        // `phone: hide` -- a framed HA card that cannot be made to fit a phone
        // (energy-sources-table is 459px wide at 402 and has no responsive
        // mode of its own) is dropped from the layout there instead of
        // overflowing the page. Same 640px line as hk-responsive.css.
        '@media (max-width: 640px){:host(.hide-phone){display:none}}'
      ].join('');
    }
    static get MATERIALS() {
      return {
        // hk_glass_tile, the material every other card on these pages wears.
        // M.bg, NOT the literal: the plate follows the Glass look like every
        // other card, so a framed card frosts with its neighbours. The frame
        // itself carries the blur marker in dress() below, at the same
        // radius, so the shared layer is cut to it.
        glass: {
          '--ha-card-background': M.bg,
          '--ha-card-border-radius': M.radius,
          '--ha-card-border-width': '1px',
          '--ha-card-border-color': 'rgba(255,255,255,0.13)',
          '--ha-card-box-shadow': '0 10px 28px rgba(0,0,0,0.12)'
        },
        // Full-bleed media (the radar map): rounded like the glass, but a
        // transparent plate with no rim, so the content's own clipped corners
        // are the edge. The same values as the `HK Kiosk Camera` theme,
        // which a framed card cannot use -- see the lazy-load note in _build.
        media: {
          '--ha-card-background': 'transparent',
          '--ha-card-border-radius': '23.5px',
          '--ha-card-border-width': '0px',
          '--ha-card-box-shadow': '0 8px 22px rgba(0,0,0,0.12)'
        },
        // No plate at all -- for a card that paints its own.
        none: {
          '--ha-card-background': 'none',
          '--ha-card-border-width': '0px',
          '--ha-card-box-shadow': 'none'
        }
      };
    }
    setConfig(config) {
      if (!config || !config.card || !config.card.type) {
        throw new Error('hk-frame: `card` is required');
      }
      super.setConfig(config);
      this.classList.toggle('hide-phone', config.phone === 'hide');
    }
    getCardSize() { return 6; }
    set hass(h) {
      super.hass = h;
      // The wrapper is static; the child owns its independent update gate.
      if (this._child) this._child.hass = h;
    }
    get hass() { return this._hass; }
    // The frame has no state of its own; the child gates its own renders.
    _sigOf() { return 'static'; }
    // HA's OWN HELPERS BUILD THE CHILD, not document.createElement.
    //
    // The energy cards live in a chunk HA loads on demand, and it loads it
    // when ITS createCardElement asks for the card -- creating the element by
    // tag name never triggers that import, so the element sits there
    // unupgraded forever: the right tag, no shadow root, and `typeof
    // setConfig === "undefined"`. It renders as nothing and reports no error.
    //
    // loadCardHelpers() is HA's documented way in. createCardElement() imports
    // the chunk, constructs the element and calls setConfig for us.
    _build() {
      var cfg = this._config, self = this;
      this._child = null;
      var dress = function (el) {
        // Helpers/module imports may finish after the editor replaces config.
        if (self._config !== cfg) return;
        var matName = cfg.material || 'glass';
        var mat = HkFrameCard.MATERIALS[matName];
        if (mat) {
          Object.keys(mat).forEach(function (k) { el.style.setProperty(k, mat[k]); });
        }
        // The frame is the glass SURFACE for hk-glass.js: the child's plate
        // fills it edge to edge, so cutting the shared blur to the frame's
        // rounded box is cutting it to the plate.
        if (self._e && self._e.style) {
          self._e.style.borderRadius = matName === 'glass' ? M.radius : '';
          self._e.style.setProperty('--hk-glass-surface', matName === 'glass' ? '1' : '');
        }
        // `vars:` -- per-card extras, applied AFTER the material so they win.
        // For a card that paints a surface of its own inside the plate:
        // energy-sources-table fills its whole table and header row with
        // --card-background-color, a solid grey slab over the glass. That
        // variable is NOT in the material because the date picker's dropdown
        // reads the same one, and a transparent menu over a chart is unreadable.
        var extra = cfg.vars || {};
        Object.keys(extra).forEach(function (k) {
          el.style.setProperty(k.slice(0, 2) === '--' ? k : '--' + k, String(extra[k]));
        });
        self._child = el;
        self._e.appendChild(el);
        if (self._hass) el.hass = self._hass;
      };
      if (window.loadCardHelpers) {
        var make = function () {
          return window.loadCardHelpers().then(function (h) {
            try {
              dress(h.createCardElement(cfg.card));
            } catch (e) {
              console.error('[hk-frame] could not create', cfg.card, e);
            }
          });
        };
        if (cfg.module) {
          loadModule(cfg.module, cfg.card.type).then(make, function (e) {
            console.error('[hk-frame] module failed', cfg.module, e);
            make();                     // HA then shows its own error card
          });
        } else {
          make();
        }
        return;
      }
      // No helpers (an older core): our own cards still work by tag.
      var C = window.hkCards;
      var own = (C && C.create) ? C.create(cfg.card) : null;
      if (own) dress(own);
    }

    _render() {
      var cfg = this._config;
      if (!this._built) {
        this._root.innerHTML = '<div class="frame" data-hk-role="card"></div>';
        this._e = this._root.querySelector('.frame');
        if (cfg.margin) this._e.style.margin = cfg.margin;
        this._built = true;
        this._build();
      }
    }
  }

  // -------------------------------------------------------- hk-spacer
  //
  // NOTHING, at a given height. A Lovelace view is a list of cards and has no
  // way to say "leave a gap here". This is the knob for
  // how far apart two blocks sit; a margin on the block above is not, because
  // that margin belongs to the block and travels with it everywhere else it
  // is used.
  class HkSpacerCard extends HkBase {
    static get CSS() {
      return ['ha-card.spacer{display:block;background:none;box-shadow:none;',
              '  border:none;padding:0;margin:0}'].join('');
    }
    setConfig(config) { super.setConfig(config || {}); }
    getCardSize() { return 1; }
    _sigOf() { return 'static'; }
    _render() {
      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="spacer" data-hk-role="card" aria-hidden="true"></ha-card>';
        this._e = this._root.querySelector('.spacer');
        this._built = true;
      }
      this._e.style.height = this._config.height || '16px';
    }
  }

  // ------------------------------------------------------------ hk-back
  // A 44px circle with a chevron in it. One instance, included by every
  // subview, and it knows ONE thing the browser's own back does not: which
  // page is a page's parent.
  //
  // Most subviews hang directly off the chip row, so "up" is the dashboard.
  // `music-browse` does not -- it is reached only from Play Music, so backing
  // out to the dashboard would skip a level and drop you two pages from where
  // you started. A page reached from another page adds one line to `parents`.
  // THE ROUND GLASS BUTTON, shared by the back chevron and the menu button
  // beside it (and hk-menu-button-card): one plate, one press, one size.
  var ROUND_CSS = [
    // THE SAME GLASS AS THE CHIPS, blur and all. M.glass is the
    // plate and the marker that cuts the shared blur to this circle;
    // the chip shadow because it is chip-sized.
    'ha-card.back{width:44px;height:44px;border-radius:50%;padding:0;margin:0;flex:none;',
    '  ' + M.glass + ';border:' + M.border + ';',
    '  box-shadow:var(--hk-glass-shadow-chip,inset 0 1px 0 rgba(255,255,255,0.20),0 6px 18px rgba(0,0,0,0.10));',
    '  display:flex;align-items:center;justify-content:center;line-height:0;',
    '  cursor:pointer;color:rgba(255,255,255,0.92);',
    '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0;',
    '  transition:transform .12s ease}',
    'ha-card.back:active{transform:scale(0.97);filter:brightness(0.93)}',
    // The menu glyph at the chevron's optical size: an SF glyph fills its
    // 24 box to 21, so 20px here draws it as wide as the 20px chevron.
    'ha-card.back ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex}',
    // MENU, BACK, TITLE: 20px between each, so a tap meant for one does not
    // land on its neighbour. The title's 20 is the page's own grid gap.
    '.pair{display:flex;align-items:center;gap:20px}'
  ].join('');
  // The menu's state (hk-base.js). The first load after an update can pair
  // this file with the previous hk-base.js from the service worker's cache,
  // which has no menu: then there is no menu for that load, rather than a
  // back button that throws.
  var NO_MENU = { sig: function () { return ''; }, style: function () { return null; },
                  icon: function () { return ''; }, toggle: function () {} };
  function menu() { return (C && C.menu && C.menu.sig) ? C.menu : NO_MENU; }
  function roundMenu() {
    return '<ha-card class="back menu" data-hk-role="menu" role="button" aria-label="Menu">' +
      '<ha-icon icon="' + menu().icon() + '"></ha-icon></ha-card>';
  }

  // A card that drew the round menu button, attached again (a cached view
  // coming back redraws nothing): hand it back to the menu's list.
  function chipBack(card) {
    var m = card._built && card._root && card._root.querySelector && card._root.querySelector('[data-hk-role="menu"]');
    if (m && menu().chipShown) menu().chipShown(card);
  }

  class HkBackCard extends HkBase {
    static get CSS() { return ROUND_CSS; }
    getCardSize() { return 1; }
    // Depends on the URL and the menu's state, not on hass: the menu button
    // beside the chevron comes and goes with the menu's settings.
    _sigOf() { return 'menu=' + menu().sig(); }
    connectedCallback() { super.connectedCallback(); chipBack(this); }
    disconnectedCallback() { super.disconnectedCallback(); if (menu().chipGone) menu().chipGone(this); }
    _render() {
      // THE MENU BUTTON RIDES HERE on a dashboard whose menu uses the round
      // button (hk-base.js menu.style): every sub-page has this card, so the
      // menu is always one tap away, in the same place as the Home page's
      // chip. With the edge tab, or no menu, the chevron is alone -- exactly
      // as on a dashboard without the menu.
      var withMenu = menu().round ? menu().round('page') : menu().style() === 'chip';
      var icon = withMenu ? menu().icon() : '';
      if (this._built && this._menuWas === withMenu && this._iconWas === icon) return;
      this._menuWas = withMenu;
      this._iconWas = icon;
      // The chevron is drawn, not iconised: at 44px an mdi glyph's own padding
      // makes it read small and off-centre, and this stroke weight (2.6) was
      // matched to the 19.7px headings it sits beside.
      var back =
        '<ha-card class="back" data-hk-role="card" role="button" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"' +
        ' stroke="rgba(255, 255, 255, 0.92)" stroke-width="2.6"' +
        ' stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M15 4.5 L7.5 12 L15 19.5"/></svg></ha-card>';
      this._root.innerHTML = withMenu ? '<div class="pair">' + roundMenu() + back + '</div>' : back;
      this._root.querySelector('[data-hk-role="card"]')
          .addEventListener('click', this._up.bind(this));
      var m = this._root.querySelector('[data-hk-role="menu"]');
      if (m) m.addEventListener('click', function (e) { e.stopPropagation(); menu().toggle(); });
      if (m && menu().chipShown) menu().chipShown(this);
      this._built = true;
    }
    // A PAGE WITH DEPTH OF ITS OWN GETS FIRST REFUSAL.
    //
    // Browse Music is a browser: you can be three levels into the library on
    // a page whose "up" is Play Music. Backing out to the parent there would
    // leave the page entirely, skipping every level you had opened.
    //
    // The answer is NOT history.back(): on a wall tablet, "back always lands
    // on the room" cannot strand you mid-history, and history.back() can.
    //
    // So the press is OFFERED first, as a cancelable event. A card with
    // somewhere to go internally calls preventDefault() and handles it; every
    // other page is untouched and still backs out to its parent.
    // One control, two meanings, and the page that knows decides.
    _up() {
      var ev = new CustomEvent('hk-back', { cancelable: true, detail: {
        path: String(location.pathname) } });
      window.dispatchEvent(ev);
      if (ev.defaultPrevented) return;
      var parents = this._config.parents || {};
      var seg = String(location.pathname).split('/');
      var up = parents[seg[2] || ''];
      var path = '/' + seg[1] + (up ? '/' + up : '');
      history.pushState(null, '', path);
      window.dispatchEvent(new CustomEvent('location-changed'));
    }
  }

  // ------------------------------------------------------------- hk-menu-button
  //
  // THE MENU CHIP: a round glass button that opens the menu of pages and
  // rooms (modules/hk-menu.js). Usually the chip row's `lead:` -- pinned at
  // its start while the chips scroll -- and anywhere else a dashboard wants
  // one. It draws ONLY when this dashboard's menu uses the round button
  // (hk-base.js menu.style: chip); otherwise it takes no space at all, so a
  // shared chip row carries it on every dashboard and changes nothing on the
  // ones without the menu. Its presence on a Home view is also what makes
  // Automatic choose the chip over the edge tab.
  class HkMenuButtonCard extends HkBase {
    static get CSS() { return ':host{display:block}:host([hidden]){display:none}' + ROUND_CSS; }
    getCardSize() { return 1; }
    _sigOf() { return 'menu=' + menu().sig(); }
    connectedCallback() { super.connectedCallback(); chipBack(this); }
    disconnectedCallback() { super.disconnectedCallback(); if (menu().chipGone) menu().chipGone(this); }
    _render() {
      var show = menu().round ? menu().round('home') : menu().style() === 'chip';
      var icon = show ? menu().icon() : '';
      if (this._built && this._showWas === show && this._iconWas === icon) return;
      this._showWas = show;
      this._iconWas = icon;
      this.toggleAttribute('hidden', !show);
      this._root.innerHTML = show ? roundMenu() : '';
      var m = this._root.querySelector('[data-hk-role="menu"]');
      if (m) m.addEventListener('click', function (e) { e.stopPropagation(); menu().toggle(); });
      if (m && menu().chipShown) menu().chipShown(this);
      this._built = true;
    }
  }

  // ------------------------------------------------------------- hk-key
  //
  // A FLAT KEY: one plate, and on it either a glyph or a word, with no state
  // of its own. A key reads no entity except to name a service target.
  //
  // ONE CARD FOR BOTH because they differ only in their plate and their
  // payload, and a key that looks different is still a key. Three variants:
  //
  //   flat    rgba white 0.10, no border, no rim -- the four vacuum controls,
  //           which sit INSIDE a card and must not read as cards themselves
  //   glass   the house glass material with its lit top rim -- the six
  //           free-standing duration chips
  //   filled  a solid tint with dark ink -- the one "+ New Timer" call to
  //           action, which has to out-rank the six chips beside it
  //
  // Not a tile subclass: a tile is an accessory with a state, a well and an
  // on/off material, and every one of those would be dead weight here.
  class HkKeyCard extends HkBase {
    static get CSS() {
      return [
        'ha-card.key{display:flex;align-items:center;justify-content:center;',
        '  box-sizing:border-box;cursor:pointer;overflow:hidden;',
        '  transition:background-color .25s ease,transform .12s ease;',
        '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
        'ha-card.key:active{transform:scale(0.97);filter:brightness(0.93)}',
        // ---- flat: the controls inside a vacuum card
        'ha-card.key.flat{height:52px;border-radius:18px;padding:0;border:none;',
        '  box-shadow:none;background:rgba(255,255,255,0.10)}',
        'ha-card.key.flat .icon{width:23px;height:23px;color:rgba(255,255,255,0.90)}',
        // ---- glass: the free-standing duration chips
        // 116x56 and a 20px radius: wider and flatter than the 52px controls
        // above, because a row of NINE 52px squares reads as a keypad, which
        // is the wrong idea -- these are not digits you combine.
        'ha-card.key.glass{height:56px;width:116px;border-radius:20px;padding:0;',
        '  ' + window.hkCards.M.glass + ';',
        '  border:' + window.hkCards.M.border + ';',
        '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 6px 18px rgba(0,0,0,0.10)}',
        'ha-card.key.filled{height:56px;width:116px;border-radius:20px;padding:0;',
        '  border:none;box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),',
        '  0 6px 18px rgba(0,0,0,0.10)}',
        '.key .name{font-size:17px;font-weight:600;letter-spacing:-0.4px;',
        '  color:rgba(255,255,255,0.92);white-space:nowrap}',
        'ha-card.key.filled .name{color:rgba(0,0,0,0.88);font-weight:700}',
        // PHONE: FILL THE TRACK. The Timers row auto-fills ~118px columns
        // below 640px and a 184px "+ New Timer" would overflow its column,
        // printing on top of the "5 min" chip beside it. Same shape as the
        // pills: calc(100% + 8px) restores layout-card's 4px side margins.
        '@media (max-width:640px){',
        '  :host{max-width:none !important}',
        '  ha-card.key.glass,ha-card.key.filled{',
        '    width:calc(100% + var(--hk-cell-bleed,8px)) !important;',
        '    min-width:0 !important;max-width:none !important}',
        '}'
      ].join('');
    }
    setConfig(config) {
      if (!config || (!config.icon && !config.name)) {
        throw new Error('hk-key: one of `icon` or `name` is required');
      }
      super.setConfig(config);
    }
    getCardSize() { return 1; }
    // A key has no state -- it never needs a re-render from hass at all.
    _sigOf() { return 'static'; }
    _render() {
      var cfg = this._config;
      if (!this._built) {
        var variant = ['flat', 'glass', 'filled'].indexOf(cfg.variant) >= 0
          ? cfg.variant : 'glass';
        this._root.innerHTML =
          '<ha-card class="key ' + variant + '" data-hk-role="card">' +
          (cfg.icon ? '<ha-state-icon class="icon" data-hk-role="icon"></ha-state-icon>'
                    : '<div class="name" data-hk-role="name"></div>') +
          '</ha-card>';
        this._e = {
          card: this._root.querySelector('.key'),
          icon: this._root.querySelector('.icon'),
          name: this._root.querySelector('.name')
        };
        this._bind(this._e.card, 'tap_action', null);
        this._built = true;
      }
      var e = this._e;
      if (cfg.width) e.card.style.width = cfg.width;
      if (cfg.fill) e.card.style.background = cfg.fill;
      if (e.icon) {
        e.icon.icon = cfg.icon;
        if (this._hass) e.icon.hass = this._hass;
        if (cfg.icon_color) e.icon.style.color = cfg.icon_color;
      }
      if (e.name && e.name.textContent !== cfg.name) e.name.textContent = cfg.name;
    }
  }

  // --------------------------------------------------------- hk-info-card
  //
  // The two big blocks at the top of the Tesla dashboard: the house
  // temperature and the security summary. An icon, a headline, two label
  // lines, and an icon tint that carries the actual signal.
  //
  // BOTH READINGS ARE ONE CALCULATION EACH, SHARED WITH THE WALL HEADER.
  // A private copy of the entity lists drifts from modules/hk-header.js --
  // missing the window checks, or returning "Home Secure" whenever the
  // counters sum to zero, which an EMPTY state map also does. Every id lives
  // once, in hkHeader's SECURITY_* lists, and this card asks hkHeader.status().
  class HkInfoCard extends HkBase {
    static get CSS() {
      return [
        // No plate at all -- these sit on the Tesla's own background. The
        // three stacked drop-shadows are what makes them legible over it.
        'ha-card.info{box-sizing:border-box;display:block;height:108px;',
        '  border-radius:0;padding:12px;background:none;border:none;box-shadow:none;',
        '  cursor:pointer;',
        '  filter:drop-shadow(0px 1px 3px rgba(0,0,0,0.30))',
        '    drop-shadow(0px 3px 12px rgba(0,0,0,0.28))',
        '    drop-shadow(0px 6px 26px rgba(0,0,0,0.30));',
        '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
        '.info .grid{display:grid;grid-template-areas:"i n" "i l";',
        '  grid-template-columns:52px minmax(0,1fr);',
        '  grid-template-rows:min-content min-content;',
        '  column-gap:12px;align-content:start;justify-items:start}',
        '.info .icon{grid-area:i;width:34px;height:34px;--mdc-icon-size:34px;',
        '  color:rgba(255,255,255,0.92);align-self:start;justify-self:center;',
        '  margin-top:2px}',
        '.info .name{grid-area:n;justify-self:start;align-self:end;text-align:left;',
        '  font-weight:600;font-size:26px;letter-spacing:0.3px;',
        '  color:rgba(255,255,255,0.95);line-height:1.02;width:100%}',
        '.info .label{grid-area:l;justify-self:start;align-self:start;text-align:left;',
        '  font-weight:600;font-size:14px;letter-spacing:-0.34px;',
        '  color:rgba(255,255,255,0.72);line-height:1.1;width:100%}',
        // Two lines, each clipped on its own. A single wrapping block would
        // let one long alarm string push the other line out of the card.
        '.info .label span{display:block;white-space:nowrap;overflow:hidden;',
        '  text-overflow:ellipsis;text-align:left}',
        // ---- the `state` variant: the same shape reading ONE entity, so it
        // needs no computation and no shadow -- it sits on a glass sheet
        // rather than on the Tesla's photographic background.
        //
        // ON THE PILLS' COLUMNS, or the whole block seems to push to the
        // right. It sits over the Locks, whose pills put their icon well at
        // 15.3 px in (layout-card's 4 px child margin, the pill's 1 px border
        // and its 10.3 px padding),
        // 42 px wide, and their names 10 px after it. 18 px of padding and a
        // 54 px column would put the shield 12 px right of the lock icons and
        // "Disarmed" 20 px right of their names; this centres the shield on
        // the lock icons' column and starts the words where their names do.
        'ha-card.info.state{height:104px;border-radius:24px;padding:16px 18px 16px 15.3px;',
        '  filter:none}',
        '.info.state .grid{grid-template-columns:42px 1fr;column-gap:10px;',
        '  align-items:center;align-content:center}',
        '.info.state .icon{width:38px;height:38px;--mdc-icon-size:38px;',
        '  align-self:center;justify-self:center;margin-top:0}',
        '.info.state .name{font-size:25px;font-weight:700;letter-spacing:0.14px;',
        '  align-self:center;color:rgba(255,255,255,0.96)}',
        '.info.state .label{font-size:14px;font-weight:400;letter-spacing:-0.15px;',
        '  color:rgba(255,255,255,0.58);padding-top:4px}'
      ].join('');
    }
    setConfig(config) {
      if (!config || ['climate', 'security', 'state'].indexOf(config.variant) < 0) {
        throw new Error('hk-info: `variant` must be climate, security or state');
      }
      if (config.variant === 'state' && !config.entity) {
        throw new Error('hk-info: variant `state` needs an `entity`');
      }
      super.setConfig(config);
    }
    getCardSize() { return 2; }

    // `state` reads ONE entity and `climate` three, all named in the config,
    // so both gate like any other card. `security` calls hkHeader.status(),
    // which reads a list of entities this config does not name, so no
    // signature could describe it honestly -- null means "always render",
    // the safe answer, and a dashboard rarely has more than one.
    _sigOf() {
      var c = this._config, h = this._hass;
      if (!c || !h) return null;
      if (c.variant === 'state') return HkBase.prototype._sigOf.call(this);
      if (c.variant !== 'climate') return null;
      var ids = [c.temperature, c.downstairs, c.upstairs], out = '';
      for (var i = 0; i < ids.length; i++) {
        var s = ids[i] && h.states[ids[i]];
        out += (ids[i] || '-') + '=' + (s ? s.last_updated : 'x') + ';';
      }
      return out;
    }

    _num(id) {
      var s = id && this._st(id);
      var n = parseFloat(s && s.state);
      return isNaN(n) ? null : n;
    }
    _action(id) {
      var s = id && this._st(id);
      return (s && s.attributes && s.attributes.hvac_action) || null;
    }

    // ---- climate: the house temperature, and what the two systems are doing.
    _climate() {
      var cfg = this._config;
      var temp = this._num(cfg.temperature);
      var down = this._action(cfg.downstairs), up = this._action(cfg.upstairs);
      var dc = down === 'cooling', uc = up === 'cooling';
      var dh = down === 'heating', uh = up === 'heating';
      var act = 'Idle';
      if (dc && uc) act = 'Cooling Both';
      else if (dc) act = 'Cooling Down';
      else if (uc) act = 'Cooling Up';
      else if (dh && uh) act = 'Heating Both';
      else if (dh) act = 'Heating Down';
      else if (uh) act = 'Heating Up';
      // THE SENSOR'S OWN UNIT, and the comfort band in it: 66-74 °F unless
      // the card says otherwise (cool_below / warm_above), 19-23 in °C.
      var tst = cfg.temperature && this._st(cfg.temperature);
      var unit = (tst && tst.attributes && tst.attributes.unit_of_measurement) || '°F';
      var celsius = /C$/.test(unit);
      var cool = cfg.cool_below != null ? Number(cfg.cool_below) : (celsius ? 19 : 66);
      var warm = cfg.warm_above != null ? Number(cfg.warm_above) : (celsius ? 23 : 74);
      var colour;
      if (dc || uc) colour = 'rgba(33, 150, 243, 0.98)';
      else if (dh || uh) colour = 'rgba(244, 67, 54, 0.98)';
      else if (temp === null) colour = 'var(--kiosk-text)';
      else if (temp <= cool) colour = 'rgba(33, 150, 243, 0.98)';
      else if (temp >= warm) colour = 'rgba(244, 67, 54, 0.98)';
      else colour = 'rgba(76, 175, 80, 0.98)';
      return {
        name: temp === null ? 'House' : (Math.round(temp) + unit),
        lines: ['Temperature', act],
        colour: colour
      };
    }

    // ---- security: shut, locked, and the garage.
    _security() {
      // NO STATES YET IS THE NORMAL FIRST RENDER. setConfig() renders before
      // Lovelace assigns hass, and hkHeader.status(null) throws -- which HA
      // catches by replacing the whole card with a permanent error card, so
      // the block would never appear at all. Guard on the states object, not
      // just on hkHeader.
      var st = this._hass && this._hass.states;
      var s = (st && window.hkHeader) ? window.hkHeader.status(st) : null;
      // No hkHeader is not "all clear" -- it is "cannot tell", and this card
      // says so rather than reading "Home Secure" for an empty map.
      if (!s) {
        return { name: 'Check Home', lines: ['Unknown', 'Garage Unknown'],
                 colour: 'rgba(244, 67, 54, 0.98)' };
      }
      var titleCase = function (v) {
        if (!v || v === 'unknown' || v === 'unavailable') return 'Unknown';
        return String(v).replace(/_/g, ' ').split(' ').map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
      };
      var alarm = s.alarmRaw || 'unknown';
      var unlocked = s.unlocked || 0;
      var gd = this._st(this._config.garage);
      var garage = (gd && gd.state) || 'unknown';
      var lockText = unlocked > 0
        ? (unlocked + ' Lock' + (unlocked === 1 ? '' : 's'))
        : 'All Locked';
      var garageText = garage === 'open' ? 'Garage Open'
                     : garage === 'opening' ? 'Garage Opening'
                     : garage === 'closing' ? 'Garage Closing'
                     : garage === 'closed' ? 'Garage Closed'
                     : 'Garage Unknown';
      var garageOpen = ['open', 'opening', 'closing'].indexOf(garage) >= 0;
      // The headline means the house is physically SHUT -- not the wall's
      // "armed and clear" -- so the ordinary disarmed-but-closed reading is
      // unchanged. The alarm state is on the label line and is not lost.
      //
      // s.alert covers doors AND windows, and s.unusable is the honest part:
      // an icon that stays calm because its sensors are dead tells the same
      // lie as "Home Secure" for an empty map.
      var bad = unlocked > 0 || garageOpen || s.alert || s.unusable > 0;
      var armed = ['armed_home', 'armed_away', 'armed_night', 'armed_vacation']
                    .indexOf(alarm) >= 0;
      return {
        name: (s.alert || s.unusable > 0) ? 'Check Home' : 'Home Secure',
        // No garage configured, no garage line (not "Garage Unknown").
        lines: [titleCase(alarm) + ' • ' + lockText].concat(this._config.garage ? [garageText] : []),
        colour: bad ? 'rgba(244, 67, 54, 0.98)'
              : armed ? 'rgba(76, 175, 80, 0.98)' : 'rgba(33, 150, 243, 0.98)'
      };
    }

    // ---- state: one entity, title-cased, with declarative glyph and tint
    // maps. No computation at all.
    _state() {
      var cfg = this._config, st = this._st(cfg.entity);
      var v = (st && st.state) || 'unknown';
      var title = String(v).replace(/_/g, ' ').split(' ').map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join(' ');
      var pickFrom = function (map, dflt) {
        if (!map) return dflt;
        if (Object.prototype.hasOwnProperty.call(map, v)) return map[v];
        // `armed_*` is four states that share a glyph and a tint, so a prefix
        // entry earns its keep rather than four near-identical rows.
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (k.slice(-1) === '*' && v.indexOf(k.slice(0, -1)) === 0) return map[k];
        }
        return map['default'] != null ? map['default'] : dflt;
      };
      return {
        name: cfg.name || title,
        lines: [cfg.label || '', ''],
        icon: pickFrom(cfg.icon_states, cfg.icon),
        colour: pickFrom(cfg.icon_colors, 'rgba(255,255,255,0.75)')
      };
    }

    _render() {
      var cfg = this._config;
      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="info' + (cfg.variant === 'state' ? ' state' : '') +
          '" data-hk-role="card"><div class="grid">' +
          '<ha-icon class="icon" data-hk-role="icon"></ha-icon>' +
          '<div class="name" data-hk-role="name"></div>' +
          '<div class="label" data-hk-role="label">' +
          '<span data-hk-role="l1"></span><span data-hk-role="l2"></span></div>' +
          '</div></ha-card>';
        var q = this._root.querySelector.bind(this._root);
        this._e = { card: q('.info'), icon: q('.icon'), name: q('.name'),
                    l1: q('[data-hk-role="l1"]'), l2: q('[data-hk-role="l2"]') };
        this._bind(this._e.card, 'tap_action', null);
        this._built = true;
      }
      var e = this._e;
      var r = cfg.variant === 'climate' ? this._climate()
            : cfg.variant === 'state' ? this._state() : this._security();
      var ic = r.icon || cfg.icon;
      if (ic) e.icon.icon = ic;
      e.icon.style.color = r.colour;
      if (e.name.textContent !== r.name) e.name.textContent = r.name;
      if (e.l1.textContent !== r.lines[0]) e.l1.textContent = r.lines[0];
      if (e.l2.textContent !== r.lines[1]) e.l2.textContent = r.lines[1];
    }
  }

  register('hk-frame-card', HkFrameCard, 'HK Frame',
    'Wraps any Home Assistant card in the HK glass background.',
    C && [
      { name: 'card', required: true, selector: { object: {} } },
      C.section('Appearance', [
        { type: 'grid', name: '', schema: [
          { name: 'material', selector: C.selOptions(['glass', 'none']) },
          { name: 'margin', selector: { text: {} } },
          { name: 'phone', selector: C.selOptions(['hide']),
            helper: 'hide: leave this card out of the layout below 640px.' }
        ] }
      ], 'mdi:palette')
    ],
    function () { return { card: { type: 'energy-usage-graph' } }; });

  register('hk-spacer-card', HkSpacerCard, 'HK Spacer',
    'Empty space of a set height, to separate rows.',
    C && [{ name: 'height', selector: { text: {} }, helper: 'CSS height, e.g. 16px.' }],
    function () { return { height: '16px' }; });

  register('hk-back-card', HkBackCard, 'HK Back Button',
    'A round back button for a sub-page; returns to the page above it.',
    C && [{ name: 'parents', selector: { object: {} } }],
    function () { return {}; });

  // No options of its own: when it draws, and with which glyph, are the menu's
  // settings. The one editor field is the standard `glass` opt-out.
  register('hk-menu-button-card', HkMenuButtonCard, 'HK Menu Button',
    'Opens the menu of pages and rooms. Draws only on a dashboard with the menu turned on (HK Frontend → Configure → Menu and room pages); put it in a chip row as its lead.',
    C && [{ name: 'glass', selector: { boolean: {} },
            helper: 'Off: leave this button out of the shared blur (Glass look: Blur).' }],
    function () { return {}; });

  register('hk-key-card', HkKeyCard, 'HK Button',
    'A plain button showing an icon or a word, which runs an action when tapped.',
    C && [
      { type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} }, helper: 'Text on the button. Use this or an icon.' },
        { name: 'icon', selector: { icon: {} } }
      ] },
      C.section('Appearance', [
        { type: 'grid', name: '', schema: [
          { name: 'variant', selector: C.selOptions(['glass', 'flat', 'filled']) },
          { name: 'icon_color', selector: C.selColour() },
          { name: 'fill', selector: { text: {} } },
          { name: 'width', selector: { text: {} } }
        ] }
      ], 'mdi:palette'),
      C.section('Interactions', [
        { name: 'tap_action', selector: { ui_action: {} } }
      ], 'mdi:gesture-tap', true)
    ],
    function () { return { name: '15 min', variant: 'glass' }; });

  register('hk-info-card', HkInfoCard, 'HK Info Block',
    'A large icon with a title and two lines: the house climate, its security, or any entity\'s state.',
    C && [
      { name: 'variant', required: true, label: 'Type',
        helper: 'Climate and Security summarize the house; Entity state shows one entity.',
        selector: C.selOptions([['climate', 'Climate'], ['security', 'Security'], ['state', 'Entity state']]) },
      { type: 'grid', name: '', schema: [
        { name: 'name', label: 'Title', helper: 'Entity state type: leave empty to show the state.', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } }
      ] },
      C.section('Entity state', [
        { name: 'entity', selector: { entity: {} } },
        { name: 'label', label: 'Line under the title', helper: '', selector: { text: {} } },
        { name: 'icon_states', selector: { object: {} } },
        { name: 'icon_colors', selector: { object: {} } }
      ], 'mdi:information-outline'),
      C.section('Climate and security', [
        { type: 'grid', name: '', schema: [
          { name: 'temperature', selector: { entity: { filter: { domain: 'sensor' } } } },
          { name: 'downstairs', selector: { entity: { filter: { domain: 'climate' } } } },
          { name: 'upstairs', selector: { entity: { filter: { domain: 'climate' } } } },
          { name: 'garage', selector: { entity: { filter: { domain: 'cover' } } } }
        ] }
      ], 'mdi:home-thermometer'),
      C.section('Interactions', [
        { name: 'tap_action', selector: { ui_action: {} } }
      ], 'mdi:gesture-tap')
    ],
    function (hass) { return { variant: 'security', icon: 'mdi:shield-home',
                               garage: firstOf(hass, 'cover') }; });

  // ---------------------------------------------------------------------
  // hk-grid-card -- the grid host, owned here.
  //
  // A drop-in for layout-card. This is a DELIBERATE REPRODUCTION, not
  // an improvement: it copies layout-card's `custom:grid-layout` geometry
  // exactly, including the parts that are arguably wrong, because every
  // measured constant in this frontend -- the 82px rows, the 9/11/17/19px
  // paddings, the section spacing that lands on 31px -- is tuned against
  // those parts. Reproducing them keeps all of it valid and makes the swap
  // mechanical. Changing any of it belongs in a SEPARATE step where each
  // moved number can be seen on its own.
  //
  // THE CONTRACT, read off the running page rather than the minified source
  // (reading the source alone gets the padding wrong):
  //
  //     #root      display:grid
  //                margin  <- layout.margin, default 0px 4px 0px 4px
  //                padding <- layout.padding
  //                every grid-* / place-* property from `layout`
  //     #root > *  margin: 4px 4px 8px
  //     host       display: block
  //
  // THE HOST IS A BLOCK BOX, stated here rather than inherited. layout-card
  // never gave `grid-layout` a display, so it fell to `inline` for an unknown
  // element -- an inline box containing block content, which Safari and Blink
  // measure differently, which makes every section creep down 6px per
  // tap. A host that says `display: block` itself cannot have that bug.
  //
  // `4px 4px 8px` IS NOT A CHOICE. It is layout-card's hardcoded child margin
  // (`var(--masonry-view-card-margin, 4px 4px 8px)`), it cannot be configured
  // away there, and every alignment in this frontend is achieved by matching
  // nesting depth against it. It is reproduced verbatim; do not "clean it
  // up".
  class HkGridCard extends HkBase {
    setConfig(config) {
      var cfg = Object.assign({}, config || {});
      cfg.layout = Object.assign({}, cfg.layout || {});
      cfg.cards = cfg.cards || [];
      this._config = cfg;
      // The editor reuses one element. Remove the previous grid before the
      // base class rebuilds, otherwise every edit appends another style/root
      // pair and leaves the old child cards alive behind the preview.
      this._root.innerHTML = '';
      this._kids = [];
      this._e = null;
      super.setConfig(cfg);
    }
    // The children gate their own renders; this frame has no state.
    _sigOf() { return 'static'; }
    getCardSize() { return 6; }

    set hass(h) {
      super.hass = h;
      var kids = this._kids || [];
      for (var i = 0; i < kids.length; i++) kids[i].hass = h;
    }
    get hass() { return this._hass; }

    // Only grid-* and place-* reach the grid, matching layout-card. Anything
    // else in `layout` is handled explicitly above or ignored, and ignoring it
    // is part of the reproduction: `card_margin`, `justify-content` and
    // `align-items` are silently dropped by layout-card too, and several
    // configs in this repository still carry them.
    _applyLayout(root) {
      var L = this._config.layout || {};
      root.style.cssText = '';
      root.style.display = 'grid';
      root.style.margin = L.margin != null ? L.margin : '0px 4px 0px 4px';
      // A grid that bleeds sideways (`margin: … -22px`, the shadow room of
      // the scroll row it wraps) publishes that bleed, and the phone rule in
      // _render clamps it to the gutter -- see hk-row.js for the whole story.
      var b = window.hkCards.bleedSides(L.margin);
      root.classList.toggle('hk-bleed', !!b);
      root.style.setProperty('--hk-bleed-l', b ? b.l + 'px' : '0px');
      root.style.setProperty('--hk-bleed-r', b ? b.r + 'px' : '0px');
      if (L.padding != null) root.style.padding = L.padding;
      Object.keys(L).forEach(function (k) {
        if (k.indexOf('grid') === 0 || k === 'place-items' || k === 'place-content') {
          root.style.setProperty(k, L[k]);
        }
      });
    }

    _render() {
      if (this._built) return;
      this._built = true;
      var self = this, cfg = this._config;

      // A STACKED GRID COLLAPSES ITS MARGINS AGAINST ITS NEIGHBOURS.
      //
      // layout-card carries BOTH of these on its own element, and they are the
      // whole reason stacked grids do not accumulate space:
      //
      //     :host(:not(:first-child)) { margin-top: 0 !important }
      //     :host(:not(:last-child))  { margin-bottom: 0 !important }
      //
      // Without them every view with stacked grids -- climate, energy,
      // weather, vacuums, timers -- grows, and grows CUMULATIVELY down the
      // page, while the plain tile pages stay clean: on the climate page most
      // grids are not the first child, and each would keep margin-top 4px
      // where layout-card gives 0.
      //
      // BOTH rules, not the first alone: with only the first, the climate
      // page still comes out ~110px too tall. They sit side by side in
      // layout-card's style block -- take the whole block, not the rule you
      // went looking for.
      //
      // `!important` is not decoration. The parent grid writes
      // `margin: 4px 4px 8px` as an INLINE style on each child, and only an
      // important declaration outranks an inline one -- which is exactly why
      // layout-card wrote them this way.
      // THE CHILD MARGIN IS A RULE, NOT AN INLINE STYLE, and that distinction
      // is the whole contract -- not a detail of how it is written.
      //
      // layout-card sets `#root > * { margin: 4px 4px 8px }` as CSS, so a card
      // that sets its OWN margin inline overrides it. Several do: a chips
      // row is `custom:hk-row-card` with
      // `margin: -14px -22px -26px -22px`, deliberately negative so it bleeds
      // past the column.
      //
      // Writing the same value inline instead INVERTS that relationship: the
      // grid's margin wins, the row's -22px sides are discarded, and it comes
      // out 26px right and 52px narrower, with everything below pushed down
      // 52px. Same numbers, opposite precedence.
      //
      // Reproduce the MECHANISM, not just the value.
      var st = document.createElement('style');
      st.textContent = ':host(:not(:first-child)){margin-top:0 !important}' +
                       ':host(:not(:last-child)){margin-bottom:0 !important}' +
                       '#root>*{margin:4px 4px 8px}' +
                       // The sideways bleed may not pass the screen edge -- at
                       // every width (an upright iPad mini's
                       // gutter is 18.9 px); where the gutter is wider the
                       // clamp is the bleed and nothing moves.
                       '#root.hk-bleed{' +
                       '--hk-bleed-lc:min(var(--hk-bleed-l,0px),var(--hk-gutter,calc((100vw - var(--hk-page-left,0px)) * 0.02 + 4px)));' +
                       '--hk-bleed-rc:min(var(--hk-bleed-r,0px),var(--hk-gutter,calc((100vw - var(--hk-page-left,0px)) * 0.02 + 4px)));' +
                       'margin-left:calc(-1 * var(--hk-bleed-lc)) !important;' +
                       'margin-right:calc(-1 * var(--hk-bleed-rc)) !important}';
      this._root.appendChild(st);

      var root = document.createElement('div');
      root.id = 'root';
      this._applyLayout(root);
      this._root.appendChild(root);
      this._e = root;
      this._kids = [];

      if (!window.loadCardHelpers) {
        console.error('[hk-grid] loadCardHelpers is unavailable');
        return;
      }
      window.loadCardHelpers().then(function (helpers) {
        // The editor can replace the config while the helpers promise is in
        // flight; the frame card guards against the same thing.
        if (self._config !== cfg) return;
        cfg.cards.forEach(function (childCfg) {
          var el;
          try {
            el = helpers.createCardElement(childCfg);
          } catch (e) {
            console.error('[hk-grid] could not create', childCfg, e);
            return;
          }
          // No inline margin here: `#root > *` above supplies it, so a card
          // with its own margin still wins.
          //
          // `view_layout` is how a child places itself on the grid -- the same
          // key layout-card uses, so existing placements keep working
          // unchanged. Only grid-* / place-* are honoured, as there.
          var vl = childCfg.view_layout || {};
          Object.keys(vl).forEach(function (k) {
            if (k.indexOf('grid') === 0 || k.indexOf('place') === 0) {
              el.style.setProperty(k, vl[k]);
            }
          });
          root.appendChild(el);
          self._kids.push(el);
          if (self._hass) el.hass = self._hass;
        });
      });
    }
  }

  register('hk-grid-card', HkGridCard, 'HK Grid',
    'A CSS grid of cards. Replaces custom:layout-card / custom:grid-layout.',
    C && [
      { name: 'layout', selector: { object: {} } }
    ],
    function () { return { layout: { 'grid-template-columns': '1fr' }, cards: [] }; });

  // ---------------------------------------------------------------------
  // hk-grid-view -- the VIEW type, owned here.
  //
  // A drop-in for `type: custom:grid-layout`, which is layout-card's view
  // element -- the same `grid-layout` custom element it uses inside a card,
  // wearing its other hat. This replaces that hat.
  //
  // A VIEW IS A DIFFERENT CONTRACT FROM A CARD, and a simpler one: Home
  // Assistant builds the card elements itself and hands them over as
  // `.cards`, already carrying `hass`. There is no loadCardHelpers dance here.
  // What HA sets, in this order: setConfig(), then hass, lovelace, narrow,
  // index, cards, badges -- any of which can arrive more than once.
  //
  // THE PLACEMENT COMES FROM THE CONFIG, NOT THE ELEMENTS. `view_layout` is a
  // key on each card's CONFIG (most say `grid-column: '2'` to sit in
  // the 96% centre column), and a built element does not carry it. So the
  // config's cards array is matched to the element array by index, which is
  // the order HA builds them in.
  //
  // Geometry is reproduced exactly as in hk-grid-card: margin from
  // layout.margin, padding from layout.padding, grid-*/place-* forwarded, and
  // `margin: 4px 4px 8px` on every child. The view's own layout is the
  // 2% / 96% / 2% column grid every page is built on.
  class HkGridView extends HTMLElement {
    setConfig(config) {
      this._config = config || {};
      if (!this._sr) this._sr = this.attachShadow({ mode: 'open' });
      this._build();
      this._place();
    }
    // HA may set these before or after setConfig; none of them changes layout,
    // and the cards already have their own hass.
    set hass(h) { this._hass = h; }
    get hass() { return this._hass; }
    set lovelace(l) { this._lovelace = l; }
    get lovelace() { return this._lovelace; }
    set narrow(n) { this._narrow = n; }
    set index(i) { this._index = i; }
    set cards(c) { this._cards = c || []; this._place(); }
    get cards() { return this._cards || []; }
    set badges(b) { this._badges = b || []; this._place(); }
    get badges() { return this._badges || []; }

    _build() {
      if (this._root) return;
      // Same rule, same reason as hk-grid-card: a card that sets its own
      // margin must still win, which only holds if this is CSS rather than an
      // inline style.
      var st = document.createElement('style');
      st.textContent = '#root>*{margin:4px 4px 8px}';
      this._sr.appendChild(st);
      var root = document.createElement('div');
      root.id = 'root';
      this._sr.appendChild(root);
      this._root = root;
    }

    _applyLayout() {
      var L = (this._config && this._config.layout) || {};
      var root = this._root;
      if (!root) return;
      root.style.cssText = '';
      root.style.display = 'grid';
      root.style.margin = L.margin != null ? L.margin : '0px 4px 0px 4px';
      if (L.padding != null) root.style.padding = L.padding;
      Object.keys(L).forEach(function (k) {
        if (k.indexOf('grid') === 0 || k === 'place-items' || k === 'place-content') {
          root.style.setProperty(k, L[k]);
        }
      });
    }

    _place() {
      if (!this._root || !this._config) return;
      this._applyLayout();
      var root = this._root;

      // RECONCILE, NEVER EMPTY-AND-REFILL. HA sets `cards` and `badges`
      // separately and repeatedly while a view builds -- measured: five
      // _place() calls for ONE first visit. Emptying the root each time
      // would detach and re-attach every card on the page four times over, and
      // each detach runs the card's disconnectedCallback: camera timers stop
      // and restart, and every chart that has just asked hk-stats for data
      // is released from the fetch that would have woken it -- the Energy
      // page's charts then sit on "Loading" until their sensors next change.
      // A card that is already in the right place is not touched at all.
      //
      // Badges first, as HA's own views do. None of these dashboards uses
      // them, but a view that silently dropped them would be a trap.
      var want = (this._badges || []).concat(this._cards || []);
      var nb = (this._badges || []).length;
      var cfgCards = (this._config.cards || []);
      want.forEach(function (el, i) {
        if (i >= nb) {
          var vl = (cfgCards[i - nb] && cfgCards[i - nb].view_layout) || {};
          Object.keys(vl).forEach(function (k) {
            if (k.indexOf('grid') === 0 || k.indexOf('place') === 0) {
              el.style.setProperty(k, vl[k]);
            }
          });
        }
      });
      want = HkGridView.roomOrder(want, nb, cfgCards);
      want.forEach(function (el, i) {
        var at = root.childNodes[i] || null;
        if (at !== el) root.insertBefore(el, at);
      });
      while (root.childNodes.length > want.length) root.removeChild(root.lastChild);
      this._announce();
    }

    // `hk-view-ready` ON WINDOW: "this view is attached and its cards are in
    // it", once per attachment. It fires for a first build and again when HA
    // re-attaches a cached view, which is every return to a page already seen.
    //
    // The contract exists for hk-sky.js, which must repaint the background in
    // the same frame the new page appears -- not before (the new palette
    // behind the old page) and not after (the old palette behind the new one).
    // Polling the DOM for a swapped hui-view instead would need a ceiling
    // that a slow tablet's first build can outlast.
    //
    // Waits for the cards, not just for connection: HA can attach the view
    // before handing it `cards`, and an empty page is not the page. A view
    // configured with no cards at all announces on attach.
    connectedCallback() {
      if (super.connectedCallback) super.connectedCallback();
      // A settings change (the room order) re-places the cards -- in place,
      // as ever: only the room sections that move are moved.
      var self = this;
      if (!this._onReady) {
        this._onReady = function () { self._place(); };
        window.addEventListener('hk-module-ready', this._onReady);
      }
      this._announce();
    }
    disconnectedCallback() {
      if (super.disconnectedCallback) super.disconnectedCallback();
      if (this._onReady) { window.removeEventListener('hk-module-ready', this._onReady); this._onReady = null; }
      this._announced = false;
    }
    _announce() {
      if (this._announced || !this.isConnected || !this._config) return;
      var wantCards = (this._config.cards || []).length;
      if (wantCards && !(this._cards || []).length) return;
      this._announced = true;
      try {
        window.dispatchEvent(new CustomEvent('hk-view-ready', { detail: { view: this } }));
      } catch (e) {
        console.error('[hk-grid-view] hk-view-ready listener threw', e);
      }
    }
  }

  // ROOMS ON HOME IN THE ROOM ORDER (the dashboard item's "Rooms on Home":
  // in room order). A ROOM SECTION is a card whose first card is
  // a heading naming an area -- how the generated Home and a hand-built
  // one write a room. Only those
  // swap places, among the slots they already hold, by where their area
  // falls in the Room order; an area not in it keeps its place after the
  // ones that are. Everything else on the page stays exactly where it is.
  // "As the dashboard lists them" (the default) changes nothing.
  HkGridView.sectionArea = function (cfg) {
    var first = cfg && Array.isArray(cfg.cards) ? cfg.cards[0] : null;
    if (!first || first.type !== 'custom:hk-heading-card' || !first.area) return null;
    return [].concat(first.area)[0] || null;
  };
  HkGridView.roomOrder = function (want, nb, cfgCards) {
    var M = window.hkCards && window.hkCards.menu;
    var b = M && typeof M.board === 'function' ? M.board() : null;
    var how = b && b.home_rooms;
    var order = (how === 'order' || how === 'only') && Array.isArray(b.room_order) ? b.room_order : [];
    if (!order.length) return want;
    // "Only the rooms in the room order" (1.7): the others leave Home; their
    // pages stay.
    var only = how === 'only';
    var rank = {};
    order.forEach(function (a, i) { if (!(a in rank)) rank[a] = i; });
    var slots = [], rooms = [];
    want.forEach(function (el, i) {
      if (i < nb) return;
      var area = HkGridView.sectionArea(cfgCards[i - nb]);
      if (area === null) return;
      slots.push(i);
      rooms.push({ el: el, r: area in rank ? rank[area] : order.length, i: i });
    });
    if (rooms.length < 2 && !only) return want;
    rooms.sort(function (x, y) { return x.r - y.r || x.i - y.i; });
    var out = want.slice(), gone = [];
    slots.forEach(function (at, k) {
      if (only && rooms[k].r === order.length) { gone.push(at); out[at] = null; }
      else out[at] = rooms[k].el;
    });
    return gone.length ? out.filter(function (el) { return el !== null; }) : out;
  };

  if (!customElements.get('hk-grid-view')) {
    customElements.define('hk-grid-view', HkGridView);
  }

  window.hkLayout = { version: '1.0.0' };
  });
})();
