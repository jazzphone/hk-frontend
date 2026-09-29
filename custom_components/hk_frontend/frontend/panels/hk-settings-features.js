// hk-settings-features.js -- THE FEATURES' OWN SETTINGS on the HK Settings
// page.
//
// Each page belongs to one of HK Frontend's optional features -- Music, Live
// TV, Alarm PIN, Clean Areas -- each its own entry of the integration, added
// from Settings -> Devices & services -> HK Frontend -> Add feature
// (features/__init__.py). A page reads and saves through that feature's own
// commands (`<id>/settings/get` and `/set`, e.g. hk_tv/settings/get), which
// check each change the way the feature's Configure does and store it where
// Configure stores it -- in the feature's own entry. panel/get `features`
// lists each feature with its entries; not yet added, its page offers Add.
// Every choice comes from the house as it is -- the tuner's lineup, the
// vacuums, the alarm panels, Music Assistant's players -- never from a list
// written here.
//
// The page (hk-settings.js) owns drawing and saving; this file is the pages'
// content, and the pure parts are tested in tests/test_features.js.
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  if (root.hkSettingsFeatures) return;

  // [route, id (the feature's websocket prefix and its key in panel/get
  // `features`), label, icon, tile color]. Music is always listed: its
  // Browse Music settings are the dashboards' own.
  var LIST = [
    ['music', 'hk_music', 'Music', 'mdi:music', '#ff2d55'],
    ['tv', 'hk_tv', 'Live TV', 'mdi:television-classic', '#007aff'],
    ['alarm', 'hk_alarm_pin', 'Alarm PIN', 'mdi:shield-key', '#ff3b30'],
    ['clean', 'hk_clean_areas', 'Clean Areas', 'mdi:robot-vacuum', '#30b0c7']
  ];
  function byRoute(r) { return LIST.filter(function (x) { return x[0] === r; })[0] || null; }

  // ------------------------------------------------------------------ pure
  // The Features rows the sidebar lists: Music always, the others when the
  // server reports them (every feature is part of HK Frontend, so always).
  function listed(features) {
    features = features || {};
    return LIST.filter(function (x) {
      return x[0] === 'music' || !!(features[x[1]] && features[x[1]].installed);
    });
  }
  // a feature's state on this house: 'missing' (not reported) | 'not_added' |
  // 'added'
  function stateOf(features, domain) {
    var f = (features || {})[domain];
    if (!f || !f.installed) return 'missing';
    return f.entries && f.entries.length ? 'added' : 'not_added';
  }
  // Every feature is an item of HK Frontend's one entry, added with Add
  // feature on the integration's page (which offers the features the house
  // has not added); the same page lists each one, with its gear
  function addHref() { return '/config/integrations/integration/hk_frontend'; }
  function integrationHref() { return '/config/integrations/integration/hk_frontend'; }

  // LIVE TV: the channels as the list editor shows them. Shown: the saved
  // channels (their own names; the number, and the station when the name is
  // not the station's). More: the rest of the tuner's lineup, by network
  // when the guide names one.
  function tvLists(d) {
    var saved = (d && d.channels) || [], lineup = (d && d.lineup) || [];
    var st = {};
    lineup.forEach(function (c) { st[c.number] = c; });
    var have = {};
    saved.forEach(function (c) { have[c.number] = true; });
    var rows = saved.map(function (c) {
      var l = st[c.number];
      var sub = c.number + (l && l.station && l.station !== c.name ? ' · ' + l.station : '') + (l ? '' : ' · Not in the lineup');
      return { value: c.number, label: c.name, sub: sub };
    });
    var more = lineup.filter(function (c) { return !have[c.number]; }).map(function (c) {
      return { value: c.number, label: c.network || c.station, sub: c.number + (c.network ? ' · ' + c.station : '') };
    });
    return { rows: rows, more: more };
  }
  // CLEAN BY AREA: a vacuum's line (what it does with a chosen room)
  function vacuumSub(v, areaName) {
    if (v.how === 'map') return v.areas.length === 1 ? 'Cleans 1 room on its map' : 'Cleans ' + v.areas.length + ' rooms on its map';
    if (v.how === 'start') return 'Starts when ' + areaName(v.areas[0]) + ' is chosen';
    if (v.how === 'no_map') return 'Can clean by area, but has no room map yet';
    return 'Can’t clean by area and has no room of its own';
  }
  // which vacuums take part after one is ticked or unticked: [] is every
  // vacuum (new ones join by themselves); null when none would be left
  function vacuumsAfter(d, id, on) {
    var all = (d.vacuums || []).map(function (v) { return v.vacuum; });
    var now = (d.chosen_vacuums || []).length ? d.chosen_vacuums.filter(function (x) { return all.indexOf(x) >= 0; }) : all.slice();
    var next = on ? all.filter(function (x) { return now.indexOf(x) >= 0 || x === id; })
                  : now.filter(function (x) { return x !== id; });
    if (!next.length) return null;
    return next.length === all.length ? [] : next;
  }
  // the Rooms list: Shown -- the rooms the picker offers; More -- the rest a
  // vacuum reaches (only while chosen by hand)
  function roomLists(d) {
    var by = {};
    (d.areas || []).forEach(function (a) { by[a.id] = a; });
    var row = function (id) {
      var a = by[id] || { id: id, name: id, by: [] };
      return { value: id, label: a.name, sub: [a.floor, (a.by || []).join(', ')].filter(Boolean).join(' · ') || null };
    };
    var auto = !(d.chosen_areas || []).length;
    // floor by floor (lowest first, no floor last), A to Z: as the screens group them
    var lv = function (a) { return a && typeof a.level === 'number' ? a.level : (a && a.floor ? 1e8 : 1e9); };
    var cmp = function (x, y) {
      var a = by[x], b = by[y];
      return lv(a) - lv(b) || String(a.floor || '').localeCompare(String(b.floor || '')) || String(a.name).localeCompare(String(b.name));
    };
    var shown = (d.offered || []).filter(function (id) { return by[id]; }).sort(cmp);
    return { auto: auto, rows: shown.map(row),
             more: auto ? [] : (d.areas || []).filter(function (a) { return shown.indexOf(a.id) < 0; })
               .map(function (a) { return a.id; }).sort(cmp).map(row) };
  }
  function roomCount(d) {
    var n = (d.offered || []).length;
    if (!(d.chosen_areas || []).length) return 'Automatic · ' + n;
    return n + ' of ' + (d.areas || []).length;
  }
  // MUSIC: the Speakers list. Shown: the speakers in their order (each named
  // by its area, the player's own name under it when different); More: the
  // other Music Assistant players, but never a preset's sync group.
  function speakerLists(d) {
    var groups = (d.presets || []).map(function (p) { return p.group; });
    var have = (d.speakers || []).map(function (x) { return x.entity; });
    return {
      rows: (d.speakers || []).map(function (x) {
        return { value: x.entity, label: x.name,
                 sub: [x.floor, x.player && x.player !== x.name ? x.player : null].filter(Boolean).join(' · ') || null };
      }),
      more: (d.players || []).filter(function (p) { return have.indexOf(p.entity) < 0 && groups.indexOf(p.entity) < 0; })
        .map(function (p) { return { value: p.entity, label: p.name, sub: p.entity }; })
    };
  }
  function speakerName(d, id) {
    var x = (d.speakers || []).filter(function (s) { return s.entity === id; })[0];
    if (x) return x.name;
    var p = (d.players || []).filter(function (s) { return s.entity === id; })[0];
    return p ? p.name : id;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function tvCount(d) {
    var n = ((d && d.channels) || []).length, of = d && d.lineup ? d.lineup.length : null;
    return of === null ? String(n) : n + ' of ' + of;
  }

  // SEARCH: each installed feature's settings, [label, route, words]
  var SEARCH = {
    hk_tv: [['Live TV', 'features/tv', 'television tv hdhomerun tuner'],
            ['Channels', 'features/tv/channels', 'live tv channel lineup rename'],
            ['Picture Quality', 'features/tv', 'live tv 720p 1080p resolution'],
            ['Tuner Address', 'features/tv', 'live tv hdhomerun ip host'],
            ['Guide Address', 'features/tv', 'live tv xmltv schedule epg']],
    hk_music: [['Speakers', 'features/music/speakers', 'music rooms hk music speaker order'],
               ['Home Rooms', 'features/music/homes', 'music tablet user room home'],
               ['House Volume', 'features/music', 'music playlist volume'],
               ['Presets', 'features/music/presets', 'music sync group everywhere downstairs'],
               ['Playlists', 'features/music/playlists', 'music pills playlist chooser decades']],
    hk_alarm_pin: [['Alarm PIN', 'features/alarm', 'pin code keypad alarm security passcode'],
                   ['Change PIN', 'features/alarm', 'alarm pin code new passcode'],
                   ['PIN to Arm', 'features/alarm', 'alarm arm require code']],
    hk_clean_areas: [['Clean Areas', 'features/clean', 'vacuum robot clean by area rooms'],
                     ['Vacuums', 'features/clean', 'clean by area robots take part'],
                     ['Rooms', 'features/clean/rooms', 'clean by area picker which areas shown']]
  };
  function search(features) {
    var out = [];
    LIST.forEach(function (x) {
      if (stateOf(features, x[1]) === 'missing') return;
      (SEARCH[x[1]] || []).forEach(function (e) {
        out.push({ label: e[0], route: e[1], where: x[2], words: e[2] });
      });
    });
    return out;
  }

  // ----------------------------------------------------------------- pages
  var K = null;
  function use(kit) { K = kit; }

  // A page whose data is still on its way, or could not be read
  function waiting(c, st, name, domain) {
    if (st && st.error) {
      c.appendChild(K.group({ footer: name + ' didn’t answer: ' + st.error + '. It may be restarting; this page tries again when you come back.' }, [
        K.nav({ label: name, sub: 'In Devices & Services', href: integrationHref(domain), icon: 'mdi:open-in-new' })]));
      return;
    }
    c.appendChild(K.group({}, [K.info({ label: 'Loading…' })]));
  }
  // not added yet: what it does and the way to add it
  function notAdded(c, name, what, domain) {
    c.appendChild(K.group({ footer: what }, [
      K.nav({ label: 'Add ' + name, sub: 'Devices & Services → HK Frontend → Add feature', href: addHref(domain),
              icon: 'mdi:plus-circle-outline', fk: 'feat:add:' + domain })]));
  }
  function openIn(c, name, domain, sub) {
    c.appendChild(K.group({}, [K.nav({ label: name, sub: sub || 'In Devices & Services', href: integrationHref(domain),
                                       icon: 'mdi:open-in-new', fk: 'feat:open:' + domain })]));
  }

  // ---- LIVE TV
  function tvMain(P, c, d) {
    var set = function (ch) { return P.featSet('hk_tv', ch); };
    c.appendChild(K.group({ header: 'Channels', footer: d.lineup_error
        ? d.lineup_error + ' The channels below are what is saved; they can’t be changed until the tuner answers.'
        : 'The channels on every screen’s Live TV page, from the tuner’s own lineup.' }, [
      K.nav({ label: 'Channels', value: tvCount(d), href: '#/features/tv/channels', sk: 'f:hk_tv:channels',
              fk: 'tv:channels' })]));
    c.appendChild(K.group({ header: 'Picture', footer: '720p is plenty on a wall tablet or a phone. 1080p uses about 40% more of Home Assistant’s processor for each channel being watched.' }, [
      K.seg({ label: 'Quality', sk: 'f:hk_tv:quality', value: d.quality, options: [['720', '720p'], ['1080', '1080p']],
              onChange: function (v) { set({ quality: v }); } })]));
    c.appendChild(K.group({ header: 'Tuner and Guide', footer: 'The guide is an XMLTV file (from a service such as Schedules Direct, or a program that builds one). With a guide, each channel shows what’s on now and uses the network’s name.' }, [
      K.text({ label: 'Tuner Address', sk: 'f:hk_tv:host', value: d.host, placeholder: 'IP address or host name',
               error: P.err('f:hk_tv:host'), onCommit: function (v) { set({ host: v }); } }),
      K.text({ label: 'Guide Address', sk: 'f:hk_tv:guide_url', value: d.guide_url, placeholder: 'None',
               error: P.err('f:hk_tv:guide_url'), onCommit: function (v) { set({ guide_url: v }); } })]));
    openIn(c, 'Live TV', 'hk_tv');
  }
  function tvChannels(P, c, d) {
    var L = tvLists(d);
    if (!d.lineup) {
      c.appendChild(K.group({ footer: d.lineup_error || 'The tuner didn’t answer.' },
        L.rows.map(function (r) { return K.info({ label: r.label, sub: r.sub }); })));
      return;
    }
    var err = P.err('f:hk_tv:channels') || P.err('f:hk_tv:names');
    c.appendChild(K.listEditor({ fk: 'tv', reorder: false, minRows: 1, announce: P.announce.bind(P),
      shownHeader: 'Shown', moreHeader: 'More Channels',
      shownFooter: (err ? err + ' ' : '') + 'In the tuner’s order. Tap a channel to rename it.',
      rows: L.rows.map(function (r) { return Object.assign({ href: '#/features/tv/channels/' + encodeURIComponent(r.value) }, r); }),
      more: L.more,
      onChange: function (v) { P.featSet('hk_tv', { channels: v }, ['channels']); } }));
  }
  function tvChannel(P, c, d, num) {
    var ch = ((d && d.channels) || []).filter(function (x) { return x.number === num; })[0];
    if (!ch) { c.appendChild(K.group({ footer: 'That channel isn’t shown any more.' }, [])); return; }
    var l = ((d && d.lineup) || []).filter(function (x) { return x.number === num; })[0] || {};
    var names = {};
    c.appendChild(K.group({ footer: 'The name on the Live TV page and its guide.' }, [
      K.text({ label: 'Name', sk: 'f:hk_tv:names', value: ch.name, maxlength: 40, error: P.err('f:hk_tv:names'),
               onCommit: function (v) { names[num] = v; P.featSet('hk_tv', { names: names }, ['names']); } })]));
    var rows = [K.info({ label: 'Channel', value: num })];
    if (l.station) rows.push(K.info({ label: 'Station', value: l.station }));
    if (l.network) rows.push(K.info({ label: 'Network', value: l.network }));
    c.appendChild(K.group({ header: 'From the Tuner' }, rows));
    var usable = [l.network, l.station].filter(function (x) { return x && x !== ch.name; });
    if (usable.length) {
      c.appendChild(K.group({}, usable.map(function (n) {
        return K.button({ label: 'Use “' + n + '”', fk: 'tv:use:' + n, onClick: function () {
          var o = {}; o[num] = n; P.featSet('hk_tv', { names: o }, ['names']);
        } });
      })));
    }
  }

  // ---- CLEAN BY AREA
  function cleanMain(P, c, d) {
    var names = {};
    (d.areas || []).concat(d.unreached || []).forEach(function (a) { names[a.id] = a.name; });
    var areaName = function (id) { return names[id] || ((P._hass.areas || {})[id] || {}).name || id; };
    var err = P.err('f:hk_clean_areas:vacuums');
    c.appendChild(K.group({ header: 'Vacuums', footer: (err ? err + ' ' : '') +
        'A vacuum that cleans by area gets the chosen rooms on its room map; one that can’t starts when its own room is chosen. ' +
        'Map a vacuum’s rooms in its entity settings in Home Assistant. While every vacuum is checked, a new one joins by itself.' },
      (d.vacuums || []).map(function (v) {
        return K.check({ label: v.name, sub: vacuumSub(v, areaName), multi: true, on: v.taking_part,
                         fk: 'clean:v:' + v.vacuum, onClick: function (on) {
          var next = vacuumsAfter(d, v.vacuum, on);
          if (next === null) { P.announce('At least one vacuum takes part.'); return; }
          P.featSet('hk_clean_areas', { vacuums: next });
        } });
      })));
    if (!(d.vacuums || []).length) c.appendChild(K.group({ footer: 'This house has no vacuums yet.' }, []));
    c.appendChild(K.group({ header: 'Rooms', footer: 'The rooms the Clean Areas picker shows on every screen.' }, [
      K.nav({ label: 'Rooms', value: roomCount(d), href: '#/features/clean/rooms', sk: 'f:hk_clean_areas:areas', fk: 'clean:rooms' })]));
    var st = P.feat('hk_clean_areas');
    var rows = [K.button({ label: 'Show What Would Be Cleaned', fk: 'clean:test', disabled: !(d.offered || []).length,
      onClick: function () {
        st.test = { busy: true }; P.render();
        P._hass.callWS({ type: 'call_service', domain: 'hk_frontend', service: 'clean_areas',
                         service_data: { areas: d.offered, dry_run: true }, return_response: true })
          .then(function (r) { st.test = { res: (r && r.response) || {} }; P.render(); },
                function (e) { st.test = { error: String((e && e.message) || e) }; P.render(); });
      } })];
    var t = st.test;
    if (t && t.busy) rows.push(K.info({ label: 'Asking…' }));
    if (t && t.error) rows.push(K.info({ label: t.error }));
    if (t && t.res) {
      var vn = {};
      (d.vacuums || []).forEach(function (v) { vn[v.vacuum] = v.name; });
      // the rooms under the name: a long list as the value squeezed the name
      (t.res.plan || []).forEach(function (step) {
        rows.push(K.info({ label: vn[step.vacuum] || step.vacuum,
                           sub: (step.action === 'start' ? 'Starts: ' : '') + step.areas.map(areaName).join(', ') }));
      });
      if ((t.res.unreachable || []).length) {
        rows.push(K.info({ label: 'No vacuum reaches', sub: t.res.unreachable.map(areaName).join(', ') }));
      }
      if (!(t.res.plan || []).length && t.res.message) rows.push(K.info({ label: t.res.message }));
    }
    c.appendChild(K.group({ header: 'Check', footer: 'Every room the picker shows, as a dry run: which vacuum would clean what. Nothing moves.' }, rows));
    openIn(c, 'Clean Areas', 'hk_clean_areas');
  }
  function cleanRooms(P, c, d) {
    var L = roomLists(d);
    var err = P.err('f:hk_clean_areas:areas');
    c.appendChild(K.listEditor({ fk: 'rooms', auto: L.auto, reorder: false, minRows: 1, announce: P.announce.bind(P),
      autoFooter: 'Automatic: every room a vacuum that takes part can reach. Off: only the rooms you choose.',
      shownFooter: (err ? err + ' ' : '') + 'By floor and name on the screens. Under each: the vacuums that reach it.',
      moreHeader: 'Other Rooms a Vacuum Reaches',
      emptyText: 'No room is reached by a vacuum yet. Map each vacuum’s rooms in its entity settings in Home Assistant.',
      rows: L.rows, more: L.more,
      onAuto: function (on) { P.featSet('hk_clean_areas', { areas: on ? [] : (d.offered || []).slice() }); },
      onChange: function (v) { P.featSet('hk_clean_areas', { areas: v }); } }));
    if ((d.unreached || []).length) {
      c.appendChild(K.group({ header: 'No Vacuum Reaches', footer: 'Add a room to a vacuum’s room map (its entity settings in Home Assistant) to offer it here.' },
        d.unreached.map(function (a) { return K.info({ label: a.name, sub: a.floor || null }); })));
    }
  }

  // ---- ALARM PIN
  // A PIN typed on this page lives only in these two fields until it is
  // saved (then forgotten); nothing ever reads one back.
  function pinForm(st, key) { return ((st.forms = st.forms || {})[key] = st.forms[key] || { pin: '', again: '' }); }
  function alarmMain(P, c, d) {
    var st = P.feat('hk_alarm_pin');
    st.forms = {};
    var house = ((P.data.settings || {}).security || {}).alarm || null;
    (d.alarms || []).forEach(function (a) {
      var uses = house && house === a.panel;
      var rows = [
        K.nav({ label: 'Change PIN', value: a.pin_set ? 'Set' : 'Not Set', href: '#/features/alarm/' + a.entry_id + '/pin',
                fk: 'alarm:pin:' + a.entry_id }),
        K.toggle({ label: 'PIN to Arm', sub: 'Off: arming needs no PIN. Disarming always does.', on: a.arm_required,
                   sk: 'f:hk_alarm_pin:arm_required', fk: 'alarm:arm:' + a.entry_id, onChange: function (on) {
          P.featCall('hk_alarm_pin', { type: 'hk_alarm_pin/settings/set', entry_id: a.entry_id, changes: { arm_required: on } }, ['arm_required']);
        } }),
        K.nav({ label: 'Protects', value: a.alarm_name || a.alarm, href: '#/features/alarm/' + a.entry_id + '/alarm',
                fk: 'alarm:alarm:' + a.entry_id }),
        // its name and entity id under the label: beside it, a phone squeezed them over each other
        K.info({ label: 'Keypad Panel', sub: a.panel ? (a.panel_name && a.panel_name !== a.panel ? a.panel_name + ' · ' : '') + a.panel : 'Starting…' })];
      if (a.panel && !uses) {
        rows.push(K.button({ label: 'Use on All Screens', fk: 'alarm:use:' + a.entry_id, onClick: function () {
          P.setH({ 'security.alarm': a.panel });
        } }));
      }
      c.appendChild(K.group({ header: a.alarm_name || a.title, footer: uses
          ? 'The screens’ alarm keypad and Security page use this PIN panel.'
          : 'Point keypads and screens at the PIN panel: it asks for the PIN, then arms or disarms the alarm. ' +
            (house ? 'The screens use ' + (P.name ? P.name(house) : house) + ' now.' : 'The screens have no alarm chosen yet.') }, rows));
      c.appendChild(K.group({}, [K.button({ label: 'Remove PIN', destructive: true, fk: 'alarm:rm:' + a.entry_id, onClick: function () {
        K.confirm(P.shadowRoot, { title: 'Remove the PIN from ' + (a.alarm_name || a.title) + '?', destructive: true, ok: 'Remove',
          message: 'Its PIN panel goes too. The alarm itself stays, and arms and disarms for anyone who can reach it, as before.' })
          .then(function (yes) {
            if (yes) P.featCall('hk_alarm_pin', { type: 'hk_alarm_pin/remove', entry_id: a.entry_id }, ['entry_id']);
          });
      } })]));
    });
    if (!(d.alarms || []).length) c.appendChild(K.group({ footer: 'No alarm has a PIN yet.' }, []));
    var free = (d.choices || []).filter(function (x) { return !x.entry; });
    c.appendChild(K.group({ footer: free.length ? 'For an alarm that arms and disarms for anyone who can reach it.'
                                                : 'Every alarm panel in this house has a PIN.' },
      free.length ? [K.nav({ label: 'Add a PIN to an Alarm', href: '#/features/alarm/add', icon: 'mdi:plus-circle-outline', fk: 'alarm:add' })] : []));
    openIn(c, 'Alarm PIN', 'hk_alarm_pin');
  }
  function pinFields(P, c, form, footer) {
    c.appendChild(K.group({ footer: footer }, [
      K.text({ label: 'New PIN', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', sk: 'f:hk_alarm_pin:pin', value: form.pin,
               error: P.err('f:hk_alarm_pin:pin'), placeholder: 'Required', onCommit: function (v) { form.pin = v; } }),
      K.text({ label: 'Type It Again', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', sk: 'f:hk_alarm_pin:pin_again', value: form.again,
               error: P.err('f:hk_alarm_pin:pin_again'), placeholder: 'Required', onCommit: function (v) { form.again = v; } })]));
  }
  var PIN_NOTE = function (d) {
    return 'At least ' + (d.min_length || 4) + ' characters. Only a salted hash is kept, so nothing can show the PIN again: type it the same way twice.';
  };
  function alarmPin(P, c, d, id) {
    var a = (d.alarms || []).filter(function (x) { return x.entry_id === id; })[0];
    if (!a) { c.appendChild(K.group({ footer: 'That alarm has no PIN any more.' }, [])); return; }
    var st = P.feat('hk_alarm_pin'), form = pinForm(st, id);
    pinFields(P, c, form, PIN_NOTE(d));
    c.appendChild(K.group({}, [K.button({ label: 'Change PIN', fk: 'alarm:save:' + id, onClick: function () {
      P.featCall('hk_alarm_pin', { type: 'hk_alarm_pin/settings/set', entry_id: id,
                                   changes: { pin: form.pin, pin_again: form.again } }, ['pin', 'pin_again'])
        .then(function (done) {
          if (!done) return;
          delete st.forms[id];
          P.announce('PIN changed');
          P.back('#/features/alarm');
        });
    } })]));
  }
  function alarmPick(P, c, d, id) {
    var a = (d.alarms || []).filter(function (x) { return x.entry_id === id; })[0];
    if (!a) { c.appendChild(K.group({ footer: 'That alarm has no PIN any more.' }, [])); return; }
    c.appendChild(K.group({ footer: (P.err('f:hk_alarm_pin:alarm') ? P.err('f:hk_alarm_pin:alarm') + ' ' : '') +
        'The alarm this PIN protects. The PIN and the arm rule stay the same.' },
      (d.choices || []).map(function (x) {
        if (x.entry && x.entry !== id) return K.info({ label: x.name, sub: 'Has its own PIN' });
        return K.check({ label: x.name, sub: x.entity_id, on: x.entity_id === a.alarm, fk: 'alarm:pick:' + x.entity_id, onClick: function () {
          if (x.entity_id === a.alarm) return;
          P.featCall('hk_alarm_pin', { type: 'hk_alarm_pin/settings/set', entry_id: id, changes: { alarm: x.entity_id } }, ['alarm'])
            .then(function (done) { if (done) P.back('#/features/alarm'); });
        } });
      })));
  }
  function alarmAdd(P, c, d) {
    var st = P.feat('hk_alarm_pin'), form = pinForm(st, 'add');
    var free = (d.choices || []).filter(function (x) { return !x.entry; });
    if (form.alarm === undefined) form.alarm = free.length === 1 ? free[0].entity_id : '';
    if (form.arm === undefined) form.arm = true;
    c.appendChild(K.group({ footer: P.err('f:hk_alarm_pin:alarm') || 'The alarm to protect. Its PIN panel then stands in front of it.' }, [
      K.select({ label: 'Alarm', sk: 'f:hk_alarm_pin:alarm', value: form.alarm, placeholder: 'Choose',
                 options: free.map(function (x) { return [x.entity_id, x.name]; }),
                 onChange: function (v) { form.alarm = v; P.render(); } })]));
    pinFields(P, c, form, PIN_NOTE(d));
    c.appendChild(K.group({}, [K.toggle({ label: 'PIN to Arm', sub: 'Off: arming needs no PIN. Disarming always does.', on: form.arm,
                                          fk: 'alarm:add:arm', onChange: function (on) { form.arm = on; P.render(); } })]));
    c.appendChild(K.group({}, [K.button({ label: 'Add PIN', fk: 'alarm:add:go', disabled: !form.alarm, onClick: function () {
      P.featCall('hk_alarm_pin', { type: 'hk_alarm_pin/add', alarm: form.alarm, pin: form.pin, pin_again: form.again,
                                   arm_required: form.arm }, ['alarm', 'pin', 'pin_again'])
        .then(function (done) {
          if (!done) return;
          delete st.forms.add;
          P.announce('PIN added');
          P.back('#/features/alarm');
        });
    } })]));
  }

  // ---- MUSIC (the Music feature's own; Browse Music is the page's, drawn by it)
  function musicTop(P, c) {
    var feats = P.data.features || {}, state = stateOf(feats, 'hk_music');
    if (state === 'missing') return;
    if (state === 'not_added') { notAdded(c, (feats.hk_music || {}).name || 'Music', WHAT.hk_music, 'hk_music'); return; }
    var st = P.feat('hk_music');
    if (!st.data) { waiting(c, st, 'Music', 'hk_music'); return; }
    var d = st.data;
    if (d.configured === false) { notAdded(c, 'Music', WHAT.hk_music, 'hk_music'); return; }
    var homes = Object.keys(d.homes || {}).filter(function (u) { return (d.users || []).some(function (x) { return x.id === u; }); }).length;
    c.appendChild(K.group({ header: 'Speakers', footer: 'The rooms music plays in. A wall tablet’s signed-in user starts in its own home room.' }, [
      K.nav({ label: 'Speakers', value: String((d.speakers || []).length), href: '#/features/music/speakers', fk: 'music:speakers' }),
      K.nav({ label: 'Home Rooms', value: homes ? homes + ' of ' + (d.users || []).length : 'None', href: '#/features/music/homes', fk: 'music:homes' }),
      K.slider({ label: 'House Volume', sub: 'Where a playlist starts, in every room it plays in.', sk: 'f:hk_music:volume',
                 value: Math.round((d.volume || 0) * 100), min: 0, max: 100, step: 5, unit: '%', fk: 'music:volume',
                 onChange: function (v) { P.featSet('hk_music', { volume: v / 100 }); } })]));
    c.appendChild(K.group({ header: 'Presets and Playlists' }, [
      K.nav({ label: 'Presets', value: String((d.presets || []).length), href: '#/features/music/presets', fk: 'music:presets' }),
      K.nav({ label: 'Playlists', value: String((d.playlists || []).length), href: '#/features/music/playlists', fk: 'music:playlists' })]));
  }
  function musicSpeakers(P, c, d) {
    var L = speakerLists(d), err = P.err('f:hk_music:speakers');
    c.appendChild(K.listEditor({ fk: 'spk', minRows: 1, announce: P.announce.bind(P), moreHeader: 'Other Music Assistant Players',
      shownFooter: (err ? err + ' ' : '') + 'Each is named by its area and grouped by its floor on the screens; within a floor, in this order.',
      emptyText: 'Music Assistant has no other players.',
      rows: L.rows, more: L.more, onChange: function (v) { P.featSet('hk_music', { speakers: v }); } }));
  }
  function musicHomes(P, c, d) {
    var opts = [['', 'No Home Room']].concat((d.speakers || []).map(function (x) { return [x.entity, x.name]; }));
    c.appendChild(K.group({ footer: (P.err('f:hk_music:homes') ? P.err('f:hk_music:homes') + ' ' : '') +
        'The room a person starts in when they play music. A wall tablet signs in as its own user, so this is where each tablet hangs.' },
      (d.users || []).map(function (u) {
        return K.select({ label: u.name, sk: 'music:home:' + u.id, value: (d.homes || {})[u.id] || '', options: opts,
                          onChange: function (v) { var h = {}; h[u.id] = v || null; P.featSet('hk_music', { homes: h }, ['homes']); } });
      })));
  }
  function musicPresets(P, c, d) {
    c.appendChild(K.group({ footer: 'A Music Assistant sync group and the rooms it plays in. Choosing exactly those rooms on a screen plays through the group, in step.' },
      (d.presets || []).map(function (p) {
        return K.nav({ label: p.name, sub: (p.members || []).map(function (m) { return speakerName(d, m); }).join(', '),
                       href: '#/features/music/presets/' + encodeURIComponent(p.id), fk: 'music:preset:' + p.id });
      }).concat([K.nav({ label: 'Add Preset', href: '#/features/music/presets/new', icon: 'mdi:plus-circle-outline', fk: 'music:preset:new' })])));
  }
  function form(st, key, init) { return ((st.forms = st.forms || {})[key] = st.forms[key] || init()); }
  function musicPreset(P, c, d, id) {
    var st = P.feat('hk_music');
    var p = (d.presets || []).filter(function (x) { return x.id === id; })[0];
    if (id !== 'new' && !p) { c.appendChild(K.group({ footer: 'That preset is gone.' }, [])); return; }
    var f = form(st, 'preset:' + id, function () {
      return p ? { name: p.name, group: p.group, members: p.members.slice() } : { name: '', group: '', members: [] };
    });
    var rooms = (d.speakers || []).map(function (x) { return x.entity; });
    var groups = (d.players || []).filter(function (x) { return rooms.indexOf(x.entity) < 0; });
    c.appendChild(K.group({}, [
      K.text({ label: 'Name', sk: 'f:hk_music:name', value: f.name, placeholder: 'Everywhere', maxlength: 60,
               error: P.err('f:hk_music:name'), onCommit: function (v) { f.name = v; } }),
      K.select({ label: 'Sync Group', sk: 'f:hk_music:group', value: f.group, placeholder: 'Choose',
                 options: groups.map(function (x) { return [x.entity, x.name]; }), onChange: function (v) { f.group = v; P.render(); } })]));
    if (P.err('f:hk_music:group')) c.appendChild(K.group({ footer: P.err('f:hk_music:group') }, []));
    c.appendChild(K.group({ header: 'Rooms', footer: (P.err('f:hk_music:members') ? P.err('f:hk_music:members') + ' ' : '') +
        'The rooms the sync group plays in. Home Assistant can’t read them from Music Assistant, so they’re chosen here.' },
      (d.speakers || []).map(function (x) {
        var on = f.members.indexOf(x.entity) >= 0;
        return K.check({ label: x.name, sub: x.floor || null, multi: true, on: on, fk: 'music:member:' + x.entity, onClick: function () {
          f.members = on ? f.members.filter(function (m) { return m !== x.entity; }) : f.members.concat(x.entity);
          P.render();
        } });
      })));
    var save = K.button({ label: p ? 'Save Preset' : 'Add Preset', fk: 'music:preset:save', onClick: function () {
      P.featCall('hk_music', Object.assign({ type: 'hk_music/preset/save', name: f.name, group: f.group, members: f.members },
                                           p ? { item: p.id } : {}), ['name', 'group', 'members'])
        .then(function (ok) { if (ok) { delete st.forms['preset:' + id]; P.back('#/features/music/presets'); } });
    } });
    c.appendChild(K.group({}, [save]));
    if (p) removeButton(P, c, p.id, p.name, 'preset', '#/features/music/presets');
  }
  function removeButton(P, c, id, name, what, back) {
    c.appendChild(K.group({}, [K.button({ label: 'Delete ' + (what === 'preset' ? 'Preset' : 'Playlist'), destructive: true,
      fk: 'music:rm:' + id, onClick: function () {
        K.confirm(P.shadowRoot, { title: 'Delete “' + name + '”?', destructive: true, ok: 'Delete',
          message: what === 'preset' ? 'The sync group itself stays in Music Assistant.' : 'The playlists stay in your Music Assistant library.' })
          .then(function (yes) {
            if (!yes) return;
            P.featCall('hk_music', { type: 'hk_music/item/remove', item: id }, ['item'])
              .then(function (ok) { if (ok) P.back(back); });
          });
      } })]));
  }
  function playlistSub(p) {
    var n = (p.items || []).length;
    return [p.chooser ? 'In ' + p.chooser : null, plural(n, 'playlist', 'playlists')].filter(Boolean).join(' · ');
  }
  function musicPlaylists(P, c, d) {
    var st = P.feat('hk_music');
    c.appendChild(K.listEditor({ fk: 'pls', minRows: 1, announce: P.announce.bind(P),
      shownFooter: 'The pills on Play Music, in this order. Pills with the same chooser become one pill that asks which (like Decades).',
      rows: (d.playlists || []).map(function (p) {
        return { value: p.id, label: p.name, sub: playlistSub(p), icon: p.icon, removable: true,
                 href: '#/features/music/playlists/' + encodeURIComponent(p.id) };
      }),
      more: [],
      onRemove: function (id) {
        var p = (d.playlists || []).filter(function (x) { return x.id === id; })[0];
        K.confirm(P.shadowRoot, { title: 'Delete “' + (p ? p.name : id) + '”?', destructive: true, ok: 'Delete',
                                  message: 'The playlists stay in your Music Assistant library.' })
          .then(function (yes) { if (yes) P.featCall('hk_music', { type: 'hk_music/item/remove', item: id }, ['item']); });
      },
      onChange: function (ids) { P.featCall('hk_music', { type: 'hk_music/playlists/order', ids: ids }, ['ids']); } }));
    c.appendChild(K.group({}, [K.nav({ label: 'Add Playlist', href: '#/features/music/playlists/new', icon: 'mdi:plus-circle-outline',
                                       fk: 'music:playlist:new' })]));
    void st;
  }
  function libraryOf(P) {
    var st = P.feat('hk_music');
    if (!st.library && !st.libLoading) {
      st.libLoading = true;
      P._hass.callWS({ type: 'hk_music/settings/library' }).then(function (r) {
        st.library = (r && r.items) || []; st.libLoading = false; P.render(true);
      }, function () { st.library = []; st.libLoading = false; P.render(true); });
    }
    return st.library || null;
  }
  function musicPlaylist(P, c, d, id) {
    var st = P.feat('hk_music');
    var p = (d.playlists || []).filter(function (x) { return x.id === id; })[0];
    if (id !== 'new' && !p) { c.appendChild(K.group({ footer: 'That playlist is gone.' }, [])); return; }
    var f = form(st, 'playlist:' + id, function () {
      return p ? { name: p.name, icon: p.icon, items: p.items.slice(), chooser: p.chooser || '' } : { name: '', icon: '', items: [], chooser: '' };
    });
    var lib = libraryOf(P) || [], names = {};
    lib.forEach(function (i) { names[i.uri] = i.name; });
    c.appendChild(K.group({}, [
      K.text({ label: 'Name', sk: 'f:hk_music:name', value: f.name, placeholder: 'Road Trip', maxlength: 60,
               error: P.err('f:hk_music:name'), onCommit: function (v) { f.name = v; } }),
      K.text({ label: 'Icon', sk: 'f:hk_music:icon', value: f.icon, placeholder: 'mdi:playlist-music', maxlength: 60,
               onCommit: function (v) { f.icon = v; } }),
      K.text({ label: 'Chooser', sub: 'Optional', sk: 'f:hk_music:chooser', value: f.chooser, placeholder: 'None', maxlength: 60,
               error: P.err('f:hk_music:chooser'), onCommit: function (v) { f.chooser = v; } })]));
    c.appendChild(K.group({ header: 'Plays', footer: (P.err('f:hk_music:items') ? P.err('f:hk_music:items') + ' ' : '') +
        'Library playlists, played as one queue.' },
      f.items.map(function (u) { return K.info({ label: names[u] || u, sub: names[u] ? null : 'Not in the library' }); })
        .concat([K.nav({ label: f.items.length ? 'Choose Playlists' : 'Choose a Playlist', value: String(f.items.length),
                         href: '#/features/music/playlists/' + encodeURIComponent(id) + '/items', fk: 'music:items' })])));
    c.appendChild(K.group({}, [K.button({ label: p ? 'Save Playlist' : 'Add Playlist', fk: 'music:playlist:save', onClick: function () {
      P.featCall('hk_music', Object.assign({ type: 'hk_music/playlist/save', name: f.name, icon: f.icon || null, items: f.items,
                                             chooser: f.chooser || null }, p ? { item: p.id } : {}), ['name', 'items', 'chooser'])
        .then(function (ok) { if (ok) { delete st.forms['playlist:' + id]; P.back('#/features/music/playlists'); } });
    } })]));
    if (p) removeButton(P, c, p.id, p.name, 'playlist', '#/features/music/playlists');
  }
  function musicItems(P, c, d, id) {
    var st = P.feat('hk_music');
    var f = (st.forms || {})['playlist:' + id];
    if (!f) { P.go('#/features/music/playlists/' + encodeURIComponent(id)); return; }
    var lib = libraryOf(P);
    if (!lib) { c.appendChild(K.group({}, [K.info({ label: 'Reading the library…' })])); return; }
    var q = String(st.libQ || '').trim().toLowerCase();
    var inp = K.text({ label: 'Search', sk: 'music:libq', value: st.libQ || '', placeholder: 'Playlist name',
                       onCommit: function (v) { st.libQ = v; P.render(); } });
    c.appendChild(K.group({}, [inp]));
    var pick = function (u, on) {
      f.items = on ? f.items.filter(function (x) { return x !== u; }) : f.items.concat(u);
      P.render();
    };
    // two library playlists with one name (Music Assistant keeps duplicates):
    // each says which it is
    var seen = {};
    lib.forEach(function (i) { seen[i.name] = (seen[i.name] || 0) + 1; });
    var subOf = function (i) { return seen[i.name] > 1 ? i.uri : null; };
    var chosen = f.items.map(function (u) {
      var i = lib.filter(function (x) { return x.uri === u; })[0];
      return K.check({ label: i ? i.name : u, sub: i ? subOf(i) : 'Not in the library', multi: true, on: true, fk: 'music:item:' + u,
                       onClick: function () { pick(u, true); } });
    });
    if (chosen.length) c.appendChild(K.group({ header: 'Chosen', footer: 'Played in this order, as one queue.' }, chosen));
    var rest = lib.filter(function (i) { return f.items.indexOf(i.uri) < 0 && (!q || i.name.toLowerCase().indexOf(q) >= 0); });
    c.appendChild(K.group({ header: 'Library', footer: lib.length ? (rest.length > 200 ? 'The first 200; search for the rest.' : null)
                                                     : 'The Music Assistant library has no playlists, or couldn’t be read.' },
      rest.slice(0, 200).map(function (i) {
        return K.check({ label: i.name, sub: subOf(i), multi: true, on: false, fk: 'music:item:' + i.uri, onClick: function () { pick(i.uri, false); } });
      })));
  }

  // The page for a Features route, or null (the page falls back)
  //   P: the settings page; parts: the route after 'features/'
  function page(P, parts) {
    var t = byRoute(parts[0]);
    if (!t) return null;
    if (t[0] === 'music' && ['speakers', 'homes', 'presets', 'playlists'].indexOf(parts[1]) < 0) return null;
    var route = t[0], domain = t[1], name = t[2], sub = parts.slice(1);
    var base = '#/features/' + route;
    var feats = P.data.features || {};
    var state = stateOf(feats, domain);
    var mk = function (title, body, back) { return { title: title, back: back || [name, base], body: body }; };
    var withData = function (fn) {
      return function (c) {
        var st = P.feat(domain);
        if (!st.data) { waiting(c, st, (feats[domain] || {}).name || name, domain); return; }
        if (st.data.configured === false) { notAdded(c, (feats[domain] || {}).name || name, WHAT[domain], domain); return; }
        fn(c, st.data);
      };
    };
    if (state !== 'added') {
      return { title: name, top: true, scope: SCOPE[domain], body: function (c) {
        notAdded(c, (feats[domain] || {}).name || name, WHAT[domain], domain);
      } };
    }
    if (route === 'tv') {
      if (sub[0] === 'channels' && sub[1]) {
        var num = decodeURIComponent(sub[1]);
        var ch = ((P.feat(domain).data || {}).channels || []).filter(function (x) { return x.number === num; })[0];
        return mk(ch ? ch.name : num, withData(function (c, d) { tvChannel(P, c, d, num); }), ['Channels', base + '/channels']);
      }
      if (sub[0] === 'channels') return mk('Channels', withData(function (c, d) { tvChannels(P, c, d); }));
      return { title: name, top: true, scope: SCOPE[domain], body: withData(function (c, d) { tvMain(P, c, d); }) };
    }
    if (route === 'music') {
      var back = ['Music', base];
      if (sub[0] === 'speakers') return mk('Speakers', withData(function (c, d) { musicSpeakers(P, c, d); }), back);
      if (sub[0] === 'homes') return mk('Home Rooms', withData(function (c, d) { musicHomes(P, c, d); }), back);
      if (sub[0] === 'presets' && sub[1]) {
        var pid = decodeURIComponent(sub[1]);
        var pp = ((P.feat(domain).data || {}).presets || []).filter(function (x) { return x.id === pid; })[0];
        return mk(pid === 'new' ? 'Add Preset' : (pp ? pp.name : 'Preset'), withData(function (c, d) { musicPreset(P, c, d, pid); }),
                  ['Presets', base + '/presets']);
      }
      if (sub[0] === 'presets') return mk('Presets', withData(function (c, d) { musicPresets(P, c, d); }), back);
      if (sub[0] === 'playlists' && sub[1] && sub[2] === 'items') {
        var iid = decodeURIComponent(sub[1]);
        return mk('Playlists', withData(function (c, d) { musicItems(P, c, d, iid); }), ['Playlist', base + '/playlists/' + sub[1]]);
      }
      if (sub[0] === 'playlists' && sub[1]) {
        var lid = decodeURIComponent(sub[1]);
        var lp = ((P.feat(domain).data || {}).playlists || []).filter(function (x) { return x.id === lid; })[0];
        return mk(lid === 'new' ? 'Add Playlist' : (lp ? lp.name : 'Playlist'), withData(function (c, d) { musicPlaylist(P, c, d, lid); }),
                  ['Playlists', base + '/playlists']);
      }
      if (sub[0] === 'playlists') return mk('Playlists', withData(function (c, d) { musicPlaylists(P, c, d); }), back);
    }
    if (route === 'alarm') {
      if (sub[0] === 'add') return mk('Add a PIN', withData(function (c, d) { alarmAdd(P, c, d); }));
      if (sub[0] && sub[1] === 'pin') return mk('Change PIN', withData(function (c, d) { alarmPin(P, c, d, sub[0]); }));
      if (sub[0] && sub[1] === 'alarm') return mk('Protects', withData(function (c, d) { alarmPick(P, c, d, sub[0]); }));
      return { title: name, top: true, scope: SCOPE[domain], body: withData(function (c, d) { alarmMain(P, c, d); }) };
    }
    if (route === 'clean') {
      if (sub[0] === 'rooms') return mk('Rooms', withData(function (c, d) { cleanRooms(P, c, d); }));
      return { title: name, top: true, scope: SCOPE[domain], body: withData(function (c, d) { cleanMain(P, c, d); }) };
    }
    return null;
  }
  var SCOPE = {
    hk_tv: 'An HDHomeRun tuner’s channels, live on every screen.',
    hk_alarm_pin: 'A PIN in front of the alarm, asked for on every screen.',
    hk_clean_areas: 'Clean chosen rooms with whichever vacuum reaches them.',
    hk_music: 'Whole-home music through Music Assistant.'
  };
  var WHAT = {
    hk_tv: 'Live TV isn’t added yet. It plays an HDHomeRun tuner’s channels on your screens, with a guide.',
    hk_alarm_pin: 'Alarm PIN isn’t added yet. It puts a PIN in front of an alarm panel.',
    hk_clean_areas: 'Clean Areas isn’t added yet. It sends each vacuum the chosen rooms on its own map.',
    hk_music: 'Music isn’t added yet. It plays music in chosen rooms through Music Assistant.'
  };

  root.hkSettingsFeatures = {
    LIST: LIST, listed: listed, stateOf: stateOf, page: page, use: use, addHref: addHref, search: search, musicTop: musicTop,
    integrationHref: integrationHref, SCOPE: SCOPE, WHAT: WHAT,
    _: { tvLists: tvLists, tvCount: tvCount, speakerLists: speakerLists, speakerName: speakerName, playlistSub: playlistSub, vacuumSub: vacuumSub, vacuumsAfter: vacuumsAfter,
         roomLists: roomLists, roomCount: roomCount }
  };
})();
