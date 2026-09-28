// hk-security.js -- the alarm keypad
//
// hk-alarm-keypad-card. The code is checked SERVER-SIDE (the HK Alarm PIN
// integration's panel); this card only collects it.
//
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
      else console.error('[hk-security] hk-cards-ready fired without hk-base.js');
    }, { once: true });
  }

  whenBase(function (C) {
    var setting = C.setting;
  if (window.hkSecurity) return;                  // double-load guard
  var HkBase = C.HkBase, M = C.M, register = C.register,
      wireEditor = C.wireEditor, firstOfDomain = C.firstOf,
      HK_LABELS = C.LABELS, create = C.create;

  // =========================================================== alarm keypad
  // The code entry half of the Alarm page and the #alarm pop-up.
  //
  // WHAT THE CARD DOES NOT DO: check the code. That lives in the Alarm PIN
  // feature's alarm_control_panel, which wraps an alarm integration with no
  // code of its own and checks the entered code (against a hash, never the
  // code) before forwarding. A card cannot enforce anything -- anyone who can
  // reach the frontend can call the service directly -- so this card COLLECTS
  // a code and Home Assistant decides whether it was right. It calls
  // alarm_control_panel.alarm_disarm / arm_home / arm_away on the WRAPPER,
  // never on the wrapped panel.
  //
  // THE DIGITS STAY IN THE BROWSER. They are a JS string that never leaves
  // this card until a button is pressed -- not a shared input_text helper,
  // which would hold whatever somebody was half-way through typing, share it
  // between every screen, rebroadcast it to every connected client on each
  // keypress and need excluding from the recorder by hand. The card passes its
  // own digits to the alarm service and clears itself.
  //
  // THERE IS NO ENTER KEY, deliberately. It would call
  // alarm_control_panel.alarm_disarm with the typed code -- identical to the
  // Disarm button in the row below it. Two keys for one action, one of them
  // named after a keyboard convention rather than after what it does, is worse
  // than one key that says Disarm. The 0 widens into its cell, so the bottom
  // row is a double-width 0 and then Clear.
  //
  // WRONG-CODE FEEDBACK still comes from the server, and has to: only the
  // panel knows the code. A refused call answers with an error, which this
  // card shows as "Wrong code" for 3s (a `bad_code_entity` flag is also read
  // for a panel that fails silently).
  class HkAlarmKeypadCard extends HkBase {
    static get CSS() {
      return [
        '.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 14px 0}',
        '.k{height:62px;border-radius:22px;padding:0;' + M.glass + ';',
        '  border:' + M.border + ';box-shadow:0 6px 18px rgba(0,0,0,0.10);',
        '  display:flex;align-items:center;justify-content:center;cursor:pointer;',
        '  user-select:none;font-size:19.7px;letter-spacing:-0.45px;font-weight:700;',
        '  color:rgba(255,255,255,0.92);transition:transform .12s ease}',
        '.k:active{transform:scale(0.96)}',
        '.acts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}',
        // THE ICON AND THE LABEL ARE CENTRED AS A PAIR, not laid out in a
        // fixed icon column. A `grid-template-columns: 34px 1fr` with the label
        // at justify-self:start parks the glyph hard against the left rim and
        // leaves a third of the button empty on the right -- beside a keypad of
        // perfectly centred digits it reads as broken rather than deliberate.
        // One flex row, centred, is what the Home app does with a labelled control.
        '.a{height:64px;border-radius:22px;padding:0 10px;' + M.glass + ';',
        '  border:' + M.border + ';box-shadow:0 6px 18px rgba(0,0,0,0.10);',
        '  display:flex;align-items:center;justify-content:center;gap:10px;',
        '  cursor:pointer;user-select:none;transition:transform .12s ease}',
        '.a:active{transform:scale(0.96)}',
        '.a ha-icon{--mdc-icon-size:20px;width:20px;height:20px;flex:0 0 auto;',
        '  color:rgba(255,255,255,0.92)}',
        // THE THREE MODES ARE COLOURED, so each is easy to pick out.
        // The same meaning the Security chip already uses -- armed green,
        // disarmed red -- with Home in blue so the two ways of arming are not
        // the same green side by side. The icon palette (hkCards.PALETTE.icon).
        // The glyph only: the label stays white, so the key still reads as glass.
        '.a.home ha-icon{color:' + C.PALETTE.icon.blue + '}',
        '.a.away ha-icon{color:' + C.PALETTE.icon.green + '}',
        '.a.off ha-icon{color:' + C.PALETTE.icon.red + '}',
        // Clear sits IN the keypad grid, so it takes the keypad's own 62px row
        // height rather than the 64px of the action row below; 64 would leave a
        // 2px step against the 0 beside it.
        '.k62{height:62px}',
        '.k62 ha-icon{--mdc-icon-size:24px;width:24px;height:24px}',
        // The 0 spans two columns because THERE IS NO ENTER: it would call
        // alarm_disarm with the typed code -- byte for byte what the Disarm
        // button one row below does -- so the keypad would offer the same action
        // twice under two names, one of which does not say what it does.
        // Widening a key keeps the row full; the alternative leaves a hole.
        // The 0 is the one that widens, so the middle column stays a digit.
        '.k2{grid-column:span 2}',
        '.a span{font-size:14px;letter-spacing:-0.15px;font-weight:600;',
        '  color:rgba(255,255,255,0.92)}',
        // The readout, and the only place the keypad talks back.
        '.read{height:58px;border-radius:20px;padding:8px 16px;margin:0 0 14px 0;',
        '  ' + M.glass + ';border:' + M.border + ';box-shadow:none;',
        '  display:flex;align-items:center;justify-content:center}',
        '.read .code{font-weight:700;color:rgba(255,255,255,0.88);',
        '  font-size:30px;letter-spacing:8px}',
        '.read[data-bad="1"]{border:1px solid rgba(255,69,58,0.55)}',
        '.read[data-bad="1"] .code{font-size:19px;letter-spacing:0.2px;',
        '  color:rgba(255,69,58,0.95)}',
        // THE STATUS, AT REST: what the alarm is doing, in place of the
        // dash -- see _status. Typing or a wrong code puts the code line back.
        '.read .st{display:none;align-items:center;gap:10px;min-width:0}',
        '.read[data-mode="status"] .st{display:flex}',
        '.read[data-mode="status"] .code{display:none}',
        '.read .st ha-icon{--mdc-icon-size:26px;width:26px;height:26px;flex:none;display:flex}',
        '.read .st span{font-size:20px;font-weight:700;letter-spacing:-0.3px;',
        '  color:rgba(255,255,255,0.94);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '@media (prefers-reduced-motion: reduce){',
        '  .k,.k:active,.a,.a:active{transition:none;transform:none}}'
      ].join('');
    }
    _onConfig() { this._code = ''; this._msg = ''; this._built = false; }

    // THE ALARM'S STATUS IN THE READOUT, so the keypad itself says what the
    // alarm is doing instead of a separate Status block beside it (whose glyph
    // could never sit on the column of the pills under it). The readout says
    // it while nobody is typing: the shield of the button that sets that
    // state, in that button's colour -- Disarm red, Home blue, Away green --
    // amber while it is on its way, and the word. `status: false` keeps the
    // plain dash (the alarm sheet, which leads with the state word already).
    static status(s) {
      var P = C.PALETTE.icon, st = s && s.state;
      var M2 = {
        disarmed: ['hk:shield-off', P.red, 'Disarmed'],
        armed_home: ['hk:shield-home', P.blue, 'Armed Home'],
        armed_night: ['hk:shield-home', P.blue, 'Armed Night'],
        armed_away: ['hk:shield-lock', P.green, 'Armed Away'],
        armed_vacation: ['hk:shield-lock', P.green, 'Armed Vacation'],
        armed_custom_bypass: ['hk:shield-lock', P.green, 'Armed'],
        arming: ['hk:shield-lock', P.orange, 'Arming\u2026'],
        pending: ['hk:shield-alert', P.orange, 'Pending\u2026'],
        disarming: ['hk:shield-off', P.orange, 'Disarming\u2026'],
        triggered: ['hk:shield-alert', P.red, 'Triggered']
      };
      var m = M2[st] || ['hk:shield-off', 'rgba(255,255,255,0.55)',
                         !s || st === 'unavailable' || st === 'unknown' ? 'Unavailable' : String(st)];
      return { icon: m[0], color: m[1], word: m[2] };
    }

    // The card's own entity, else the alarm chosen in Configure -> Your home.
    _panel() { return this._config.entity || setting('security.alarm'); }
    // The server's wrong-code flash: the card's own, else Configure -> Advanced.
    _badCode() { return this._config.bad_code_entity || setting('features.alarm_bad_code'); }
    _press(d) { this._code = (this._code + d).slice(0, 10); this._paint(); }
    _clear() { this._code = ''; this._paint(); }

    // NOT named _call: that name is HkBase._call(domain, service, data), and
    // shadowing it makes this method call itself forever -- every
    // Home/Away/Disarm press overflows the stack and sends nothing.
    _alarm(service) {
      if (!this._hass) { return; }
      var self = this;
      // WRONG CODE, BUILT IN. An alarm integration that checks the code refuses
      // the call with an error ("Invalid alarm code ..."), and that refusal is
      // shown here for 3 s -- no helper, no automation. An error that is not
      // about the code says the alarm did not answer instead.
      //
      // The optional wrong-code INDICATOR (Configure -> Advanced) stays for
      // panels that fail SILENTLY -- a template panel that checks the code
      // itself and simply does nothing on a mismatch: its own automation turns
      // the indicator on, and _paint shows that too.
      this._callErr('alarm_control_panel', service, {
        entity_id: this._panel(), code: this._code
      }).then(function (r) {
        if (r.ok) return;
        self._flash(/code/i.test(String(r.error)) ? 'Wrong code' : 'Alarm not responding');
      });
      // Cleared whether or not the code was right -- a keypad that keeps a
      // rejected code on screen invites a second try at the same wrong digits.
      this._clear();
    }

    _flash(text) {
      var self = this;
      this._msg = text;
      clearTimeout(this._msgT);
      this._msgT = setTimeout(function () { self._msg = ''; self._paint(); }, 3000);
      this._paint();
    }

    // The flash's timer goes with the card (it chains to HkBase's cleanup).
    disconnectedCallback() {
      clearTimeout(this._msgT);
      this._msgT = null;
      this._msg = '';
      super.disconnectedCallback();
    }

    // The wrong-code flag is an input like the panel itself. HkBase's default
    // signature names `entity` only, so without this the server's 3 s flash of
    // the wrong-code flag never reaches the screen: "Wrong code" could not
    // appear unless the panel happened to change in the same moment.
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      // the panel as _panel() finds it: the status in the readout reads it
      var ids = [c.entity || setting('security.alarm'), c.bad_code_entity || setting('features.alarm_bad_code')];
      return ids.map(function (id) {
        var s = id && h.states[id];
        return id + '=' + (s ? s.last_updated : 'x');
      }).join(';');
    }

    _paint() {
      var read = this._root.querySelector('.read');
      if (!read) { return; }
      var bad = this._st(this._badCode());
      var isBad = !!this._msg || (bad && bad.state === 'on');
      read.setAttribute('data-bad', isBad ? '1' : '0');
      var rest = !isBad && !this._code && this._config.status !== false;
      read.setAttribute('data-mode', rest ? 'status' : 'code');
      var span = read.querySelector('.code');
      span.textContent = isBad ? (this._msg || 'Wrong code')
                       : (this._code ? new Array(this._code.length + 1).join('\u2022')
                                     : '\u2014');
      if (!rest) return;
      var s = HkAlarmKeypadCard.status(this._st(this._panel()));
      var icon = read.querySelector('.st ha-icon'), word = read.querySelector('.st span');
      if (icon.getAttribute('icon') !== s.icon) icon.setAttribute('icon', s.icon);
      icon.style.color = s.color;
      word.textContent = s.word;
      read.setAttribute('aria-label', 'Alarm: ' + s.word);
    }

    _key(cls, label, fn, icon) {
      var d = document.createElement('div');
      d.className = cls;
      C.button(d, fn);
      if (icon) {
        var i = document.createElement('ha-icon'); i.setAttribute('icon', icon);
        var s = document.createElement('span'); s.textContent = label;
        d.appendChild(i); d.appendChild(s);
      } else {
        d.textContent = label;
      }
      return d;
    }

    _render() {
      if (!this._config) { return; }
      if (this._built) { this._paint(); return; }
      var self = this;
      this._root.innerHTML = '';

      var read = document.createElement('div');
      read.className = 'read';
      read.setAttribute('role', 'status');
      var code = document.createElement('span'); code.className = 'code';
      var st = document.createElement('div'); st.className = 'st';
      st.appendChild(document.createElement('ha-icon'));
      st.appendChild(document.createElement('span'));
      read.appendChild(code); read.appendChild(st);
      this._root.appendChild(read);

      var pad = document.createElement('div'); pad.className = 'pad';
      ['1','2','3','4','5','6','7','8','9'].forEach(function (d) {
        pad.appendChild(self._key('k', d, function () { self._press(d); }));
      });
      // 0 FIRST AND SPANNING, Clear on the right. The 0 takes two columns, so
      // the middle column -- where a hand goes for it without looking -- is
      // still 0. A wide Clear on the left would put a destructive key under the
      // spot muscle memory reaches for a digit, which is the wrong way round:
      // it is the one key here you cannot take back by pressing it again.
      //
      // Clear stays icon+label rather than a bare digit: it does a different
      // KIND of thing from the numbers above it, and the label says so.
      pad.appendChild(self._key('k k2', '0', function () { self._press('0'); }));
      pad.appendChild(self._key('a k62', 'Clear', function () { self._clear(); },
                                'hk:backspace-outline'));
      this._root.appendChild(pad);

      var acts = document.createElement('div'); acts.className = 'acts';
      acts.appendChild(self._key('a home', 'Home', function () { self._alarm('alarm_arm_home'); }, 'hk:shield-home'));
      acts.appendChild(self._key('a away', 'Away', function () { self._alarm('alarm_arm_away'); }, 'hk:shield-lock'));
      acts.appendChild(self._key('a off', 'Disarm', function () { self._alarm('alarm_disarm'); }, 'hk:shield-off'));
      this._root.appendChild(acts);

      this._built = true;
      this._paint();
    }
    getCardSize() { return 8; }
  }

  if (!customElements.get('hk-alarm-keypad-card')) {
    customElements.define('hk-alarm-keypad-card', HkAlarmKeypadCard);
  }
  window.customCards.push({
    type: 'hk-alarm-keypad-card',
    name: 'HK Alarm Keypad',
    description: 'A keypad to arm and disarm an alarm panel with a code.',
    preview: false
  });

  // Field labels and help text live in hk-base.js (HK_LABELS / HK_HELPERS).
  wireEditor('hk-alarm-keypad-card', HkAlarmKeypadCard, [
    // NOT required: empty is the home's alarm (Configure -> Your home), so a
    // keypad added in the UI follows a change there instead of keeping a copy.
    { name: 'entity', label: 'Alarm panel',
      selector: { entity: { filter: { domain: 'alarm_control_panel' } } } },
    // Set by the automation that rejects a code, so the keypad can shake.
    { name: 'bad_code_entity',
      selector: { entity: { filter: { domain: 'input_boolean' } } } }
  ], function (hass) {
    return setting('security.alarm') ? {} : { entity: firstOfDomain(hass, 'alarm_control_panel') };
  });

  window.hkSecurity = { version: '1.0.0' };
  });
})();
