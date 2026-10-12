// hk-saver-panel.js -- the screensaver music's panel: Speakers, Volume, Browse.
//
// WHAT IT IS (2026-10-11, the user's design from the mockups): two buttons
// either side of the screensaver music's transport -- Speakers and Browse --
// turn the album art (the slide) or the whole pane over, and this is what is
// on the back:
//
//   Speakers  every room, the ones in the music marked, the others picked by
//             a tap. ADD puts the picked rooms in with the music (and lets go
//             of any marked to leave: then it reads Update); TRANSFER moves
//             the music to just the picked rooms. Both are the Play Music
//             page's own request, hk_frontend.music_transfer -- the rooms
//             that should end up playing, and where the music is now -- so a
//             preset's set of rooms still plays on Music Assistant's sync
//             group, and the engine (features/music/music.py) does the
//             joining, the moving and the letting go.
//   Volume    each room in the music, a slider of its own (the front's
//             slider is the whole group's).
//   Browse    the house's playlists (Play Music's tiles, played on the rooms
//             in the music, hk_frontend.music_play), then the Browse Music
//             page itself -- hk-library-card, its search, its Discover rows,
//             its categories -- told to play on the music's own player
//             (config `player`), not on whatever this screen would pick.
//
// THE MUSIC PAGE uses it too (cards/hk-music.js, 2026-10-11), turned over in
// place of what plays, with its own tabs (o.tabs: Speakers, Volume, Queue):
//   Queue     what plays and what comes next, from Music Assistant's queue
//             (the integration's hk_music/queue); a tap plays that song.
//   ...and with nothing playing, Speakers picks WHERE THE NEXT MUSIC PLAYS
//   (o.target / o.setTarget): rooms ticked, no Add or Transfer.
//   Stop (o.stop) beside Add and Transfer.
//
// hk-saver.js owns everything around it: where it sits, the turn-over, the
// taps that reach it (the screensaver otherwise swallows every tap), closing
// it after a while untouched, and telling the house the photos are in use.
// This file only draws the back and acts on its taps. Its CSS goes in the
// screensaver's shadow root (hkSaverPanel.CSS).
(function () {
  'use strict';
  if (window.hkSaverPanel) return;

  var VOL_EVERY = 200;          // a volume drag sends at most this often (ms)
  var VOL_HOLD = 4000;          // ...and its own value stands this long after
  var DONE_MS = 1200;           // a request done: the answer read, then closed
  var BLUR = 32;                // the blurred art, drawn this small

  var ICON = {
    close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
    check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    move: 'M4 11h11.2l-4.6-4.6L12 5l7 7-7 7-1.4-1.4 4.6-4.6H4z',
    note: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3z',
    vlo: 'M7 9v6h4l5 5V4l-5 5H7z',
    vhi: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z',
    next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6z',
    play: 'M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z',
    stop: 'M7 7h10v10H7z',
    pause: 'M7 5h3.2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6.8 0H17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3.2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'
  };
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function list(names) {
    return names.length <= 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  function same(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
    return true;
  }

  // ------------------------------------------------------------ pure (tests)
  // WHAT A PRESS ASKS FOR. `members`: the rooms in the music now; `sel`: rooms
  // picked; `drop`: rooms in it marked to leave. Add/Update: the rooms that
  // stay plus the picked ones; Transfer: the picked ones alone. null: nothing
  // to do (the button is dimmed).
  function plan(members, sel, drop) {
    var stay = members.filter(function (r) { return drop.indexOf(r) < 0; });
    var add = stay.concat(sel.filter(function (r) { return stay.indexOf(r) < 0; }));
    return {
      add: add.length && !same(add, members) ? add : null,
      transfer: sel.length ? sel.slice() : null,
      // "Add" while it adds; "Update" when it only lets rooms go
      addLabel: sel.length || !drop.length ? 'Add' : 'Update'
    };
  }
  // A PRESET'S CHIP fills in the picks: its rooms that are not playing, and
  // the playing rooms that are not in it marked to leave
  function presetPicks(members, rooms) {
    return { sel: rooms.filter(function (r) { return members.indexOf(r) < 0; }),
             drop: members.filter(function (r) { return rooms.indexOf(r) < 0; }) };
  }
  // the line over the buttons: what each would do, before it is pressed
  function caption(members, sel, drop, label, nameOf) {
    var n = function (a) { return list(a.map(nameOf)); };
    if (!sel.length && !drop.length) return 'Tap rooms to <b>Add</b> them to this music, or to <b>Transfer</b> it there.';
    if (!sel.length) return '<b>Update</b>: ' + esc(n(drop)) + (drop.length === 1 ? ' stops' : ' stop') + ', the rest play on.';
    var keep = members.filter(function (r) { return drop.indexOf(r) < 0; });
    return '<b>Add</b>: ' + esc(n(sel)) + (sel.length === 1 ? ' joins ' : ' join ') + esc(keep.length ? label : 'the music') +
           (drop.length ? ', ' + esc(n(drop)) + (drop.length === 1 ? ' stops' : ' stop') : '') + '.<br>' +
           '<b>Transfer</b>: only ' + esc(n(sel)) + (sel.length === 1 ? ' plays' : ' play') + ', the rest stop.';
  }

  // ------------------------------------------------------------ the look
  // Sizes are a 1280 x 800 tablet's; hk-saver.js zooms the inside (.mpin)
  // with the screen. Nothing here animates for long: the eq bars only while
  // the Speakers list is up.
  var CSS = [
    '.mpanel{position:absolute;z-index:6;display:none;color:#fff;overflow:hidden;touch-action:pan-y;',
    '  -webkit-user-select:none;user-select:none;cursor:default;backface-visibility:hidden;-webkit-backface-visibility:hidden}',
    '.mpanel.up{display:block}',
    // the slide's: a card where the art was; the pane's: the whole pane
    '.mpanel.card{border-radius:18px;box-shadow:0 26px 70px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.12)}',
    '.mpbg{position:absolute;left:-8%;top:-8%;width:116%;height:116%;display:block}',
    '.mpshade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(6,10,18,.56),rgba(6,10,18,.66))}',
    '.mpin{position:absolute;left:0;top:0;display:flex;flex-direction:column;text-shadow:0 1px 10px rgba(0,0,0,.18)}',
    '.mphd{flex:none;padding:20px 22px 10px}',
    '.mprow{display:flex;align-items:center;gap:10px}',
    // THE TABS ARE THE DASHBOARD'S SWITCH (the Calendar page's Day / Week /
    // Month): a glass capsule, the choice a white pill that slides to the
    // new tab (slideTab) -- and the close button as tall as it, beside it
    // (it takes what the row leaves beside the close button -- the button
    // keeps the panel's own margin on the right, as the switch does on the left)
    '.mptabs{flex:1 1 auto;min-width:0;height:44px;padding:3px;border-radius:22px;display:flex;gap:2px;position:relative;box-sizing:border-box;',
    '  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}',
    '.mptabs div{flex:1 1 auto;min-width:0;justify-content:center;height:36px;padding:0 12px;border-radius:18px;display:flex;align-items:center;font-size:15px;font-weight:600;cursor:pointer;',
    '  white-space:nowrap;position:relative;isolation:isolate;transition:color .22s ease;color:#fff;box-sizing:border-box}',
    '.mptabs div.on{color:#1c1c1e;text-shadow:none}',
    '.mptabs div.on::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:#fff;',
    '  transform-origin:0 0;transform:translate(var(--hx,0px),0) scale(var(--sx,1),1);transition:transform .42s cubic-bezier(.34,1.24,.42,1)}',
    '.mptabs div.slide-from::before{transition:none}',
    '.mpx{margin-left:10px;flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;',
    '  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);box-sizing:border-box}',
    '.mpx svg{width:20px;height:20px;fill:#fff}',
    '@media (prefers-reduced-motion:reduce){.mptabs div.on::before,.mptabs div{transition:none}}',
    '.mpsub{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px;opacity:.75;min-width:0;white-space:nowrap;overflow:hidden}',
    '.mpsub:empty{display:none}',
    '.mpsub svg{width:16px;height:16px;fill:#fff;flex:none}',
    '.mpsub span{overflow:hidden;text-overflow:ellipsis}',
    '.mpbody{flex:1;min-height:0;position:relative}',
    '.mpt{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding:6px 22px 16px;box-sizing:border-box;',
    '  overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-y;',
    '  -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent)}',
    '.mpt::-webkit-scrollbar{display:none}',
    '.mpt[hidden]{display:none}',
    '.mpfoot{flex:none;padding:12px 22px 20px;border-top:1px solid rgba(255,255,255,.12)}',
    '.mpfoot:empty{display:none}',
    '.mptoast{position:absolute;left:50%;bottom:22px;transform:translate(-50%,10px);max-width:calc(100% - 40px);background:rgba(255,255,255,.95);color:#111;',
    '  font-weight:600;font-size:14px;padding:10px 16px;border-radius:99px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;',
    '  transition:opacity .25s,transform .25s;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:3;text-shadow:none}',
    '.mptoast.on{opacity:1;transform:translate(-50%,0)}',
    // SPEAKERS
    '.mpchips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -22px 12px;padding:0 22px;touch-action:pan-x}',
    '.mpchips::-webkit-scrollbar{display:none}',
    '.mpchips:empty{display:none}',
    '.mpchip{flex:none;height:34px;padding:0 14px;border-radius:99px;display:flex;align-items:center;font-size:14px;font-weight:600;cursor:pointer;',
    '  border:1.5px dashed rgba(255,255,255,.35);box-sizing:border-box}',
    '.mpchip.on{border-style:solid;background:rgba(255,255,255,.9);color:#111;border-color:transparent;text-shadow:none}',
    '.mprooms{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}',
    '.mpanel[wide] .mprooms{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}',
    '.mproom{display:flex;align-items:center;gap:12px;min-height:52px;padding:6px 10px 6px 8px;border-radius:13px;background:rgba(255,255,255,.07);',
    '  cursor:pointer;box-sizing:border-box}',
    '.mproom .ri{flex:none;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center}',
    '.mproom .ri ha-icon{--mdc-icon-size:21px;width:21px;height:21px;color:#fff}',
    '.mproom .rn{flex:1;min-width:0}',
    '.mproom .rn b{display:block;font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mproom .rn small{display:flex;align-items:center;gap:6px;font-size:12.5px;opacity:.72;margin-top:1px;white-space:nowrap;overflow:hidden}',
    '.mproom .ck{flex:none;width:26px;height:26px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center}',
    '.mproom .ck svg{width:16px;height:16px;fill:#111;opacity:0}',
    '.mproom.mem .ck{background:rgba(255,255,255,.35);box-shadow:none}',
    '.mproom.mem .ck svg{opacity:1;fill:#fff}',
    '.mproom.sel{background:rgba(255,255,255,.18)}',
    '.mproom.sel .ck{background:#fff;box-shadow:none}',
    '.mproom.sel .ck svg{opacity:1;fill:#111}',
    '.mproom.drop{opacity:.55}',
    '.mproom.drop .ck{background:transparent;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4)}',
    '.mproom.drop .ck svg{opacity:0}',
    '.mproom.off{opacity:.38;cursor:default}',
    '.mpeq{display:inline-flex;gap:2px;align-items:flex-end;height:10px}',
    '.mpeq i{width:2.5px;height:10px;background:#fff;border-radius:1px;transform-origin:50% 100%;animation:mpeq 1s ease-in-out infinite}',
    '.mpeq i:nth-child(2){animation-delay:-.3s}.mpeq i:nth-child(3){animation-delay:-.6s}',
    '[paused] .mpeq i{animation:none;transform:scaleY(.3)}',
    '@keyframes mpeq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}',
    '.mpcap{font-size:13px;opacity:.78;min-height:36px;margin-bottom:12px;line-height:1.38}',
    '.mpcap.err{color:#ffb340;opacity:1}',
    // ADD AND TRANSFER AS EQUAL HALVES, Stop a square at the end (the user's
    // pick, 2026-10-11: the buttons sized to their words looked off)
    '.mpacts{display:flex;gap:8px}',
    '.mpact{flex:1 1 0;min-width:0;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;font-weight:700;',
    '  cursor:pointer;transition:opacity .2s;text-shadow:none}',
    '.mpact svg{width:19px;height:19px;fill:currentColor}',
    '.mpact.add{background:rgba(255,255,255,.16);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}',
    '.mpact.xfer{background:#fff;color:#111}',
    '.mpact.dis{opacity:.32;cursor:default}',
    '.mpspin{width:16px;height:16px;border-radius:50%;border:2.4px solid currentColor;border-right-color:transparent;animation:mpspin .7s linear infinite;box-sizing:border-box}',
    '@keyframes mpspin{to{transform:rotate(360deg)}}',
    // VOLUME
    '.mpvrow{padding:12px 4px 14px;border-bottom:1px solid rgba(255,255,255,.10)}',
    '.mpvrow:last-child{border-bottom:none}',
    '.mpvhd{display:flex;align-items:baseline;gap:10px;font-size:16px;font-weight:600}',
    '.mpvhd b{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mpvhd span{font-size:14px;opacity:.65;font-variant-numeric:tabular-nums}',
    // a finger-sized strip around a thin track
    '.mpvs{position:relative;height:44px;margin-top:2px;cursor:pointer;touch-action:none}',
    '.mpvs .tr{position:absolute;left:12px;right:12px;top:50%;height:6px;margin-top:-3px;border-radius:99px;background:rgba(255,255,255,.22)}',
    '.mpvs .tr i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--v,0) * 100%);border-radius:99px;background:rgba(255,255,255,.92)}',
    '.mpvs .tr b{position:absolute;top:50%;left:calc(var(--v,0) * 100%);width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;',
    '  background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.3);transition:transform .12s}',
    '.mpvs.drag .tr b{transform:scale(1.18)}',
    '.mpnone{opacity:.7;font-size:15px;padding:18px 4px}',
    // BROWSE: the house's playlists, then the Browse Music page
    '.mppl h4{margin:0 0 9px 2px;font-size:15px;font-weight:700}',
    '.mppls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:20px}',
    '.mpanel[wide] .mppls{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.mppill{display:flex;align-items:center;gap:10px;height:50px;padding:0 12px;border-radius:13px;background:rgba(255,255,255,.10);',
    '  font-size:15px;font-weight:600;cursor:pointer;min-width:0;box-sizing:border-box}',
    '.mppill ha-icon{--mdc-icon-size:20px;width:20px;height:20px;flex:none;color:#fff}',
    '.mppill span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mppill.on{background:rgba(255,255,255,.9);color:#111;text-shadow:none}',
    '.mppill.on ha-icon{color:#111}',
    '.mppill.busy{opacity:.6}',
    '.mpopts{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px}',
    '.mpopts:empty{display:none}',
    '.mppl[hidden]{display:none}',
    // (its categories are pills with a label: two across in the pane)
    '.mplib{--hk-lib-track:150px;--hk-lib-shelf:112px}',
    '.mpanel[wide] .mplib{--hk-lib-shelf:124px}',
    '.mplibmsg{opacity:.7;font-size:15px;padding:18px 4px}',
    // THE PANE'S BACK keeps what plays at its foot: the big controls are on
    // the other side
    '.mpmini{flex:none;display:flex;align-items:center;gap:12px;padding:12px 22px 18px;border-top:1px solid rgba(255,255,255,.12)}',
    '.mpmini:empty{display:none}',
    '.mpmini .ia{width:46px;height:46px;border-radius:8px;background:rgba(255,255,255,.12) center/cover;flex:none}',
    '.mpmini .tx{flex:1;min-width:0}',
    '.mpmini .tx b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mpmini .tx small{display:block;font-size:13px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mpmini .b{flex:none;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;cursor:pointer}',
    '.mpmini .b.pp{width:48px;height:48px;background:rgba(255,255,255,.92)}',
    '.mpmini .b svg{width:46%;height:46%;fill:#fff}',
    '.mpmini .b.pp svg{fill:#111}',
    // QUEUE
    '.mpqh{font-size:12px;font-weight:700;letter-spacing:.8px;opacity:.55;margin:10px 4px 4px;text-transform:uppercase}',
    '.mpq{display:flex;align-items:center;gap:12px;padding:8px 6px;border-radius:12px;cursor:pointer;min-height:56px;box-sizing:border-box}',
    '.mpq.now{background:rgba(255,255,255,.10);cursor:default}',
    '.mpq .th{width:42px;height:42px;border-radius:7px;background:rgba(255,255,255,.12) center/cover;flex:none;display:flex;align-items:center;justify-content:center}',
    '.mpq .th svg{width:46%;height:46%;fill:rgba(255,255,255,.45)}',
    '.mpq .tx{flex:1;min-width:0}',
    '.mpq b{display:block;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mpq small{display:block;font-size:12.5px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mpq em{font-style:normal;font-size:12.5px;opacity:.5;font-variant-numeric:tabular-nums;flex:none}',
    '.mpq.busy{opacity:.5}',
    '.mpact.stop{flex:0 0 48px;width:48px;padding:0;background:rgba(255,90,90,.18);color:#ffb3b3}',
    '.mpact.stop svg{width:18px;height:18px}',
    '@media (prefers-reduced-motion:reduce){.mpeq i,.mpspin{animation:none}}'
  ].join('\n');

  // ------------------------------------------------------------ one panel
  // o: { hass(), ctx() -- the music on the screensaver (hkMusic's context) or
  // null, art() -- its blurred art (a canvas) or null, done(ms) -- close it,
  // follow(key) -- the music moved here, wide() -- two columns fit }
  var TAB_NAME = { speakers: 'Speakers', volume: 'Volume', browse: 'Browse', queue: 'Queue' };
  function create(o) {
    var el = document.createElement('div');
    el.className = 'mpanel';
    el.innerHTML =
      '<canvas class="mpbg" width="' + BLUR + '" height="' + BLUR + '"></canvas><div class="mpshade"></div>' +
      '<div class="mpin"><div class="mphd"><div class="mprow"><div class="mptabs">' +
      (o.tabs || ['speakers', 'volume', 'browse']).map(function (k) { return '<div data-tab="' + k + '">' + TAB_NAME[k] + '</div>'; }).join('') + '</div>' +
      '<div class="mpx" data-k="close" role="button" aria-label="Close">' + svg(ICON.close) + '</div></div><div class="mpsub"></div></div>' +
      '<div class="mpbody"><div class="mpt" data-p="speakers"><div class="mpchips"></div><div class="mprooms"></div></div>' +
      '<div class="mpt" data-p="volume" hidden></div><div class="mpt" data-p="queue" hidden></div>' +
      '<div class="mpt" data-p="browse" hidden><div class="mppl"><h4>Playlists</h4><div class="mppls"></div></div><div class="mplib"></div></div></div>' +
      '<div class="mpfoot"></div><div class="mpmini"></div><div class="mptoast"></div></div>';
    var q = function (s) { return el.querySelector(s); };
    var E = { bg: q('.mpbg'), inner: q('.mpin'), tabs: q('.mptabs'), sub: q('.mpsub'), foot: q('.mpfoot'), toast: q('.mptoast'), mini: q('.mpmini'),
              chips: q('.mpchips'), rooms: q('.mprooms'), vol: q('[data-p="volume"]'), pl: q('.mppl'), pls: q('.mppls'),
              lib: q('.mplib'), pages: el.querySelectorAll('.mpt'), queue: q('[data-p="queue"]') };
    var S = { tab: 'speakers', sel: [], drop: [], busy: '', err: '', key: null, members: [], open: null, art: null,
              vols: {}, drag: null, lib: null, libFor: null, libRoot: true, closing: false, q: null, qFor: '', qBusy: null };
    var M = function () { return window.hkMusic; };

    function nameOf(e) { var m = M(); return m && m.nameOf ? m.nameOf(e) : e; }
    function states() { var h = o.hass(); return (h && h.states) || {}; }
    function ctx() { return o.ctx(); }
    function label(c) { var m = M(); return c ? (m && m.label ? m.label(c) : c.key) : ''; }

    // ---- the tabs
    // the white pill starts over the tab it was on and springs to the new one
    function box(b) {
      var a = E.tabs.getBoundingClientRect(), r = b && b.getBoundingClientRect();
      return r && r.width ? { x: r.left - a.left, w: r.width } : null;
    }
    function show(tab) {
      var was = E.tabs.querySelector('.on'), from = was ? box(was) : null;
      if (tab) S.tab = tab;
      Array.prototype.forEach.call(E.tabs.children, function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === S.tab); });
      var now = E.tabs.querySelector('.on'), to = now ? box(now) : null;
      if (now && now !== was && from && to && Math.abs(from.x - to.x) >= 1) {
        now.classList.add('slide-from');
        now.style.setProperty('--hx', (from.x - to.x) + 'px');
        now.style.setProperty('--sx', String(from.w / to.w));
        void now.offsetWidth;
        now.classList.remove('slide-from');
        now.style.removeProperty('--hx'); now.style.removeProperty('--sx');
      }
      Array.prototype.forEach.call(E.pages, function (p) { p.hidden = p.getAttribute('data-p') !== S.tab; });
      scrolled();
      if (S.tab === 'browse') ensureLib();
      update(true);
    }

    // ---- everything again from the house (hk-saver.js calls this at most
    // once a second, and on every tap here)
    function update(now) {
      var c = ctx();
      if (c && c.key !== S.key) {
        // the music moved (Transfer, a new leader): the picks were for the
        // old rooms
        if (S.key) { S.sel = []; S.drop = []; }
        S.key = c.key;
      }
      S.members = c ? c.members.slice() : [];
      drawArt();
      el.toggleAttribute('paused', !(c && c.playing));
      if (S.tab === 'speakers') drawSpeakers(c);
      else if (S.tab === 'volume') drawVolume(c, now);
      else if (S.tab === 'queue') drawQueue(c);
      else drawBrowse(c);
      drawMini();
    }
    // (the pane's back only: o.now() is what the screensaver is drawing)
    function drawMini() {
      var d = o.mini && o.mini() && o.now ? o.now() : null, html = '';
      if (d && !d.idle) {
        html = '<div class="ia"' + (d.pic ? ' style="background-image:url(&quot;' + esc(d.pic) + '&quot;)"' : '') + '></div>' +
               '<div class="tx"><b>' + esc(d.title) + '</b><small>' + esc([d.artist, d.room].filter(Boolean).join(' \u00b7 ')) + '</small></div>' +
               '<div class="b pp" data-k="pp" role="button">' + svg(d.playing ? ICON.pause : ICON.play) + '</div>' +
               '<div class="b" data-k="next" role="button">' + svg(ICON.next) + '</div>';
      }
      if (E.mini.__t !== html) { E.mini.innerHTML = html; E.mini.__t = html; }
    }
    // THE HEADER RIDES ON THE LIST: the shadow every scrolling list under a
    // header has (hk-base.js shadeCss), for the tab on screen -- its page
    // scrolled from its top
    function scrolled() {
      var pg = el.querySelector('.mpt[data-p="' + S.tab + '"]'), on = !!(pg && pg.scrollTop > 2);
      if (on === el.hasAttribute('hk-scrolled')) return;
      if (on) el.style.setProperty('--hk-shade-top', Math.round(pg.getBoundingClientRect().top - el.getBoundingClientRect().top) + 'px');
      el.toggleAttribute('hk-scrolled', on);
    }
    Array.prototype.forEach.call(E.pages, function (p) { p.addEventListener('scroll', scrolled, { passive: true }); });
    function drawArt() {
      var a = o.art && o.art();
      if (!a || a === S.art) return;
      var cx = E.bg.getContext && E.bg.getContext('2d');
      if (!cx) return;
      try { cx.clearRect(0, 0, BLUR, BLUR); cx.drawImage(a, 0, 0, BLUR, BLUR); S.art = a; } catch (e) { /* not ready */ }
    }
    function sub(icon, text) {
      var want = text ? svg(icon) + '<span>' + esc(text) + '</span>' : '';
      if (E.sub.__t !== want) { E.sub.innerHTML = want; E.sub.__t = want; }
    }

    // ---- SPEAKERS
    // nothing playing, on the page: the rooms the next music plays on
    function picking(c) { return !c && !!o.target; }
    function drawSpeakers(c) {
      var m = M(), h = states();
      if (picking(c)) { S.members = o.target().slice(); S.sel = []; S.drop = []; }
      sub(ICON.vhi, c ? [c.title, c.artist].filter(Boolean).join(' · ') || label(c) : picking(c) ? 'Where the next music plays' : '');
      var rooms = m && m.rooms ? m.rooms() : [];
      var others = {};
      (m && m.contexts ? m.contexts(o.hass()) : []).forEach(function (x) {
        if (c && x.key === c.key) return;
        x.members.forEach(function (r) { others[r] = x.title || label(x); });
      });
      // a pick that has started playing here, or gone away, is no pick
      S.sel = S.sel.filter(function (r) { return S.members.indexOf(r) < 0; });
      S.drop = S.drop.filter(function (r) { return S.members.indexOf(r) >= 0; });
      var final = S.members.filter(function (r) { return S.drop.indexOf(r) < 0; }).concat(S.sel);
      var chips = (m && m.presets ? m.presets() : []).map(function (p) {
        var on = (picking(c) || S.sel.length || S.drop.length) && same(final, p.members);
        return '<div class="mpchip' + (on ? ' on' : '') + '" data-preset="' + esc(p.entity) + '">' + esc(p.name) + '</div>';
      }).join('');
      if (E.chips.__t !== chips) { E.chips.innerHTML = chips; E.chips.__t = chips; }
      var html = rooms.map(function (r) {
        var k = r.entity, st = h[k], mem = S.members.indexOf(k) >= 0, sel = S.sel.indexOf(k) >= 0, drop = S.drop.indexOf(k) >= 0;
        var off = !st || st.state === 'unavailable' || st.state === 'unknown';
        var stops = others[k] && (sel || (picking(c) && mem)) ? ' \u2014 stops first' : '';
        var line = picking(c) ? (off ? 'Unavailable' : others[k] ? 'Playing ' + esc(others[k]) + stops : '')
                 : mem ? (drop ? 'Leaves the music' : '<span class="mpeq"><i></i><i></i><i></i></span>' + (c && c.playing ? 'Playing here' : 'Paused here'))
                 : off ? 'Unavailable' : others[k] ? 'Playing ' + esc(others[k]) + stops : '';
        var cls = picking(c) ? (mem ? ' sel' : '') : (mem ? ' mem' : '') + (sel ? ' sel' : '') + (drop ? ' drop' : '');
        return '<div class="mproom' + cls + (off && !mem ? ' off' : '') +
               '" data-room="' + esc(k) + '"><div class="ri"><ha-icon icon="hk:homepod"></ha-icon></div><div class="rn"><b>' + esc(r.name) + '</b>' +
               (line ? '<small>' + line + '</small>' : '') + '</div><div class="ck">' + svg(ICON.check) + '</div></div>';
      }).join('');
      if (E.rooms.__t !== html) { E.rooms.innerHTML = html; E.rooms.__t = html; }
      var gone = (picking(c) ? S.members : S.sel).filter(function (r) { return others[r]; });
      var also = gone.length ? ' ' + esc(list(gone.map(nameOf))) + (gone.length === 1 ? ' stops ' : ' stop ') + esc(others[gone[0]]) + ' first.' : '';
      if (picking(c)) {
        var pf = '<div class="mpcap">The next playlist, album or song you pick plays on <b>' + esc(list(S.members.map(nameOf))) + '</b>.' + also + '</div>';
        if (E.foot.__t !== pf) { E.foot.innerHTML = pf; E.foot.__t = pf; }
        return;
      }
      var pl = plan(S.members, S.sel, S.drop);
      var cap = S.err ? '<span>' + esc(S.err) + '</span>' : S.busy ? esc(S.busy) : caption(S.members, S.sel, S.drop, label(c), nameOf) + also;
      var addL = S.busy && S.busy.indexOf('Adding') === 0 ? '<span class="mpspin"></span>' + (pl.addLabel === 'Update' ? 'Updating' : 'Adding')
               : svg(ICON.plus) + pl.addLabel;
      var xL = S.busy && S.busy.indexOf('Moving') === 0 ? '<span class="mpspin"></span>Moving' : svg(ICON.move) + 'Transfer';
      var foot = '<div class="mpcap' + (S.err ? ' err' : '') + '">' + cap + '</div><div class="mpacts">' +
                 '<div class="mpact add' + (!pl.add || S.busy || !c ? ' dis' : '') + '" data-k="add">' + addL + '</div>' +
                 '<div class="mpact xfer' + (!pl.transfer || S.busy || !c ? ' dis' : '') + '" data-k="xfer">' + xL + '</div>' +
                 (o.stop ? '<div class="mpact stop' + (S.busy || !c ? ' dis' : '') + '" data-k="stop" role="button" aria-label="Stop">' + svg(ICON.stop) + '</div>' : '') + '</div>';
      if (E.foot.__t !== foot) { E.foot.innerHTML = foot; E.foot.__t = foot; }
    }
    function tapRoom(k) {
      if (S.busy) return;
      var st = states()[k];
      S.err = '';
      if (picking(ctx())) {
        var tg = o.target().slice(), ti = tg.indexOf(k);
        if (ti >= 0) { if (tg.length > 1) tg.splice(ti, 1); }
        else if (st && st.state !== 'unavailable' && st.state !== 'unknown') tg.push(k);
        o.setTarget(tg); update(true); return;
      }
      if (S.members.indexOf(k) >= 0) {
        var i = S.drop.indexOf(k);
        if (i >= 0) S.drop.splice(i, 1);
        // the last room playing cannot leave (that is Stop, not Update)
        else if (S.members.length - S.drop.length > 1) S.drop.push(k);
      } else {
        if (!st || st.state === 'unavailable' || st.state === 'unknown') return;
        var j = S.sel.indexOf(k);
        if (j >= 0) S.sel.splice(j, 1); else S.sel.push(k);
      }
      update(true);
    }
    function tapPreset(entity) {
      var p = (M().presets() || []).filter(function (x) { return x.entity === entity; })[0];
      if (!p || S.busy) return;
      if (picking(ctx())) { o.setTarget(p.members.slice()); update(true); return; }
      var pk = presetPicks(S.members, p.members);
      S.sel = pk.sel; S.drop = pk.drop; S.err = '';
      update(true);
    }
    // ONE REQUEST, ONE ANSWER, as the Play Music page asks it (hk-media.js
    // _request): the focus held on the rooms while it lands, the leader the
    // engine reports followed, a refusal said here
    function request(service, data, target, busy, ok) {
      var h = o.hass(), m = M();
      if (!h || !h.callService) return;
      S.busy = busy; S.err = '';
      if (m && target && m.known(target)) m.setFocus(target, { hold: true });
      update(true);
      var p;
      try { p = h.callService('hk_frontend', 'music_' + service, data, undefined, false, true); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function (res) {
        var r = (res && res.response) || {};
        if (r.ok === false) throw new Error(r.message || 'That did not work.');
        var lead = r.leader || target;
        if (m && lead && m.known(lead)) m.setFocus(lead, { hold: true });
        if (o.follow) o.follow(lead);
        S.busy = ''; S.sel = []; S.drop = [];
        toast(r.message ? 'Playing, but ' + String(r.message).replace(/\.$/, '') : ok);
        update(true);
        o.done(DONE_MS);
      }).catch(function (e) {
        if (m && target) m.release(target);
        S.busy = '';
        S.err = 'That did not work' + (e && e.message ? ': ' + String(e.message).replace(/\.$/, '') : '') + '.';
        update(true);
      });
    }
    function add() {
      var c = ctx(), pl = plan(S.members, S.sel, S.drop);
      if (!c || !pl.add || S.busy) return;
      var sel = S.sel.slice(), drop = S.drop.slice();
      request('transfer', { rooms: pl.add, source: c.key }, pl.add.indexOf(c.key) >= 0 ? c.key : pl.add[0],
              sel.length ? 'Adding ' + list(sel.map(nameOf)) + '…' : 'Adding…',
              sel.length ? list(sel.map(nameOf)) + ' joined' : list(drop.map(nameOf)) + ' stopped');
    }
    function stop() {
      var c = ctx();
      if (!c || S.busy) return;
      request('stop', { rooms: c.members.slice() }, null, 'Stopping\u2026', 'Stopped');
    }
    function transfer() {
      var c = ctx(), pl = plan(S.members, S.sel, S.drop);
      if (!c || !pl.transfer || S.busy) return;
      var to = pl.transfer;
      request('transfer', { rooms: to, source: c.key }, to[0], 'Moving the music to ' + list(to.map(nameOf)) + '…',
              'Now playing on ' + list(to.map(nameOf)));
    }

    // ---- VOLUME: each room in the music
    function drawVolume(c, now) {
      sub(ICON.vhi, c ? label(c) : '');
      E.foot.innerHTML = ''; E.foot.__t = '';
      var h = states(), t = Date.now();
      var rows = S.members.map(function (k) {
        var st = h[k] || {}, a = st.attributes || {}, mine = S.vols[k];
        var v = mine && (S.drag && S.drag.key === k || t < mine.until) ? mine.val : (typeof a.volume_level === 'number' ? a.volume_level : null);
        return { k: k, v: v };
      });
      var sig = rows.map(function (r) { return r.k; }).join(',');
      if (E.vol.__sig !== sig) {
        E.vol.__sig = sig;
        E.vol.innerHTML = rows.length ? rows.map(function (r) {
          return '<div class="mpvrow" data-vk="' + esc(r.k) + '"><div class="mpvhd"><b>' + esc(nameOf(r.k)) + '</b><span></span></div>' +
                 '<div class="mpvs" data-vol="' + esc(r.k) + '"><div class="tr"><i></i><b></b></div></div></div>';
        }).join('') : '<div class="mpnone">Nothing is playing.</div>';
      }
      rows.forEach(function (r) {
        var row = E.vol.querySelector('[data-vk="' + r.k + '"]');
        if (!row) return;
        var v = r.v === null ? 0 : Math.max(0, Math.min(1, r.v));
        var s = row.querySelector('.mpvs');
        s.style.visibility = r.v === null ? 'hidden' : '';
        if (s.style.getPropertyValue('--v') !== v.toFixed(3)) s.style.setProperty('--v', v.toFixed(3));
        var pct = r.v === null ? '' : Math.round(v * 100) + '%';
        var sp = row.querySelector('.mpvhd span');
        if (sp.textContent !== pct) sp.textContent = pct;
      });
    }
    function volAt(x) {
      var d = S.drag, r = d && d.el.querySelector('.tr').getBoundingClientRect();
      if (!r || !r.width) return;
      var val = Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * 100) / 100;
      S.vols[d.key] = { val: val, until: Date.now() + VOL_HOLD, sent: S.vols[d.key] ? S.vols[d.key].sent : null };
      drawVolume(ctx(), true);
      var now = Date.now();
      if (now - d.sent >= VOL_EVERY) volSend(); else if (!d.t) d.t = setTimeout(volSend, VOL_EVERY - (now - d.sent));
    }
    function volSend() {
      var d = S.drag, h = o.hass();
      if (d && d.t) { clearTimeout(d.t); d.t = null; }
      var key = d ? d.key : S.lastVol, mine = key && S.vols[key];
      if (!mine || !h) return;
      if (d) d.sent = Date.now();
      if (mine.sent === mine.val) return;
      mine.sent = mine.val;
      try { h.callService('media_player', 'volume_set', { entity_id: key, volume_level: mine.val }); } catch (e) { /* offline */ }
    }
    el.addEventListener('pointerdown', function (e) {
      var s = e.target.closest && e.target.closest('[data-vol]');
      if (!s) return;
      S.drag = { key: s.getAttribute('data-vol'), el: s, sent: 0, t: null, id: e.pointerId };
      S.lastVol = S.drag.key;
      s.classList.add('drag');
      try { s.setPointerCapture(e.pointerId); } catch (x) { /* a mouse */ }
      volAt(e.clientX);
    });
    el.addEventListener('pointermove', function (e) { if (S.drag && e.pointerId === S.drag.id) volAt(e.clientX); });
    var volEnd = function (e) {
      var d = S.drag;
      if (!d || (e && e.pointerId !== d.id)) return;
      volSend();
      if (d.t) clearTimeout(d.t);
      d.el.classList.remove('drag');
      S.drag = null;
      if (S.vols[d.key]) S.vols[d.key].until = Date.now() + VOL_HOLD;
    };
    el.addEventListener('pointerup', volEnd);
    el.addEventListener('pointercancel', volEnd);

    // ---- QUEUE: what plays, then what comes next (Music Assistant's queue,
    // asked again for each song); a tap plays that song
    function qTime(s) { s = Math.round(Number(s) || 0); return s ? Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) : ''; }
    function drawQueue(c) {
      sub(ICON.vhi, c ? label(c) : '');
      E.foot.innerHTML = ''; E.foot.__t = '';
      var sig = c ? c.key + '|' + c.title : '';
      if (!c) { E.queue.innerHTML = '<div class="mpnone">Nothing is playing.</div>'; S.qFor = ''; return; }
      if (sig !== S.qFor) {
        S.qFor = sig; S.q = null;
        var h = o.hass();
        if (h && h.callWS) {
          h.callWS({ type: 'hk_music/queue', entity_id: c.key, limit: 40 }).then(function (r) {
            if (S.qFor !== sig) return;
            S.q = r && r.ok ? r : { ok: false, message: (r && r.message) || '' };
            drawQueue(ctx());
          }, function () { if (S.qFor === sig) { S.q = { ok: false }; drawQueue(ctx()); } });
        }
      }
      var note = '<svg viewBox="0 0 24 24"><path d="' + ICON.note + '"/></svg>';
      var row = function (it, now) {
        return '<div class="mpq' + (now ? ' now' : '') + (S.qBusy === it.id ? ' busy' : '') + '"' + (now ? '' : ' data-qid="' + esc(it.id) + '"') + '>' +
               '<div class="th"' + (it.image ? ' style="background-image:url(&quot;' + esc(it.image) + '&quot;)"' : '') + '>' + (it.image ? '' : note) + '</div>' +
               '<div class="tx"><b>' + esc(it.title) + '</b><small>' + esc(it.artist || '') + '</small></div><em>' + qTime(it.duration) + '</em></div>';
      };
      var html;
      if (!S.q) html = '<div class="mpnone">Loading\u2026</div>';
      else if (!S.q.ok || !S.q.items || !S.q.items.length) html = '<div class="mpqh">Now Playing</div>' + row({ title: c.title, artist: c.artist }, true) +
        '<div class="mpnone">The rest of the queue can\u2019t be read from Music Assistant.</div>';
      else html = '<div class="mpqh">Now Playing</div>' + row(S.q.items[0], true) + (S.q.items.length > 1 ? '<div class="mpqh">Up Next</div>' : '') +
        S.q.items.slice(1).map(function (it) { return row(it, false); }).join('');
      if (E.queue.__t !== html) { E.queue.innerHTML = html; E.queue.__t = html; }
    }
    function playQueue(id) {
      var c = ctx(), h = o.hass();
      if (!c || !h || !h.callWS || S.qBusy) return;
      S.qBusy = id; drawQueue(c);
      h.callWS({ type: 'hk_music/queue_play', entity_id: c.key, item_id: id }).then(function (r) {
        S.qBusy = null;
        if (r && r.ok === false) toast('Could not play that song' + (r.message ? ': ' + r.message : ''));
        S.qFor = ''; drawQueue(ctx());
      }, function () { S.qBusy = null; toast('Could not play that song'); drawQueue(ctx()); });
    }

    // ---- BROWSE
    function drawBrowse(c) {
      sub('', '');
      E.foot.innerHTML = ''; E.foot.__t = '';
      var m = M(), pls = m && m.playlists ? m.playlists() : [];
      E.pl.hidden = !pls.length || !S.libRoot;
      var html = pls.map(function (p, i) {
        var on = S.open === i;
        return '<div class="mppill' + (on ? ' on' : '') + (S.busy === 'pl' + i ? ' busy' : '') + '" data-pl="' + i + '">' +
               (p.icon ? '<ha-icon icon="' + esc(p.icon) + '"></ha-icon>' : '') + '<span>' + esc(p.name) + '</span></div>' +
               (on && p.options ? '<div class="mpopts">' + p.options.map(function (x, j) {
                 return '<div class="mpchip" data-opt="' + i + ':' + j + '">' + esc(x.name) + '</div>';
               }).join('') + '</div>' : '');
      }).join('');
      if (E.pls.__t !== html) { E.pls.innerHTML = html; E.pls.__t = html; }
      // the Browse Music page, on the music's own player
      if (S.lib && c && S.libFor !== c.key) {
        S.libFor = c.key;
        try { S.lib.setConfig({ type: 'custom:hk-library-card', player: c.key }); } catch (e) { /* as it was */ }
      }
      if (S.lib) { var h = o.hass(); if (h && S.lib.hass !== h) S.lib.hass = h; }
    }
    function ensureLib() {
      if (S.lib || S.libWait) return;
      var tag = 'hk-library-card';
      var make = function () {
        S.libWait = false;
        if (S.lib) return;
        try {
          var card = document.createElement(tag);
          var cx = ctx();
          S.libFor = cx ? cx.key : null;
          // (the house first: setConfig draws the first level at once, and
          // with no connection yet it said "no hass")
          var h = o.hass();
          if (h) card._hass = h;
          card.setConfig({ type: 'custom:' + tag, player: S.libFor });
          if (h) card.hass = h;
          E.lib.innerHTML = '';
          E.lib.appendChild(card);
          S.lib = card;
        } catch (e) {
          E.lib.innerHTML = '<div class="mplibmsg">Browse Music could not open here.</div>';
          console.warn('[hk-saver-panel] library', e);
        }
      };
      if (customElements.get(tag)) make();
      else {
        S.libWait = true;
        E.lib.innerHTML = '<div class="mplibmsg">Loading…</div>';
        customElements.whenDefined(tag).then(make);
      }
    }
    // the playlists only at the library's first level (not over an album or
    // a search)
    el.addEventListener('hk-library-level', function (e) {
      S.libRoot = !!(e.detail && e.detail.root);
      if (S.tab === 'browse') drawBrowse(ctx());
    });
    // ITS MESSAGES ARE SHOWN HERE: Home Assistant's toast is on the dashboard,
    // under the screensaver
    el.addEventListener('hass-notification', function (e) {
      e.stopPropagation();
      if (e.detail && e.detail.message) toast(e.detail.message);
    });
    el.addEventListener('hk-library-played', function () { o.done(DONE_MS); });
    function playlist(i, j) {
      var c = ctx(), m = M(), p = (m.playlists() || [])[i];
      if (!p || !c || S.busy) return;
      if (p.options && p.options.length && j == null) { S.open = S.open === i ? null : i; drawBrowse(c); return; }
      var key = j != null ? p.options[j].key : p.key, name = j != null ? p.options[j].name : p.name;
      var rooms = c.members.filter(function (r) { return m.known(r) && !m.isGroup(r); });
      if (!rooms.length) return;
      S.busy = 'pl' + i;
      toast('Starting ' + name + '…');
      drawBrowse(c);
      var h = o.hass(), q;
      if (m.known(c.key)) m.setFocus(c.key, { hold: true });
      try { q = h.callService('hk_frontend', 'music_play', { rooms: rooms, playlist: key }, undefined, false, true); } catch (e) { q = Promise.reject(e); }
      Promise.resolve(q).then(function (res) {
        var r = (res && res.response) || {};
        if (r.ok === false) throw new Error(r.message || 'That did not work.');
        if (r.leader && m.known(r.leader)) { m.setFocus(r.leader, { hold: true }); if (o.follow) o.follow(r.leader); }
        S.busy = ''; S.open = null;
        toast('Playing ' + name + ' on ' + label(c));
        drawBrowse(ctx());
        o.done(DONE_MS);
      }).catch(function (e) {
        if (m.known(c.key)) m.release(c.key);
        S.busy = '';
        toast('Could not play ' + name + (e && e.message ? ': ' + String(e.message).replace(/\.$/, '') : ''));
        drawBrowse(ctx());
      });
    }

    function toast(t) {
      E.toast.textContent = t;
      E.toast.classList.add('on');
      clearTimeout(S.toastT);
      S.toastT = setTimeout(function () { E.toast.classList.remove('on'); }, 2400);
    }

    // ---- taps (the screensaver lets clicks through to the panel)
    el.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-tab],[data-k],[data-room],[data-preset],[data-pl],[data-opt],[data-qid]');
      if (!t || !el.contains(t)) return;
      if (t.hasAttribute('data-tab')) { show(t.getAttribute('data-tab')); return; }
      var k = t.getAttribute('data-k');
      if (k === 'close') { o.done(0); return; }
      if (k === 'add') { add(); return; }
      if (k === 'xfer') { transfer(); return; }
      if (k === 'stop') { stop(); return; }
      if (t.hasAttribute('data-qid')) { playQueue(t.getAttribute('data-qid')); return; }
      if (k === 'pp' || k === 'next') { if (o.transport) o.transport(k); update(true); return; }
      if (t.hasAttribute('data-room')) { tapRoom(t.getAttribute('data-room')); return; }
      if (t.hasAttribute('data-preset')) { tapPreset(t.getAttribute('data-preset')); return; }
      if (t.hasAttribute('data-pl')) { playlist(Number(t.getAttribute('data-pl'))); return; }
      if (t.hasAttribute('data-opt')) { var ij = t.getAttribute('data-opt').split(':'); playlist(Number(ij[0]), Number(ij[1])); }
    });

    // its size: the box hk-saver.js gives it, the inside zoomed with the screen
    function size(w, h, z) {
      z = z || 1;
      E.inner.style.zoom = z === 1 ? '' : String(z);
      E.inner.style.width = Math.round(w / z) + 'px';
      E.inner.style.height = Math.round(h / z) + 'px';
      el.toggleAttribute('wide', !!(o.wide && o.wide()));
    }
    function destroy() {
      if (S.drag) volEnd();
      clearTimeout(S.toastT);
      if (S.lib) { S.lib.remove(); S.lib = null; }
      el.remove();
    }
    return {
      el: el, show: show, update: update, size: size, destroy: destroy,
      tab: function () { return S.tab; },
      // a request still landing, or a finger on a slider: not closed for
      // being untouched
      busy: function () { return !!(S.busy || S.drag); },
      // the field being typed in, in sight (the screen just got shorter)
      reveal: function () {
        // (the Browse page's own scroller only: scrollIntoView would also
        // scroll the panel's clipped boxes and push its tabs out of sight)
        var a = S.lib && S.lib.shadowRoot && S.lib.shadowRoot.activeElement;
        var pg = el.querySelector('[data-p="browse"]');
        if (!a || !pg || !a.getBoundingClientRect) return;
        pg.scrollTop += a.getBoundingClientRect().top - pg.getBoundingClientRect().top - 8;
      },
      // text being typed in it (the search box)
      typing: function () {
        var a = S.lib && S.lib.shadowRoot && S.lib.shadowRoot.activeElement;
        return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName));
      }
    };
  }

  window.hkSaverPanel = { create: create, CSS: CSS, _: { plan: plan, presetPicks: presetPicks, caption: caption } };
  try { window.dispatchEvent(new Event('hk-saver-panel')); } catch (e) { /* ignore */ }
})();
