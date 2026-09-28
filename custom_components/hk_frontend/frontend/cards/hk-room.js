// hk-room.js -- a room page's STATUS ROW (hk-room-status-card).
//
// The line under a room's name in the Home app: "Temperature 71° · Humidity
// 46% · Outlet On · Blinds Open · 2 Fans On · 3 Windows Closed · Motion Not
// Detected · Occupancy None". NOT the home page's chip row -- the Home app
// draws a room's status differently: no plate, no
// border, no well: a bare white glyph and two lines of text straight on the
// sky. Temperature and humidity draw a ring open at the bottom with a dot at
// the reading; counts go in the title ("2 Fans"); an idle sensor is dimmed.
//
// EVERYTHING COMES FROM THE AREA (config `area:`, one or a list), so it names
// no house:
//   temperature, humidity  the AREA's own sensors -- Settings -> Areas -> the
//                          area -> Related sensors (area temperature_entity_id,
//                          humidity_entity_id); a card may name its own.
//   everything else        counted from the area's entities (their own area,
//                          else their device's), leaving out hidden, disabled
//                          and diagnostic/config entities -- a tablet's battery
//                          temperature is not the room's.
// Which kinds show, and in what order, is Configure -> Menu and room pages ->
// Status row shows (settings rooms.status); a card's `items:` wins.
//
// TAP: one sensor opens its sheet (hk-detail.js, or HA's dialog); a count of
// several opens a sheet of those devices (hkDetail.openGroup).
(function () {
  'use strict';

  function whenBase(fn) {
    if (window.hkCards && window.hkCards.register) return fn(window.hkCards);
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.register) fn(window.hkCards);
    }, { once: true });
  }

  // The kinds, in the Home app's order: readings, accessories, sensors.
  var KINDS = ['temperature', 'humidity', 'outlets', 'blinds', 'fans', 'windows', 'doors',
               'locks', 'garage', 'motion', 'occupancy', 'leaks'];
  var DOOR_COVERS = { garage: 1, gate: 1, door: 1 };
  // The kinds that are accessories -- things on the page -- rather than sensors.
  var ACCESSORY = { outlets: 1, blinds: 1, fans: 1, locks: 1, garage: 1 };
  var OFF = { unavailable: 1, unknown: 1 };

  function dom(id) { return String(id).split('.')[0]; }
  function attr(st, k) { return st && st.attributes ? st.attributes[k] : undefined; }

  // Which kind an entity counts toward, or null.
  function kindOf(id, st) {
    var d = dom(id), dc = attr(st, 'device_class');
    if (d === 'fan') return 'fans';
    if (d === 'lock') return 'locks';
    if (d === 'switch' && dc === 'outlet') return 'outlets';
    if (d === 'cover') return DOOR_COVERS[dc] ? 'garage' : 'blinds';
    if (d === 'binary_sensor') {
      if (dc === 'window') return 'windows';
      if (dc === 'door') return 'doors';
      if (dc === 'garage_door') return 'garage';
      if (dc === 'motion' || dc === 'moving') return 'motion';
      if (dc === 'occupancy' || dc === 'presence') return 'occupancy';
      if (dc === 'moisture') return 'leaks';
    }
    return null;
  }

  // An area's entities, as the generated dashboard counts them.
  // MEMOISED ON THE REGISTRIES: the status row asks on every hass push
  // (several a second) to see whether anything changed, and this walks
  // every registry entry -- thousands in a large home. HA replaces
  // hass.entities / hass.devices when a registry changes, so their identity
  // (and the areas asked for) is the whole key.
  var memo = { ents: null, devs: null, key: '', out: null };
  function members(hass, areas) {
    var key = areas.join('|');
    if (memo.ents === hass.entities && memo.devs === hass.devices && memo.key === key && memo.out) return memo.out;
    var out = walk(hass, areas);
    memo = { ents: hass.entities, devs: hass.devices, key: key, out: out };
    return out;
  }
  function walk(hass, areas) {
    var ents = hass.entities || {}, devs = hass.devices || {}, want = {}, out = [];
    areas.forEach(function (a) { want[a] = true; });
    Object.keys(ents).forEach(function (id) {
      var e = ents[id] || {};
      if (e.hidden || e.entity_category) return;
      var a = e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id);
      if (a && want[a]) out.push(id);
    });
    return out.sort();
  }

  function isOn(kind, st) {
    var s = st && st.state;
    if (kind === 'blinds' || kind === 'garage') {
      return dom(st.entity_id) === 'cover' ? (s === 'open' || s === 'opening' || s === 'closing') : s === 'on';
    }
    if (kind === 'locks') return s !== 'locked';
    return s === 'on';
  }

  // Words, as the Home app says them.
  var NOUN = { outlets: ['Outlet', 'Outlets'], blinds: ['Blinds', 'Blinds'], fans: ['Fan', 'Fans'],
               windows: ['Window', 'Windows'], doors: ['Door', 'Doors'], locks: ['Lock', 'Locks'],
               garage: ['Garage Door', 'Garage Doors'] };
  var WORDS = { outlets: ['Off', 'On'], blinds: ['Closed', 'Open'], fans: ['Off', 'On'],
                windows: ['Closed', 'Open'], doors: ['Closed', 'Open'], locks: ['Locked', 'Unlocked'],
                garage: ['Closed', 'Open'] };

  // THE ROW'S ITEMS -- a pure function of hass, the areas and the kinds, so
  // the tests hold it to every rule without a page.
  //   o: { items: [kinds], temperature, humidity, include: [ids], exclude: [ids],
  //        entities: [ids] }
  //
  // `entities:` -- THE ACCESSORIES ON THE PAGE. Given, the accessory kinds
  // (outlets, blinds, fans, locks, garage doors) count only these, so "2 Fans"
  // is always the two fan tiles below it -- the Home app's own rule. An area
  // can hold more than the page shows: a second integration's copy of the
  // same shades (a Matter bridge), a relay that is not a room's device. The
  // sensor kinds still come from the whole area.
  function items(hass, areas, o) {
    o = o || {};
    var st = hass.states || {}, A = hass.areas || {}, out = [];
    // always in the house order, whatever order a card or the settings list them in
    var pick = o.items && o.items.length ? o.items : KINDS;
    var kinds = KINDS.filter(function (k) { return pick.indexOf(k) !== -1; });
    var skip = {};
    (o.exclude || []).forEach(function (id) { skip[id] = true; });
    var ids = members(hass, areas).concat(o.include || []).filter(function (id, i, arr) {
      return !skip[id] && arr.indexOf(id) === i;
    });
    var own = Array.isArray(o.entities) ? o.entities.filter(function (id) { return !skip[id]; }) : null;
    var by = {};
    function count(list, accessories) {
      list.forEach(function (id) {
        var s = st[id];
        if (!s || OFF[s.state]) return;
        var k = kindOf(id, s);
        if (!k || !!ACCESSORY[k] !== accessories) return;
        if (by[k] && by[k].indexOf(id) !== -1) return;
        (by[k] = by[k] || []).push(id);
      });
    }
    count(own || ids, true);
    count(ids, false);
    function areaSensor(key) {
      if (o[key]) return o[key];
      for (var i = 0; i < areas.length; i++) {
        var a = A[areas[i]];
        if (a && a[key + '_entity_id']) return a[key + '_entity_id'];
      }
      return null;
    }
    kinds.forEach(function (k) {
      if (k === 'temperature' || k === 'humidity') {
        var id = areaSensor(k), s = id && st[id];
        var v = s ? parseFloat(s.state) : NaN;
        if (!isFinite(v)) return;
        var unit = attr(s, 'unit_of_measurement') || '';
        var c = /C$/.test(unit);
        out.push({ kind: k, title: k === 'temperature' ? 'Temperature' : 'Humidity',
                   value: k === 'temperature' ? Math.round(v) + '°' : Math.round(v) + '%',
                   ids: [id], dim: false,
                   // THE DOT'S PLACE on the 270° ring: temperature over a
                   // room's range, centred on 71 °F / 21.5 °C (the Home app draws
                   // 71° at the top), humidity over 0-100 %.
                   gauge: k === 'humidity' ? v / 100 : (c ? (v - 7) / 29 : (v - 45) / 52) });
        return;
      }
      var list = by[k];
      if (!list || !list.length) return;
      var on = list.filter(function (id) { return isOn(k, st[id]); }).length, n = list.length;
      if (k === 'motion' || k === 'occupancy' || k === 'leaks') {
        var words = { motion: ['Not Detected', 'Detected'], occupancy: ['None', 'Detected'], leaks: ['None', 'Detected'] }[k];
        out.push({ kind: k, title: { motion: 'Motion', occupancy: 'Occupancy', leaks: 'Leak' }[k],
                   value: words[on ? 1 : 0], ids: list, dim: !on, alert: k === 'leaks' && !!on, on: on });
        return;
      }
      var w = WORDS[k];
      out.push({ kind: k, title: (n === 1 ? '' : n + ' ') + NOUN[k][n === 1 ? 0 : 1],
                 // one: its state; several: all in one state, or how many are in the other
                 value: n === 1 || on === 0 || on === n ? w[on ? 1 : 0] : on + ' ' + w[1],
                 ids: list, dim: false, on: on, alert: k === 'locks' && !!on });
    });
    return out;
  }

  // The glyph for each kind -- SF Symbols where the hk: set has them,
  // the same-named Material icon where it does not.
  var ICON = { temperature: 'home-thermometer', humidity: 'water-percent', outlets: 'power-socket-us',
               blinds: 'blinds-horizontal', fans: 'fan', windows: 'window-closed-variant',
               // `motion`: the Home app's diamond with trails, drawn for this set
               // (not a public SF Symbol); a tile's motion sensor is `motion-sensor`
               doors: 'door-closed', locks: 'lock', garage: 'garage', motion: 'motion',
               occupancy: 'walk', leaks: 'water' };
  var ICON_ON = { blinds: 'blinds-horizontal', windows: 'window-open-variant', doors: 'door-open',
                  locks: 'lock-open-variant', garage: 'garage-open', leaks: 'water-alert' };
  function icon(it) {
    var n = (it.on && ICON_ON[it.kind]) || ICON[it.kind];
    var g = window.hkGlyphs && window.hkGlyphs.icons;
    return (g && !g[n] && !(n === 'door-closed' && g['door-closed-lock'])) ? 'mdi:' + n : 'hk:' + n;
  }

  // The ring: 270°, open at the bottom, a dot at the reading with a gap cut
  // round it -- the Home app's temperature and humidity glyph.
  var GID = 0;
  function gauge(frac) {
    var r = 12.6, c = 16, f = Math.max(0, Math.min(1, isFinite(frac) ? frac : 0.5));
    function p(a) { return [(c + r * Math.cos(a * Math.PI / 180)).toFixed(2), (c + r * Math.sin(a * Math.PI / 180)).toFixed(2)]; }
    var s = p(135), e = p(405), d = p(135 + 270 * f), id = 'hkrg' + (++GID);
    return '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><defs><mask id="' + id + '">' +
      '<rect width="32" height="32" fill="#fff"/><circle cx="' + d[0] + '" cy="' + d[1] + '" r="4.7" fill="#000"/></mask></defs>' +
      '<path d="M' + s[0] + ' ' + s[1] + 'A' + r + ' ' + r + ' 0 1 1 ' + e[0] + ' ' + e[1] + '" fill="none" stroke="currentColor"' +
      ' stroke-width="2.6" stroke-linecap="round" mask="url(#' + id + ')"/>' +
      '<circle cx="' + d[0] + '" cy="' + d[1] + '" r="2.7" fill="currentColor"/></svg>';
  }

  window.hkRoom = { version: '1.0.0', _: { items: items, kindOf: kindOf, members: members, gauge: gauge, KINDS: KINDS } };

  whenBase(function (C) {
    if (window.hkRoom.Card) return;
    var HkBase = C.HkBase, esc = C.esc;

    var CSS = [
      // THE PAGE'S RHYTHM, measured on a 1280 tablet: 24 px from
      // the back button to this row -- close enough to read as the title's --
      // and 32 px from it to the first section heading, the same as between
      // sections. !important because the view sets every card's margin.
      // POSITIONED, as hk-row-card's host is. The row below is a sideways
      // scroller, which Android composites as a layer of its own; with this
      // host left in flow, an Android tablet draws every card ABOVE the
      // row -- the back button's plate, the room's name -- under the live
      // sky's layers, so the title vanishes (desktop Chrome does not).
      // Taken one change at a time: the row not scrolling avoids it,
      // dropping the glyphs' shadows does not, and position:relative here
      // fixes it with the scroller intact. Keep both.
      ':host{display:block;position:relative;margin-top:-8px !important;margin-bottom:12px !important}',
      // an empty row hides (_render sets `hidden`): the display above would win over it
      ':host([hidden]){display:none}',
      // ONE LINE, left aligned with the tiles below (a view card sits 4 px left
      // of the tiles, which are a grid's children), scrolling sideways only
      // when a room has more than fits (a phone). The padding holds the
      // glyphs' drop shadow; the negative margin hands it back.
      '.row{display:flex;align-items:center;gap:34px;overflow-x:auto;overflow-y:hidden;',
      '  overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch;',
      '  padding:6px 12px 8px 16px;margin:0 -12px}',
      '.row::-webkit-scrollbar{display:none}',
      '.it{display:flex;align-items:center;gap:10px;flex:none;margin:0;padding:0;border:0;',
      '  background:none;color:#fff;font:inherit;text-align:left;cursor:pointer;',
      '  -webkit-tap-highlight-color:transparent;transition:opacity .15s ease}',
      '.it.pressed{opacity:0.55}',
      '.g{width:32px;height:32px;flex:none;position:relative;display:flex;align-items:center;',
      '  justify-content:center;color:rgba(255,255,255,0.96);',
      '  filter:drop-shadow(0 1px 2px rgba(0,0,0,0.28)) drop-shadow(0 2px 6px rgba(0,0,0,0.16))}',
      '.g ha-icon{--mdc-icon-size:27px;width:27px;height:27px;display:flex}',
      '.g svg{position:absolute;inset:0}',
      '.g.ring ha-icon{--mdc-icon-size:14px;width:14px;height:14px}',
      '.it.dim .g{opacity:0.5}',
      '.tx{display:flex;flex-direction:column;min-width:0}',
      '.t,.v{font-size:15px;line-height:19px;letter-spacing:-0.24px;white-space:nowrap;',
      '  text-shadow:0 1px 3px rgba(0,0,0,0.30),0 2px 8px rgba(0,0,0,0.22)}',
      '.t{font-weight:600;color:rgba(255,255,255,0.94)}',
      '.v{font-weight:400;color:rgba(235,235,245,0.66)}',
      '.it.alert .v{color:#ff9f0a}',
      '.it:focus-visible{outline:2px solid rgba(255,255,255,0.7);outline-offset:4px;border-radius:6px}'
    ].join('');

    class HkRoomStatusCard extends HkBase {
      static get CSS() { return CSS; }
      setConfig(config) {
        if (!config || !config.area) throw new Error('hk-room-status: `area` is required (one area, or a list)');
        super.setConfig(config);
      }
      getCardSize() { return 1; }
      _areas() { return [].concat(this._config.area || []).filter(Boolean); }
      _opts() {
        var c = this._config;
        return { items: c.items || C.setting('rooms.status', null), temperature: c.temperature,
                 humidity: c.humidity, include: c.include, exclude: c.exclude, entities: c.entities };
      }
      // The entities it reads, and the settings that shape it.
      _sigOf() {
        var h = this._hass;
        if (!h || !h.states) return null;
        var list = items(h, this._areas(), this._opts());
        this._items = list;
        var sig = JSON.stringify(this._opts().items || '') + ';';
        list.forEach(function (it) {
          sig += it.kind + ':' + it.ids.map(function (id) {
            var s = h.states[id];
            return s ? s.state : 'x';
          }).join(',') + ';';
        });
        return sig + (window.hkGlyphs ? 'g' : '');
      }
      _render() {
        var h = this._hass;
        if (!h) return;
        var list = this._items || items(h, this._areas(), this._opts());
        this.toggleAttribute('hidden', !list.length);
        // THE ROW STAYS, its buttons change: replacing the scroller would put
        // a phone's sideways-scrolled row back at the start under the reader's
        // finger whenever anything in the room changed
        var row = this._root.querySelector('.row');
        if (!row) {
          this._root.innerHTML = '<div class="row" role="list"></div>';
          row = this._root.querySelector('.row');
        }
        row.innerHTML = list.map(function (it, i) {
          var ring = it.kind === 'temperature' || it.kind === 'humidity';
          return '<button class="it' + (it.dim ? ' dim' : '') + (it.alert ? ' alert' : '') + '" data-i="' + i +
            '" role="listitem" aria-label="' + esc(it.title + ', ' + it.value) + '">' +
            '<span class="g' + (ring ? ' ring' : '') + '">' + (ring ? gauge(it.gauge) : '') +
            '<ha-icon icon="' + esc(icon(it)) + '"></ha-icon></span>' +
            '<span class="tx"><span class="t">' + esc(it.title) + '</span><span class="v">' + esc(it.value) +
            '</span></span></button>';
        }).join('');
        this._list = list;
        if (!this._wired) this._wire();
      }
      // A tap is a lift that did not travel (hk-tap.js's rule): the row
      // scrolls on a phone, and a scroll must not open a sheet.
      _wire() {
        this._wired = true;
        var self = this, down = null;
        this._root.addEventListener('pointerdown', function (e) {
          var b = e.target.closest && e.target.closest('.it');
          down = b ? { b: b, x: e.clientX, y: e.clientY } : null;
          if (b) b.classList.add('pressed');
        });
        var clear = function () {
          self._root.querySelectorAll('.it.pressed').forEach(function (b) { b.classList.remove('pressed'); });
        };
        this._root.addEventListener('pointermove', function (e) {
          if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down = null; clear(); }
        });
        this._root.addEventListener('pointercancel', function () { down = null; clear(); });
        this._root.addEventListener('click', function (e) {
          clear();
          var b = e.target.closest && e.target.closest('.it');
          if (!b) return;
          var it = self._list && self._list[+b.getAttribute('data-i')];
          if (it) self._open(it);
        });
      }
      _open(it) {
        if (it.ids.length === 1) {
          this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true,
            detail: { entityId: it.ids[0] } }));
          return;
        }
        var D = window.hkDetail;
        var room = (this._hass.areas && this._hass.areas[this._areas()[0]]) || {};
        if (D && D.openGroup && C.setting('look.details', true) !== false) {
          D.openGroup(it.title, it.ids, { icon: icon(it), room: room.name || '', kind: it.kind });
          return;
        }
        this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true,
          detail: { entityId: it.ids[0] } }));
      }
    }

    C.register('hk-room-status-card', HkRoomStatusCard, 'HK Room Status',
      "A room's status line -- temperature, humidity, and what is on, open or detected -- read from its area.",
      [
        { name: 'area', required: true, selector: { area: { multiple: true } },
          helper: 'The room: one area, or several for a room that spans them.' },
        { name: 'items', selector: { select: { multiple: true, mode: 'list', options: KINDS.map(function (k) {
          return { value: k, label: k.charAt(0).toUpperCase() + k.slice(1) };
        }) } }, helper: 'Leave empty to follow Configure → Menu and room pages → Status row shows.' },
        C.section('Sensors', [
          { name: 'temperature', selector: { entity: { domain: 'sensor', device_class: 'temperature' } },
            helper: "Else the area's own temperature sensor (Settings → Areas)." },
          { name: 'humidity', selector: { entity: { domain: 'sensor', device_class: 'humidity' } } },
          { name: 'entities', selector: { entity: { multiple: true } },
            helper: "The page's own devices: outlets, blinds, fans, locks and garage doors are counted from these (else the whole area)." },
          { name: 'exclude', selector: { entity: { multiple: true } }, helper: 'Leave these out of the counts.' },
          { name: 'include', selector: { entity: { multiple: true } }, helper: 'Count these too, from outside the area.' }
        ], 'mdi:tune')
      ],
      function (hass) {
        var a = hass && hass.areas ? Object.keys(hass.areas)[0] : null;
        return { area: a || 'living_room' };
      });
    window.hkRoom.Card = HkRoomStatusCard;
  });
})();
