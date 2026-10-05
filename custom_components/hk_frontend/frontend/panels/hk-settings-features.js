// hk-settings-features.js -- THE FEATURES' OWN SETTINGS on the HK Settings
// page.
//
// Each page belongs to one of HK Frontend's optional features -- Music, Live
// TV, Alarm PIN, Clean Areas -- each an ITEM of the integration's one entry,
// added from Settings -> Devices & services -> HK Frontend -> Add feature
// (features/__init__.py). A page reads and saves through that feature's own
// commands (`<id>/settings/get` and `/set`, e.g. hk_tv/settings/get), which
// check each change the way the feature's gear does and store it where the
// gear stores it -- in the feature's item. panel/get `features` lists each
// feature with its items; not yet added, its page offers Add.
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
    ['clean', 'hk_clean_areas', 'Clean Areas', 'mdi:robot-vacuum', '#30b0c7'],
    ['energy', 'hk_energy', 'Energy', 'mdi:lightning-bolt', '#34c759']
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
  var INTEGRATION = '/config/integrations/integration/hk_frontend';
  function addHref() { return INTEGRATION; }
  function integrationHref() { return INTEGRATION; }

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
                     ['Rooms', 'features/clean/rooms', 'clean by area picker which areas shown']],
    hk_energy: [['Energy', 'features/energy', 'energy power electricity kwh watts page cost'],
                ['Energy Sections', 'features/energy/sections', 'energy rooms appliances outlets circuits groups'],
                ['Energy Devices', 'features/energy/devices', 'energy circuit plug power sensor name glyph'],
                ['Energy Readings', 'features/energy/top', 'energy cost thermostat outside top row'],
                ['Energy Daily Bars', 'features/energy/usages', 'energy usage fortnight chart history'],
                ['Energy Batteries', 'features/energy/batteries', 'energy car battery range house battery charging']]
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

  // ---------------------------------------------------------------- energy
  // ENERGY (features/energy): the Energy page a screen shows, built from
  // Home Assistant's Energy settings. Its page here sorts the devices into
  // sections, names them and picks the rows; each change goes through
  // hk_energy/settings/set (or /device/set for one device), whose answer is
  // the page again. `d`: options (as stored), plan (what the screens draw),
  // devices (every one, hidden too), batteries, sections (as resolved).
  var EN = 'hk_energy';
  var EN_COLORS = [['', 'Automatic'], ['white', 'White'], ['yellow', 'Yellow'], ['orange', 'Orange'], ['red', 'Red'],
                   ['pink', 'Pink'], ['purple', 'Purple'], ['blue', 'Blue'], ['teal', 'Teal'], ['mint', 'Mint'],
                   ['green', 'Green'], ['cyan', 'Cyan']];
  // how a device's power sensor was found, in the page's words
  function energyFound(dev) {
    return { own: 'Chosen here', energy: 'From Home Assistant’s Energy settings',
             source: 'Found through its meter’s source', device: 'Found on its meter’s device' }[dev.found] ||
           'None found: its tile shows today’s kWh';
  }
  // the sections as resolved, with one device moved to another (or out of
  // every section: back to where its guess puts it) -- what is saved once a
  // device is placed by hand
  function sectionsAfter(d, key, to) {
    var out = (d.sections || []).map(function (s) {
      return { id: s.id, name: s.name, items: s.items.filter(function (k) { return k !== key; }),
               link: s.link || undefined };
    });
    if (to) {
      var s = out.filter(function (x) { return x.id === to; })[0];
      if (!s) {
        var kinds = {};
        (d.section_kinds || []).forEach(function (k) { kinds[k[0]] = k[1]; });
        s = { id: to, name: kinds[to] || to, items: [] };
        out.push(s);
      }
      s.items.push(key);
    }
    return out.map(function (x) { var y = { id: x.id, name: x.name, items: x.items }; if (x.link) y.link = x.link; return y; });
  }
  function energySet(P, changes) { return P.featSet(EN, changes); }
  // an entity's name; one with none of its own (Home Assistant's own cost
  // sensor) by its id, not a made-up one
  function enName(P, id) {
    var st = P._hass && P._hass.states[id];
    return st && st.attributes && st.attributes.friendly_name ? P.name(id) : id;
  }
  function energyDev(P, key, changes) {
    return P.featCall(EN, { type: 'hk_energy/device/set', key: key, changes: changes }, Object.keys(changes));
  }
  function devByKey(d, key) { return (d.devices || []).filter(function (x) { return x.key === key; })[0] || null; }
  function sectionOf(d, key) {
    return (d.sections || []).filter(function (s) { return s.items.indexOf(key) >= 0; })[0] || null;
  }
  function plural2(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function energyMain(P, c, d) {
    var o = d.options || {}, pl = d.plan || {}, T = pl.total || {}, en = d.energy || {};
    var ha = en.grid || en.devices
      ? [en.grid ? 'the grid meter' : null, en.devices ? plural2(en.devices, 'device', 'devices') : null].filter(Boolean).join(' and ')
      : null;
    c.appendChild(K.group({ header: 'Home Assistant’s Energy Settings',
        footer: ha ? 'The page starts from ' + ha + ' in Home Assistant’s Energy settings: their meters, which device is inside which, and their power sensors.'
                   : 'Home Assistant’s Energy settings list nothing yet. Add the grid and your devices there, or add devices here.' }, [
      K.toggle({ label: 'List Their Devices', sub: 'Every device there gets a tile, new ones too', on: o.follow !== false,
                 sk: 'f:' + EN + ':follow', onChange: function (on) { energySet(P, { follow: on }); } }),
      K.nav({ label: 'Energy Settings', sub: 'In Home Assistant', href: en.url || '/config/energy', icon: 'mdi:open-in-new',
              fk: 'energy:ha' })]));
    c.appendChild(K.group({ header: 'The Page' }, [
      K.text({ label: 'Title', sk: 'f:' + EN + ':title', value: o.title || '', placeholder: 'Energy', maxlength: 40,
               error: P.err('f:' + EN + ':title'), onCommit: function (v) { energySet(P, { title: v.trim() || null }); } }),
      K.nav({ label: 'Readings', sub: 'Today’s cost, thermostats, outside', value: String((pl.top || []).length),
              href: '#/features/energy/top', fk: 'energy:top' }),
      K.nav({ label: 'Daily Bars', sub: 'A fortnight of each day’s use', value: String((pl.usages || []).length),
              href: '#/features/energy/usages', fk: 'energy:usages' }),
      K.nav({ label: 'Sections', value: String((pl.sections || []).length), href: '#/features/energy/sections', fk: 'energy:sections' }),
      K.nav({ label: 'Devices', value: String((d.devices || []).length), href: '#/features/energy/devices', fk: 'energy:devices' }),
      K.nav({ label: 'Batteries', value: String((d.batteries || []).length), href: '#/features/energy/batteries', fk: 'energy:batteries' }),
      K.toggle({ label: 'Home Assistant’s Charts', sub: 'The day’s sources and each device, at the end', on: o.detail !== false,
                 sk: 'f:' + EN + ':detail', onChange: function (on) { energySet(P, { detail: on }); } })]));
    var tot = o.total || {};
    c.appendChild(K.group({ header: 'Whole Home', footer: 'Automatic: the grid meter in Home Assistant’s Energy settings, its cost, and the power sensor behind it (or General → Power Use).' }, [
      P.entityRow({ label: 'Power', sk: 'f:' + EN + ':total:power', value: tot.power || null,
                    none: 'Automatic' + (T.power && !tot.power ? ' (' + enName(P, T.power) + ')' : ''),
                    filter: { domains: ['sensor'], dc: 'power' },
                    onPick: function (v) { energySet(P, { total: Object.assign({}, tot, { power: v || '' }) }); } }),
      P.entityRow({ label: 'Energy Meter', sk: 'f:' + EN + ':total:stat', value: tot.stat || null,
                    none: 'Automatic' + (T.stat && !tot.stat ? ' (' + enName(P, T.stat) + ')' : ''),
                    filter: { domains: ['sensor'], dc: 'energy' },
                    onPick: function (v) { energySet(P, { total: Object.assign({}, tot, { stat: v || '' }) }); } }),
      P.entityRow({ label: 'Cost', sk: 'f:' + EN + ':total:cost', value: tot.cost || null,
                    none: 'Automatic' + (T.cost && !tot.cost ? ' (' + enName(P, T.cost) + ')' : T.price ? ' (meter × price)' : ''),
                    filter: { domains: ['sensor'], dc: 'monetary' },
                    onPick: function (v) { energySet(P, { total: Object.assign({}, tot, { cost: v || '' }) }); } })]));
    // WHERE IT IS SHOWN: the screens that list it
    var boards = (P.data && P.data.boards) || {};
    var on = (P.data.dashboards || []).filter(function (x) {
      var b = boards[x.path];
      if (!b) return false;
      if (b.home_page === false) {
        return (b.only_pages || []).length ? b.only_pages.indexOf('energy') >= 0 : (b.custom_pages || []).indexOf('energy') >= 0;
      }
      return !(b.pages || []).length || (b.pages || []).indexOf('energy') >= 0;
    });
    c.appendChild(K.group({ header: 'Screens', footer: 'A screen shows it once Energy is on its Pages (Automatic pages include it). An Energy Display is a screen that is only this page.' },
      on.map(function (x) {
        return K.nav({ label: x.title, sub: '/' + x.path, href: '#/screens/' + encodeURIComponent(x.path) + '/pages', fk: 'energy:screen:' + x.path });
      }).concat([K.button({ label: 'Add an Energy Display', fk: 'energy:display', onClick: function () {
        P._new = { name: 'Energy', kind: 'energy', admin: false, shows: 'energy' };
        P.go('#/add-screen');
      } })])));
    openIn(c, 'Energy', EN);
  }

  function energyTop(P, c, d) {
    var o = d.options || {}, pl = d.plan || {};
    var auto = !Array.isArray(o.top);
    var ids = (pl.top || []).filter(function (t) { return t.entity; }).map(function (t) { return t.entity; });
    c.appendChild(K.group({}, [K.toggle({ label: 'Today’s Cost', sub: 'First, from the whole home’s meter', on: o.cost !== false,
      sk: 'f:' + EN + ':cost', onChange: function (on) { energySet(P, { cost: on }); } })]));
    c.appendChild(K.listEditor({ fk: 'entop', auto: auto, minRows: 0, announce: P.announce.bind(P),
      autoFooter: 'Automatic: the first two thermostats (Status & Chips) and the outside temperature (Weather).',
      shownFooter: 'Up to four readings, today’s cost among them.',
      rows: ids.map(function (id) { return { value: id, label: P.name(id), sub: id }; }),
      onAuto: function (on) { energySet(P, { top: on ? null : ids }); },
      onChange: function (v) { energySet(P, { top: v }); },
      addLabel: ids.length < 4 - (o.cost !== false ? 1 : 0) ? 'Add a Reading' : null,
      onAddOther: function () {
        P.go(P.picker('energy-top', { title: 'Add a Reading', value: null, items: function () {
          return P.entityIds({ domains: ['climate', 'sensor'], shown: true }).filter(function (id) {
            var a = (P._hass.states[id] || {}).attributes || {};
            return id.indexOf('climate.') === 0 || a.device_class === 'temperature' || a.device_class === 'humidity' ||
                   a.device_class === 'power';
          }).map(function (id) { return { value: id, label: P.name(id), sub: id }; });
        }, onPick: function (v) { if (v) energySet(P, { top: ids.concat(v).slice(0, 4) }); } }));
      } }));
  }

  function energyUsages(P, c, d) {
    var o = d.options || {}, pl = d.plan || {};
    var auto = !Array.isArray(o.usages);
    var rows = (pl.usages || []).map(function (u) { return { entity: u.entity, stat: u.stat, name: u.name, color: u.color }; });
    var save = function (list) {
      energySet(P, { usages: list.map(function (u) {
        var x = { entity: u.entity };
        if (u.stat && u.stat !== u.entity) x.stat = u.stat;
        if (u.name) x.name = u.name;
        if (u.color) x.color = u.color;
        return x;
      }) });
    };
    c.appendChild(K.listEditor({ fk: 'enuse', auto: auto, minRows: 0, announce: P.announce.bind(P),
      autoFooter: 'Automatic: the whole home, then the five devices whose meters read the most.',
      shownFooter: 'Each is a fortnight of daily use against the week before. A runtime sensor (hours) shows its daily runtime.',
      rows: rows.map(function (u, i) {
        return { value: String(i), label: u.name, sub: u.entity, href: auto ? null : '#/features/energy/usages/' + i };
      }),
      onAuto: function (on) { if (on) energySet(P, { usages: null }); else save(rows); },
      onChange: function (v) { save(v.map(function (i) { return rows[Number(i)]; })); },
      addLabel: rows.length < 9 ? 'Add a Bar' : null,
      onAddOther: function () {
        P.go(P.picker('energy-usage', { title: 'Add a Bar', value: null, items: function () {
          return P.entityIds({ domains: ['sensor'], shown: true }).filter(function (id) {
            var a = (P._hass.states[id] || {}).attributes || {};
            return ['power', 'energy', 'duration'].indexOf(a.device_class) >= 0;
          }).map(function (id) { return { value: id, label: P.name(id), sub: id }; });
        }, onPick: function (v) {
          if (!v) return;
          var dev = (d.devices || []).filter(function (x) { return x.power === v || x.stat === v; })[0];
          save(rows.concat([{ entity: v, stat: dev ? dev.stat : null, name: dev ? dev.name : null }]));
        } }));
      } }));
  }
  function energyUsage(P, c, d, i) {
    var o = d.options || {};
    var list = Array.isArray(o.usages) ? o.usages.slice() : null;
    var u = list && list[i];
    if (!u) { c.appendChild(K.group({ footer: 'That bar is gone.' }, [])); return; }
    var put = function (ch) {
      list[i] = Object.assign({}, u, ch);
      Object.keys(list[i]).forEach(function (k) { if (list[i][k] === '' || list[i][k] == null) delete list[i][k]; });
      energySet(P, { usages: list });
    };
    var shown = ((d.plan || {}).usages || [])[i] || {};
    c.appendChild(K.group({}, [
      K.text({ label: 'Name', sk: 'f:' + EN + ':usage:name', value: u.name || '', placeholder: shown.name || '', maxlength: 40,
               onCommit: function (v) { put({ name: v.trim() }); } }),
      K.select({ label: 'Color', sk: 'f:' + EN + ':usage:color', value: u.color || '', options: EN_COLORS,
                 onChange: function (v) { put({ color: v }); } }),
      P.entityRow({ label: 'Reading', sk: 'f:' + EN + ':usage:entity', value: u.entity, required: true,
                    filter: { domains: ['sensor'] }, onPick: function (v) { if (v) put({ entity: v }); } }),
      P.entityRow({ label: 'Daily Use From', sk: 'f:' + EN + ':usage:stat', value: u.stat || null, none: 'The reading itself',
                    filter: { domains: ['sensor'] }, onPick: function (v) { put({ stat: v || '' }); } })]));
  }

  function energySections(P, c, d) {
    var o = d.options || {};
    var auto = !Array.isArray(o.sections);
    var secs = d.sections || [];
    var names = {};
    (d.devices || []).forEach(function (x) { names[x.key] = x.name; });
    (d.batteries || []).forEach(function (x) { names[x.key] = x.name; });
    var asStored = function (list) {
      return list.map(function (s) { var y = { id: s.id, name: s.name, items: s.items }; if (s.link) y.link = s.link; return y; });
    };
    c.appendChild(K.listEditor({ fk: 'ensec', auto: auto, minRows: 1, announce: P.announce.bind(P),
      autoFooter: 'Automatic: each device in the section its name suggests — Heating & Cooling, Rooms, Appliances, Outlets, Charging.',
      shownFooter: 'The page’s sections, in this order. A device in none goes to the section its name suggests, or Other.',
      rows: secs.map(function (s) {
        return { value: s.id, label: s.name, sub: s.items.map(function (k) { return names[k] || k; }).join(', ') || 'Empty',
                 href: '#/features/energy/sections/' + encodeURIComponent(s.id) };
      }),
      onAuto: function (on) { energySet(P, { sections: on ? null : asStored(secs) }); },
      onChange: function (v) {
        energySet(P, { sections: asStored(v.map(function (id) { return secs.filter(function (s) { return s.id === id; })[0]; })) });
      },
      addLabel: 'Add a Section',
      onAddOther: function () {
        var n = 1, id = 'section-1';
        while (secs.some(function (s) { return s.id === id; })) id = 'section-' + (++n);
        energySet(P, { sections: asStored(secs).concat([{ id: id, name: 'New Section', items: [] }]) })
          .then(function (done) { if (done) P.go('#/features/energy/sections/' + id); });
      } }));
  }
  function energySection(P, c, d, id) {
    var secs = d.sections || [];
    var s = secs.filter(function (x) { return x.id === id; })[0];
    if (!s) { c.appendChild(K.group({ footer: 'That section is gone.' }, [])); return; }
    var names = {}, subs = {};
    (d.devices || []).forEach(function (x) { names[x.key] = x.name; subs[x.key] = x.hidden ? 'Hidden' : null; });
    (d.batteries || []).forEach(function (x) { names[x.key] = x.name; subs[x.key] = 'Battery'; });
    var asStored = function (list) {
      return list.map(function (x) { var y = { id: x.id, name: x.name, items: x.items }; if (x.link) y.link = x.link; return y; });
    };
    var put = function (ch) {
      energySet(P, { sections: asStored(secs.map(function (x) { return x.id === id ? Object.assign({}, x, ch) : x; })) });
    };
    var link = s.link || {};
    c.appendChild(K.group({}, [
      K.text({ label: 'Name', sk: 'f:' + EN + ':section:name', value: s.name, maxlength: 40, error: P.err('f:' + EN + ':sections'),
               onCommit: function (v) { if (v.trim()) put({ name: v.trim() }); } })]));
    c.appendChild(K.group({ header: 'Link', footer: 'Optional: its heading opens another page — a panel’s own dashboard, say (“/ecoflow-panel/ecoflow”).' }, [
      K.text({ label: 'Page', sk: 'f:' + EN + ':section:link', value: link.path || '', placeholder: 'None', maxlength: 120,
               onCommit: function (v) { put({ link: v.trim() ? { path: v.trim(), text: link.text || '' } : null }); } }),
      K.text({ label: 'Link Text', sk: 'f:' + EN + ':section:linktext', value: link.text || '', placeholder: 'More', maxlength: 40,
               onCommit: function (v) { if (link.path) put({ link: { path: link.path, text: v.trim() } }); } })]));
    var others = [];
    secs.forEach(function (x) {
      if (x.id !== id) x.items.forEach(function (k) { others.push({ value: k, label: names[k] || k, sub: 'In ' + x.name }); });
    });
    c.appendChild(K.listEditor({ fk: 'ensecitems', minRows: 0, announce: P.announce.bind(P), shownHeader: 'Tiles',
      shownFooter: 'In this order. A device taken out goes back to the section its name suggests.',
      rows: s.items.map(function (k) {
        return { value: k, label: names[k] || k, sub: subs[k],
                 href: devByKey(d, k) ? '#/features/energy/devices/' + encodeURIComponent(k) : null };
      }),
      more: others, moreHeader: 'Move Here',
      onChange: function (v) {
        // a tile moved here leaves its old section
        var moved = asStored(secs.map(function (x) {
          return x.id === id ? Object.assign({}, x, { items: v }) : Object.assign({}, x, { items: x.items.filter(function (k) { return v.indexOf(k) < 0; }) });
        }));
        energySet(P, { sections: moved });
      } }));
    if (secs.length > 1) {
      c.appendChild(K.group({}, [K.button({ label: 'Delete Section', destructive: true, fk: 'energy:section:rm', onClick: function () {
        K.confirm(P.shadowRoot, { title: 'Delete “' + s.name + '”?', destructive: true, ok: 'Delete',
                                  message: 'Its tiles go back to the sections their names suggest.' })
          .then(function (yes) {
            if (!yes) return;
            energySet(P, { sections: asStored(secs.filter(function (x) { return x.id !== id; })) })
              .then(function (done) { if (done) P.back('#/features/energy/sections'); });
          });
      } })]));
    }
  }

  function energyDevices(P, c, d) {
    var secs = d.sections || [];
    var byKey = {};
    (d.devices || []).forEach(function (x) { byKey[x.key] = x; });
    secs.forEach(function (s) {
      var rows = s.items.filter(function (k) { return byKey[k]; }).map(function (k) {
        var x = byKey[k];
        return K.nav({ label: x.name, sub: x.hidden ? 'Hidden' : (x.power ? P.name(x.power) : 'No power sensor'), icon: x.icon,
                       href: '#/features/energy/devices/' + encodeURIComponent(k), fk: 'energy:dev:' + k });
      });
      if (rows.length) c.appendChild(K.group({ header: s.name }, rows));
    });
    c.appendChild(K.group({ footer: 'A device Home Assistant’s Energy settings don’t list: a circuit or a plug with its own power sensor.' }, [
      K.nav({ label: 'Add a Device', href: '#/features/energy/add', icon: 'mdi:plus-circle-outline', fk: 'energy:add' })]));
  }
  function energyDevice(P, c, d, key) {
    var x = devByKey(d, key);
    if (!x) { c.appendChild(K.group({ footer: 'That device isn’t listed any more.' }, [])); return; }
    var own = ((d.options || {}).devices || {})[key] || {};
    var e = function (f) { return P.err('f:' + EN + ':' + f); };
    c.appendChild(K.group({}, [
      K.text({ label: 'Name', sk: 'f:' + EN + ':name', value: own.name || '', placeholder: x.name, maxlength: 40, error: e('name'),
               onCommit: function (v) { energyDev(P, key, { name: v.trim() || null }); } }),
      K.text({ label: 'Glyph', sk: 'f:' + EN + ':icon', value: own.icon || '', placeholder: x.icon, maxlength: 60, error: e('icon'),
               onCommit: function (v) { energyDev(P, key, { icon: v.trim() || null }); } }),
      K.select({ label: 'Color', sk: 'f:' + EN + ':color', value: own.color || '', options: EN_COLORS,
                 onChange: function (v) { energyDev(P, key, { color: v || null }); } }),
      K.toggle({ label: 'Show on the Energy Page', on: !x.hidden, sk: 'f:' + EN + ':hidden',
                 onChange: function (on) { energyDev(P, key, { hidden: !on }); } })]));
    var sec = sectionOf(d, key);
    c.appendChild(K.group({ header: 'Section' }, [
      K.select({ label: 'Section', sk: 'f:' + EN + ':section', value: sec ? sec.id : '',
                 options: (d.sections || []).map(function (s) { return [s.id, s.name]; }).concat(
                   (d.section_kinds || []).filter(function (k) {
                     return !(d.sections || []).some(function (s) { return s.id === k[0]; });
                   }).map(function (k) { return [k[0], k[1] + ' (new)']; })),
                 onChange: function (v) { if (v) energySet(P, { sections: sectionsAfter(d, key, v) }); } })]));
    c.appendChild(K.group({ header: 'Readings', footer: energyFound(x) + '.' }, [
      P.entityRow({ label: 'Power Sensor', sk: 'f:' + EN + ':power', value: own.power || null,
                    none: 'Automatic' + (x.power && !own.power ? ' (' + P.name(x.power) + ')' : ''),
                    filter: { domains: ['sensor'], dc: 'power' },
                    onPick: function (v) { energyDev(P, key, { power: v || null }); } }),
      x.stat ? K.info({ label: 'Energy Meter', sub: x.stat, value: P.name(x.stat) }) : null,
      P.entityRow({ label: 'Switched By', sub: 'Its sheet shows the switch', sk: 'f:' + EN + ':control', value: own.control || null,
                    none: 'Automatic' + (x.control && !own.control ? ' (' + P.name(x.control) + ')' : ''),
                    filter: { domains: ['switch'] },
                    onPick: function (v) { energyDev(P, key, { control: v || null }); } })]));
    var rel = [];
    if (x.parent_name) rel.push(K.info({ label: 'Part Of', value: x.parent_name }));
    (x.children || []).forEach(function (k) {
      var y = devByKey(d, k);
      rel.push(K.nav({ label: 'Includes', value: y ? y.name : k, href: '#/features/energy/devices/' + encodeURIComponent(k) }));
    });
    if (rel.length) c.appendChild(K.group({ header: 'In Home Assistant’s Energy Settings' }, rel));
    if (x.extra) {
      c.appendChild(K.group({}, [K.button({ label: 'Remove Device', destructive: true, fk: 'energy:dev:rm', onClick: function () {
        var extra = ((d.options || {}).extra || []).filter(function (y) { return y.key !== key; });
        energySet(P, { extra: extra }).then(function (done) { if (done) P.back('#/features/energy/devices'); });
      } })]));
    }
  }
  function energyAdd(P, c, d) {
    var st = P.feat(EN), f = form(st, 'add', function () { return { name: '', power: null, stat: null }; });
    c.appendChild(K.group({ footer: 'A power sensor gives its tile live watts; an energy meter gives its kWh today and its daily bars. Either will do.' }, [
      K.text({ label: 'Name', sk: 'f:' + EN + ':extra', value: f.name, placeholder: 'Network Rack', maxlength: 40,
               error: P.err('f:' + EN + ':extra'), onCommit: function (v) { f.name = v; } }),
      P.entityRow({ label: 'Power Sensor', sk: 'energy-add-power', value: f.power, none: 'None',
                    filter: { domains: ['sensor'], dc: 'power' }, onPick: function (v) { f.power = v; P.render(); } }),
      P.entityRow({ label: 'Energy Meter', sk: 'energy-add-stat', value: f.stat, none: 'None',
                    filter: { domains: ['sensor'], dc: 'energy' }, onPick: function (v) { f.stat = v; P.render(); } })]));
    c.appendChild(K.group({}, [K.button({ label: 'Add Device', fk: 'energy:add:go', disabled: !(f.power || f.stat), onClick: function () {
      var inp = P.shadowRoot && P.shadowRoot.querySelector('[data-fk="f:' + EN + ':extra"]');
      var name = String((inp && inp.value) || f.name || '').trim();
      if (!name) { P.errors['f:' + EN + ':extra'] = 'Give it a name.'; P.render(); return; }
      var key = f.stat || f.power;
      var extra = ((d.options || {}).extra || []).filter(function (y) { return y.key !== key; })
        .concat([{ key: key, name: name, power: f.power || null, stat: f.stat || null }]);
      energySet(P, { extra: extra }).then(function (done) {
        if (!done) return;
        delete st.forms.add;
        P.go('#/features/energy/devices/' + encodeURIComponent(key));
      });
    } })]));
  }

  // THE BATTERIES AS STORED, from rows as shown (d.batteries, resolved):
  // only what the house set itself -- a battery already in the stored list
  // keeps its own entry; one taken from Automatic is just its entity, and
  // the house battery's flag (the plan's own, else its automatic glyph).
  // Never the resolved name, label, suffix or glyph: pinned, they outlived
  // the choice that made them (The House Battery off kept the house glyph,
  // and the next save turned it back on).
  var HOUSE_GLYPH = 'hk:home-battery-outline', BATTERY_GLYPH = 'hk:battery-high';
  function batteriesStored(d, list) {
    var own = {};
    var o = (d && d.options) || {};
    (Array.isArray(o.batteries) ? o.batteries : []).forEach(function (b) { if (b && b.entity) own[b.entity] = b; });
    return list.filter(Boolean).map(function (b) {
      var key = b.entity || b.key;
      if (own[key]) return Object.assign({}, own[key]);
      var y = { entity: key };
      if (b.house === true || (b.house === undefined && b.icon === HOUSE_GLYPH)) y.house = true;
      return y;
    });
  }
  function energyBatteries(P, c, d) {
    var o = d.options || {};
    var auto = !Array.isArray(o.batteries);
    var bats = d.batteries || [];
    var asStored = function (list) { return batteriesStored(d, list); };
    c.appendChild(K.listEditor({ fk: 'enbat', auto: auto, minRows: 0, announce: P.announce.bind(P),
      autoFooter: 'Automatic: the house battery’s level (Home Assistant’s Energy settings) and every car’s — a battery level on a device that also reports a range.',
      shownFooter: 'Their level, colored by it, in the Charging section (or where Sections places them).',
      rows: bats.map(function (b) {
        return { value: b.key, label: b.name, sub: b.label ? 'With ' + enName(P, b.label) : b.key,
                 href: auto ? null : '#/features/energy/batteries/' + encodeURIComponent(b.key) };
      }),
      onAuto: function (on) { energySet(P, { batteries: on ? null : asStored(bats) }); },
      onChange: function (v) {
        energySet(P, { batteries: asStored(v.map(function (k) { return bats.filter(function (b) { return b.key === k; })[0]; })) });
      },
      addLabel: 'Add a Battery',
      onAddOther: function () {
        P.go(P.picker('energy-battery', { title: 'Add a Battery', value: null, items: function () {
          return P.entityIds({ domains: ['sensor'], dc: 'battery', shown: true })
            .map(function (id) { return { value: id, label: P.name(id), sub: id }; });
        }, onPick: function (v) { if (v) energySet(P, { batteries: asStored(bats).concat([{ entity: v }]) }); } }));
      } }));
  }
  function energyBattery(P, c, d, key) {
    var o = d.options || {};
    var list = Array.isArray(o.batteries) ? o.batteries.slice() : [];
    var i = -1;
    list.forEach(function (b, j) { if (b.entity === key) i = j; });
    var shown = (d.batteries || []).filter(function (b) { return b.key === key; })[0];
    if (i < 0 || !shown) { c.appendChild(K.group({ footer: 'That battery isn’t listed any more.' }, [])); return; }
    var b = list[i];
    var put = function (ch) {
      list[i] = Object.assign({}, b, ch);
      Object.keys(list[i]).forEach(function (k) { if (list[i][k] === '' || list[i][k] == null) delete list[i][k]; });
      energySet(P, { batteries: list });
    };
    c.appendChild(K.group({}, [
      K.text({ label: 'Name', sk: 'f:' + EN + ':bat:name', value: b.name || '', placeholder: shown.name, maxlength: 40,
               onCommit: function (v) { put({ name: v.trim() }); } }),
      P.entityRow({ label: 'Under Its Name', sub: 'A range, or the energy stored', sk: 'f:' + EN + ':bat:label',
                    value: b.label || null, none: shown.label && !b.label ? 'Automatic (' + P.name(shown.label) + ')' : 'Nothing',
                    filter: { domains: ['sensor'] }, onPick: function (v) { put({ label: v || '' }); } }),
      K.text({ label: 'After It', sk: 'f:' + EN + ':bat:suffix', value: b.label_suffix != null ? b.label_suffix : '',
               placeholder: shown.label_suffix || ' mi range', maxlength: 40, onCommit: function (v) { put({ label_suffix: v }); } }),
      K.toggle({ label: 'The House Battery', sub: 'Its glyph is the house’s', on: !!b.house, sk: 'f:' + EN + ':bat:house',
                 // a default glyph saved by an older page goes with it, or
                 // the house's glyph would stay after turning this off
                 onChange: function (on) {
                   put({ house: on || null, icon: b.icon === HOUSE_GLYPH || b.icon === BATTERY_GLYPH ? null : b.icon });
                 } })]));
  }

  function energyPage(P, sub, mk, withData, name, domain) {
    var back = ['Energy', '#/features/energy'];
    var d0 = P.feat(domain).data || {};
    if (sub[0] === 'top') return mk('Readings', withData(function (c, d) { energyTop(P, c, d); }), back);
    if (sub[0] === 'usages' && sub[1] !== undefined) {
      return mk('Daily Bar', withData(function (c, d) { energyUsage(P, c, d, Number(sub[1])); }), ['Daily Bars', '#/features/energy/usages']);
    }
    if (sub[0] === 'usages') return mk('Daily Bars', withData(function (c, d) { energyUsages(P, c, d); }), back);
    if (sub[0] === 'sections' && sub[1]) {
      var sid = decodeURIComponent(sub[1]);
      var ss = (d0.sections || []).filter(function (x) { return x.id === sid; })[0];
      return mk(ss ? ss.name : 'Section', withData(function (c, d) { energySection(P, c, d, sid); }), ['Sections', '#/features/energy/sections']);
    }
    if (sub[0] === 'sections') return mk('Sections', withData(function (c, d) { energySections(P, c, d); }), back);
    if (sub[0] === 'devices' && sub[1]) {
      var key = decodeURIComponent(sub[1]);
      var dv = devByKey(d0, key);
      return mk(dv ? dv.name : 'Device', withData(function (c, d) { energyDevice(P, c, d, key); }), ['Devices', '#/features/energy/devices']);
    }
    if (sub[0] === 'devices') return mk('Devices', withData(function (c, d) { energyDevices(P, c, d); }), back);
    if (sub[0] === 'add') return mk('Add a Device', withData(function (c, d) { energyAdd(P, c, d); }), ['Devices', '#/features/energy/devices']);
    if (sub[0] === 'batteries' && sub[1]) {
      var bk = decodeURIComponent(sub[1]);
      return mk('Battery', withData(function (c, d) { energyBattery(P, c, d, bk); }), ['Batteries', '#/features/energy/batteries']);
    }
    if (sub[0] === 'batteries') return mk('Batteries', withData(function (c, d) { energyBatteries(P, c, d); }), back);
    return { title: name, top: true, scope: SCOPE[domain], body: withData(function (c, d) { energyMain(P, c, d); }) };
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
    if (route === 'energy') return energyPage(P, sub, mk, withData, name, domain);
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
    hk_energy: 'An Energy page for your screens, built from Home Assistant’s Energy settings.',
    hk_music: 'Whole-home music through Music Assistant.'
  };
  var WHAT = {
    hk_tv: 'Live TV isn’t added yet. It plays an HDHomeRun tuner’s channels on your screens, with a guide.',
    hk_alarm_pin: 'Alarm PIN isn’t added yet. It puts a PIN in front of an alarm panel.',
    hk_clean_areas: 'Clean Areas isn’t added yet. It sends each vacuum the chosen rooms on its own map.',
    hk_energy: 'Energy isn’t added yet. It builds an Energy page — whole-home power, today’s cost, daily use and a live tile per circuit — from Home Assistant’s Energy settings.',
    hk_music: 'Music isn’t added yet. It plays music in chosen rooms through Music Assistant.'
  };

  root.hkSettingsFeatures = {
    LIST: LIST, listed: listed, stateOf: stateOf, page: page, use: use, addHref: addHref, search: search, musicTop: musicTop,
    integrationHref: integrationHref, SCOPE: SCOPE, WHAT: WHAT,
    _: { tvLists: tvLists, tvCount: tvCount, speakerLists: speakerLists, speakerName: speakerName, playlistSub: playlistSub, vacuumSub: vacuumSub, vacuumsAfter: vacuumsAfter,
         roomLists: roomLists, roomCount: roomCount, energyFound: energyFound, sectionsAfter: sectionsAfter,
         batteriesStored: batteriesStored }
  };
})();
