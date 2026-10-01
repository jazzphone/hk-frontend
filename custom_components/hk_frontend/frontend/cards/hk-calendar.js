// hk-calendar.js -- the house's calendars: the Calendar page, its event
// sheet, and the screensaver's calendar pane.
//
// hk-calendar-card       the Calendar page (hk-strategy.js `calendar`): the
//                        month, the week or the day, moved through with the
//                        arrows (or a swipe), events added, changed and deleted
// hk-calendar-pane-card  the screensaver's pane (hk-saver.js, option
//                        `calendar`): today's events and the coming days',
//                        down the right of the screen
// window.hkCalendar      the events of the calendars (Home Assistant's own
//                        calendar API) and the sheet that shows and edits one
//
// WHICH CALENDARS, AND THEIR COLOURS: All Screens -> Calendar
// (hkSettings.calendarIds / calendarColor), read live -- a change there
// redraws these cards and rebuilds nothing.
//
// THE EVENTS come from GET /api/calendars/<entity>?start&end (the same
// answer Home Assistant's own calendar panel draws), for the range a card
// shows, and are shared between cards for a minute. Adding, changing and
// deleting go through calendar/event/create | update | delete, offered only
// where the calendar says it can (supported_features: 1 create, 2 delete,
// 4 update -- a Local Calendar can do all three, a read-only feed none).
(function () {
  'use strict';

  function whenBase(fn) {
    if (window.hkCards && window.hkCards.register) return fn(window.hkCards);
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.register) fn(window.hkCards);
      else console.error('[hk-calendar] hk-cards-ready fired without hk-base.js');
    }, { once: true });
  }

  whenBase(function (C) {
  if (window.hkCalendar) return;              // double-load guard
  var HkBase = C.HkBase, M = C.M, register = C.register, esc = C.esc;

  // ------------------------------------------------------------ dates
  var DAY_MS = 86400000;
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
             'October', 'November', 'December'];
  var MON3 = MON.map(function (m) { return m.slice(0, 3); });
  function day0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  // calendar days, not 24-hour steps: a daylight-saving day is 23 or 25 hours
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()); }
  function addMonths(d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function weekStart(d) { var x = day0(d); return addDays(x, -x.getDay()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  // local time with its offset: what calendar/event/create takes, and what
  // the events API reads as a moment
  function isoLocal(d) {
    var o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-';
    o = Math.abs(o);
    return ymd(d) + 'T' + hm(d) + ':' + pad(d.getSeconds()) + s + pad(Math.floor(o / 60)) + ':' + pad(o % 60);
  }
  function time(d) {
    var h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  // the month grid's short form: 7a, 5:30p
  function tshort(d) {
    var h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + (m ? ':' + pad(m) : '') + (h < 12 ? 'a' : 'p');
  }
  function hourLabel(h) { return h === 0 ? '12 AM' : h === 12 ? 'Noon' : (h % 12) + (h < 12 ? ' AM' : ' PM'); }
  function span(ev) {
    if (ev.allDay) {
      var last = addDays(ev.end, -1);
      return sameDay(ev.start, last) ? 'All day' : 'All day · through ' + MON3[last.getMonth()] + ' ' + last.getDate();
    }
    var e = ev.end, s = ev.start;
    if (sameDay(s, e) || (+e === +addDays(day0(s), 1))) return time(s) + ' – ' + time(e);
    return time(s) + ' – ' + MON3[e.getMonth()] + ' ' + e.getDate() + ', ' + time(e);
  }
  // "in 46 min", "in 2 hr", "Now"
  function soon(ev, now) {
    if (ev.allDay) return '';
    if (ev.start <= now && ev.end > now) return 'Now';
    var min = Math.round((ev.start - now) / 60000);
    if (min <= 0 || min > 180) return '';
    if (min < 60) return 'in ' + min + ' min';
    var hr = Math.floor(min / 60), r = min % 60;
    return 'in ' + hr + ' hr' + (r >= 5 ? ' ' + r + ' min' : '');
  }

  // ------------------------------------------------------------ calendars
  var WHITE = [255, 255, 255];
  function calIds(hass) {
    var HS = window.hkSettings, st = (hass && hass.states) || {};
    if (HS && HS.calendarIds) return HS.calendarIds(st);
    return Object.keys(st).filter(function (k) { return k.indexOf('calendar.') === 0; }).sort();
  }
  function rgbOf(id, hass) {
    var HS = window.hkSettings, key = HS && HS.calendarColor ? HS.calendarColor(id, (hass && hass.states) || {}) : 'orange';
    var hue = (C.PALETTE && C.PALETTE.chart) || {};
    return key === 'white' ? WHITE : (hue[key] && hue[key].length === 3 ? hue[key] : [255, 159, 10]);
  }
  function rgba(rgb, a) { return 'rgba(' + rgb.join(',') + ',' + a + ')'; }
  function features(hass, id) {
    var st = hass && hass.states && hass.states[id];
    return Number((st && st.attributes && st.attributes.supported_features) || 0);
  }
  function can(hass, id, what) { return !!(features(hass, id) & ({ create: 1, delete: 2, update: 4 })[what]); }
  function calName(hass, id) {
    var st = hass && hass.states && hass.states[id];
    return (st && st.attributes && st.attributes.friendly_name) || id;
  }
  function writable(hass) { return calIds(hass).filter(function (id) { return can(hass, id, 'create'); }); }

  // ------------------------------------------------------------ events
  // One event, as the cards use it: start and end as Dates (an all-day
  // event's end is the day AFTER its last, as the API gives it).
  function norm(cal, e) {
    var s = e.start || {}, en = e.end || {};
    var allDay = !s.dateTime && !!s.date;
    var start = allDay ? parseYmd(s.date) : new Date(s.dateTime);
    var end = allDay ? parseYmd(en.date) : new Date(en.dateTime || s.dateTime);
    if (!start || isNaN(start)) return null;
    if (!end || isNaN(end) || end <= start) end = allDay ? addDays(start, 1) : new Date(+start + 3600000);
    return { cal: cal, uid: e.uid || null, rid: e.recurrence_id || null, rrule: e.rrule || null,
             title: String(e.summary || 'Untitled'), desc: String(e.description || ''), loc: String(e.location || ''),
             allDay: allDay, start: start, end: end,
             key: cal + '|' + (e.uid || '') + '|' + (e.recurrence_id || '') + '|' + (+start) };
  }
  function byStart(a, b) {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (a.start - b.start) || (b.end - a.end) || (a.title < b.title ? -1 : 1);
  }
  // A DAY'S OWN EVENTS for a dot: what starts that day or lasts no longer
  // than it -- not a month-long all-day event passing through
  function ownDay(evs, d) {
    var a = day0(d);
    return onDay(evs, d).filter(function (e) { return sameDay(e.start, a) || (e.end - e.start) <= DAY_MS; });
  }
  // the events touching a day
  function onDay(evs, d) {
    var a = day0(d), b = addDays(a, 1);
    return evs.filter(function (e) { return e.start < b && e.end > a; }).sort(byStart);
  }

  // THE SHARED STORE: one answer per (calendar, range) for a minute, so the
  // page and the pane (or two cards) ask once. `ver` moves on every edit
  // made here, and every card asks again.
  var store = { ver: 0, got: {}, live: {} };
  var TTL = 60000;
  function fetchOne(hass, id, from, to) {
    var key = id + '|' + (+from) + '|' + (+to) + '|' + store.ver, hit = store.got[key];
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.evs);
    if (store.live[key]) return store.live[key];
    var path = 'calendars/' + id + '?start=' + encodeURIComponent(isoLocal(from)) + '&end=' + encodeURIComponent(isoLocal(to));
    var p;
    try { p = Promise.resolve(hass.callApi('GET', path)); } catch (e) { p = Promise.reject(e); }
    p = p.then(function (r) {
      var evs = (Array.isArray(r) ? r : []).map(function (e) { return norm(id, e); }).filter(Boolean);
      store.got[key] = { at: Date.now(), evs: evs };
      delete store.live[key];
      return evs;
    }, function (err) {
      delete store.live[key];
      throw err;
    });
    store.live[key] = p;
    return p;
  }
  // every chosen calendar's events from `from` to `to`; a calendar that
  // fails is left out (and said so), the rest still show
  function load(hass, ids, from, to) {
    if (!hass || !hass.callApi || !ids.length) return Promise.resolve({ evs: [], failed: [] });
    var failed = [];
    return Promise.all(ids.map(function (id) {
      return fetchOne(hass, id, from, to).catch(function (e) {
        console.warn('[hk-calendar]', id, e && (e.message || e.body || e));
        failed.push(id);
        return [];
      });
    })).then(function (lists) {
      return { evs: [].concat.apply([], lists).sort(byStart), failed: failed };
    });
  }
  function changed() {
    store.ver++;
    store.got = {};
    try { window.dispatchEvent(new CustomEvent('hk-calendar-changed')); } catch (e) { /* ignore */ }
  }

  // ADD, CHANGE, DELETE. `ev` is the event as norm() made it; `scope` for an
  // occurrence of a repeating event: '' (this one) or 'THISANDFUTURE'.
  function payload(f) {
    var o = { summary: f.title };
    if (f.allDay) { o.dtstart = ymd(f.start); o.dtend = ymd(addDays(day0(f.end), 1)); }
    else { o.dtstart = isoLocal(f.start); o.dtend = isoLocal(f.end); }
    if (f.desc) o.description = f.desc;
    if (f.loc) o.location = f.loc;
    if (f.rrule) o.rrule = f.rrule;
    return o;
  }
  function wsErr(e) { return (e && (e.message || e.code)) || 'Home Assistant refused it.'; }
  function create(hass, cal, f) {
    return hass.callWS({ type: 'calendar/event/create', entity_id: cal, event: payload(f) })
      .then(function () { changed(); }, function (e) { throw new Error(wsErr(e)); });
  }
  function update(hass, ev, f, scope) {
    var msg = { type: 'calendar/event/update', entity_id: ev.cal, uid: ev.uid, event: payload(f) };
    if (ev.rid) { msg.recurrence_id = ev.rid; if (scope) msg.recurrence_range = scope; }
    return hass.callWS(msg).then(function () { changed(); }, function (e) { throw new Error(wsErr(e)); });
  }
  function remove(hass, ev, scope) {
    var msg = { type: 'calendar/event/delete', entity_id: ev.cal, uid: ev.uid };
    if (ev.rid) { msg.recurrence_id = ev.rid; if (scope) msg.recurrence_range = scope; }
    return hass.callWS(msg).then(function () { changed(); }, function (e) { throw new Error(wsErr(e)); });
  }

  // OVERLAPPING EVENTS SIDE BY SIDE in a day's column: each cluster of
  // events that overlap shares the width, each in the first free lane.
  function lanes(evs) {
    var out = [], cluster = [], end = -Infinity;
    function flush() {
      var cols = [];
      cluster.forEach(function (it) {
        var c = 0;
        while (cols[c] && cols[c] > +it.s) c++;
        cols[c] = +it.e;
        it.col = c;
      });
      cluster.forEach(function (it) { it.cols = cols.length; out.push(it); });
      cluster = [];
    }
    evs.slice().sort(function (a, b) { return (a.s - b.s) || (b.e - a.e); }).forEach(function (it) {
      if (+it.s >= end) { flush(); end = -Infinity; }
      cluster.push(it);
      end = Math.max(end, +it.e);
    });
    flush();
    return out;
  }
  // ALL-DAY BARS across a row of days: each event's first and last column
  // in the row, in the first lane free for all of them.
  function bars(evs, from, n) {
    var to = addDays(from, n), used = [], out = [];
    evs.filter(function (e) { return (e.allDay || (e.end - e.start) >= DAY_MS) && e.start < to && e.end > from; })
      .sort(function (a, b) { return (a.start - b.start) || (b.end - a.end); })
      .forEach(function (e) {
        var a = Math.max(0, Math.floor((day0(e.start) - from) / DAY_MS + 0.5));
        var lastDay = e.allDay ? addDays(e.end, -1) : (e.end.getHours() || e.end.getMinutes() ? e.end : addDays(e.end, -1));
        var b = Math.min(n - 1, Math.floor((day0(lastDay) - from) / DAY_MS + 0.5));
        if (b < a) b = a;
        var lane = 0;
        while ((used[lane] || []).some(function (r) { return !(b < r[0] || a > r[1]); })) lane++;
        (used[lane] = used[lane] || []).push([a, b]);
        out.push({ ev: e, a: a, b: b, lane: lane, cont: e.start < from, more: e.end > to });
      });
    return { list: out, lanes: used.length };
  }

  // ------------------------------------------------------------ icons
  var IC = {
    left: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    notes: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14M5 11h14M5 16h9"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>'
  };

  // ------------------------------------------------------------ the sheet
  // ONE SHEET, reused, on document.body (no card's overflow can clip it,
  // like hk-base's confirmSheet): an event shown, or the form that adds or
  // changes one. Its own shadow root, so nothing on the page styles it.
  var REPEATS = [['', 'Never'], ['FREQ=DAILY', 'Every Day'], ['FREQ=WEEKLY', 'Every Week'],
                 ['FREQ=MONTHLY', 'Every Month'], ['FREQ=YEARLY', 'Every Year']];
  var SHEET_CSS = [
    ':host{position:fixed;inset:0;z-index:9000;display:none;font-family:var(--ha-font-family-body,-apple-system,system-ui,sans-serif);',
    '  -webkit-tap-highlight-color:transparent}',
    ':host([open]){display:block}',
    '*{box-sizing:border-box;font-family:inherit}',
    '.back{position:absolute;inset:0;background:rgba(4,10,24,0.5)}',
    '.box{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 24px));',
    '  max-height:calc(var(--hk-vh,100vh) - 24px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
    '  border-radius:28px;border:1px solid rgba(255,255,255,0.14);background:rgba(28,36,54,0.96);color:#fff;',
    '  box-shadow:0 30px 80px rgba(0,0,0,0.45);padding:0 20px 22px}',
    '.hd{display:flex;align-items:center;height:64px;position:sticky;top:0;background:rgba(28,36,54,0.98);z-index:1;margin:0 -20px;padding:0 20px}',
    '.hd .t{flex:1;text-align:center;font-size:17px;font-weight:700}',
    'button{appearance:none;font:inherit;cursor:pointer;color:#fff}',
    '.tb{height:40px;padding:0 14px;border:0;border-radius:20px;background:transparent;font-size:17px;font-weight:500;min-width:72px}',
    '.go{background:#fff;color:#1c1c1e;font-weight:700;padding:0 20px}',
    // a text button's words on the form's edge (the pill keeps its own)
    '.hd > .tb:first-child:not(.go){padding-left:0;text-align:left}',
    '.hd > .tb:last-child:not(.go){padding-right:0;text-align:right}',
    '.go[disabled]{opacity:0.4;cursor:default}',
    '.grp{border-radius:14px;background:rgba(255,255,255,0.08);margin-top:14px}',
    '.row{display:flex;align-items:center;min-height:52px;padding:0 16px;gap:10px}',
    '.row + .row{border-top:1px solid rgba(255,255,255,0.1)}',
    '.row .l{font-size:17px;flex:1}',
    'input,textarea,select{font:inherit;color:#fff;background:transparent;border:0;outline:none}',
    'input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.55)}',
    '.title{flex:1;font-size:19px;font-weight:600;height:52px}',
    '.loc{flex:1;font-size:17px;height:52px}',
    'textarea{width:100%;font-size:17px;resize:none;padding:14px 16px;min-height:76px;display:block;overflow-wrap:anywhere}',
    '.pick{height:36px;padding:0 10px;border-radius:10px;background:rgba(255,255,255,0.14);font-size:16px;color-scheme:dark}',
    'select.pick{padding:0 8px;max-width:240px}',
    'select option{color:#000}',
    '.sw{width:52px;height:32px;border-radius:16px;border:0;background:rgba(255,255,255,0.22);padding:2px;display:flex;transition:background .2s}',
    '.sw span{width:28px;height:28px;border-radius:14px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.25);transition:transform .2s}',
    '.sw[aria-checked="true"]{background:#30d158}',
    '.sw[aria-checked="true"] span{transform:translateX(20px)}',
    '.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:12px 16px}',
    '.chip{height:36px;padding:0 12px;border-radius:18px;border:0;background:rgba(255,255,255,0.1);font-size:14px;font-weight:600}',
    '.chip[aria-pressed="true"]{background:#fff;color:#1c1c1e}',
    '.dot{width:10px;height:10px;border-radius:5px;flex:none}',
    '.err{color:#ffb3ae;font-size:14px;font-weight:600;padding:12px 4px 0;display:none}',
    '.err[data-on]{display:block}',
    '.del{width:100%;margin-top:14px;height:48px;border-radius:14px;border:1px solid rgba(255,105,97,0.45);background:rgba(255,69,58,0.16);',
    '  color:#ffb3ae;font-size:17px;font-weight:600}',
    // the event, shown
    '.vw{padding:6px 0 0}',
    '.vw .cal{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:rgba(255,255,255,0.8)}',
    '.vw h2{margin:8px 0 0;font-size:26px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;overflow-wrap:anywhere}',
    '.vw .ln{display:flex;align-items:flex-start;gap:10px;margin-top:12px;font-size:16px;line-height:1.35}',
    '.vw .ln svg{flex:none;margin-top:2px;opacity:0.85}',
    // A LONG WORD OR LINK (a FaceTime or Zoom link in the notes) breaks
    // where it must, rather than widening the sheet into a sideways scroll
    '.vw .ln span{min-width:0;overflow-wrap:anywhere}',
    '.vw .note{white-space:pre-wrap;color:rgba(255,255,255,0.88)}',
    '.acts{display:flex;gap:10px;margin-top:20px}',
    '.acts button{flex:1;height:48px;border-radius:24px;font-size:17px;font-weight:600}',
    '.acts .ed{border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.12)}',
    '.acts .rm{border:1px solid rgba(255,105,97,0.45);background:rgba(255,69,58,0.16);color:#ffb3ae}',
    '.ro{margin-top:16px;font-size:14px;color:rgba(255,255,255,0.7)}',
    '.pk{display:flex;gap:8px;margin-left:auto}',
    // a phone: the label over its date and time
    '@media (max-width:460px){.box{padding:0 14px 18px}.hd{margin:0 -14px;padding:0 14px}.dt{flex-wrap:wrap;padding:10px 16px;gap:8px}',
    '  .dt .l{flex-basis:100%}.dt .pk{margin-left:0;flex:1 1 100%;min-width:0}.dt .pick{flex:1 1 0;min-width:0;width:0}}'
  ].join('\n');

  var sheet = null;
  function sheetEl() {
    if (sheet) return sheet;
    var host = document.createElement('hk-calendar-sheet');
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + SHEET_CSS + '</style><div class="back"></div>' +
      '<div class="box" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(host);
    sheet = { host: host, root: root, box: root.querySelector('.box'), onKey: null };
    root.querySelector('.back').addEventListener('click', function () { if (sheet.backdrop) closeSheet(); });
    return sheet;
  }
  function openSheet(label, backdrop) {
    var s = sheetEl();
    s.backdrop = backdrop;
    s.box.setAttribute('aria-label', label);
    s.host.setAttribute('open', '');
    if (!s.onKey) {
      s.onKey = function (e) { if (e.key === 'Escape' && sheet.host.hasAttribute('open')) { e.stopPropagation(); closeSheet(); } };
      document.addEventListener('keydown', s.onKey, true);
    }
    return s;
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.host.removeAttribute('open');
    sheet.box.innerHTML = '';
    if (sheet.onKey) { document.removeEventListener('keydown', sheet.onKey, true); sheet.onKey = null; }
  }

  // AN EVENT, SHOWN: when, where, the notes, and Edit / Delete where the
  // calendar allows them.
  function show(hass, ev) {
    var s = openSheet(ev.title, true), rgb = rgbOf(ev.cal, hass);
    var day = ev.allDay ? '' : (sameDay(ev.start, new Date()) ? 'Today, ' : DOW_LONG[ev.start.getDay()] + ', ' +
              MON3[ev.start.getMonth()] + ' ' + ev.start.getDate() + ', ');
    var allDayWhen = ev.allDay ? DOW_LONG[ev.start.getDay()] + ', ' + MON[ev.start.getMonth()] + ' ' + ev.start.getDate() + ' · ' + span(ev) : '';
    var edit = can(hass, ev.cal, 'update') && ev.uid, del = can(hass, ev.cal, 'delete') && ev.uid;
    s.box.innerHTML =
      '<div class="hd"><span class="tb" aria-hidden="true"></span><div class="t">Event</div>' +
      '<button class="tb" data-a="close">Done</button></div>' +
      '<div class="vw"><div class="cal"><span class="dot" style="background:' + rgba(rgb, 1) + '"></span>' + esc(calName(hass, ev.cal)) + '</div>' +
      '<h2>' + esc(ev.title) + '</h2>' +
      '<div class="ln">' + IC.clock + '<span>' + esc(ev.allDay ? allDayWhen : day + span(ev)) + '</span></div>' +
      (ev.rrule ? '<div class="ln">' + IC.repeat + '<span>' + esc(repeatLabel(ev.rrule)) + '</span></div>' : '') +
      (ev.loc ? '<div class="ln">' + IC.pin + '<span>' + esc(ev.loc) + '</span></div>' : '') +
      (ev.desc ? '<div class="ln">' + IC.notes + '<span class="note">' + esc(ev.desc) + '</span></div>' : '') +
      (edit || del ? '<div class="acts">' + (edit ? '<button class="ed" data-a="edit">Edit</button>' : '') +
                     (del ? '<button class="rm" data-a="del">Delete</button>' : '') + '</div>'
                   : '<div class="ro">This calendar can only be read here.</div>') +
      '</div>';
    s.box.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-a]');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'close') closeSheet();
      else if (a === 'edit') edit_(hass, ev);
      else if (a === 'del') askDelete(hass, ev, function () { closeSheet(); });
    };
  }
  function repeatLabel(r) {
    var hit = REPEATS.filter(function (x) { return x[0] && x[0] === r; })[0];
    if (hit) return hit[1];
    var f = /FREQ=([A-Z]+)/.exec(r || '');
    return f ? 'Repeats ' + f[1].toLowerCase() : 'Repeats';
  }
  // DELETE, asked first; an occurrence of a repeating event asks which.
  function askDelete(hass, ev, done) {
    var go = function (scope) {
      remove(hass, ev, scope).then(done, function (e) {
        C.confirmSheet('Couldn’t delete “' + ev.title + '”', function () {}, { detail: e.message, yes: 'OK', no: 'Close' });
      });
    };
    if (ev.rid) {
      C.chooseSheet('Delete “' + ev.title + '”?', [{ name: 'This Event Only', scope: '' },
        { name: 'This and Future Events', scope: 'THISANDFUTURE' }], function (o) { go(o.scope); });
    } else {
      C.confirmSheet('Delete “' + ev.title + '”?', function () { go(''); }, { yes: 'Delete', detail: span(ev) });
    }
  }

  // THE FORM: a new event (`ev` null; `seed` = {cal, start, end, allDay}) or
  // a change to one.
  function edit_(hass, ev, seed) {
    var cals = writable(hass);
    if (!ev && !cals.length) return;
    var isNew = !ev;
    var f = ev ? { cal: ev.cal, title: ev.title, loc: ev.loc, desc: ev.desc, allDay: ev.allDay, rrule: ev.rrule || '',
                   start: new Date(ev.start), end: ev.allDay ? addDays(ev.end, -1) : new Date(ev.end) }
               : { cal: (seed && seed.cal && cals.indexOf(seed.cal) >= 0) ? seed.cal : cals[0], title: '', loc: '', desc: '',
                   allDay: !!(seed && seed.allDay), rrule: '', start: seed.start, end: seed.end };
    var origRule = f.rrule;
    var s = openSheet(isNew ? 'New Event' : 'Edit Event', false);
    var repeatOpts = REPEATS.slice();
    if (f.rrule && !REPEATS.some(function (r) { return r[0] === f.rrule; })) repeatOpts.push([f.rrule, repeatLabel(f.rrule)]);
    s.box.innerHTML =
      '<div class="hd"><button class="tb" data-a="cancel">Cancel</button><div class="t">' + (isNew ? 'New Event' : 'Edit Event') + '</div>' +
      '<button class="tb go" data-a="save">' + (isNew ? 'Add' : 'Save') + '</button></div>' +
      '<div class="grp"><label class="row"><span style="display:none">Title</span>' +
      '<input class="title" data-f="title" placeholder="Title" maxlength="200" aria-label="Title"></label>' +
      '<label class="row">' + IC.pin + '<input class="loc" data-f="loc" placeholder="Location" maxlength="200" aria-label="Location"></label></div>' +
      '<div class="grp"><div class="row"><span class="l" id="adl">All-day</span>' +
      '<button class="sw" role="switch" data-a="allday" aria-labelledby="adl"><span></span></button></div>' +
      '<div class="row dt"><span class="l">Starts</span><span class="pk"><input type="date" class="pick" data-f="sd" aria-label="Start date">' +
      '<input type="time" class="pick" data-f="st" step="300" aria-label="Start time"></span></div>' +
      '<div class="chips" data-f="chips"></div>' +
      '<div class="row dt"><span class="l">Ends</span><span class="pk"><input type="date" class="pick" data-f="ed" aria-label="End date">' +
      '<input type="time" class="pick" data-f="et" step="300" aria-label="End time"></span></div></div>' +
      '<div class="grp"><div class="row">' + IC.repeat + '<span class="l">Repeat</span><select class="pick" data-f="rrule" aria-label="Repeat">' +
      repeatOpts.map(function (r) { return '<option value="' + esc(r[0]) + '">' + esc(r[1]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="row"><span class="dot" data-f="calDot"></span><span class="l">Calendar</span><select class="pick" data-f="cal" aria-label="Calendar"' +
      (isNew ? '' : ' disabled') + '>' + (isNew ? cals : [f.cal]).map(function (id) {
        return '<option value="' + esc(id) + '">' + esc(calName(hass, id)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="grp"><textarea data-f="desc" rows="3" placeholder="Notes" maxlength="2000" aria-label="Notes"></textarea></div>' +
      '<div class="err" role="alert"></div>' +
      (isNew || !can(hass, f.cal, 'delete') || !ev.uid ? '' : '<button class="del" data-a="del">Delete Event</button>');
    var q = function (k) { return s.box.querySelector('[data-f="' + k + '"]'); };
    var save = s.box.querySelector('[data-a="save"]'), err = s.box.querySelector('.err');
    q('title').value = f.title; q('loc').value = f.loc; q('desc').value = f.desc; q('rrule').value = f.rrule || '';
    q('cal').value = f.cal;
    function paintTimes() {
      q('sd').value = ymd(f.start); q('ed').value = ymd(f.end);
      q('st').value = hm(f.start); q('et').value = hm(f.end);
      ['st', 'et'].forEach(function (k) { q(k).style.display = f.allDay ? 'none' : ''; });
      s.box.querySelector('[data-a="allday"]').setAttribute('aria-checked', f.allDay ? 'true' : 'false');
      q('calDot').style.background = rgba(rgbOf(f.cal, hass), 1);
      // QUICK TIMES around the start, every half hour
      var box = q('chips');
      box.style.display = f.allDay ? 'none' : '';
      if (!f.allDay) {
        var base = new Date(f.start); base.setMinutes(base.getMinutes() < 30 ? 0 : 30, 0, 0);
        var html = '';
        for (var i = -2; i <= 2; i++) {
          var t = new Date(+base + i * 1800000);
          if (!sameDay(t, f.start)) continue;
          html += '<button class="chip" data-a="quick" data-t="' + hm(t) + '" aria-pressed="' + (hm(t) === hm(f.start)) + '">' + time(t) + '</button>';
        }
        box.innerHTML = html;
      }
      save.disabled = !q('title').value.trim();
    }
    paintTimes();
    var dur = function () { return f.end - f.start; };
    function setStart(d) { var keep = Math.max(f.allDay ? 0 : 900000, dur()); f.start = d; f.end = new Date(+d + keep); paintTimes(); }
    function at(dateStr, timeStr, fallback) {
      var d = parseYmd(dateStr);
      if (!d) return fallback;
      var m = /^(\d{1,2}):(\d{2})/.exec(timeStr || '');
      if (m) d.setHours(+m[1], +m[2], 0, 0); else d.setHours(fallback.getHours(), fallback.getMinutes(), 0, 0);
      return d;
    }
    q('title').addEventListener('input', function () { save.disabled = !q('title').value.trim(); err.removeAttribute('data-on'); });
    q('sd').addEventListener('change', function () { setStart(at(q('sd').value, q('st').value, f.start)); });
    q('st').addEventListener('change', function () { setStart(at(q('sd').value, q('st').value, f.start)); });
    q('ed').addEventListener('change', function () { f.end = at(q('ed').value, q('et').value, f.end); paintTimes(); });
    q('et').addEventListener('change', function () { f.end = at(q('ed').value, q('et').value, f.end); paintTimes(); });
    q('cal').addEventListener('change', function () { f.cal = q('cal').value; paintTimes(); });
    s.box.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-a]');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'cancel') closeSheet();
      else if (a === 'allday') {
        f.allDay = !f.allDay;
        if (f.allDay) { f.start = day0(f.start); f.end = day0(f.end < f.start ? f.start : f.end); }
        else {
          var s0 = new Date(f.start); s0.setHours(9, 0, 0, 0);
          f.start = s0; f.end = new Date(+s0 + 3600000);
        }
        paintTimes();
      } else if (a === 'quick') {
        var p = b.getAttribute('data-t').split(':'), d = new Date(f.start);
        d.setHours(+p[0], +p[1], 0, 0);
        setStart(d);
      } else if (a === 'del') {
        askDelete(hass, ev, function () { closeSheet(); });
      } else if (a === 'save') {
        f.title = q('title').value.trim();
        f.loc = q('loc').value.trim();
        f.desc = q('desc').value.trim();
        f.rrule = q('rrule').value;
        if (!f.title) return;
        if (f.allDay ? day0(f.end) < day0(f.start) : f.end <= f.start) {
          err.textContent = 'It has to end after it starts.';
          err.setAttribute('data-on', '');
          return;
        }
        var finish = function () { closeSheet(); };
        var fail = function (x) { save.disabled = false; err.textContent = 'Couldn’t save: ' + x.message; err.setAttribute('data-on', ''); };
        save.disabled = true;
        if (isNew) { create(hass, f.cal, f).then(finish, fail); return; }
        // an occurrence of a repeating event: this one, or this and the
        // ones after it (a change to the repeat itself is always the latter)
        if (ev.rid) {
          if (f.rrule !== origRule) { update(hass, ev, f, 'THISANDFUTURE').then(finish, fail); return; }
          C.chooseSheet('Change “' + f.title + '”', [{ name: 'This Event Only', scope: '' },
            { name: 'This and Future Events', scope: 'THISANDFUTURE' }], function (o) {
            if (!o.scope) f.rrule = '';
            update(hass, ev, f, o.scope).then(finish, fail);
          });
          save.disabled = false;
          return;
        }
        update(hass, ev, f, '').then(finish, fail);
      }
    };
    setTimeout(function () { try { if (isNew) q('title').focus(); } catch (e) { /* ignore */ } }, 60);
  }
  // a new event at `start` (a day: the next hour today, else 9 AM)
  function newAt(hass, start, allDay, cal) {
    var s0 = new Date(start);
    if (!allDay && s0.getHours() === 0 && s0.getMinutes() === 0) {
      var now = new Date();
      if (sameDay(s0, now)) { s0 = new Date(now); s0.setHours(now.getHours() + 1, 0, 0, 0); }
      else s0.setHours(9, 0, 0, 0);
    }
    edit_(hass, null, { cal: cal, start: s0, end: allDay ? day0(s0) : new Date(+s0 + 3600000), allDay: !!allDay });
  }

  // ------------------------------------------------------------ the page
  var GLASS = function () {
    return M.glass + ';border:' + M.border + ';border-radius:' + M.radius +
      ';box-shadow:inset 0 1px 0 rgba(255,255,255,0.2),var(--hk-glass-shadow-lg,0 10px 28px rgba(0,0,0,0.12))';
  };
  var PAGE_CSS = function () {
    return [
      ':host{display:block;color:#fff;-webkit-tap-highlight-color:transparent}',
      'button{appearance:none;font:inherit;color:#fff;cursor:pointer;margin:0}',
      '.bar{display:flex;align-items:center;gap:14px;min-height:52px;margin:6px 0 16px;flex-wrap:wrap}',
      '.ttl{font-size:34px;font-weight:700;letter-spacing:-0.6px;white-space:nowrap}',
      '.ttl span{font-weight:300;opacity:0.8}',
      '.arrows{display:flex;gap:8px}',
      '.rb{width:44px;height:44px;border-radius:22px;border:' + M.border + ';background:' + M.bg + ';display:flex;align-items:center;justify-content:center;padding:0}',
      '.pb{height:44px;padding:0 18px;border-radius:22px;border:' + M.border + ';background:' + M.bg + ';font-size:15px;font-weight:600}',
      '.sp{flex:1}',
      '.seg{height:44px;padding:3px;border-radius:22px;border:' + M.border + ';background:' + M.bg + ';display:flex;gap:2px}',
      '.seg button{width:80px;height:36px;border-radius:18px;border:0;background:transparent;font-size:15px;font-weight:600}',
      '.seg button[aria-selected="true"]{background:#fff;color:#1c1c1e}',
      '.new{height:44px;padding:0 18px 0 14px;border-radius:22px;border:0;background:#fff;color:#1c1c1e;font-size:15px;font-weight:600;display:flex;align-items:center;gap:6px}',
      '.panel{' + GLASS() + ';position:relative;overflow:hidden}',
      '.body{display:flex;gap:20px;align-items:stretch}',
      '.wide .body{height:var(--cal-h,620px)}',
      '.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.warn{margin:0 0 12px;font-size:14px;font-weight:600;color:#ffd60a}',
      '.empty{padding:18px 0;font-size:15px;color:rgba(255,255,255,0.75)}',
      // ---- month
      '.mgrid{flex:1;min-width:0;padding:10px 12px 12px;display:flex;flex-direction:column}',
      '.dows{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));height:30px;align-items:center;flex:none}',
      '.dows div{padding-left:8px;font-size:12px;font-weight:600;letter-spacing:0.8px;color:rgba(255,255,255,0.75)}',
      '.weeks{flex:1;display:flex;flex-direction:column;min-height:0}',
      '.wk{position:relative;flex:1;min-height:0;border-top:1px solid rgba(255,255,255,0.12);display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}',
      '.cell{position:relative;min-width:0;overflow:hidden;border:0;background:transparent;text-align:left;padding:0;display:block}',
      '.cell + .cell{border-left:1px solid rgba(255,255,255,0.08)}',
      '.cell.out{opacity:0.45}',
      '.cell.sel{background:rgba(255,255,255,0.08)}',
      '.num{position:absolute;left:9px;top:8px;font-size:15px;font-weight:600;line-height:20px}',
      '.cell.today .num{left:5px;top:5px;width:26px;height:26px;line-height:26px;border-radius:13px;background:#fff;color:#1c1c1e;font-weight:700;text-align:center}',
      '.chips{position:absolute;left:9px;right:6px;display:flex;flex-direction:column;gap:2px}',
      '.chip{height:17px;line-height:17px;font-size:12px;font-weight:500;display:flex;align-items:center;gap:5px;min-width:0}',
      '.chip i{flex:none;width:7px;height:7px;border-radius:4px}',
      '.chip b{font-weight:700}',
      '.more{height:17px;line-height:17px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.75)}',
      '.bar1{position:absolute;height:18px;line-height:18px;border-radius:6px;font-size:11px;font-weight:700;padding:0 6px;box-sizing:border-box;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;text-align:left;color:#fff}',
      '.dots{position:absolute;left:0;right:0;bottom:6px;display:flex;justify-content:center;gap:3px}',
      '.dots i{width:6px;height:6px;border-radius:3px}',
      // ---- the day's list (month) and the agenda rows
      '.side{width:380px;flex:none;padding:22px 22px 18px;display:flex;flex-direction:column}',
      '.dname{font-size:28px;font-weight:700;letter-spacing:-0.4px}',
      '.dsub{font-size:15px;font-weight:500;color:rgba(255,255,255,0.8);margin-top:2px}',
      '.list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;margin-top:10px}',
      '.ad{width:100%;height:30px;margin-top:6px;border-radius:9px;border:0;display:flex;align-items:center;padding:0 12px;gap:8px;font-size:14px;font-weight:600;text-align:left}',
      '.ad i{flex:none;width:8px;height:8px;border-radius:4px}',
      '.ad em{margin-left:auto;font-style:normal;font-weight:500;color:rgba(255,255,255,0.85);white-space:nowrap}',
      '.ev{width:100%;display:flex;align-items:flex-start;padding:12px 0;border:0;border-bottom:1px solid rgba(255,255,255,0.1);background:transparent;text-align:left;gap:0}',
      '.ev:last-child{border-bottom:0}',
      '.ev.past{opacity:0.5}',
      '.ev .tm{width:76px;flex:none;font-size:14px;font-weight:600;padding-top:2px}',
      '.ev i{flex:none;width:9px;height:9px;border-radius:5px;margin:7px 10px 0 0}',
      '.ev .tx{min-width:0;flex:1}',
      '.ev .t1{font-size:17px;font-weight:600}',
      '.ev .t2{font-size:14px;color:rgba(255,255,255,0.8);margin-top:2px}',
      '.soon{flex:none;height:24px;padding:0 10px;border-radius:12px;background:#fff;color:#1c1c1e;font-size:12px;font-weight:700;display:flex;align-items:center;margin-left:8px}',
      '.addday{height:44px;border-radius:22px;border:1px dashed rgba(255,255,255,0.35);background:transparent;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;flex:none}',
      // ---- week and day: the time grid
      '.tg{flex:1;min-width:0;padding:8px 12px 12px;display:flex;flex-direction:column}',
      '.cols{display:grid;flex:none}',
      '.dh{display:flex;align-items:center;justify-content:center;gap:7px;height:46px;border:0;background:transparent;padding:0}',
      '.dh span{font-size:13px;font-weight:600;letter-spacing:0.6px;color:rgba(255,255,255,0.78)}',
      '.dh b{font-size:17px;font-weight:600}',
      '.dh.today b{width:28px;height:28px;line-height:28px;border-radius:14px;background:#fff;color:#1c1c1e;font-weight:700;text-align:center;font-size:15px}',
      '.alld{position:relative;border-top:1px solid rgba(255,255,255,0.12);flex:none}',
      '.alld .lab{position:absolute;left:0;top:50%;transform:translateY(-50%);width:50px;text-align:right;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7)}',
      '.tl{position:relative;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border-top:1px solid rgba(255,255,255,0.12)}',
      '.hrs{position:relative}',
      '.hr{position:absolute;left:56px;right:0;height:0;border-top:1px solid rgba(255,255,255,0.08)}',
      '.hr span{position:absolute;left:-56px;top:-8px;width:50px;text-align:right;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7)}',
      '.days{position:absolute;top:0;bottom:0;right:0;display:grid}',
      '.dcol{position:relative;border-left:1px solid rgba(255,255,255,0.08)}',
      '.dcol.today{background:rgba(255,255,255,0.06)}',
      '.slot{position:absolute;left:0;right:0;border:0;background:transparent;padding:0}',
      '.blk{position:absolute;box-sizing:border-box;overflow:hidden;border-radius:8px;padding:4px 8px;border:0;text-align:left;color:#fff;line-height:1.25}',
      '.blk .t1{font-size:13px;font-weight:700}',
      '.blk .t2{font-size:12px;font-weight:500;color:rgba(255,255,255,0.88);margin-top:1px}',
      '.blk.past{opacity:0.7}',
      '.blk.sel{box-shadow:0 0 0 2px #fff}',
      '.dayv .blk{border-radius:10px;padding:4px 12px;line-height:1.25}',
      '.dayv .blk .t1{font-size:15px}',
      '.dayv .blk .t2{font-size:13px;margin-top:2px}',
      '.now{position:absolute;height:2px;background:#ff453a;pointer-events:none}',
      '.now::before{content:"";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:5px;background:#ff453a}',
      '.nowl{position:absolute;left:0;width:50px;text-align:right;font-size:11px;font-weight:700;color:#ff6961;pointer-events:none}',
      // ---- the day's right column: the month, the event
      '.rcol{width:400px;flex:none;display:flex;flex-direction:column;gap:16px;min-height:0}',
      '.mini{padding:16px 18px 14px;flex:none}',
      '.mini .mh{display:flex;align-items:center}',
      '.mini .mh b{font-size:17px;font-weight:700;flex:1}',
      '.mini .mh button{width:36px;height:36px;border:0;background:transparent;padding:0;display:flex;align-items:center;justify-content:center}',
      '.mgr{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));margin-top:6px;row-gap:2px}',
      '.mgr .w{text-align:center;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);height:22px;line-height:22px}',
      '.md{height:38px;border:0;background:transparent;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}',
      '.md b{height:26px;min-width:26px;line-height:26px;font-size:14px;font-weight:600;border-radius:13px;text-align:center}',
      '.md.out b{opacity:0.4}',
      '.md.today b{background:#fff;color:#1c1c1e;font-weight:700}',
      '.md.sel:not(.today) b{background:rgba(255,255,255,0.22)}',
      '.md i{width:5px;height:5px;border-radius:3px}',
      '.det{padding:18px 20px;flex:none}',
      '.det .c{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.8)}',
      '.det .c i{width:10px;height:10px;border-radius:5px}',
      '.det h3{font-size:22px;font-weight:700;margin:8px 0 0;letter-spacing:-0.3px;overflow-wrap:anywhere}',
      '.det .ln{display:flex;align-items:flex-start;gap:10px;margin-top:9px;font-size:15px}',
      '.det .ln svg{flex:none;margin-top:2px}',
      '.det .ln span{min-width:0;overflow-wrap:anywhere}',
      '.det .note{color:rgba(255,255,255,0.85);white-space:pre-wrap;max-height:84px;overflow:hidden}',
      '.det .acts{display:flex;gap:10px;margin-top:16px}',
      '.det .acts button{flex:1;height:44px;border-radius:22px;font-size:15px;font-weight:600}',
      '.det .ed{border:' + M.border + ';background:rgba(255,255,255,0.12)}',
      '.det .rm{border:1px solid rgba(255,105,97,0.45);background:rgba(255,69,58,0.18);color:#ffb3ae}',
      '.det .none{font-size:15px;color:rgba(255,255,255,0.75)}',
      // ---- narrow (a phone): stacked
      '.narrow .ttl{font-size:26px}',
      '.narrow .bar{gap:10px}',
      '.narrow .sp{display:none}',
      '.narrow .arrows{margin-left:auto}',
      '.narrow .pb{order:4}',
      '.narrow .seg{order:5;flex:1}',
      '.narrow .seg button{flex:1;width:auto}',
      '.narrow .new{order:6}',
      '.narrow .body{flex-direction:column;gap:14px}',
      '.narrow .mgrid{padding:8px}',
      '.narrow .wk{height:56px;flex:none}',
      '.narrow .num{left:0;right:0;text-align:center}',
      '.narrow .cell.today .num{left:50%;margin-left:-13px}',
      '.narrow .side{width:auto;padding:18px}',
      '.narrow .list{overflow:visible}',
      '.narrow .tg{height:min(620px,calc(var(--hk-vh,100vh) - 220px));flex:none}',
      '.narrow .rcol{width:auto}',
      '.narrow .wl{padding:4px 18px 10px}',
      '.wl .dayh{font-size:13px;font-weight:700;letter-spacing:1.2px;color:rgba(255,255,255,0.7);margin-top:16px}',
      '.wl .dayh.today{color:#fff}'
    ].join('\n');
  };

  class HkCalendarCard extends HkBase {
    static get CSS() { return PAGE_CSS(); }
    constructor() {
      super();
      this._view = 'month';
      this._day = day0(new Date());     // the day chosen (and what the view shows)
      this._sel = null;                  // the event chosen (day view)
      this._evs = [];
      this._failed = [];
      this._have = '';                   // the range (and store version) the events are for
      this._n = 0;                       // answers in
      this._w = 0;
      var self = this;
      this._onChanged = function () { self._have = ''; self._fetch(); };
      this._onResize = function () { self._measure(); };
      // on its own shadow root: they live and go with the card
      this._root.addEventListener('click', function (e) { self._click(e); });
      this._root.addEventListener('pointerdown', function (e) { self._swipeStart(e); });
      this._root.addEventListener('pointerup', function (e) { self._swipeEnd(e); });
    }
    setConfig(config) {
      var c = Object.assign({}, config || {});
      if (c.view === 'week' || c.view === 'day') this._view = c.view;
      super.setConfig(c);
    }
    getCardSize() { return 12; }
    connectedCallback() {
      if (super.connectedCallback) super.connectedCallback();
      var self = this;
      window.addEventListener('hk-calendar-changed', this._onChanged);
      window.addEventListener('resize', this._onResize);
      if (typeof ResizeObserver === 'function' && !this._ro) {
        this._ro = new ResizeObserver(function (en) {
          var w = en && en[0] && en[0].contentRect ? en[0].contentRect.width : self.clientWidth;
          if (Math.abs(w - self._w) < 2) return;
          self._w = w;
          self._measure();
          self.redraw();
        });
        this._ro.observe(this);
      }
      // every five minutes the events again (a calendar changed elsewhere)
      this._tick = setInterval(function () { self._have = ''; self._fetch(); }, 300000);
      this._m0 = setTimeout(function () { self._m0 = null; self._measure(); }, 0);
    }
    disconnectedCallback() {
      if (super.disconnectedCallback) super.disconnectedCallback();
      window.removeEventListener('hk-calendar-changed', this._onChanged);
      window.removeEventListener('resize', this._onResize);
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      if (this._tick) { clearInterval(this._tick); this._tick = null; }
      if (this._m0) { clearTimeout(this._m0); this._m0 = null; }
      this._hkSig = null;
    }
    _wide() { return (this._w || this.clientWidth || 1200) >= 900; }
    // THE PAGE'S HEIGHT, on a wide screen: the panels reach the bottom of
    // the window, whatever is above them
    _measure() {
      if (!this.isConnected || !this.getBoundingClientRect) return;
      var r = this.getBoundingClientRect(), H = window.innerHeight || 800;
      var top = r.top + (window.scrollY || 0) + 74;      // the toolbar
      var h = Math.max(460, Math.round(H - top - 24));
      if (h !== this._h) { this._h = h; this.style.setProperty('--cal-h', h + 'px'); }
    }
    // THE DAYS SHOWN: the month's weeks, the week, or the day
    _range() {
      var d = this._day;
      if (this._view === 'month') {
        var first = new Date(d.getFullYear(), d.getMonth(), 1), from = weekStart(first);
        var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        var weeks = Math.ceil((Math.round((day0(last) - from) / DAY_MS) + 1) / 7);
        return { from: from, to: addDays(from, weeks * 7), weeks: weeks };
      }
      if (this._view === 'week') { var w = weekStart(d); return { from: w, to: addDays(w, 7) }; }
      // the day, and its month (the little month's dots)
      var m0 = weekStart(new Date(d.getFullYear(), d.getMonth(), 1));
      return { from: m0, to: addDays(m0, 42) };
    }
    _fetch() {
      var h = this._hass;
      if (!h) return;
      var r = this._range(), ids = calIds(h);
      var want = ids.join(',') + '|' + (+r.from) + '|' + (+r.to) + '|' + store.ver;
      if (want === this._have) return;
      this._have = want;
      var self = this;
      load(h, ids, r.from, r.to).then(function (got) {
        if (self._have !== want) return;
        self._evs = got.evs;
        self._failed = got.failed;
        self._n++;
        self.redraw();
      });
    }
    _sigOf() {
      var h = this._hass;
      if (!h || !this._config) return null;
      var ids = calIds(h), HS = window.hkSettings;
      var out = ids.map(function (id) { var s = h.states[id]; return id + '=' + (s ? s.last_updated : 'x'); }).join(';');
      var cols = ids.map(function (id) { return HS && HS.calendarColor ? HS.calendarColor(id, h.states) : ''; }).join(',');
      return out + '|' + cols + '|' + this._n + '|' + this._view + '|' + (+this._day) + '|' + (this._sel || '') +
        '|' + (this._wide() ? 'W' : 'N') + '|' + Math.floor(Date.now() / 60000);
    }
    _go(view, day) {
      if (view) this._view = view;
      if (day) this._day = day0(day);
      this._sel = null;
      this._fetch();
      this.redraw();
    }
    _step(n) {
      var d = this._day;
      if (this._view === 'month') this._go(null, addMonths(new Date(d.getFullYear(), d.getMonth(), 1), n));
      else this._go(null, addDays(d, this._view === 'week' ? 7 * n : n));
    }
    _swipeStart(e) {
      if (e.pointerType === 'mouse') return;
      this._sx = e.clientX; this._sy = e.clientY; this._st = Date.now();
    }
    // A SWIPE across the month or the week turns it (a sideways flick, not
    // a scroll of the hours)
    _swipeEnd(e) {
      if (this._sx == null || e.pointerType === 'mouse') return;
      var dx = e.clientX - this._sx, dy = e.clientY - this._sy, dt = Date.now() - this._st;
      this._sx = null;
      if (dt < 700 && Math.abs(dx) > 70 && Math.abs(dy) < 50) { this._swiped = Date.now(); this._step(dx < 0 ? 1 : -1); }
    }
    _find(key) { return this._evs.filter(function (e) { return e.key === key; })[0] || null; }
    _click(e) {
      if (this._swiped && Date.now() - this._swiped < 400) return;
      var b = e.composedPath ? e.composedPath().filter(function (n) { return n.getAttribute && n.getAttribute('data-a'); })[0]
                              : (e.target.closest && e.target.closest('[data-a]'));
      if (!b) return;
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v'), h = this._hass;
      if (a === 'prev') this._step(-1);
      else if (a === 'next') this._step(1);
      else if (a === 'today') this._go(null, new Date());
      else if (a === 'view') this._go(v, this._day);
      else if (a === 'new') newAt(h, this._view === 'month' || this._view === 'day' ? this._day : new Date(), false);
      else if (a === 'addday') newAt(h, this._day, false);
      else if (a === 'day') {
        var d = parseYmd(v);
        // a second tap on the chosen day opens it
        if (this._view === 'month' && sameDay(d, this._day)) this._go('day', d);
        else if (this._view === 'month') { this._day = d; if (d.getMonth() !== this._shownMonth) this._fetch(); this.redraw(); }
        else this._go('day', d);
      } else if (a === 'mini') { this._go(null, parseYmd(v)); }
      else if (a === 'minip' || a === 'minin') this._go(null, addMonths(this._day, a === 'minip' ? -1 : 1));
      else if (a === 'slot') {
        if (!writable(h).length) return;
        var p = v.split('T'), sd = parseYmd(p[0]);
        sd.setHours(+p[1], 0, 0, 0);
        newAt(h, sd, false);
      } else if (a === 'ev') {
        var ev = this._find(v);
        if (!ev) return;
        if (this._view === 'day' && this._wide()) { this._sel = v; this.redraw(); }
        else show(h, ev);
      } else if (a === 'edit') { var e1 = this._find(this._sel); if (e1) edit_(h, e1); }
      else if (a === 'del') { var e2 = this._find(this._sel), self = this; if (e2) askDelete(h, e2, function () { self._sel = null; }); }
    }
    _render() {
      var h = this._hass;
      if (!h || !this._config) return;
      this._fetch();
      var wide = this._wide();
      // KEEP WHERE THE HOURS WERE SCROLLED (the page is redrawn whole)
      var tl = this._root.querySelector && this._root.querySelector('.tl');
      var keep = tl && tl.getAttribute && tl.getAttribute('data-k') === this._view + (+this._day) ? tl.scrollTop : null;
      var list = this._root.querySelector && this._root.querySelector('.list'), keepL = list ? list.scrollTop : 0;
      var html = '<div class="' + (wide ? 'wide' : 'narrow') + '">' + this._bar(h, wide);
      if (!calIds(h).length) html += '<div class="panel" style="padding:22px"><div class="empty">No calendars. Add one to Home Assistant (Settings → Devices &amp; Services → Add Integration → Local Calendar) and it shows here.</div></div>';
      else {
        if (this._failed.length) html += '<div class="warn">' + esc(this._failed.map(function (id) { return calName(h, id); }).join(', ')) + ' couldn’t be read.</div>';
        html += this._view === 'week' ? this._week(h, wide) : this._view === 'day' ? this._dayView(h, wide) : this._month(h, wide);
      }
      this._root.innerHTML = html + '</div>';
      var tl2 = this._root.querySelector && this._root.querySelector('.tl');
      if (tl2 && tl2.setAttribute) {
        tl2.setAttribute('data-k', this._view + (+this._day));
        if (keep != null) tl2.scrollTop = keep;
        else tl2.scrollTop = Math.max(0, this._scrollTo * this._px - 12);
      }
      var l2 = this._root.querySelector && this._root.querySelector('.list');
      if (l2 && keepL) l2.scrollTop = keepL;
    }
    _bar(h, wide) {
      var d = this._day, v = this._view, ttl;
      if (v === 'month') ttl = MON[d.getMonth()] + ' <span>' + d.getFullYear() + '</span>';
      else if (v === 'week') {
        var a = weekStart(d), b = addDays(a, 6);
        ttl = (wide ? MON3[a.getMonth()] + ' ' + a.getDate() + ' – ' + (a.getMonth() === b.getMonth() ? '' : MON3[b.getMonth()] + ' ') + b.getDate()
                    : MON3[a.getMonth()] + ' ' + a.getDate() + ' – ' + b.getDate()) + ' <span>' + b.getFullYear() + '</span>';
      } else ttl = (wide ? DOW_LONG[d.getDay()] + ', ' + MON[d.getMonth()] : DOW_LONG[d.getDay()].slice(0, 3) + ', ' + MON3[d.getMonth()]) +
                   ' ' + d.getDate() + ' <span>' + d.getFullYear() + '</span>';
      var prevL = v === 'month' ? 'Previous month' : v === 'week' ? 'Previous week' : 'Previous day';
      var nextL = v === 'month' ? 'Next month' : v === 'week' ? 'Next week' : 'Next day';
      var seg = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(function (o) {
        return '<button role="tab" data-a="view" data-v="' + o[0] + '" aria-selected="' + (o[0] === v) + '">' + o[1] + '</button>';
      }).join('');
      var isToday = v === 'month' ? (d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear())
                  : v === 'week' ? sameDay(weekStart(d), weekStart(new Date())) : sameDay(d, new Date());
      return '<div class="bar"><div class="ttl">' + ttl + '</div>' +
        '<div class="arrows"><button class="rb" data-a="prev" aria-label="' + prevL + '">' + IC.left + '</button>' +
        '<button class="rb" data-a="next" aria-label="' + nextL + '">' + IC.right + '</button></div>' +
        '<button class="pb" data-a="today"' + (isToday ? ' aria-current="date"' : '') + '>Today</button>' +
        '<div class="sp"></div><div class="seg" role="tablist" aria-label="View">' + seg + '</div>' +
        (writable(h).length ? '<button class="new" data-a="new" aria-label="New Event">' + IC.plus + (wide ? 'New Event' : '') + '</button>' : '') +
        '</div>';
    }
    // ---- the month
    _month(h, wide) {
      var r = this._range(), evs = this._evs, today = new Date(), d = this._day;
      this._shownMonth = d.getMonth();
      var rowH = wide ? (this._h || 620) - 20 - 30 : 56;
      rowH = wide ? rowH / r.weeks : 56;
      var weeks = '';
      for (var w = 0; w < r.weeks; w++) {
        var from = addDays(r.from, w * 7), bs = bars(evs, from, 7), shownLanes = wide ? Math.min(bs.lanes, 2) : 0;
        var cells = '';
        for (var c = 0; c < 7; c++) {
          var day = addDays(from, c), cls = 'cell' + (day.getMonth() !== d.getMonth() ? ' out' : '') +
            (sameDay(day, today) ? ' today' : '') + (sameDay(day, d) ? ' sel' : '');
          var mine = onDay(evs, day);
          var inner = '<span class="num">' + day.getDate() + '</span>';
          if (wide) {
            // the day's own (not an all-day bar shown above it)
            var barred = bs.list.filter(function (b) { return b.lane < shownLanes && c >= b.a && c <= b.b; }).map(function (b) { return b.ev; });
            var own = mine.filter(function (e) { return barred.indexOf(e) < 0; });
            var top = 31 + shownLanes * 20 + 2, room = Math.max(0, Math.floor((rowH - top - 2) / 19));
            var showN = own.length > room ? Math.max(0, room - 1) : own.length;
            inner += '<span class="chips" style="top:' + top + 'px">' + own.slice(0, showN).map(function (e) {
              var rgb = rgbOf(e.cal, h);
              return '<span class="chip"><i style="background:' + rgba(rgb, 1) + '"></i><span class="ell">' +
                (e.allDay ? '' : '<b>' + tshort(e.start < day0(day) ? day0(day) : e.start) + '</b> ') + esc(e.title) + '</span></span>';
            }).join('') + (own.length > showN ? '<span class="more">+' + (own.length - showN) + ' more</span>' : '') + '</span>';
          } else if (ownDay(evs, day).length) {
            var cs = [];
            ownDay(evs, day).forEach(function (e) { var k = rgba(rgbOf(e.cal, h), 1); if (cs.indexOf(k) < 0) cs.push(k); });
            inner += '<span class="dots">' + cs.slice(0, 3).map(function (k) { return '<i style="background:' + k + '"></i>'; }).join('') + '</span>';
          }
          cells += '<button class="' + cls + '" data-a="day" data-v="' + ymd(day) + '" aria-label="' + DOW_LONG[day.getDay()] + ', ' +
            MON[day.getMonth()] + ' ' + day.getDate() + (mine.length ? ', ' + mine.length + (mine.length === 1 ? ' event' : ' events') : '') + '">' + inner + '</button>';
        }
        var barsHtml = bs.list.filter(function (b) { return b.lane < shownLanes; }).map(function (b) {
          var rgb = rgbOf(b.ev.cal, h);
          return '<button class="bar1" data-a="ev" data-v="' + esc(b.ev.key) + '" style="top:' + (31 + b.lane * 20) + 'px;left:calc(' + b.a +
            ' * 100% / 7 + 3px);width:calc(' + (b.b - b.a + 1) + ' * 100% / 7 - 6px);background:' + rgba(rgb, 0.38) + '">' + esc(b.ev.title) + '</button>';
        }).join('');
        weeks += '<div class="wk">' + cells + barsHtml + '</div>';
      }
      var grid = '<div class="panel mgrid"><div class="dows">' + DOW.map(function (x) { return '<div>' + (wide ? x : x.charAt(0)) + '</div>'; }).join('') +
        '</div><div class="weeks">' + weeks + '</div></div>';
      return '<div class="body">' + grid + this._dayList(h, wide) + '</div>';
    }
    // THE CHOSEN DAY'S EVENTS (beside the month)
    _dayList(h, wide) {
      var d = this._day, now = new Date(), evs = onDay(this._evs, d), today = sameDay(d, now);
      var all = evs.filter(function (e) { return e.allDay || (e.start <= day0(d) && e.end >= addDays(day0(d), 1)); });
      var timed = evs.filter(function (e) { return all.indexOf(e) < 0; });
      var next = null;
      if (today) timed.forEach(function (e) { if (!next && soon(e, now)) next = e; });
      var sub = MON[d.getMonth()] + ' ' + d.getDate() + (today ? ' · Today' : sameDay(d, addDays(day0(now), 1)) ? ' · Tomorrow' : '');
      var rows = timed.map(function (e) {
        var rgb = rgbOf(e.cal, h), past = e.end <= now;
        var sl = e === next ? soon(e, now) : '';
        return '<button class="ev' + (past ? ' past' : '') + '" data-a="ev" data-v="' + esc(e.key) + '">' +
          '<span class="tm">' + (e.start < day0(d) ? 'Until' : time(e.start)) + '</span><i style="background:' + rgba(rgb, 1) + '"></i>' +
          '<span class="tx"><span class="t1 ell" style="display:block">' + esc(e.title) + '</span>' +
          '<span class="t2 ell" style="display:block">' + esc(span(e) + (e.loc ? ' · ' + e.loc : '')) + '</span></span>' +
          (sl ? '<span class="soon">' + sl + '</span>' : '') + '</button>';
      }).join('');
      var alls = all.map(function (e) {
        var rgb = rgbOf(e.cal, h);
        return '<button class="ad" data-a="ev" data-v="' + esc(e.key) + '" style="background:' + rgba(rgb, 0.32) + '"><i style="background:' +
          rgba(rgb, 1) + '"></i><span class="ell">' + esc(e.title) + '</span><em>' + esc(span(e)) + '</em></button>';
      }).join('');
      return '<div class="panel side"><div class="dname">' + DOW_LONG[d.getDay()] + '</div><div class="dsub">' + sub + '</div>' +
        '<div class="list">' + alls + (rows || (alls ? '' : '<div class="empty">Nothing on this day.</div>')) + '</div>' +
        (writable(h).length ? '<button class="addday" data-a="addday">' + IC.plus + ' Add an Event on ' + DOW_LONG[d.getDay()] + '</button>' : '') +
        '</div>';
    }
    // ---- the time grid (week: 7 columns; day: 1)
    _grid(h, days, wide, isDay) {
      var PX = isDay ? 48 : 44, now = new Date(), self = this;
      this._px = PX;
      var n = days.length, gutter = 56, evs = this._evs;
      var from = days[0], bs = bars(evs, from, n);
      var allH = Math.max(30, bs.lanes * 26 + 6);
      var heads = isDay ? '' : '<div class="cols" style="grid-template-columns:' + gutter + 'px repeat(' + n + ',minmax(0,1fr))"><div></div>' +
        days.map(function (d) {
          return '<button class="dh' + (sameDay(d, now) ? ' today' : '') + '" data-a="day" data-v="' + ymd(d) + '" aria-label="' +
            DOW_LONG[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate() + '"><span>' + (wide ? DOW[d.getDay()] : DOW[d.getDay()].charAt(0)) +
            '</span><b>' + d.getDate() + '</b></button>';
        }).join('') + '</div>';
      var alld = '<div class="alld" style="height:' + allH + 'px"><span class="lab">all-day</span>' + bs.list.map(function (b) {
        var rgb = rgbOf(b.ev.cal, h);
        return '<button class="bar1" data-a="ev" data-v="' + esc(b.ev.key) + '" style="top:' + (4 + b.lane * 26) + 'px;height:22px;line-height:22px;font-size:12px;left:calc(' +
          gutter + 'px + ' + b.a + ' * (100% - ' + gutter + 'px) / ' + n + ' + 3px);width:calc(' + (b.b - b.a + 1) + ' * (100% - ' + gutter + 'px) / ' + n +
          ' - 6px);background:' + rgba(rgb, 0.38) + '">' + esc(b.ev.title) + (isDay && b.ev.allDay ? '<span style="font-weight:500;margin-left:8px;opacity:0.85">' + esc(span(b.ev).replace('All day · ', '').replace('All day', '')) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
      // (the hour's label gives way to the time now, where they would meet)
      var nowAt = days.some(function (d) { return sameDay(d, now); }) ? (now - day0(now)) / 3600000 * PX : -99;
      var hrs = '';
      for (var hr = 1; hr < 24; hr++) {
        hrs += '<div class="hr" style="top:' + (hr * PX) + 'px">' + (Math.abs(hr * PX - nowAt) < 14 ? '' : '<span>' + hourLabel(hr) + '</span>') + '</div>';
      }
      var first = 24;
      var cols = days.map(function (d) {
        var a = day0(d), b = addDays(a, 1), today = sameDay(d, now);
        var items = evs.filter(function (e) { return !e.allDay && (e.end - e.start) < DAY_MS && e.start < b && e.end > a; })
          .map(function (e) { return { ev: e, s: e.start < a ? a : e.start, e: e.end > b ? b : e.end }; });
        var slots = '';
        for (var h2 = 0; h2 < 24; h2++) slots += '<button class="slot" tabindex="-1" aria-hidden="true" data-a="slot" data-v="' + ymd(d) + 'T' + h2 + '" style="top:' + (h2 * PX) + 'px;height:' + PX + 'px"></button>';
        var blocks = lanes(items).map(function (it) {
          var top = (it.s - a) / 3600000 * PX, ht = Math.max(18, (it.e - it.s) / 3600000 * PX - 3);
          first = Math.min(first, (it.s - a) / 3600000);
          var rgb = rgbOf(it.ev.cal, h), past = it.ev.end <= now, w = 100 / it.cols;
          return '<button class="blk' + (past ? ' past' : '') + (self._sel === it.ev.key ? ' sel' : '') + '" data-a="ev" data-v="' + esc(it.ev.key) + '" style="top:' + (top + 1) +
            'px;height:' + ht + 'px;left:calc(' + (it.col * w) + '% + 3px);width:calc(' + w + '% - 6px);background:' + rgba(rgb, past ? 0.22 : 0.42) + '">' +
            '<div class="t1 ell">' + esc(it.ev.title) + '</div>' + (ht > 30 ? '<div class="t2 ell">' + esc(span(it.ev) + (isDay && it.ev.loc ? ' · ' + it.ev.loc : '')) + '</div>' : '') + '</button>';
        }).join('');
        return '<div class="dcol' + (today && !isDay ? ' today' : '') + '">' + slots + blocks + '</div>';
      }).join('');
      var nowIdx = -1;
      days.forEach(function (d, i) { if (sameDay(d, now)) nowIdx = i; });
      var nowTop = (now - day0(now)) / 3600000 * PX;
      var nowLine = nowIdx < 0 ? '' : '<div class="now" style="top:' + nowTop + 'px;left:calc(' + gutter + 'px + ' + nowIdx + ' * (100% - ' + gutter + 'px) / ' + n +
        ');width:calc((100% - ' + gutter + 'px) / ' + n + ')"></div><div class="nowl" style="top:' + (nowTop - 8) + 'px">' + time(now).replace(' AM', '').replace(' PM', '') + '</div>';
      // first look: the hour before now (today shown) or before the first event, else 7 AM
      this._scrollTo = Math.max(0, Math.floor(nowIdx >= 0 ? (now - day0(now)) / 3600000 - 2 : first < 24 ? first - 1 : 7));
      return heads + alld + '<div class="tl"><div class="hrs" style="height:' + (24 * PX) + 'px">' + hrs +
        '<div class="days" style="left:' + gutter + 'px;grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + cols + '</div>' + nowLine + '</div></div>';
    }
    _week(h, wide) {
      var a = weekStart(this._day), days = [];
      for (var i = 0; i < 7; i++) days.push(addDays(a, i));
      if (!wide) return '<div class="body">' + this._weekList(h, days) + '</div>';
      return '<div class="body"><div class="panel tg">' + this._grid(h, days, wide, false) + '</div></div>';
    }
    // A WEEK ON A PHONE: day by day, as a list
    _weekList(h, days) {
      var now = new Date(), self = this;
      var out = days.map(function (d) {
        var evs = onDay(self._evs, d);
        return '<div class="dayh' + (sameDay(d, now) ? ' today' : '') + '">' + DOW_LONG[d.getDay()].toUpperCase() + ' · ' + MON3[d.getMonth()].toUpperCase() + ' ' + d.getDate() + '</div>' +
          (evs.length ? evs.map(function (e) {
            var rgb = rgbOf(e.cal, h);
            return '<button class="ev' + (e.end <= now ? ' past' : '') + '" data-a="ev" data-v="' + esc(e.key) + '"><span class="tm">' +
              (e.allDay ? 'All day' : time(e.start < day0(d) ? day0(d) : e.start)) + '</span><i style="background:' + rgba(rgb, 1) + '"></i><span class="tx">' +
              '<span class="t1 ell" style="display:block">' + esc(e.title) + '</span>' + (e.loc ? '<span class="t2 ell" style="display:block">' + esc(e.loc) + '</span>' : '') + '</span></button>';
          }).join('') : '<div class="empty" style="padding:8px 0">Nothing.</div>');
      }).join('');
      return '<div class="panel wl">' + out + '</div>';
    }
    _dayView(h, wide) {
      var d = this._day;
      var grid = '<div class="panel tg dayv">' + this._grid(h, [d], wide, true) + '</div>';
      if (!wide) return '<div class="body">' + grid + '</div>';
      return '<div class="body">' + grid + '<div class="rcol">' + this._mini(h) + this._detail(h) + '</div></div>';
    }
    // THE LITTLE MONTH beside the day: any day in a tap, a dot where there
    // are events
    _mini(h) {
      var d = this._day, from = weekStart(new Date(d.getFullYear(), d.getMonth(), 1)), now = new Date(), evs = this._evs;
      var cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (x) { return '<div class="w">' + x + '</div>'; }).join('');
      var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      var n = Math.ceil((Math.round((day0(last) - from) / DAY_MS) + 1) / 7) * 7;
      for (var i = 0; i < n; i++) {
        var x = addDays(from, i), mine = ownDay(evs, x);
        var dot = mine.length ? rgba(rgbOf(mine[0].cal, h), 1) : 'transparent';
        cells += '<button class="md' + (x.getMonth() !== d.getMonth() ? ' out' : '') + (sameDay(x, now) ? ' today' : '') + (sameDay(x, d) ? ' sel' : '') +
          '" data-a="mini" data-v="' + ymd(x) + '" aria-label="' + MON[x.getMonth()] + ' ' + x.getDate() + '"><b>' + x.getDate() + '</b><i style="background:' + dot + '"></i></button>';
      }
      return '<div class="panel mini"><div class="mh"><b>' + MON[d.getMonth()] + ' ' + d.getFullYear() + '</b>' +
        '<button data-a="minip" aria-label="Previous month">' + IC.left + '</button><button data-a="minin" aria-label="Next month">' + IC.right + '</button></div>' +
        '<div class="mgr">' + cells + '</div></div>';
    }
    // THE CHOSEN EVENT (day view): tap one in the hours
    _detail(h) {
      var now = new Date(), d = this._day, ev = this._sel ? this._find(this._sel) : null;
      if (!ev) {
        // nothing chosen: the next one today, else the day's first
        var evs = onDay(this._evs, d);
        ev = evs.filter(function (e) { return !e.allDay && e.end > now; })[0] || evs.filter(function (e) { return !e.allDay; })[0] || null;
        if (ev) this._sel = ev.key;
      }
      if (!ev) {
        var anyAll = onDay(this._evs, d).length > 0;
        return '<div class="panel det"><div class="none">' + (anyAll ? 'Only all-day events on this day.' : 'Nothing on this day.') +
          (writable(h).length ? ' Tap an hour to add an event.' : '') + '</div></div>';
      }
      var rgb = rgbOf(ev.cal, h), sl = soon(ev, now);
      var when = (sameDay(ev.start, now) ? 'Today, ' : DOW_LONG[ev.start.getDay()] + ', ') + span(ev);
      var ed = can(h, ev.cal, 'update') && ev.uid, rm = can(h, ev.cal, 'delete') && ev.uid;
      return '<div class="panel det"><div class="c"><i style="background:' + rgba(rgb, 1) + '"></i>' + esc(calName(h, ev.cal)) +
        (sl ? '<span class="soon" style="margin-left:auto">' + sl + '</span>' : '') + '</div>' +
        '<h3>' + esc(ev.title) + '</h3>' +
        '<div class="ln">' + IC.clock + '<span>' + esc(when) + '</span></div>' +
        (ev.rrule ? '<div class="ln">' + IC.repeat + '<span>' + esc(repeatLabel(ev.rrule)) + '</span></div>' : '') +
        (ev.loc ? '<div class="ln">' + IC.pin + '<span>' + esc(ev.loc) + '</span></div>' : '') +
        (ev.desc ? '<div class="ln" style="color:rgba(255,255,255,0.85)">' + IC.notes + '<span class="note">' + esc(ev.desc) + '</span></div>' : '') +
        (ed || rm ? '<div class="acts">' + (ed ? '<button class="ed" data-a="edit">Edit</button>' : '') + (rm ? '<button class="rm" data-a="del">Delete</button>' : '') + '</div>' : '') +
        '</div>';
    }
  }

  // ------------------------------------------------------------ the pane
  // THE SCREENSAVER'S CALENDAR PANE (hk-saver.js draws its place, its
  // background and its scrolling): today's events and the coming days',
  // big enough to read across a room. Past events today are dimmed; the
  // next one says how soon.
  var PANE_CSS = [
    ':host{display:block;color:#fff}',
    '.day{padding-top:22px}',
    '.lbl{font-size:13px;font-weight:700;letter-spacing:1.4px;color:rgba(255,255,255,0.72)}',
    '.date{font-size:24px;font-weight:700;letter-spacing:-0.3px;margin-top:2px}',
    '.ad{margin-top:12px;min-height:32px;border-radius:10px;display:flex;align-items:center;padding:4px 12px;gap:8px;font-size:15px;font-weight:600}',
    '.ad i{flex:none;width:8px;height:8px;border-radius:4px}',
    '.ad em{margin-left:auto;font-style:normal;font-weight:500;color:rgba(255,255,255,0.85);white-space:nowrap}',
    '.ev{display:flex;align-items:flex-start;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.1)}',
    '.ev:last-child{border-bottom:0}',
    '.ev.past{opacity:0.45}',
    '.tm{width:82px;flex:none;font-size:16px;font-weight:600;padding-top:3px}',
    '.ev i{flex:none;width:10px;height:10px;border-radius:5px;margin:9px 12px 0 0}',
    '.tx{min-width:0;flex:1}',
    '.t1{font-size:20px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.t2{font-size:15px;color:rgba(255,255,255,0.8);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.soon{flex:none;margin:2px 0 0 8px;height:24px;padding:0 10px;border-radius:12px;background:#fff;color:#1c1c1e;font-size:12px;font-weight:700;display:flex;align-items:center}',
    '.none{font-size:17px;color:rgba(255,255,255,0.7);padding:12px 0 4px}',
    '.foot{height:60px}'
  ].join('\n');
  class HkCalendarPaneCard extends HkBase {
    static get CSS() { return PANE_CSS; }
    constructor() {
      super();
      this._evs = []; this._have = ''; this._n = 0;
      var self = this;
      this._onChanged = function () { self._have = ''; self._fetch(); };
    }
    getCardSize() { return 6; }
    connectedCallback() {
      if (super.connectedCallback) super.connectedCallback();
      var self = this;
      window.addEventListener('hk-calendar-changed', this._onChanged);
      this._tick = setInterval(function () { self._have = ''; self._fetch(); }, 300000);
    }
    disconnectedCallback() {
      if (super.disconnectedCallback) super.disconnectedCallback();
      window.removeEventListener('hk-calendar-changed', this._onChanged);
      if (this._tick) { clearInterval(this._tick); this._tick = null; }
      this._hkSig = null;
    }
    _days() { var n = Number((this._config || {}).days); return n >= 1 && n <= 7 ? Math.round(n) : 2; }
    _fetch() {
      var h = this._hass;
      if (!h) return;
      var from = day0(new Date()), to = addDays(from, this._days()), ids = calIds(h);
      var want = ids.join(',') + '|' + (+from) + '|' + this._days() + '|' + store.ver;
      if (want === this._have) return;
      this._have = want;
      var self = this;
      load(h, ids, from, to).then(function (got) {
        if (self._have !== want) return;
        self._evs = got.evs; self._n++;
        self.redraw();
      });
    }
    _sigOf() {
      var h = this._hass;
      if (!h || !this._config) return null;
      var ids = calIds(h), HS = window.hkSettings;
      return ids.map(function (id) { var s = h.states[id]; return id + '=' + (s ? s.last_updated : 'x') + '/' +
        (HS && HS.calendarColor ? HS.calendarColor(id, h.states) : ''); }).join(';') + '|' + this._n + '|' + Math.floor(Date.now() / 60000);
    }
    _render() {
      var h = this._hass;
      if (!h || !this._config) return;
      this._fetch();
      var now = new Date(), d0 = day0(now), self = this, html = '', next = null;
      onDay(this._evs, d0).forEach(function (e) { if (!next && soon(e, now)) next = e; });
      for (var i = 0; i < this._days(); i++) {
        var d = addDays(d0, i), evs = onDay(self._evs, d);
        var all = evs.filter(function (e) { return e.allDay || (e.start <= d && e.end >= addDays(d, 1)); });
        var timed = evs.filter(function (e) { return all.indexOf(e) < 0; });
        var lbl = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : DOW_LONG[d.getDay()].toUpperCase();
        var date = i < 2 ? DOW_LONG[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate() : MON[d.getMonth()] + ' ' + d.getDate();
        html += '<div class="day"><div class="lbl">' + lbl + '</div><div class="date">' + date + '</div>' +
          all.map(function (e) {
            var rgb = rgbOf(e.cal, h);
            return '<div class="ad" style="background:' + rgba(rgb, 0.32) + '"><i style="background:' + rgba(rgb, 1) + '"></i>' + esc(e.title) + '<em>All day</em></div>';
          }).join('') +
          '<div>' + timed.map(function (e) {
            var rgb = rgbOf(e.cal, h), sl = e === next ? soon(e, now) : '';
            var sub = e.loc || (e.end - e.start > 3600000 ? time(e.start) + ' – ' + time(e.end) : calName(h, e.cal));
            return '<div class="ev' + (e.end <= now ? ' past' : '') + '"><div class="tm">' + (e.start < d ? 'Until' : time(e.start)) +
              '</div><i style="background:' + rgba(rgb, 1) + '"></i><div class="tx"><div class="t1">' + esc(e.title) + '</div><div class="t2">' +
              esc(sub) + '</div></div>' + (sl ? '<div class="soon">' + sl + '</div>' : '') + '</div>';
          }).join('') + '</div>' +
          (evs.length ? '' : '<div class="none">Nothing scheduled.</div>') + '</div>';
      }
      if (!calIds(h).length) html = '<div class="day"><div class="none">No calendars.</div></div>';
      this._root.innerHTML = html + '<div class="foot"></div>';
    }
  }

  register('hk-calendar-card', HkCalendarCard, 'HK Calendar',
    'The house’s calendars: the month, the week or the day, with events to add, change and delete.',
    C && [{ name: 'view', selector: { select: { options: [{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }] } } }],
    function () { return {}; });
  register('hk-calendar-pane-card', HkCalendarPaneCard, 'HK Calendar Pane',
    'Today’s events and the coming days’, as the screensaver’s calendar pane shows them.',
    C && [{ name: 'days', selector: { number: { min: 1, max: 7, mode: 'box' } } }],
    function () { return { days: 2 }; });

  window.hkCalendar = {
    version: '1.0.0',
    ids: calIds, load: load, create: create, update: update, remove: remove, changed: changed,
    show: show, edit: edit_, newAt: newAt, close: closeSheet,
    // tests
    _: { norm: norm, onDay: onDay, ownDay: ownDay, lanes: lanes, bars: bars, payload: payload, isoLocal: isoLocal, ymd: ymd,
         weekStart: weekStart, addMonths: addMonths, span: span, soon: soon, tshort: tshort, store: store }
  };
  });
})();
