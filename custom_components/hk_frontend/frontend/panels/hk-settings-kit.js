// hk-settings-kit.js -- THE HK SETTINGS PAGE'S CONTROLS.
//
// The parts an Apple settings screen is made of, and nothing else: inset
// grouped lists with a header and a footer, rows that push a page (›), a
// switch, a segmented control, a pop-up menu (the system's own <select>, so a
// Mac and an iPhone draw their own menu), a slider, a text row, a checkmark
// row, a destructive button, an alert. And the one list every "which, in
// what order" setting uses: Control Center's Include / More editor -- an
// Automatic switch, the Shown rows (remove, drag or arrow keys to move) and
// the More rows (add).
//
// Every control is a real button/input with an accessible name; the page
// (hk-settings.js) owns the data and saving. `fk` on a control is its focus
// key: the page puts focus back on it after a redraw.
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  if (root.hkSettingsKit) return;

  var uid = 0;
  function id(p) { return (p || 'hk') + '-' + (++uid); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // h('div', {class: 'x', onclick: f}, [children | text])
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k in { value: 1, checked: 1, disabled: 1, hidden: 1, placeholder: 1, type: 1, href: 1, src: 1, title: 1 } && k !== 'href') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function icon(name, cls) { return h('ha-icon', { icon: name, class: cls || 'ic', 'aria-hidden': 'true' }); }

  // ------------------------------------------------------------ the look
  // Apple's system colors and materials, light and dark (:host([dark])).
  var CSS = [
    // (the light secondary label, blue and red are Apple's a shade deeper,
    // so small text meets WCAG AA: 4.8:1 and better on the grouped gray)
    ':host{--hk-bg:#f2f2f7;--hk-cell:#fff;--hk-hover:rgba(0,0,0,.035);--hk-press:rgba(0,0,0,.08);',
    '  --hk-label:#000;--hk-label2:rgba(60,60,67,.75);--hk-label3:rgba(60,60,67,.3);--hk-sep:rgba(60,60,67,.2);',
    '  --hk-tint:#0066dd;--hk-sel:#0066dd;--hk-green:#34c759;--hk-red:#d70015;--hk-orange:#c93400;--hk-gray:#8e8e93;',
    '  --hk-fill:rgba(120,120,128,.12);--hk-seg:rgba(118,118,128,.12);--hk-seg-on:#fff;--hk-off:#e9e9eb;',
    '  --hk-bar:rgba(242,242,247,.82);--hk-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04);',
    '  --hk-font:-apple-system,BlinkMacSystemFont,"SF Pro",system-ui,"Helvetica Neue",sans-serif;',
    '  --hk-display:-apple-system,BlinkMacSystemFont,"SF Pro",system-ui,"Helvetica Neue",sans-serif;',
    '  --hk-body:16px;--hk-row:44px;',
    '  display:block;height:100%;background:var(--hk-bg);color:var(--hk-label);font-family:var(--hk-font);',
    '  font-size:var(--hk-body);line-height:1.3;-webkit-font-smoothing:antialiased;letter-spacing:-.01em;',
    '  -webkit-tap-highlight-color:transparent}',
    ':host([dark]){--hk-bg:#000;--hk-cell:#1c1c1e;--hk-hover:rgba(255,255,255,.04);--hk-press:rgba(255,255,255,.1);',
    '  --hk-label:#fff;--hk-label2:rgba(235,235,245,.6);--hk-label3:rgba(235,235,245,.3);--hk-sep:rgba(84,84,88,.55);',
    '  --hk-tint:#0a84ff;--hk-sel:#0a66d6;--hk-green:#30d158;--hk-red:#ff453a;--hk-orange:#ff9f0a;',
    '  --hk-fill:rgba(118,118,128,.24);--hk-seg:rgba(118,118,128,.24);--hk-seg-on:#636366;--hk-off:#39393d;',
    '  --hk-bar:rgba(0,0,0,.72);--hk-shadow:0 3px 8px rgba(0,0,0,.5)}',
    '@media (pointer:coarse){:host{--hk-body:17px}}',
    '*{box-sizing:border-box}',
    'a{color:var(--hk-tint);text-decoration:none}',
    'button{font:inherit;color:inherit}',
    ':focus-visible{outline:3px solid color-mix(in srgb,var(--hk-tint) 55%,transparent);outline-offset:2px;border-radius:8px}',
    // GROUPS
    '.grp{margin:0 0 30px}',
    '.gh{margin:0;padding:0 16px 7px;font-size:13px;font-weight:400;line-height:18px;text-transform:uppercase;',
    '  letter-spacing:0;color:var(--hk-label2)}',
    '.cells{background:var(--hk-cell);border-radius:10px;overflow:hidden}',
    '.gf{margin:0;padding:7px 16px 0;font-size:13px;line-height:18px;color:var(--hk-label2)}',
    '.gf a{font-weight:400}',
    // CELLS
    '.cell{position:relative;display:flex;align-items:center;gap:12px;min-height:var(--hk-row);padding:6px 16px;',
    '  width:100%;border:0;background:none;text-align:left;color:inherit}',
    '.cell + .cell::before,.cell + .cellwrap::before,.cellwrap + .cell::before,.cellwrap + .cellwrap::before{content:"";position:absolute;top:0;right:0;left:16px;height:1px;',
    '  background:var(--hk-sep);transform:scaleY(.5);transform-origin:top}',
    '.cellwrap{position:relative}',
    '.cell.hasic + .cell::before,.cell + .cell.hasic::before{left:58px}',
    'a.cell,button.cell{cursor:pointer}',
    '@media (hover:hover){a.cell:hover,button.cell:hover{background:var(--hk-hover)}}',
    'a.cell:active,button.cell:active{background:var(--hk-press)}',
    '.lbl{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
    '.lbl .t{overflow-wrap:anywhere}',
    '.lbl small{font-size:13px;line-height:17px;color:var(--hk-label2)}',
    '.val{flex:0 1 auto;min-width:0;color:var(--hk-label2);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.chev{flex:none;width:8px;height:13px;margin-left:-2px;color:var(--hk-label3)}',
    '.tile{flex:none;width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;',
    '  color:#fff;--mdc-icon-size:19px}',
    '.ic{--mdc-icon-size:22px;color:var(--hk-label2);flex:none}',
    '.cell.tintc{color:var(--hk-tint)}',
    '.cell.redc{color:var(--hk-red)}',
    '.cell.center{justify-content:center}',
    // its label is a stretching flex item: centered, it has to stop stretching
    '.cell.center .lbl{flex:0 1 auto;text-align:center}',
    '.cell[aria-disabled="true"]{opacity:.45;pointer-events:none}',
    '.cell .err{color:var(--hk-red)}',
    '.errline{padding:0 16px 10px;font-size:13px;color:var(--hk-red)}',
    '.badge{font-size:12px;line-height:16px;padding:1px 7px;border-radius:9px;background:var(--hk-fill);color:var(--hk-label2);white-space:nowrap}',
    '.flash{animation:hkflash 1.4s ease}',
    '@keyframes hkflash{0%,40%{background:color-mix(in srgb,var(--hk-tint) 22%,transparent)}100%{background:transparent}}',
    // SWITCH
    '.sw{flex:none;position:relative;width:51px;height:31px;border-radius:16px;border:0;padding:0;cursor:pointer;',
    '  background:var(--hk-off);transition:background .22s}',
    '.sw::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;',
    '  box-shadow:var(--hk-shadow);transition:transform .22s cubic-bezier(.3,.7,.4,1)}',
    '.sw[aria-checked="true"]{background:var(--hk-green)}',
    '.sw[aria-checked="true"]::after{transform:translateX(20px)}',
    '.sw:disabled{opacity:.4;cursor:default}',
    // SEGMENTED
    // equal segments, each as wide as the widest (Apple's own rule)
    '.seg{flex:none;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;position:relative;padding:2px;',
    '  border-radius:9px;background:var(--hk-seg);max-width:100%}',
    '.seg button{min-width:56px;height:28px;border:0;border-radius:7px;background:none;padding:0 12px;',
    '  font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;color:var(--hk-label)}',
    '.seg button + button{box-shadow:-1px 0 0 -0.5px var(--hk-sep)}',
    '.seg button[aria-checked="true"]{background:var(--hk-seg-on);box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04);font-weight:600}',
    '.seg button[aria-checked="true"] + button{box-shadow:none}',
    '.cell.stack{flex-wrap:wrap}',
    '.cell.stack .seg{width:100%}',
    '.cell.stack .seg button{padding:0 6px}',
    // POP-UP MENU (a system <select> over the value)
    '.pop{position:relative;flex:0 1 auto;min-width:0;display:inline-flex;align-items:center;gap:6px;color:var(--hk-label2)}',
    '.pop .pv{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pop svg{flex:none;width:9px;height:14px}',
    // invisible, but the system's own menu opens from it (no native
    // drawing at all: a phone's WebView can paint the box through opacity 0)
    '.pop select{position:absolute;inset:-8px -6px;width:calc(100% + 12px);opacity:0;cursor:pointer;font:inherit;font-size:16px;',
    '  -webkit-appearance:none;appearance:none;background:transparent;color:transparent;border:0}',
    '.pop select option{color:initial;background:initial}',
    '.pop:focus-within{outline:3px solid color-mix(in srgb,var(--hk-tint) 55%,transparent);outline-offset:3px;border-radius:6px}',
    // SLIDER
    '.cell.slider{flex-direction:column;align-items:stretch;gap:8px;padding:10px 16px 12px}',
    '.cell.slider .top{display:flex;align-items:center;gap:10px}',
    '.cell.slider .top .lbl{flex:1}',
    'input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:28px;margin:0;background:transparent;cursor:pointer}',
    'input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;',
    '  background:linear-gradient(to right,var(--hk-tint) var(--p,50%),var(--hk-fill) var(--p,50%))}',
    'input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:var(--hk-fill)}',
    'input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:var(--hk-tint)}',
    'input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;margin-top:-12px;border-radius:50%;',
    '  background:#fff;box-shadow:0 0.5px 4px rgba(0,0,0,.12),0 6px 13px rgba(0,0,0,.12);border:0}',
    'input[type=range]::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:#fff;border:0;',
    '  box-shadow:0 0.5px 4px rgba(0,0,0,.12),0 6px 13px rgba(0,0,0,.12)}',
    'input[type=range]:focus-visible{outline:none}',
    'input[type=range]:focus-visible::-webkit-slider-thumb{outline:3px solid color-mix(in srgb,var(--hk-tint) 55%,transparent)}',
    // TEXT
    '.cell input.tx{flex:1 1 40%;min-width:0;border:0;background:none;color:var(--hk-label);font:inherit;text-align:right;',
    '  padding:6px 0;outline:none}',
    '.cell input.tx::placeholder{color:var(--hk-label3)}',
    '.cell.textrow:focus-within{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--hk-tint) 55%,transparent);border-radius:10px}',
    '.cell .unit{color:var(--hk-label2)}',
    // CHECK
    '.check{flex:none;width:17px;height:17px;color:var(--hk-tint)}',
    // LIST EDITOR
    '.li{padding-left:12px}',
    '.lx{flex:none;width:30px;height:30px;margin:-2px 0;border:0;padding:0;border-radius:50%;background:none;cursor:pointer;',
    '  display:inline-flex;align-items:center;justify-content:center}',
    '.lx svg{width:22px;height:22px}',
    '.lx .chev{width:8px;height:13px;margin:0}',
    '.lx.grip{width:44px;height:40px;margin:-6px -12px -6px 0;cursor:grab;color:var(--hk-label3);touch-action:none;border-radius:8px}',
    '.lx.grip svg{width:20px;height:14px}',
    '.li.dragging{z-index:3;background:var(--hk-cell);box-shadow:0 10px 30px rgba(0,0,0,.22);border-radius:10px;',
    '  transition:box-shadow .2s;cursor:grabbing}',
    '.li.moving{transition:transform .18s ease}',
    '.li.dragging::before,.li.dragging + .cell::before{display:none}',
    '.li .lbl a,.li a.lbl{color:inherit}',
    '.li a.lnk{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:12px;color:inherit;align-self:stretch;',
    '  margin:-6px 0;padding:6px 0;cursor:pointer}',
    '@media (hover:hover){.li a.lnk:hover .t{text-decoration:none}}',
    '.li:has(a.lnk:active){background:var(--hk-press)}',
    '.li .fixed{font-size:13px;color:var(--hk-label2)}',
    // DIALOG
    '.dlgbd{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.36);display:flex;align-items:center;justify-content:center;',
    '  padding:24px;animation:hkfade .18s ease}',
    '.dlg{width:min(300px,100%);border-radius:14px;overflow:hidden;background:color-mix(in srgb,var(--hk-cell) 92%,transparent);',
    '  -webkit-backdrop-filter:blur(30px) saturate(1.6);backdrop-filter:blur(30px) saturate(1.6);text-align:center;',
    '  box-shadow:0 20px 60px rgba(0,0,0,.3);animation:hkpop .22s cubic-bezier(.2,.9,.3,1.1)}',
    '.dlg h2{margin:0;padding:19px 16px 2px;font-size:17px;font-weight:600;line-height:22px}',
    '.dlg p{margin:0;padding:0 16px 18px;font-size:13px;line-height:18px;color:var(--hk-label)}',
    '.dlg .db{display:flex;border-top:.5px solid var(--hk-sep)}',
    '.dlg .db button{flex:1;height:44px;border:0;background:none;color:var(--hk-tint);font-size:17px;cursor:pointer}',
    '.dlg .db button + button{border-left:.5px solid var(--hk-sep)}',
    '.dlg .db button.bold{font-weight:600}',
    '.dlg .db button.red{color:var(--hk-red)}',
    '@media (hover:hover){.dlg .db button:hover{background:var(--hk-hover)}}',
    '@keyframes hkfade{from{opacity:0}}',
    '@keyframes hkpop{from{opacity:0;transform:scale(1.12)}}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}'
  ].join('\n');

  var CHEV = '<svg class="chev" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var UPDOWN = '<svg viewBox="0 0 9 14" aria-hidden="true"><path d="M1.5 5 4.5 2 7.5 5M1.5 9 4.5 12 7.5 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHECK = '<svg class="check" viewBox="0 0 17 17" aria-hidden="true"><path d="M2.5 9 6.5 13 14.5 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MINUS = '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="var(--hk-red)"/><path d="M6.5 11h9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var PLUS = '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="var(--hk-green)"/><path d="M6.5 11h9M11 6.5v9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var GRIP = '<svg viewBox="0 0 20 14" aria-hidden="true"><path d="M2 2h16M2 7h16M2 12h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function svg(markup) { var s = document.createElement('span'); s.innerHTML = markup; return s.firstChild; }

  // ------------------------------------------------------------ groups
  // o: { header, footer (text or node), sk, id }; rows: cells
  function group(o, rows) {
    o = o || {};
    var hid = o.header ? id('gh') : null;
    var sec = h('section', { class: 'grp' + (o.cls ? ' ' + o.cls : ''), 'aria-labelledby': hid, 'data-sk': o.sk });
    if (o.header) sec.appendChild(h('h2', { class: 'gh', id: hid }, o.header));
    var cells = h('div', { class: 'cells', role: o.role || null });
    (rows || []).forEach(function (r) { if (r) cells.appendChild(r); });
    sec.appendChild(cells);
    if (o.footer) sec.appendChild(typeof o.footer === 'string' ? h('p', { class: 'gf', text: o.footer }) : h('div', { class: 'gf' }, o.footer));
    return sec;
  }
  function label(text, sub, lid) {
    return h('span', { class: 'lbl', id: lid }, [h('span', { class: 't', text: text }), sub ? h('small', { text: sub }) : null]);
  }
  function lead(o) {
    if (o.tile) return h('span', { class: 'tile', style: 'background:' + o.tile[1], 'aria-hidden': 'true' }, icon(o.tile[0], ''));
    if (o.icon) return icon(o.icon);
    return null;
  }

  // A ROW THAT OPENS A PAGE: o.href, o.label, o.value, o.sub, o.icon/o.tile
  function nav(o) {
    var a = h('a', { class: 'cell' + (o.icon || o.tile ? ' hasic' : '') + (o.cls ? ' ' + o.cls : ''), href: o.href,
                     'data-sk': o.sk, 'data-fk': o.fk || o.sk || o.href, 'aria-current': o.current ? 'page' : null });
    a.setAttribute('href', o.href);
    var l = lead(o);
    if (l) a.appendChild(l);
    a.appendChild(label(o.label, o.sub));
    if (o.badge) a.appendChild(h('span', { class: 'badge', text: o.badge }));
    if (o.value !== undefined && o.value !== null && o.value !== '') a.appendChild(h('span', { class: 'val', text: o.value }));
    a.appendChild(svg(CHEV));
    return a;
  }
  // A SWITCH ROW: the whole row toggles; o.on, o.onChange(bool), o.disabled
  function toggle(o) {
    var lid = id('l');
    var sw = h('button', { class: 'sw', type: 'button', role: 'switch', 'aria-checked': o.on ? 'true' : 'false',
                           'aria-labelledby': lid, disabled: !!o.disabled, 'data-fk': o.fk || o.sk,
                           'aria-describedby': o.describedby });
    var flip = function () {
      if (sw.disabled) return;
      var on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      o.onChange(on);
    };
    sw.addEventListener('click', function (e) { e.stopPropagation(); flip(); });
    var row = h('div', { class: 'cell' + (o.icon ? ' hasic' : ''), 'data-sk': o.sk }, [lead(o), label(o.label, o.sub, lid), sw]);
    row.addEventListener('click', function (e) { if (e.target === row || row.contains(e.target) && e.target.closest('.lbl')) flip(); });
    return row;
  }
  // A SEGMENTED CONTROL: o.options [[value, text]], o.value, o.onChange(v).
  // o.stack: the control under the label, full width (long choices, phones)
  function seg(o) {
    var lid = id('l');
    var box = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': lid });
    var buttons = o.options.map(function (op, i) {
      var on = op[0] === o.value;
      var b = h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', tabindex: on ? '0' : '-1',
                            'data-fk': (o.fk || o.sk) + ':' + op[0], text: op[1] });
      b.addEventListener('click', function () { if (op[0] !== o.value) o.onChange(op[0]); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var j = (i + d + o.options.length) % o.options.length;
        buttons[j].focus();
        o.onChange(o.options[j][0]);
      });
      box.appendChild(b);
      return b;
    });
    if (!o.options.some(function (op) { return op[0] === o.value; }) && buttons[0]) buttons[0].setAttribute('tabindex', '0');
    return h('div', { class: 'cell' + (o.stack ? ' stack' : ''), 'data-sk': o.sk }, [label(o.label, o.sub, lid), box]);
  }
  // A POP-UP MENU: o.options [[value, text]], o.value, o.onChange(v)
  function select(o) {
    var lid = id('l');
    var pop = popup({ options: o.options, value: o.value, onChange: o.onChange, fk: o.fk || o.sk,
                      labelledby: lid, disabled: o.disabled, placeholder: o.placeholder });
    return h('div', { class: 'cell', 'data-sk': o.sk }, [lead(o), label(o.label, o.sub, lid), pop]);
  }
  // THE POP-UP MENU ITSELF: the value and ⌃⌄, the system's own menu over it.
  // o.label (its accessible name) or o.labelledby; o.options [[value, text]]
  function popup(o) {
    var s = h('select', { 'aria-label': o.labelledby ? null : o.label, 'aria-labelledby': o.labelledby,
                          'data-fk': o.fk, disabled: !!o.disabled });
    var shown = '';
    o.options.forEach(function (op) {
      var opt = h('option', { value: op[0], text: op[1] });
      if (String(op[0]) === String(o.value)) { opt.selected = true; shown = op[1]; }
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { o.onChange(s.value); });
    return h('span', { class: 'pop' }, [h('span', { class: 'pv', text: shown || o.placeholder || '' }), svg(UPDOWN), s]);
  }
  // A SLIDER: o.value, o.min, o.max, o.step, o.unit, o.badge, o.onChange(v)
  // (on release; the number follows the thumb while it moves)
  function slider(o) {
    var lid = id('l');
    var min = o.min || 0, max = o.max === undefined ? 100 : o.max;
    var out = h('span', { class: 'val', text: o.value + (o.unit || '') });
    var r = h('input', { type: 'range', min: min, max: max, step: o.step || 1, 'aria-labelledby': lid,
                         'data-fk': o.fk || o.sk, 'aria-valuetext': o.value + (o.unit || '') });
    r.value = o.value;
    var paint = function () {
      r.style.setProperty('--p', ((r.value - min) / (max - min) * 100) + '%');
      out.textContent = r.value + (o.unit || '');
      r.setAttribute('aria-valuetext', r.value + (o.unit || ''));
    };
    paint();
    r.addEventListener('input', paint);
    r.addEventListener('change', function () { o.onChange(Number(r.value)); });
    return h('div', { class: 'cell slider', 'data-sk': o.sk }, [
      h('div', { class: 'top' }, [label(o.label, o.sub, lid), o.badge ? h('span', { class: 'badge', text: o.badge }) : null, out]), r]);
  }
  // A TEXT ROW: saved on Return or when it loses focus; Escape puts it back.
  // o.value, o.placeholder, o.onCommit(text), o.error, o.unit, o.inputmode
  function text(o) {
    var lid = id('l'), eid = o.error ? id('e') : null;
    var inp = h('input', { class: 'tx', type: o.type || 'text', 'aria-labelledby': lid, 'data-fk': o.fk || o.sk,
                           placeholder: o.placeholder || '', maxlength: o.maxlength || 300, inputmode: o.inputmode,
                           autocomplete: o.autocomplete || 'off', spellcheck: 'false', 'aria-invalid': o.error ? 'true' : null,
                           'aria-describedby': eid });
    inp.value = o.value == null ? '' : String(o.value);
    var start = inp.value;
    var commit = function () { if (inp.value !== start) { start = inp.value; o.onCommit(inp.value); } };
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { inp.value = start; inp.blur(); }
    });
    inp.addEventListener('blur', commit);
    var row = h('div', { class: 'cell textrow', 'data-sk': o.sk }, [label(o.label, o.sub, lid), inp,
      o.unit ? h('span', { class: 'unit', text: o.unit }) : null]);
    row.addEventListener('click', function (e) { if (e.target !== inp) inp.focus(); });
    if (!o.error) return row;
    return h('div', { class: 'cellwrap' }, [row, h('div', { class: 'errline', id: eid, role: 'alert', text: o.error })]);
  }
  // A ROW THAT ONLY SAYS SOMETHING
  function info(o) {
    return h('div', { class: 'cell' + (o.icon || o.tile ? ' hasic' : ''), 'data-sk': o.sk }, [lead(o), label(o.label, o.sub),
      o.value !== undefined ? h('span', { class: 'val' + (o.valueCls ? ' ' + o.valueCls : ''), text: o.value }) : null]);
  }
  // A CHECKMARK ROW (one of several, or several of several)
  function check(o) {
    var b = h('button', { class: 'cell' + (o.icon || o.tile ? ' hasic' : ''), type: 'button', role: o.multi ? 'checkbox' : 'radio',
                          'aria-checked': o.on ? 'true' : 'false', 'data-sk': o.sk, 'data-fk': o.fk || o.sk });
    var l = lead(o);
    if (l) b.appendChild(l);
    b.appendChild(label(o.label, o.sub));
    if (o.value) b.appendChild(h('span', { class: 'val', text: o.value }));
    var c = svg(CHECK);
    c.style.visibility = o.on ? 'visible' : 'hidden';
    b.appendChild(c);
    b.addEventListener('click', function () { o.onClick(!o.on); });
    return b;
  }
  // A BUTTON ROW: o.label, o.onClick, o.destructive, o.center
  function button(o) {
    return h('button', { class: 'cell ' + (o.destructive ? 'redc' : 'tintc') + (o.center ? ' center' : ''), type: 'button',
                         'data-sk': o.sk, 'data-fk': o.fk || o.sk || ('btn:' + o.label), disabled: !!o.disabled,
                         'aria-disabled': o.disabled ? 'true' : null, onclick: o.onClick },
      [o.icon ? icon(o.icon, 'ic') : null, h('span', { class: 'lbl' }, h('span', { class: 't', text: o.label }))]);
  }

  // ------------------------------------------------------ the list editor
  // o = {
  //   auto: true|false|undefined  (undefined: no Automatic switch)
  //   autoFooter, onAuto(on)       the switch and what it means
  //   rows:  [{value, label, sub, icon, href, fixed, removable, value2, control}]
  //          shown, in order (value2: a note at the end; control: a node there)
  //   more:  [{value, label, sub, icon}]                           can be added
  //   onChange(values)             Shown reordered/removed/added (custom mode)
  //   onRemove(value), onAdd(value)  override (e.g. while automatic)
  //   addLabel, onAddOther()       a row that opens a picker for more
  //   minRows                      the fewest Shown rows (an empty list would
  //                                be Automatic again): their minus is hidden
  //   reorder: false               a set, not an order (no handles)
  //   shownHeader, moreHeader, shownFooter, emptyText, fk
  //   announce(text)               the page's live region
  // }
  // While automatic the Shown rows are read-only (their detail still opens)
  // unless a row says removable.
  function listEditor(o) {
    var frag = document.createDocumentFragment();
    var fk = o.fk || 'list';
    if (o.auto !== undefined) {
      frag.appendChild(group({ footer: o.autoFooter }, [toggle({ label: 'Automatic', on: o.auto, sk: fk + ':auto',
                                                                 onChange: function (on) { o.onAuto(on); } })]));
    }
    var custom = !o.auto;
    var values = o.rows.map(function (r) { return r.value; });
    var cells = [];
    o.rows.forEach(function (r, i) {
      var canRemove = r.fixed ? false : (custom ? values.length > (o.minRows || 0) : r.removable);
      var row = h('div', { class: 'cell li' + (r.icon ? ' hasic' : ''), 'data-v': r.value, 'data-sk': r.sk });
      if (canRemove) {
        var rm = h('button', { class: 'lx rm', type: 'button', 'aria-label': 'Remove ' + r.label, 'data-fk': fk + ':rm:' + r.value });
        rm.appendChild(svg(MINUS));
        rm.addEventListener('click', function () {
          if (o.onRemove && (!custom || r.removable)) { o.onRemove(r.value); return; }
          var v = values.filter(function (x) { return x !== r.value; });
          o.onChange(v);
          if (o.announce) o.announce(r.label + ' removed');
        });
        row.appendChild(rm);
      } else if (custom && o.rows.some(function (x) { return !x.fixed; })) {
        row.appendChild(h('span', { class: 'lx', 'aria-hidden': 'true' }));
      }
      if (r.icon) row.appendChild(icon(r.icon));
      var lbl = label(r.label, r.sub);
      if (r.fixed) lbl.appendChild(h('span', { class: 'fixed', text: r.fixedText || 'Always included' }));
      // A ROW THAT OPENS A PAGE opens from anywhere between its minus and its
      // handle, not only from the ›: its name, its note and the › are one
      // link. With a control of its own, just the name.
      var main = lbl;
      if (r.href) {
        main = h('a', { class: 'lnk', 'data-fk': fk + ':go:' + r.value });
        main.setAttribute('href', r.href);
        main.appendChild(lbl);
      }
      row.appendChild(main);
      if (r.value2) (r.href && !r.control ? main : row).appendChild(h('span', { class: 'val', text: r.value2 }));
      // a control of the row's own (a generated screen's menu place)
      if (r.control) row.appendChild(r.control);
      else if (r.href) main.appendChild(svg(CHEV));
      if (custom && values.length > 1 && o.reorder !== false) {
        var g = h('button', { class: 'lx grip', type: 'button', 'aria-label': 'Move ' + r.label,
                              'aria-description': 'Use the up and down arrow keys to move it', 'data-fk': fk + ':grip:' + r.value });
        g.appendChild(svg(GRIP));
        g.addEventListener('keydown', function (e) {
          var d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          if (!d) return;
          e.preventDefault();
          var j = i + d;
          if (j < 0 || j >= values.length) return;
          if (o.announce) o.announce(r.label + ', ' + (j + 1) + ' of ' + values.length);
          o.onChange(moveVal(values, i, j));
        });
        dragger(g, row, function () { return cells; }, i, function (to) {
          if (to !== i) {
            if (o.announce) o.announce(r.label + ', ' + (to + 1) + ' of ' + values.length);
            o.onChange(moveVal(values, i, to));
          }
        });
        row.appendChild(g);
      }
      cells.push(row);
    });
    if (!cells.length) cells.push(h('div', { class: 'cell' }, h('span', { class: 'lbl' }, h('small', { text: o.emptyText || 'None' }))));
    frag.appendChild(group({ header: o.shownHeader || 'Shown', footer: o.shownFooter, sk: fk + ':shown' }, cells));
    var more = (o.more || []).map(function (r) {
      var b = h('button', { class: 'cell li' + (r.icon ? ' hasic' : ''), type: 'button', 'data-fk': fk + ':add:' + r.value,
                            'aria-label': 'Add ' + r.label });
      var p = svg(PLUS); var s = h('span', { class: 'lx', 'aria-hidden': 'true' }); s.appendChild(p);
      b.appendChild(s);
      if (r.icon) b.appendChild(icon(r.icon));
      b.appendChild(label(r.label, r.sub));
      b.addEventListener('click', function () {
        if (o.onAdd) { o.onAdd(r.value); return; }
        o.onChange(values.concat(r.value));
        if (o.announce) o.announce(r.label + ' added');
      });
      return b;
    });
    if (o.addLabel) more.push(button({ label: o.addLabel, onClick: o.onAddOther, fk: fk + ':other' }));
    if (more.length) frag.appendChild(group({ header: o.moreHeader || 'More', footer: o.moreFooter }, more));
    return frag;
  }
  function moveVal(values, from, to) {
    var v = values.slice(); var m = v.splice(from, 1)[0]; v.splice(to, 0, m); return v;
  }
  // DRAG A ROW BY ITS HANDLE (mouse, pen or finger): the row lifts and
  // follows, the others slide aside; dropped, the new order is saved.
  function dragger(handle, row, all, index, done) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      var rows = all(), start = e.clientY, h0 = row.getBoundingClientRect().height, to = index;
      var mids = rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + b.height / 2; });
      try { handle.setPointerCapture(e.pointerId); } catch (x) { /* old browsers */ }
      row.classList.add('dragging');
      rows.forEach(function (r) { if (r !== row) r.classList.add('moving'); });
      var moveH = function (ev) {
        var dy = ev.clientY - start;
        row.style.transform = 'translateY(' + dy + 'px)';
        var y = mids[index] + dy;
        to = index;
        for (var k = 0; k < rows.length; k++) {
          if (k < index && y < mids[k]) { to = k; break; }
        }
        for (var j = rows.length - 1; j > index; j--) {
          if (y > mids[j]) { to = j; break; }
        }
        rows.forEach(function (r, k) {
          if (r === row) return;
          var shift = (index < k && k <= to) ? -h0 : (to <= k && k < index) ? h0 : 0;
          r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
        });
      };
      var up = function () {
        handle.removeEventListener('pointermove', moveH);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        rows.forEach(function (r) { r.style.transform = ''; r.classList.remove('moving'); });
        row.classList.remove('dragging');
        done(to);
      };
      handle.addEventListener('pointermove', moveH);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  // ------------------------------------------------------------ the alert
  // confirm(shadowRoot, {title, message, ok, cancel, destructive}) -> Promise<bool>.
  // Cancel is where focus starts; Escape cancels; focus stays in the alert.
  function confirm(rootEl, o) {
    return new Promise(function (resolve) {
      var tid = id('dt'), mid = id('dm');
      var prev = rootEl.activeElement || document.activeElement;
      var cancel = h('button', { type: 'button', class: o.destructive ? 'bold' : '', text: o.cancel || 'Cancel' });
      var ok = h('button', { type: 'button', class: o.destructive ? 'red' : 'bold', text: o.ok || 'OK' });
      var dlg = h('div', { class: 'dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': tid, 'aria-describedby': mid }, [
        h('h2', { id: tid, text: o.title }), h('p', { id: mid, text: o.message || '' }), h('div', { class: 'db' }, [cancel, ok])]);
      var bd = h('div', { class: 'dlgbd' }, dlg);
      var close = function (v) {
        bd.remove();
        if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* gone */ } }
        resolve(v);
      };
      cancel.addEventListener('click', function () { close(false); });
      ok.addEventListener('click', function () { close(true); });
      bd.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        if (e.key === 'Tab') { e.preventDefault(); (rootEl.activeElement === ok ? cancel : ok).focus(); }
      });
      bd.addEventListener('click', function (e) { if (e.target === bd) close(false); });
      rootEl.appendChild(bd);
      cancel.focus();
    });
  }

  root.hkSettingsKit = {
    version: '2.0.0', CSS: CSS, h: h, esc: esc, icon: icon, svg: svg, id: id,
    CHEV: CHEV, CHECK: CHECK, group: group, nav: nav, toggle: toggle, seg: seg, select: select, slider: slider,
    text: text, info: info, check: check, button: button, listEditor: listEditor, confirm: confirm, label: label, popup: popup,
    moveVal: moveVal
  };
})();
