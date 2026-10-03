// hk-settings-model.js -- WHAT THE HK SETTINGS PAGE SAYS AND DECIDES, with
// no page in it. The words every row uses, the choices,
// and the small pure functions that turn a stored value into what a row
// shows and a row's change back into what is saved. The page
// (hk-settings.js) draws; this decides -- and tests/test_settingsmodel.js
// holds it to every rule without a browser.
//
// THE RULES THE PAGE KEEPS (docs/HK-Settings.md, "How the controls behave"):
//   * One place for each setting. A screen's list is ONE list: which, and in
//     what order (never split across two tabs).
//   * A screen value that can follow All Screens says so ("Same as All
//     Screens (Blur)") and can go back to it.
//   * Automatic is a switch, not a state you fall out of by touching a row.
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  if (root.hkSettingsModel) return;

  // ------------------------------------------------------------------ words
  var CHIP_LABELS = {
    weather_alert: 'Weather Alerts', security: 'Security', doors_windows: 'Doors & Windows', climate: 'Climate',
    lights: 'Lights', blinds: 'Blinds', timers: 'Timers', vacuums: 'Vacuums', speakers: 'Speakers',
    water: 'Water', energy: 'Energy'
  };
  // What each chip counts, and where that is set: What Counts kinds, or a
  // single setting (General, Weather).
  var CHIP_SOURCES = {
    weather_alert: { setting: ['house/weather/sensors', 'Weather Alerts Sensor'] },
    security: { kinds: ['locks', 'garage'], setting: ['house/general', 'Alarm Panel'] },
    doors_windows: { kinds: ['doors', 'windows'] },
    climate: { kinds: ['thermostats', 'fans'], setting: ['house/general', 'Indoor Temperature'] },
    lights: { kinds: ['lights'] }, blinds: { kinds: ['blinds'] }, timers: { kinds: ['timers'] },
    vacuums: { kinds: ['vacuums'] }, speakers: { kinds: ['speakers'] }, water: { kinds: ['leaks'] },
    energy: { setting: ['house/general', 'Power Use'] }
  };
  var PAGE_LABELS = {
    weather: 'Weather', calendar: 'Calendar', cameras: 'Cameras', live_tv: 'Live TV', security: 'Security',
    doors_windows: 'Doors & Windows', climate: 'Climate', lights: 'Lights', timers: 'Timers',
    vacuums: 'Vacuums', music: 'Play Music', browse: 'Browse Music', water: 'Water', rooms: 'Room Pages'
  };
  var COUNT_KINDS = [
    ['temperature', 'Temperature', 'Room-related temperature sensors, or a thermostat’s current reading where a room has no related sensor. Other sensors can be added explicitly.'],
    ['humidity', 'Humidity', 'Room-related humidity sensors, or a thermostat’s current humidity where a room has no related sensor. Other sensors can be added explicitly.'],
    ['lights', 'Lights', 'Every light. The Lights chip counts the ones that are on.'],
    ['fans', 'Fans', 'Every fan. The Climate chip counts the ones that are on.'],
    ['doors', 'Doors', 'Door contacts. The Doors & Windows chip counts the open ones.'],
    ['windows', 'Windows', 'Window contacts.'],
    ['garage', 'Garage Doors', 'Garage doors and gates: the cover, or a garage-door contact.'],
    ['locks', 'Locks', 'Every lock. The Security chip counts the unlocked ones.'],
    ['blinds', 'Blinds', 'Blinds, shades, curtains, shutters and awnings. The Blinds chip counts the open ones.'],
    ['leaks', 'Leak Sensors', 'Moisture sensors. The Water chip appears when one is wet.'],
    ['thermostats', 'Thermostats', 'The house’s thermostats. The Climate chip’s glyph follows them.'],
    ['timers', 'Timers', 'Timer helpers. The Timers chip counts the running ones.'],
    ['vacuums', 'Vacuums', 'Robot vacuums. The Vacuums chip counts the ones cleaning.'],
    ['speakers', 'Speakers', 'Media players that aren’t TVs or receivers (or Music’s rooms, when it’s added).']
  ];
  var MENU_STYLES = [
    ['auto', 'Automatic', 'The chip when Home has a menu button; otherwise the edge tab.'],
    ['chip', 'Chip', 'A round button at the start of the chip row.'],
    ['chip_scroll', 'Chip, Then Tab', 'The chip; the edge tab slides in while the chip is scrolled out of sight.'],
    ['chip_home', 'Chip on Home, Tab Elsewhere', 'The chip on Home, and the edge tab on every other page.'],
    ['tab', 'Edge Tab', 'A slim tab on the left edge, level with the date.']
  ];
  // ON NARROW SCREENS / WHEN FOLDED: below 1,024 px, and while
  // an always-open menu is folded
  var NARROW = [
    ['chip', 'Chip', 'A round button at the start of the chip row.'],
    ['chip_scroll', 'Chip, Then Tab', 'The chip; the edge tab slides in once the chip scrolls out of sight.'],
    ['tab', 'Edge Tab', 'A slim tab on the left edge. On a phone it sits over the page’s margin.']
  ];
  function narrowLabel(v) {
    for (var i = 0; i < NARROW.length; i++) if (NARROW[i][0] === (v || 'chip')) return NARROW[i][1];
    return 'Chip';
  }
  // the styles that can show the edge tab (Tab Position applies)
  var TAB_STYLES = { auto: 1, chip_scroll: 1, chip_home: 1, tab: 1 };
  var GLASS = [
    ['clear', 'Clear', 'The original glass. The status chips blur what’s behind them.'],
    ['frosted', 'Frosted', 'A frosted material with no blur. Costs a tablet nothing per frame.'],
    ['blur', 'Blur', 'What’s behind the glass is blurred as one shared layer, so tablets keep their frame rate.'],
    ['blur_each', 'Blur Each Card', 'Every surface blurs what’s behind it. For phones, iPads and computers — too heavy for a wall tablet.']
  ];
  var PRESETS = {
    wall_tablet: ['Wall Tablet', 'Menu always open with the time and weather, back to Home when idle, no Home Assistant header.'],
    personal: ['Phone or iPad', 'Menu behind a button, time and weather in the header.'],
    computer: ['Computer', 'Menu open beside the page.'],
    car: ['Car', 'No menu, sized for a car’s browser.'],
    custom: ['Something Else', 'Starts from the defaults.']
  };
  var STATUS_LABELS = {
    temperature: 'Temperature', humidity: 'Humidity', outlets: 'Outlets', blinds: 'Blinds', fans: 'Fans',
    windows: 'Windows', doors: 'Doors', locks: 'Locks', garage: 'Garage Doors', motion: 'Motion',
    occupancy: 'Occupancy', leaks: 'Leaks'
  };
  var BROWSE_LABELS = {
    artists: 'Artists', albums: 'Albums', tracks: 'Songs', playlists: 'Playlists', radio: 'Radio',
    podcasts: 'Podcasts', audiobooks: 'Audiobooks'
  };
  var POPUP_KINDS = [
    ['camera', 'Camera or Doorbell', 'The picture to every edge, with talk-back when it has a speaker.'],
    ['alarm', 'Alarm Keypad', 'The alarm’s keypad.'],
    ['accessories', 'Accessories', 'Several accessories on one sheet.'],
    ['cards', 'Custom', 'Your own cards, in YAML.']
  ];
  var CLOSE_AFTER = [[30, '30 Seconds'], [60, '1 Minute'], [120, '2 Minutes'], [300, '5 Minutes'],
                     [600, '10 Minutes'], [1800, '30 Minutes'], [3600, '1 Hour']];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                'October', 'November', 'December'];

  // THE SKY, by what it draws. dates: the key prefix of its _from/_to;
  // often: its how-often key; extra: another how-often key.
  var SKY_THEMES = [
    { id: 'halloween', label: 'Fall & Halloween', dates: 'halloween', often: 'halloween_often', extra: 'spooky_often',
      desc: 'An autumn canopy and falling leaves by day; on some nights a big moon, fog, bats and a witch.' },
    { id: 'thanksgiving', label: 'Thanksgiving', dates: 'thanksgiving', often: 'thanksgiving_often',
      desc: 'The autumn canopy with heavier falling leaves.' },
    { id: 'christmas', label: 'Christmas', dates: 'christmas', often: 'christmas_often',
      desc: 'Pine, ornaments and stockings, twinkling lights, snow and a rare sleigh.' },
    { id: 'fourth-of-july', label: 'Fourth of July', dates: 'july4', desc: 'Every day between its dates.' },
    { id: 'valentines-day', label: 'Valentine’s Day', dates: 'valentines', desc: 'Every day between its dates.' },
    { id: 'spring-garden', label: 'Spring Garden', dates: 'spring', often: 'spring_often',
      desc: 'Blossom, petals and a butterfly by day, on occasional days.' },
    { id: 'winter-wonderland', label: 'Winter Wonderland', dates: 'winter', often: 'winter_often',
      desc: 'Frost and ice crystals on occasional days. May run past New Year.' },
    { id: 'storybook-magic', label: 'Storybook Magic', often: 'storybook_per_month',
      desc: 'On its own fixed days every month.' },
    { id: 'space-night', label: 'Space Night', often: 'space_per_month', desc: 'On its own fixed days every month.' },
    { id: 'birthday', label: 'Birthdays', desc: 'Balloons and confetti on the day, even in place of a season’s decoration.' }
  ];
  var OFTEN_LABELS = {
    halloween_often: { every_day: 'Every Day', sometimes: 'Sometimes', near_end: 'Only the Last Days' },
    thanksgiving_often: { every_day: 'Every Day', sometimes: 'Sometimes', near_end: 'Only the Last Days' },
    christmas_often: { every_day: 'Every Day', sometimes: 'Sometimes', near_end: 'Only the Last Days' },
    spring_often: { often: 'Often', sometimes: 'Sometimes', rarely: 'Rarely' },
    winter_often: { often: 'Often', sometimes: 'Sometimes', rarely: 'Rarely' },
    storybook_per_month: { 1: 'Once a Month', 2: 'Twice a Month', 4: 'Four Times a Month' },
    space_per_month: { 1: 'Once a Month', 2: 'Twice a Month', 4: 'Four Times a Month' },
    spooky_often: { sometimes: 'Sometimes', every_night: 'Every Night', never: 'Never' }
  };
  var OFTEN_DEFAULT = { storybook_per_month: '1', space_per_month: '1' };

  // Why a value was refused (settings_api.py codes, files.py codes).
  var ERRORS = {
    entity: 'That isn’t the right kind of entity.', list: 'That list couldn’t be read.',
    choice: 'That isn’t one of the choices.', text: 'That text is too long.', amount: 'Choose 0 to 100 %.',
    card_options: 'Options must be YAML keys and values (key: value), under 20,000 characters.',
    birthday: 'Each birthday needs a name and a date.', path: 'Use letters, digits and dashes only.',
    count: 'That list couldn’t be read.', date: 'That isn’t a date.',
    stops: 'Choose four colors for Day and four for Night.',
    tab_position: 'Enter a number: pixels from the top, or a percentage of the screen’s height.',
    accent: 'Choose a color, or a color of your own as #rrggbb.',
    dock_min: 'Enter 700 to 3,000 px.', bad_room: 'Use lower-case letters, digits and underscores, like living_room.',
    user: 'That isn’t a user name.', unknown: 'That setting doesn’t exist.',
    icon: 'Use an icon name such as mdi:music or hk:apple.',
    chip_card: 'The chip must be YAML with a type, such as type: custom:hk-status-chip-card.',
    chip_gone: 'That chip isn’t there any more.',
    folder_required: 'Enter a folder name.', folder_outside_config: 'The folder must be inside /config.',
    folder_is_config: 'Choose a folder inside /config, not /config itself.',
    folder_not_dedicated: 'That folder holds Home Assistant’s own files; choose a folder of its own.',
    name_needed: 'Give it a name.', bad_hash: 'Use lower-case letters, digits and dashes.',
    hash_taken: 'Another pop-up uses that address.', bad_page_path: 'Use lower-case letters, digits and dashes (not a page the screens use themselves).',
    page_path_taken: 'Another page uses that address.', page_not_found: 'That page couldn’t be read.',
    page_view: 'The page must be YAML keys and values, such as cards: […].'
  };
  // A PAGE PILL'S OWN LOOK (hk-chip.js PAGE_PILLS): name, icon, color
  var PAGE_PILL_DEFAULTS = {
    weather: ['Weather', 'hk:weather-partly-cloudy', 'white'], calendar: ['Calendar', 'mdi:calendar-month', 'red'], cameras: ['Cameras', 'hk:camera', 'green'],
    live_tv: ['Live TV', 'hk:television', 'blue'], security: ['Security', 'hk:shield-lock', 'green'],
    doors_windows: ['Doors & Windows', 'hk:door-closed-lock', 'white'], climate: ['Climate', 'hk:thermostat', 'blue'],
    lights: ['Lights', 'hk:lightbulb', 'yellow'], timers: ['Timers', 'hk:timer-sand', 'orange'],
    vacuums: ['Vacuums', 'hk:robot-vacuum', 'white'], music: ['Play Music', 'hk:music', 'white'], water: ['Water', 'hk:water', 'blue']
  };
  var PILL_COLORS = ['white', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'mint', 'green'];
  // A CALENDAR'S AUTOMATIC COLOUR: the next of these by its place in the list
  // (the same list as hk-settings.js calendarColor)
  var CAL_COLORS = ['orange', 'green', 'purple', 'blue', 'pink', 'yellow', 'teal', 'red', 'mint', 'white'];
  function colorLabel(k) { return k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Default'; }
  function errorText(code) { return ERRORS[code] || String(code || 'Couldn’t save.'); }
  // A refusal from the page's commands: the message is JSON (field -> code).
  function refusals(err) {
    var m = err && (err.message || (err.body && err.body.message));
    try { var o = JSON.parse(m); if (o && typeof o === 'object') return o; } catch (e) { /* not ours */ }
    return null;
  }

  // ------------------------------------------------------------- the menu
  function menuMode(b) { return b.menu === 'off' ? 'off' : b.menu === 'open' ? 'open' : 'button'; }
  // Switching the segmented control: a button keeps the style it had.
  function menuFor(mode, b, last) {
    if (mode === 'off') return 'off';
    if (mode === 'open') return 'open';
    return (b.menu !== 'off' && b.menu !== 'open') ? b.menu : (last || 'auto');
  }
  function menuStyleLabel(v) {
    for (var i = 0; i < MENU_STYLES.length; i++) if (MENU_STYLES[i][0] === v) return MENU_STYLES[i][1];
    return v;
  }
  // THE MENU'S HIGHLIGHT (settings.py ACCENTS; hk-base.js has the same
  // values): Apple's system colours, as in dark mode
  var ACCENTS = [['orange', 'Orange', '#ff9f0a'], ['yellow', 'Yellow', '#ffd60a'], ['green', 'Green', '#30d158'],
                 ['mint', 'Mint', '#63e6e2'], ['teal', 'Teal', '#40c8e0'], ['cyan', 'Cyan', '#64d2ff'],
                 ['blue', 'Blue', '#0a84ff'], ['indigo', 'Indigo', '#5e5ce6'], ['purple', 'Purple', '#bf5af2'],
                 ['pink', 'Pink', '#ff375f'], ['red', 'Red', '#ff453a']];
  function accentOf(v) {
    v = String(v || 'orange').toLowerCase();
    for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i][0] === v) return { name: ACCENTS[i][1], hex: ACCENTS[i][2], custom: false };
    return /^#[0-9a-f]{6}$/.test(v) ? { name: 'Custom', hex: v, custom: true } : { name: 'Orange', hex: '#ff9f0a', custom: false };
  }
  // TAB POSITION as two choices: level with the date ('') or a distance from
  // the top in px or % (settings.py tab_position) -- [mode, number, unit]
  function tabPosParts(v) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$/.exec(String(v || ''));
    return m ? { mode: 'custom', n: m[1], unit: m[2] || 'px' } : { mode: 'date', n: '', unit: 'px' };
  }
  function tabPosJoin(n, unit) {
    var t = String(n == null ? '' : n).replace(/[^\d.]/g, '');
    return t ? t + (unit === '%' ? '%' : 'px') : '';
  }
  function tabPosLabel(v) {
    var p = tabPosParts(v);
    return p.mode === 'date' ? 'Level with Date' : p.n + (p.unit === '%' ? ' % from Top' : ' px from Top');
  }
  // ALL SCREENS' MENU (settings `menu`) as a screen's keys, and back
  // (settings.py MENU_KEYS): the same rows serve both
  var MENU_KEYS = { menu: 'style', narrow: 'narrow', tab_position: 'tab_at', tab_size: 'tab_size',
                    tab_size_phone: 'tab_size_phone', dock_min: 'open_min', time_weather: 'time_weather_at',
                    ha_row: 'ha_row', accent: 'accent', glyph: 'glyph', clock: 'clock' };
  var MENU_DEFAULTS = { menu: 'auto', narrow: 'chip', tab_position: '', tab_size: 'large', tab_size_phone: 'standard',
                        dock_min: 1000, time_weather: 'page', ha_row: false, accent: 'orange', glyph: 'sidebar', clock: true };
  function houseMenuAsBoard(m) {
    m = m || {};
    var out = {};
    Object.keys(MENU_KEYS).forEach(function (k) {
      var v = m[MENU_KEYS[k]];
      out[k] = v === undefined || v === null ? MENU_DEFAULTS[k] : v;
    });
    out.clock = out.clock !== false;
    return out;
  }
  function houseMenuSave(ch) {
    var out = {};
    Object.keys(ch).forEach(function (k) { if (MENU_KEYS[k]) out['menu.' + MENU_KEYS[k]] = ch[k]; });
    return out;
  }
  // A SCREEN TAKING ITS MENU AS ITS OWN: what it shows now, written as its
  // own, so nothing moves; its `menu` (off, a button, always open) is its
  // own already
  function menuOwnChanges(b) {
    var out = { menu_custom: true };
    Object.keys(MENU_KEYS).forEach(function (k) { if (k !== 'menu' && b[k] !== undefined) out[k] = b[k]; });
    // a button's style (All Screens', as it shows now) becomes its own too
    if (b.menu && b.menu !== 'off' && b.menu !== 'open') out.menu = b.menu;
    return out;
  }
  // one line for a screen's Menu Settings row
  function menuSummary(b) { return b.menu_custom ? 'This Screen’s Own' : 'Same as All Screens'; }
  function showsTab(b) {
    if (menuMode(b) === 'off') return false;
    return (menuMode(b) === 'button' && !!TAB_STYLES[b.menu]) || b.narrow === 'tab' || b.narrow === 'chip_scroll';
  }

  // ------------------------------------------------------------ the glass
  function glassLabel(v) {
    for (var i = 0; i < GLASS.length; i++) if (GLASS[i][0] === v) return GLASS[i][1];
    return v;
  }
  // this screen's glass: its own, or All Screens'
  function glassOf(b, look) {
    var own = !!b.glass && b.glass !== 'house';
    var house = look && look.glass || 'clear';
    return { own: own, value: own ? b.glass : 'house', effective: own ? b.glass : house, house: house };
  }
  // an amount: this screen's own (a number), else All Screens'
  function amountOf(b, look, key) {
    var own = b[key] !== null && b[key] !== undefined && b[key] !== '';
    var house = look && typeof look[key] === 'number' ? look[key] : 50;
    return { own: own, value: own ? Number(b[key]) : house, house: house };
  }
  // which amount the glass uses (the others are kept but not shown)
  function amountsFor(effective) {
    return { frost: effective === 'frosted', blur: effective === 'blur' || effective === 'blur_each' };
  }

  // ------------------------------------------------------------ the lists
  // Each list model: { auto, rows: [{value, label?, kind, ...}], more: [...] }
  // `rows` are what shows, in order; `more` what can be added.

  // CHIPS: `chips` orders kinds and own chips (entities); `chips_extra` says
  // which own chips exist; `chips_quiet` which kinds wait for news.
  // CUSTOM CHIPS: the house's own chips in YAML ({key, name,
  // after}); a screen's chips_custom says which it shows, and its chip order
  // may place one as "chip:<key>" -- unplaced, one sits where it says (after a
  // kind, at the start or the end), as the chip row puts it (hk-chip.js).
  var CHIP_TOKEN = 'chip:';
  function isCustomTok(k) { return String(k).indexOf(CHIP_TOKEN) === 0; }
  function libOf(custom) { var o = {}; (custom || []).forEach(function (c) { if (c && c.key) o[c.key] = c; }); return o; }
  // the order the chip row draws: kinds (or the screen's order), own chips
  // after them, then each unplaced custom chip where it says
  function chipOrder(base, extra, mineC, lib) {
    var order = base.slice();
    extra.forEach(function (e) { if (order.indexOf(e) < 0) order.push(e); });
    mineC.forEach(function (k) {
      var t = CHIP_TOKEN + k;
      if (order.indexOf(t) >= 0) return;
      var a = (lib[k] || {}).after, at = a === 'start' ? 0 : order.indexOf(a) + 1;
      if (at <= 0 && a !== 'start') at = order.length;
      order.splice(at, 0, t);
    });
    return order;
  }
  function chipsModel(b, kinds, custom) {
    var lib = libOf(custom);
    var extra = (b.chips_extra || []).slice();
    var mineC = (b.chips_custom || []).filter(function (k) { return lib[k]; });
    var chips = (b.chips || []).filter(function (k) {
      if (isCustomTok(k)) return mineC.indexOf(k.slice(CHIP_TOKEN.length)) >= 0;
      return k.indexOf('.') < 0 || extra.indexOf(k) >= 0;
    });
    var auto = !chips.length;
    var order = chipOrder(auto ? kinds : chips, extra, mineC, lib);
    var quiet = b.chips_quiet || [];
    var rows = order.map(function (k) {
      if (isCustomTok(k)) { var key = k.slice(CHIP_TOKEN.length); return { value: k, custom: true, key: key, name: lib[key].name }; }
      var own = k.indexOf('.') >= 0;
      return { value: k, own: own, quiet: !own && quiet.indexOf(k) >= 0 };
    });
    var more = (auto ? [] : kinds.filter(function (k) { return order.indexOf(k) < 0; })
      .map(function (k) { return { value: k, own: false }; }))
      .concat((custom || []).filter(function (c) { return mineC.indexOf(c.key) < 0; })
        .map(function (c) { return { value: CHIP_TOKEN + c.key, custom: true, key: c.key, name: c.name }; }));
    return { auto: auto, rows: rows, more: more };
  }
  // the Shown list, in order -> what is saved. A list that is the automatic
  // order (the kinds, own chips after them, custom chips where they say)
  // stays automatic, so a kind the house gains later still shows.
  function chipsSave(values, kinds, custom) {
    var lib = libOf(custom);
    var mine = values.filter(function (k) { return !isCustomTok(k) && k.indexOf('.') > 0; });
    var mineC = values.filter(isCustomTok).map(function (k) { return k.slice(CHIP_TOKEN.length); });
    var asAuto = chipOrder(kinds, mine, mineC, lib).join() === values.join();
    return { chips_extra: mine, chips_custom: mineC, chips: asAuto ? [] : values };
  }
  function chipsAddCustom(b, key) {
    return { chips_custom: (b.chips_custom || []).filter(function (k) { return k !== key; }).concat(key) };
  }
  function chipsRemoveCustom(b, key) {
    return { chips_custom: (b.chips_custom || []).filter(function (k) { return k !== key; }),
             chips: (b.chips || []).filter(function (k) { return k !== CHIP_TOKEN + key; }) };
  }
  // own chips come and go without leaving automatic
  // one accessory chip, or several (a picker's Select)
  function chipsAddOwn(b, ids) {
    ids = [].concat(ids);
    var extra = (b.chips_extra || []).concat(ids).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var chips = (b.chips || []).length ? b.chips.concat(ids.filter(function (id, i) {
      return b.chips.indexOf(id) < 0 && ids.indexOf(id) === i; })) : [];
    return { chips_extra: extra, chips: chips };
  }
  function chipsRemoveOwn(b, id) {
    return { chips_extra: (b.chips_extra || []).filter(function (x) { return x !== id; }),
             chips: (b.chips || []).filter(function (x) { return x !== id; }) };
  }
  function chipQuiet(b, kind, quiet) {
    var q = (b.chips_quiet || []).filter(function (k) { return k !== kind; });
    if (quiet) q.push(kind);
    return { chips_quiet: q };
  }

  // SCENES: `scenes` orders scene entities and "page:<kind>" pills;
  // `scenes_pages` says which page pills exist. Automatic (no scenes): every
  // scene A to Z on a generated screen, the YAML's list on a hand-written
  // one -- with the page pills after them.
  var PAGE_TOKEN = 'page:';
  function scenesModel(b, autoScenes, scenePages) {
    var sp = b.scenes_pages || [];
    var scenes = (b.scenes || []).filter(function (id) {
      return id.indexOf(PAGE_TOKEN) !== 0 || sp.indexOf(id.slice(PAGE_TOKEN.length)) >= 0;
    });
    var auto = !scenes.length;
    var order = (auto ? autoScenes.slice() : scenes.slice());
    sp.forEach(function (k) { if (order.indexOf(PAGE_TOKEN + k) < 0) order.push(PAGE_TOKEN + k); });
    var more = scenePages.filter(function (k) { return sp.indexOf(k) < 0; })
      .map(function (k) { return { value: PAGE_TOKEN + k, page: k }; });
    return {
      auto: auto,
      rows: order.map(function (v) { return v.indexOf(PAGE_TOKEN) === 0 ? { value: v, page: v.slice(PAGE_TOKEN.length) } : { value: v }; }),
      more: more
    };
  }
  function scenesSave(values) {
    return { scenes: values,
             scenes_pages: values.filter(function (v) { return v.indexOf(PAGE_TOKEN) === 0; })
               .map(function (v) { return v.slice(PAGE_TOKEN.length); }) };
  }
  // a page pill added or removed while automatic: only scenes_pages changes
  function scenesPagePill(b, page, on) {
    var sp = (b.scenes_pages || []).filter(function (k) { return k !== page; });
    if (on) sp.push(page);
    var out = { scenes_pages: sp };
    if ((b.scenes || []).length && !on) out.scenes = b.scenes.filter(function (v) { return v !== PAGE_TOKEN + page; });
    if ((b.scenes || []).length && on && b.scenes.indexOf(PAGE_TOKEN + page) < 0) out.scenes = b.scenes.concat(PAGE_TOKEN + page);
    return out;
  }

  // PAGES (a generated screen): the kinds, Browse Music (it comes with Play
  // Music) and the house's custom pages, in one order; `custom_pages` says
  // which custom pages this screen shows.
  function pagesModel(b, pageOrder, custom) {
    var pages = b.pages || [], cp = (b.custom_pages || []).filter(function (k) { return custom[k] !== undefined; });
    var auto = !pages.length;
    var order;
    if (auto) {
      order = pageOrder.slice();
      var ri = order.indexOf('rooms');
      cp.forEach(function (k) { order.splice(ri < 0 ? order.length : ri++, 0, k); });
    } else {
      order = pages.filter(function (k) { return pageOrder.indexOf(k) >= 0 || custom[k] !== undefined; })
        .filter(function (k) { return custom[k] === undefined || cp.indexOf(k) >= 0; });
      cp.forEach(function (k) {
        if (order.indexOf(k) >= 0) return;
        var r = order.indexOf('rooms');
        order.splice(r >= 0 ? r : order.length, 0, k);
      });
      if (order.indexOf('music') >= 0 && order.indexOf('browse') < 0) order.splice(order.indexOf('music') + 1, 0, 'browse');
      order = order.filter(function (k) { return k !== 'browse' || order.indexOf('music') >= 0; });
    }
    var more = pageOrder.filter(function (k) { return k !== 'browse' && order.indexOf(k) < 0; })
      .map(function (k) { return { value: k }; })
      .concat(Object.keys(custom).filter(function (k) { return order.indexOf(k) < 0; })
        .map(function (k) { return { value: k, custom: true }; }));
    return { auto: auto,
             rows: order.map(function (k) { return { value: k, custom: custom[k] !== undefined, fixed: k === 'browse' }; }),
             more: more };
  }
  function pagesSave(values, custom) {
    var withMusic = values.indexOf('music') >= 0;
    var keep = values.filter(function (k) { return k !== 'browse' || withMusic; });
    if (withMusic && keep.indexOf('browse') < 0) keep.splice(keep.indexOf('music') + 1, 0, 'browse');
    return { pages: keep, custom_pages: keep.filter(function (k) { return custom[k] !== undefined; }) };
  }
  // a custom page shown or not while automatic: only custom_pages changes
  function pagesCustom(b, path, on) {
    var cp = (b.custom_pages || []).filter(function (k) { return k !== path; });
    if (on) cp.push(path);
    var out = { custom_pages: cp };
    if ((b.pages || []).length) {
      var p = b.pages.filter(function (k) { return k !== path; });
      if (on) { var r = p.indexOf('rooms'); p.splice(r >= 0 ? r : p.length, 0, path); }
      out.pages = p;
    }
    return out;
  }

  // WHERE A PAGE SITS IN THE MENU: at the TOP (right under
  // Home, above Categories), under CATEGORIES, or NOT in the menu (still one
  // tap away on its chip). Two settings say it: `menu_top` -- the view paths
  // at the top (empty: the views' own `menu: top`, a generated screen's
  // Weather, Cameras and Live TV) -- and `categories` -- the view paths listed
  // under Categories (empty: automatic: the pages Home's chips open, or on a
  // generated screen, whose chip row names none, every page).
  // `items`: the pages that can be placed, in menu order:
  //   [{path, top: its own default, auto: listed when automatic}]
  var MENU_PATHS = { weather: 'weather', calendar: 'calendar', cameras: 'cameras', live_tv: 'live-tv', security: 'security',
                     doors_windows: 'doors-windows', climate: 'climate', lights: 'lights', timers: 'timers',
                     vacuums: 'vacuums', music: 'playmusic', water: 'water' };
  var MENU_TOPS = { weather: 1, cameras: 1, live_tv: 1 };
  var MENU_FIXED = { browse: 'With Play Music', rooms: 'Under Rooms' };
  var MENU_PLACES = [['top', 'Top of Menu'], ['list', 'Categories'], ['off', 'Not in Menu']];
  var NO_TOP = '-';
  function menuPathOf(k, custom) { return MENU_PATHS[k] || (custom && custom[k] !== undefined ? k : null); }
  // a generated screen's pages (kinds and custom pages, in its order) as items
  function menuItems(keys, custom) {
    var out = [];
    keys.forEach(function (k) {
      var p = menuPathOf(k, custom);
      if (p) out.push({ path: p, key: k, top: !!MENU_TOPS[k], auto: true });
    });
    return out;
  }
  function topsOf(b, items) {
    return (b.menu_top || []).length ? b.menu_top.slice()
      : items.filter(function (it) { return it.top; }).map(function (it) { return it.path; });
  }
  function placeOf(b, it, items) {
    if (topsOf(b, items).indexOf(it.path) >= 0) return 'top';
    var c = b.categories || [];
    if (c.length) return c.indexOf(it.path) >= 0 ? 'list' : 'off';
    return it.auto ? 'list' : 'off';
  }
  // one page to a place -> {menu_top, categories}; null when that cannot be
  // said (no page left under Categories, where empty means automatic)
  function placeSet(b, items, path, place) {
    var order = items.map(function (it) { return it.path; });
    var tops = topsOf(b, items).filter(function (p) { return p !== path && order.indexOf(p) >= 0; });
    var listed = items.filter(function (it) {
      return it.path !== path && tops.indexOf(it.path) < 0 && placeOf(b, it, items) === 'list';
    }).map(function (it) { return it.path; });
    if (place === 'top') tops.push(path);
    if (place === 'list') listed.push(path);
    tops = order.filter(function (p) { return tops.indexOf(p) >= 0; });
    listed = order.filter(function (p) { return listed.indexOf(p) >= 0; });
    var same = function (x, y) { return x.length === y.length && x.every(function (p) { return y.indexOf(p) >= 0; }); };
    var defTops = items.filter(function (it) { return it.top; }).map(function (it) { return it.path; });
    var auto = items.filter(function (it) { return it.auto && tops.indexOf(it.path) < 0; }).map(function (it) { return it.path; });
    // nothing at the top at all is NO_TOP: an empty list means "the views' own"
    var out = { menu_top: same(tops, defTops) ? [] : tops.length ? tops : [NO_TOP] };
    if (same(listed, auto)) out.categories = [];
    else if (!listed.length) return null;
    else out.categories = listed;
    return out;
  }

  // ROOMS: `room_order` (areas, in order) and `home_rooms`: Shown = the
  // rooms on Home. All shown in order = "order"; some = "only".
  function roomsModel(b, areasAZ) {
    var ro = (b.room_order || []).filter(function (a) { return areasAZ.indexOf(a) >= 0; });
    var auto = !ro.length;
    var only = b.home_rooms === 'only' && !auto;
    var rows = auto ? areasAZ.slice() : only ? ro : ro.concat(areasAZ.filter(function (a) { return ro.indexOf(a) < 0; }));
    var more = auto || !only ? [] : areasAZ.filter(function (a) { return ro.indexOf(a) < 0; });
    return { auto: auto, rows: rows.map(function (a) { return { value: a }; }),
             more: more.map(function (a) { return { value: a }; }) };
  }
  function roomsSave(values, areasAZ) {
    return { room_order: values, home_rooms: values.length < areasAZ.length ? 'only' : 'order' };
  }
  // back to automatic: no order, Home as the screen lists its rooms
  function roomsAuto() { return { room_order: [], home_rooms: 'as_is' }; }
  // ALL SCREENS' ROOMS (settings `rooms`) as a screen's keys, and back: the
  // same list editor and model serve both
  function houseRoomsAsBoard(r) {
    r = r || {};
    return { room_order: r.order || [], home_rooms: r.home || 'as_is', menu_rooms: r.menu || 'az', page_rooms: r.pages || 'floor' };
  }
  function houseRoomsSave(ch) {
    var out = {};
    if ('room_order' in ch) out['rooms.order'] = ch.room_order;
    if ('home_rooms' in ch) out['rooms.home'] = ch.home_rooms;
    if ('menu_rooms' in ch) out['rooms.menu'] = ch.menu_rooms;
    if ('page_rooms' in ch) out['rooms.pages'] = ch.page_rooms;
    return out;
  }
  // ONE ROOM ON HOME, or not (a room's own Show on Home): the order as it
  // stands, with the room taken out or added at its end
  function roomOnHome(b, areasAZ, area, on) {
    var rows = roomsModel(b, areasAZ).rows.map(function (r) { return r.value; });
    var has = rows.indexOf(area) >= 0;
    if (on === has) return null;
    return roomsSave(on ? rows.concat(area) : rows.filter(function (a) { return a !== area; }), areasAZ);
  }
  function roomsSummary(b) {
    return !(b.room_order || []).length ? 'Automatic' : b.home_rooms === 'only' ? b.room_order.length + ' on Home' : 'Custom Order';
  }

  // CAMERAS: automatic = one of every camera (its low channel)
  function camerasModel(b, ok, autoCams) {
    var cams = (b.cameras || []).filter(function (id) { return ok.indexOf(id) >= 0; });
    var auto = !cams.length;
    var rows = auto ? autoCams.slice() : cams;
    return { auto: auto, rows: rows.map(function (id) { return { value: id }; }),
             more: auto ? [] : ok.filter(function (id) { return rows.indexOf(id) < 0; }).map(function (id) { return { value: id }; }) };
  }
  // one camera per device, its low-resolution channel when it has several
  function autoCameras(ids, deviceOf) {
    var byDev = {}, out = [];
    ids.slice().sort().forEach(function (id) {
      var d = deviceOf(id) || id;
      if (!(d in byDev)) { byDev[d] = id; out.push(id); }
      else if (/low/.test(id) && !/low/.test(byDev[d])) { out[out.indexOf(byDev[d])] = id; byDev[d] = id; }
    });
    return out;
  }

  // LIVE CAMERA FOLLOWS (a screen's Cameras): a dropdown helper whose option
  // names the camera the strip plays live. An option names a camera when it
  // is the camera's name or the start of it (hk-cameras.js _optionOf: "Deck"
  // is "Deck Low resolution channel"). For each camera: the option to give
  // it -- its device's name, which its entities' names start with, else its
  // own name -- and the sensor on the same device to follow, a person sensor
  // before a motion one. With a dropdown already chosen (`have`: its
  // options), a camera keeps the option the dropdown has for it (the longest
  // that names it, as the strip picks); one it has none for is `missing`.
  //   cams     [{entity, name, device, deviceName}]
  //   sensors  [{entity, device, kind: 'person' | 'motion'}]
  function liveNames(option, names) {
    var t = String(option || '').toLowerCase();
    return !!t && names.some(function (n) {
      n = String(n || '').toLowerCase();
      return n === t || n.indexOf(t + ' ') === 0;
    });
  }
  function livePlan(cams, sensors, have) {
    var taken = {};
    return (cams || []).map(function (c) {
      var name = String(c.name || c.entity);
      var option = String(c.deviceName || '').trim();
      if (!option || !liveNames(option, [name]) || taken[option.toLowerCase()]) option = name;
      var missing = false;
      if (have) {
        var best = null;
        have.forEach(function (o) {
          if (liveNames(o, [name]) && (!best || String(o).length > best.length)) best = String(o);
        });
        if (best) option = best; else missing = true;
      }
      taken[option.toLowerCase()] = true;
      var mine = (sensors || []).filter(function (s) { return c.device && s.device === c.device; });
      var pick = mine.filter(function (s) { return s.kind === 'person'; })[0] ||
                 mine.filter(function (s) { return s.kind === 'motion'; })[0] || null;
      return { entity: c.entity, name: name, option: option, sensor: pick ? pick.entity : null, missing: missing };
    });
  }
  // The automation, as YAML to paste into the automation editor: each
  // camera's sensor turning on picks that camera; five quiet minutes on all
  // of them go back to the first camera. Only cameras the dropdown has an
  // option for (a missing one would fail). Null when no camera has a sensor.
  // Every string is written as JSON, which YAML reads as a quoted string.
  function liveYaml(plan, selector) {
    var q = JSON.stringify;
    var usable = (plan || []).filter(function (p) { return !p.missing; });
    var withSensor = usable.filter(function (p) { return p.sensor; });
    if (!withSensor.length) return null;
    var domain = String(selector || '').split('.')[0] === 'select' ? 'select' : 'input_select';
    var all = withSensor.map(function (p) { return p.sensor; });
    var list = function (pad) { return all.map(function (s) { return pad + '- ' + s; }).join('\n'); };
    var pickLines = function (pad, option) {
      return [pad + '- action: ' + domain + '.select_option', pad + '  target:', pad + '    entity_id: ' + selector,
              pad + '  data:', pad + '    option: ' + option].join('\n');
    };
    var out = ['alias: Live camera follows motion',
      'description: ' + q('Plays the camera where a person or motion was just seen live on the camera strip, ' +
                          'and the first camera again after five quiet minutes.'),
      'mode: queued', 'triggers:'];
    withSensor.forEach(function (p) {
      out.push('  - trigger: state', '    entity_id: ' + p.sensor, '    to: "on"', '    id: ' + q(p.option));
    });
    out.push('  - trigger: state', '    entity_id:', list('      '), '    to: "off"', '    for:', '      minutes: 5',
             '    id: all quiet', 'actions:', '  - if:', '      - condition: trigger', '        id: all quiet', '    then:',
             '      - condition: state', '        entity_id:', list('          '), '        state: "off"',
             pickLines('      ', q(usable[0].option)), '    else:', pickLines('      ', q('{{ trigger.id }}')));
    return out.join('\n') + '\n';
  }

  // A LIST'S REORDER: the Shown values after moving `from` to `to`
  function move(values, from, to) {
    var v = values.slice();
    if (from < 0 || from >= v.length) return v;
    to = Math.max(0, Math.min(v.length - 1, to));
    var m = v.splice(from, 1)[0];
    v.splice(to, 0, m);
    return v;
  }

  // ------------------------------------------------------------ the sky
  function mmdd(v) {
    var m = /^(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? { month: Number(m[1]), day: Number(m[2]) } : null;
  }
  function dateLabel(v) {
    if (v === 'thanksgiving') return 'Thanksgiving Day';
    var d = mmdd(v);
    return d ? MONTHS[d.month - 1].slice(0, 3) + ' ' + d.day : String(v || '');
  }
  // a theme's date: what is saved, else built in (for the hemisphere)
  function skyDate(sky, builtIn, prefix, end) {
    var own = sky[prefix + '_' + end];
    var hemi = sky.hemisphere === 'south' ? 'south' : 'north';
    var b = builtIn[prefix] ? builtIn[prefix][hemi][end === 'from' ? 0 : 1] : null;
    return { own: !!own, value: own || b, builtIn: b };
  }

  // ------------------------------------------------------------ your own dashboards
  // WHAT A DASHBOARD YOU WRITE YOURSELF CAN USE (Advanced -> Your Own
  // Dashboards, and the wiki's Your-Own-Dashboard page, which a test holds to
  // exactly these snippets). {weather}, {user}, {photos}: filled in from the
  // house on the settings page, the defaults below in the wiki.
  var YAML_DEFAULTS = { weather: 'weather.home', user: 'Kitchen Tablet', photos: 'media-source://media_source/local/photos' };
  var YAML_REF = [
    { header: 'The Dashboard', footer: 'At the top of the dashboard’s raw configuration (Edit Dashboard → ⋮ → Raw Configuration Editor), beside views:.',
      items: [
        { id: 'kiosk', title: 'Hide Header & Sidebar', key: 'hk_kiosk', anchor: 'hide-home-assistants-header-and-sidebar',
          sub: 'Or turn on Hide Home Assistant Header & Sidebar in the screen’s HK settings, with nothing written. A kiosk_mode block (the Kiosk Mode plugin’s) wins over both.',
          yaml: 'hk_kiosk:\n  header: true        # Home Assistant’s header\n  sidebar: true       # ...and its sidebar\n  admins: true        # false: an admin still sees them' },
        { id: 'screensaver', title: 'Photo Screensaver', key: 'hk_screensaver', anchor: 'photo-screensaver',
          sub: 'Or turn on Photo Screensaver in the screen’s HK settings, with nothing written, and get its switch and In Use sensor too.',
          yaml: 'hk_screensaver:\n  user: {user}   # the tablet’s Home Assistant user\n' +
                '  entity: input_boolean.kitchen_photos   # optional: yours, kept in step\n' +
                '  photos: {photos}\n  starts_after: 180\n  each_photo: 30\n  order: random        # or sorted\n  fill: true\n  zoom: false\n' +
                '  show: photos         # photos, both (Photos & Forecast) or forecast\n' +
                '  forecast_every: 5    # both: the forecast after this many photos\n' +
                '  fallback: true       # no photos: the forecast (false: a dark screen)\n' +
                '  band: true           # the forecast’s details on the forecast\n' +
                '  band_photos: false   # ...and over the photos\n' +
                '  calendar: false      # the calendar pane, down the right\n' +
                '  calendar_days: 2     # ...today and tomorrow (1 to 7 days)\n' +
                '  cards:\n    - type: custom:hk-clock-card\n    - type: custom:hk-weather-strip-card\n      variant: inline\n' +
                '    - type: custom:hk-screensaver-now-card\n      music: true\n    - type: custom:hk-timer-strip-card\n' +
                '      entity: sensor.running_quick_timers\n      fixed: true\n    - type: custom:hk-screensaver-status-card' },
        { id: 'sky', title: 'Live Sky', key: 'sky', anchor: 'live-sky',
          sub: 'The dashboard opts in with sky:, and each view that wants it says sky: true.',
          yaml: 'sky:\n  enable: input_boolean.live_sky   # optional: off hides the sky\nviews:\n  - title: Home\n    path: home\n' +
                '    type: custom:hk-grid-view\n    sky: true\n    cards: []' }] },
    { header: 'Views', footer: 'Each view in views:. The menu lists them: the first view is Home.',
      items: [
        { id: 'view', title: 'A Page in the Menu', key: 'hk-grid-view', anchor: 'a-page-in-the-menu',
          sub: 'HK Frontend’s grid view, placed in the menu. A view with area: is a room.',
          yaml: '- title: Kitchen\n  path: kitchen\n  type: custom:hk-grid-view\n  area: kitchen       # a room, in the menu’s Rooms\n' +
                '  menu: top           # right under Home (false: not listed)\n  cards: []' },
        { id: 'room', title: 'A Room Page, Built for You', key: 'hk-room', anchor: 'a-room-page-built-for-you',
          sub: 'Built from the area every time it opens.',
          yaml: '- title: Kitchen\n  path: room-kitchen\n  subview: true\n  strategy:\n    type: custom:hk-room\n    area: kitchen' }] },
    { header: 'Cards', footer: 'Anywhere in a view’s cards:. Every HK card is in the card picker too, with a visual editor.',
      items: [
        { id: 'header', title: 'Clock, Weather & Chips', key: 'hk-header-card', anchor: 'clock-weather-and-chips',
          sub: 'The header, and the status chips under it. The chips and scenes follow the screen’s HK settings.',
          yaml: '- type: custom:hk-header-card\n- type: custom:hk-chips-card\n- type: custom:hk-scenes-card' },
        { id: 'cameras', title: 'Cameras', key: 'hk-camera-mosaic-card', anchor: 'cameras',
          sub: 'The camera strip: one camera live, the others as stills. Its cameras follow the screen’s HK settings.',
          yaml: '- type: custom:hk-camera-mosaic-card' },
        { id: 'weather', title: 'Forecast', key: 'hk-weather-band-card', anchor: 'forecast',
          sub: 'Now, the next hours and the coming days.',
          yaml: '- type: custom:hk-weather-band-card\n  entity: {weather}' },
        { id: 'live_tv', title: 'Live TV', key: 'hk-tv-guide-card', anchor: 'live-tv',
          sub: 'Every channel with what is on; a tap plays one full screen. Needs the Live TV feature.',
          yaml: '- type: custom:hk-tv-guide-card\n  title: Live TV' },
        { id: 'clean_areas', title: 'Clean Areas', key: 'hk-area-select-card', anchor: 'clean-areas',
          sub: 'Pick rooms floor by floor, then clean just those. Needs the Clean Areas feature.',
          yaml: '- type: custom:hk-area-select-card' },
        { id: 'music', title: 'Music', key: 'hk-speaker-picker-card', anchor: 'music',
          sub: 'What is playing, the speakers and playlists, and the library. Needs the Music feature.',
          yaml: '- type: custom:hk-now-playing-card\n  music: true\n- type: custom:hk-speaker-picker-card\n- type: custom:hk-library-card\n  music: true' },
        { id: 'timers', title: 'Timers', key: 'hk-timers-page-card', anchor: 'timers',
          sub: 'Quick start, the running timers and the New Timer keypad, as one card.',
          yaml: '- type: custom:hk-timers-page-card' }] },
    { header: 'Automations', footer: 'Actions of HK Frontend’s, for your automations and scripts.',
      items: [
        { id: 'clean_action', title: 'Clean Some Rooms', key: 'hk_frontend.clean_areas', anchor: 'clean-some-rooms',
          sub: 'Each vacuum cleans the rooms on its own map.',
          yaml: 'action: hk_frontend.clean_areas\ndata:\n  areas:\n    - kitchen\n    - dining_room' },
        { id: 'saver_action', title: 'Start or Stop the Photos', key: 'switch.turn_on', anchor: 'start-or-stop-the-photos',
          sub: 'A screen’s Photo Screensaver switch (HK settings’ screensaver only): on starts the photos, off closes them.',
          yaml: 'action: switch.turn_on\ntarget:\n  entity_id: switch.kitchen_photo_screensaver' }] },
    { header: 'The Address', footer: 'After a screen’s address, for one visit.',
      items: [
        { id: 'address', title: 'For One Visit', key: '?hk_kiosk=off', anchor: 'for-one-visit',
          sub: 'Home Assistant’s header and sidebar back, or no screensaver, while you work on a tablet. A reload is the screen as set again.',
          yaml: '/dashboard-kitchen/0?hk_kiosk=off   # the header and sidebar, until a reload\n' +
                '/dashboard-kitchen/0?hk_saver=off   # no screensaver on this page' }] }
  ];
  // one snippet, filled in (`ctx` over YAML_DEFAULTS)
  function yamlRefText(item, ctx) {
    var c = Object.assign({}, YAML_DEFAULTS, ctx || {});
    return String(item.yaml).replace(/\{(weather|user|photos)\}/g, function (m, k) { return c[k] || YAML_DEFAULTS[k]; });
  }
  function yamlRefItem(id) {
    var out = null;
    YAML_REF.forEach(function (g) { g.items.forEach(function (it) { if (it.id === id) out = it; }); });
    return out;
  }

  // ------------------------------------------------------------ search
  // Every setting the page has, where it is, and words people might use.
  // `screen: true` rows are on every screen's page.
  var SEARCH = [
    ['Menu', 'screen', 'menu', 'sidebar drawer navigation off button always open docked', true],
    ['Menu Settings', 'screen/menu', 'menu_custom', 'same as all screens own menu this screen', true],
    ['Pages in Menu', 'screen/menu-pages', 'categories', 'categories menu list', true],
    ['On Phones', 'screen', 'phone_header', 'phone weather strip clock header narrow', true],
    ['Home Page', 'screen/pages', 'home_page', 'only custom pages energy panel no home', true],
    ['Home', 'screen/pages', 'home_view', 'home page custom first page car generated', true],
    ['Rooms in Menu', 'screen/rooms', 'menu_rooms', 'a to z order', true],
    ['Status Chips', 'screen/chips', 'chips', 'chip row only when active quiet', true],
    ['Cameras', 'screen/cameras', 'cameras', 'camera strip live camera', true],
    ['Live Camera Follows', 'screen/cameras/live', 'camera_live', 'live camera follows motion person detection dropdown input select automation', true],
    ['Scenes', 'screen/scenes', 'scenes', 'scene pills row', true],
    ['Favorites', 'screen/favorites', 'favorites', 'favourites', true],
    ['Rooms', 'screen/rooms', 'rooms_custom', 'room order home rooms on pages same as all screens', true],
    ['Pages', 'screen/pages', 'pages', 'category pages custom pages', true],
    ['Glass', 'screen/glass', 'glass', 'look blur frosted clear', true],
    ['Live Sky', 'screen', 'sky', 'background animated', true],
    ['Sky / Background', 'screen/sky', 'sky_look', 'backdrop animations weather decorations palette own look', true],
    ['Hide Home Assistant Header & Sidebar', 'screen', 'kiosk', 'kiosk mode', true],
    ['Return to Home When Idle', 'screen', 'idle_return', 'idle timeout wall tablet', true],
    ['Tablet Room', 'screen', 'idle_room', 'wall tablet room helpers', true],
    ['Allow Pop-ups', 'screen', 'popups', 'answer doorbell alarm popup', true],
    ['On Narrow Screens', 'screen/menu-narrow', 'narrow', 'phone ipad chip tab folded when folded', true],
    ['Car Browser', 'screen', 'car', 'tesla viewport', true],
    ['Rename Screen', 'screen', 'rename', 'rename name title dashboard sidebar pencil', true],
    ['Now Playing Bar', 'screen', 'now_playing', 'music media bar', true],
    ['Photo Screensaver', 'screen', 'screensaver', 'photos wall tablet slideshow', true],
    ['Screensaver Options', 'screen/screensaver', 'screensaver_options', 'photo timing starts after each photo order random slideshow', true],
    ['Screensaver for All Screens', 'house/tablets/screensaver', 'look.saver', 'screensaver all screens global default every tablet'],
    ['Same as All Screens (Screensaver)', 'screen/screensaver', 'saver:house', 'screensaver all screens own global', true],
    ['Screensaver Shows', 'screen/screensaver', 'saver:show', 'screensaver forecast weather photos no photos landscape', true],
    ['Forecast When There Are No Photos', 'screen/screensaver', 'saver:fallback', 'screensaver forecast fallback empty folder dark', true],
    ['Forecast Details (Screensaver)', 'screen/screensaver', 'saver:band', 'screensaver forecast band days hours multi-day details bottom', true],
    ['Photos & Forecast', 'screen/screensaver', 'saver:forecast_every', 'screensaver forecast every photos slide mix both', true],
    ['Slow Zoom', 'screen/screensaver', 'saver:zoom', 'screensaver photo zoom ken burns', true],
    ['Over the Photos', 'screen/screensaver', 'saver:clock', 'screensaver clock weather now playing music timers', true],
    ['Calendar Pane', 'screen/screensaver', 'saver:calendar', 'screensaver calendar events agenda pane right side upcoming today tomorrow days', true],
    ['Home Status', 'screen/screensaver', 'saver:status', 'screensaver security secured locks doors alarm top right', true],
    ['Screensaver Switch', 'screen/screensaver', 'saver:ent:switch', 'screensaver photo switch automation entity turn on off bedtime doorbell', true],
    ['Screen In Use', 'screen/screensaver', 'saver:ent:binary_sensor', 'in use touched tablet binary sensor automation window starts after timer', true],
    ['Use WallPanel Instead', 'screen/screensaver', 'b:screensaver_engine', 'wallpanel hacs screensaver', true],
    ['Your Own Dashboards', 'advanced', 'yaml-ref', 'yaml reference own dashboard hand written raw configuration snippets examples copy'],
    ['Header & Sidebar', 'screen/kiosk', 'kiosk_page', 'kiosk hide header sidebar what is hidden', true],
    ['Hide Header', 'screen/kiosk', 'kiosk_header', 'kiosk header toolbar top bar title views', true],
    ['Hide Sidebar', 'screen/kiosk', 'kiosk_sidebar', 'kiosk sidebar drawer', true],
    ['For Admins Too', 'screen/kiosk', 'kiosk_admins', 'kiosk header sidebar admin administrators', true],
    ['Use the Kiosk Mode Plugin Instead', 'screen/kiosk', 'kiosk_engine', 'kiosk mode plugin hacs', true],
    ['Kiosk Mode Options', 'screen/kiosk-mode', 'kiosk_options', 'kiosk mode plugin yaml header sidebar admins', true],
    ['Alarm Panel', 'house/general', 'security.alarm', 'security keypad'],
    ['Indoor Temperature', 'house/general', 'features.temperature', 'climate chip'],
    ['Power Use', 'house/general', 'features.power', 'energy chip watts'],
    ['House Timers', 'house/general/timers', 'features.house_timers', 'nap bedtime timers page'],
    ['What Counts', 'house/counts', 'counts', 'lights fans doors windows locks blinds leaks thermostats timers vacuums speakers count chips'],
    ['Weather Service', 'house/weather', 'weather.entity', 'forecast'],
    ['Place', 'house/weather', 'weather.place', 'location label'],
    ['Weather Sensors', 'house/weather/sensors', 'weather.sensors', 'feels like humidity wind gust uv forecast alerts outside temperature'],
    ['Radar Map', 'house/weather/radar', 'weather.radar', 'weather radar card yaml zoom noaa rainviewer'],
    ['Calendars', 'house/calendar', 'calendar.entities', 'calendar page events agenda month week day which calendars order'],
    ['Calendar Colors', 'house/calendar', 'calendar.colors', 'calendar colour color events dot'],
    ['Glass Style', 'house/appearance/glass', 'look.glass', 'blur frosted clear look'],
    ['Frost Amount', 'house/appearance', 'look.frost', 'frosted'],
    ['Blur Amount', 'house/appearance', 'look.blur', 'blur strength'],
    ['HK Detail Sheets', 'house/appearance', 'look.details', 'more info dialog sheet'],
    ['Sky Switch', 'house/sky', 'look.sky_switch', 'live sky helper'],
    ['Animations', 'house/sky', 'sky.animations', 'sky moving clouds seasons'],
    ['Weather', 'house/sky', 'sky.weather', 'sky clouds rain snow fog'],
    ['Backdrop', 'house/sky/backdrop', 'sky.gradient', 'backdrop palette gradient fixed sky color dusk midnight fjord dune graphite plum ember mist custom'],
    ['Seasonal Decorations', 'house/sky', 'sky.decorations', 'holiday halloween christmas'],
    ['Birthdays', 'house/sky/birthday', 'sky.birthdays', 'balloons'],
    ['Hemisphere', 'house/sky/advanced', 'sky.hemisphere', 'southern northern'],
    ['Moon Phase Sensor', 'house/sky/advanced', 'sky.moon', ''],
    ['Holiday Season Sensor', 'house/sky/advanced', 'sky.holidays', 'calendar'],
    ['Menu Button Icon', 'house/menu', 'menu.glyph', 'glyph sidebar lines hamburger'],
    ['Tap Clock to Open Menu', 'house/menu', 'menu.clock', ''],
    ['Highlight Color', 'house/menu/accent', 'menu.accent', 'menu color colour accent tint orange icons selected page highlight'],
    ['Button Style', 'house/menu/style', 'menu.style', 'menu chip tab edge pinned'],
    ['On Narrow Screens', 'house/menu/narrow', 'menu.narrow', 'menu when folded chip tab phone ipad'],
    ['Tab Position', 'house/menu', 'menu.tab_at', 'edge tab height level with date from top'],
    ['Tab Size', 'house/menu', 'menu.tab_size', 'edge tab menu bigger larger touch target tablet'],
    ['Tab Size on Phones', 'house/menu', 'menu.tab_size_phone', 'edge tab menu bigger larger touch target phone iphone'],
    ['Keep Open Down To', 'house/menu', 'menu.open_min', 'menu fold width docked always open'],
    ['Time & Weather in Menu', 'house/menu', 'menu.time_weather_at', 'clock header always open'],
    ['Home Assistant Section', 'house/menu', 'menu.ha_row', 'sidebar settings access integrations automations notifications profile show menu'],
    ['Rooms', 'house/rooms', 'rooms.order', 'rooms all screens settings scenes'],
    ['Room Order', 'house/rooms/order', 'rooms.order', 'rooms on home order which rooms'],
    ['Rooms in Menu', 'house/rooms', 'rooms.menu', 'a to z order menu rooms'],
    ['Rooms on Pages', 'house/rooms', 'rooms.pages', 'by floor room order lights climate'],
    ['Room Headings Open Room Pages', 'house/rooms', 'rooms.headings', 'room page link'],
    ['Room Status Row', 'house/rooms/status', 'rooms.status', 'room page temperature humidity'],
    ['Climate Status', 'house/climate', 'climate.status', 'temperature humidity ranges blinds fans room exclusions'],
    ['Browse Music Categories', 'features/music/categories', 'browse.hide', 'artists albums songs playlists radio podcasts audiobooks'],
    ['Discover Rows', 'features/music/discover', 'browse.discover', 'recently played favorites most played'],
    ['Browse Page', 'features/music', 'look.browse_view', 'music browse view'],
    ['Default Idle Time', 'house/tablets', 'idle.default', 'wall tablet idle seconds'],
    ['Screensaver Photos', 'house/tablets', 'look.photos', 'media folder wallpanel'],
    ['Hidden from Screens', 'accessories/hidden', 'generated.exclude', 'leave out hide rooms devices'],
    ['Also Shown', 'accessories/also', 'generated.include_entities', 'add entities more'],
    ['Vacuums Page Order', 'accessories/page/vacuums', 'accessories.pages.vacuums', 'vacuum order'],
    ['Security Page Order', 'accessories/page/security', 'accessories.pages.security', 'locks garage door order'],
    ['Pop-ups', 'popups', 'popups', 'doorbell alarm hash'],
    ['Custom Pages', 'pages', 'custom_pages', 'energy ecoflow yaml page'],
    ['Clock Sensors', 'advanced', 'clock.time', 'time date'],
    ['Clean-Areas Script', 'advanced', 'features.vacuum_script', 'vacuum'],
    ['Wrong-Code Indicator', 'advanced', 'features.alarm_bad_code', 'alarm keypad'],
    ['Show in Sidebar', 'advanced', 'sidebar', 'hk settings panel sidebar'],
    ['Files Folder', 'advanced', 'files_folder', 'font sf pro glyphs icons'],
    ['Setup Check', 'check', 'check', 'problems diagnostics'],
    ['Setup Assistant', 'setup', 'setup', 'wizard']
  ];
  // matches for `q`: [{label, route, key, where}] -- a screen setting once
  // per screen (`screens`: [{path, title}])
  function search(q, screens, extra) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    var words = q.split(/\s+/);
    var hit = function (text) { text = text.toLowerCase(); return words.every(function (w) { return text.indexOf(w) >= 0; }); };
    var out = [];
    SEARCH.forEach(function (s) {
      if (!hit(s[0] + ' ' + s[3])) return;
      if (s[4]) {
        (screens || []).forEach(function (x) {
          out.push({ label: s[0], route: s[1].replace(/^screen/, 'screens/' + x.path), key: s[2], where: x.title });
        });
      } else {
        out.push({ label: s[0], route: s[1], key: s[2], where: null });
      }
    });
    (extra || []).forEach(function (e) { if (hit(e.label + ' ' + (e.words || ''))) out.push(e); });
    return out;
  }

  // THE PREVIEW'S SIZE (a screen's page, under its preview). The frame IS
  // that device's size -- the dashboard lays itself out by its own window,
  // so a phone gets the phone layout -- drawn scaled down to the column.
  // Car only where Car Browser is on (tesla-viewport.js zooms that frame
  // as it does the car). hk: glyphs fall back to Material's of the same name.
  // THE SCREENSAVER'S OPTIONS (settings.py SAVER_DEFAULTS): what a screen
  // starts from, and whether it has changed any
  var SAVER_DEFAULTS = { starts_after: 180, each_photo: 30, order: 'random', fill: true, zoom: false,
                         clock: true, weather: true, music: true, timers: true, status: true, show: 'photos', fallback: true, forecast_every: 5,
                         band: true, band_photos: false, calendar: false, calendar_days: 2 };
  function saverOptions(o) {
    var out = {};
    Object.keys(SAVER_DEFAULTS).forEach(function (k) {
      out[k] = o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : SAVER_DEFAULTS[k];
    });
    return out;
  }
  // COPY SETTINGS FROM ANOTHER SCREEN: every screen setting is in exactly
  // one group here or in COPY_NEVER (settings.py BOARD_DEFAULTS -- a Python
  // test holds the two together). [key, label, board keys, copied by default]
  var COPY_GROUPS = [
    // a screen's menu: All Screens' or its own (menu_custom)
    ['menu', 'Menu', ['menu', 'menu_custom', 'dock_min', 'time_weather', 'ha_row', 'categories', 'tab_position', 'tab_size',
                      'tab_size_phone', 'menu_top', 'narrow', 'phone_header', 'accent', 'glyph', 'clock'], true],
    ['home', 'Home Page', ['home_page', 'home_view', 'chips_row', 'chips', 'chips_quiet', 'chips_extra', 'chips_custom'], true],
    // a screen's rooms: All Screens' or its own (rooms_custom)
    ['rooms', 'Rooms', ['rooms_custom', 'room_order', 'home_rooms', 'menu_rooms', 'page_rooms'], true],
    ['cameras', 'Cameras', ['camera_strip', 'cameras', 'camera_live'], true],
    ['scenes', 'Scenes', ['scenes_row', 'scenes', 'scenes_pages'], false],
    ['favorites', 'Favorites', ['favorites'], false],
    ['pages', 'Pages', ['pages', 'custom_pages'], true],
    ['look', 'Appearance', ['glass', 'frost', 'blur', 'sky', 'sky_animations', 'sky_weather',
                            'sky_decorations', 'sky_gradient', 'sky_custom'], true],
    ['behavior', 'Behavior', ['idle_return', 'popups', 'car', 'kiosk', 'kiosk_header', 'kiosk_sidebar', 'kiosk_admins',
                              'kiosk_engine', 'kiosk_options', 'now_playing'], true],
    ['saver', 'Screensaver', ['screensaver', 'screensaver_options', 'screensaver_engine', 'wallpanel_options'], true]
  ];
  // a screen's own tablet: never copied
  var COPY_NEVER = ['tablet_user', 'idle_room'];
  function copyDefaults() { return COPY_GROUPS.filter(function (g) { return g[3]; }).map(function (g) { return g[0]; }); }
  // the changes that copy `groups` of the screen `src` (its settings as read)
  function copyChanges(src, groups) {
    var out = {};
    COPY_GROUPS.forEach(function (g) {
      if (!src || (groups || []).indexOf(g[0]) < 0) return;
      g[2].forEach(function (k) {
        // a screen following All Screens' screensaver: the copy follows too
        if (k === 'screensaver_options') { out[k] = saverFollows(src) ? null : JSON.parse(JSON.stringify(src[k])); return; }
        if (src[k] !== undefined) out[k] = src[k] === null ? null : JSON.parse(JSON.stringify(src[k]));
      });
    });
    return out;
  }
  // A SCREEN FOLLOWS ALL SCREENS' SCREENSAVER when its own options are null
  // (a save hands back the stored form) or the feed says so (resolved)
  function saverFollows(b) { return !!b && (b.screensaver_house === true || b.screensaver_options == null); }
  // one line for a nav row: what shows, and when
  // A SCREEN'S Header & Sidebar row: what is hidden, and by whom
  function kioskSummary(b, generated) {
    if (!b || !b.kiosk) return 'Off';
    if (generated && b.kiosk_engine === 'kiosk_mode') return 'Kiosk Mode Plugin';
    var h = b.kiosk_header !== false, sd = b.kiosk_sidebar !== false;
    return h && sd ? 'Both Hidden' : h ? 'Header Hidden' : sd ? 'Sidebar Hidden' : 'Nothing Hidden';
  }
  function saverSummary(o) {
    o = saverOptions(o);
    var show = o.show === 'forecast' ? 'Forecast' : o.show === 'both' ? 'Photos & Forecast' : 'Photos';
    var n = o.starts_after, t = n < 60 ? n + ' s' : (n % 60 ? Math.round(n / 6) / 10 : n / 60) + ' min';
    return show + ' · ' + t;
  }
  function saverCustom(o) {
    var cur = saverOptions(o);
    return Object.keys(SAVER_DEFAULTS).some(function (k) { return cur[k] !== SAVER_DEFAULTS[k]; });
  }
  var PREVIEW_SIZES = [
    { key: 'phone', label: 'Phone', w: 390, h: 844, icon: 'hk:cellphone' },
    { key: 'portrait', label: 'Tablet Portrait', short: 'Portrait', w: 820, h: 1180, icon: 'hk:tablet', rotate: true },
    { key: 'landscape', label: 'Tablet Landscape', short: 'Landscape', w: 1280, h: 800, icon: 'hk:tablet' },
    { key: 'desktop', label: 'Desktop', w: 1440, h: 900, icon: 'hk:monitor' },
    { key: 'car', label: 'Car', w: 804, h: 638, icon: 'hk:car' }
  ];
  function previewSizes(b) {
    return PREVIEW_SIZES.filter(function (z) { return z.key !== 'car' || !!(b && b.car); });
  }
  // the size the screen is used at: a car's browser, a wall tablet (its own
  // user, WallPanel, back to Home when idle), else a desk
  function previewDefault(b) {
    if (!b) return 'desktop';
    if (b.car) return 'car';
    if (b.tablet_user || b.screensaver || b.idle_return) return 'landscape';
    return 'desktop';
  }
  // as wide as the column, no taller than maxH: the scale and the box
  function previewFit(width, maxH, z) {
    var s = Math.min((width || 400) / z.w, (maxH || 560) / z.h);
    return { scale: s, width: z.w * s, height: z.h * s };
  }

  // THE SKY'S PREVIEW (HK Settings -> Sky and each theme's page): which
  // screen shows it -- the house's Home if there is one, else a wall
  // tablet's, else the first screen -- always a generated one with its
  // sky on and a Home page to show it on.
  function skyPreviewScreen(dashboards, boards) {
    boards = boards || {};
    var ok = (dashboards || []).filter(function (d) {
      var b = boards[d.path] || {};
      return d && d.item && d.generated && b.sky !== false && b.home_page !== false;
    });
    var home = ok.filter(function (d) { return /^home$/i.test(String(d.title || '').trim()) || d.path === 'dashboard-home'; })[0];
    var wall = ok.filter(function (d) { var b = boards[d.path] || {}; return b.tablet_user || b.screensaver; })[0];
    return (home || wall || ok[0] || {}).path || null;
  }
  // the moments a theme can be looked at in, and the one it opens on: its
  // most characteristic (Halloween's spooky night, Christmas lights after
  // dark); one moment only -- Space Night, Spring Garden -- needs no row
  var SKY_MOMENTS = {
    halloween: [['day', 'spooky'], 'spooky'], christmas: [['day', 'night'], 'night'],
    'fourth-of-july': [['day', 'night'], 'night'], 'space-night': [['night'], 'night'],
    'spring-garden': [['day'], 'day'], 'storybook-magic': [['day', 'night'], 'night']
  };
  var MOMENT_LABELS = { day: 'Day', night: 'Night', spooky: 'Spooky Night' };
  function skyMoments(id) {
    var m = SKY_MOMENTS[id] || [['day', 'night'], 'day'];
    var keys = id === 'halloween' ? ['day', 'night', 'spooky'] : m[0];
    return { options: keys.map(function (k) { return [k, MOMENT_LABELS[k]]; }), value: m[1] };
  }

  // Null is a continuing relationship to All Screens, including custom
  // stops. A true flag is still an override, even when it matches the house.
  function skySummary(b) {
    var keys = ['sky_animations', 'sky_weather', 'sky_decorations', 'sky_gradient', 'sky_custom'];
    if (keys.every(function (k) { return b[k] == null; })) return 'Same as All Screens';
    var parts = [];
    if (b.sky_animations === false) parts.push('No Animation');
    if (b.sky_weather === false) parts.push('No Weather');
    if (b.sky_decorations === false) parts.push('No Decorations');
    if (b.sky_gradient != null) parts.push('Own Backdrop');
    return parts.join(', ') || 'Own Settings';
  }

  root.hkSettingsModel = {
    skySummary: skySummary,
    YAML_REF: YAML_REF, YAML_DEFAULTS: YAML_DEFAULTS, yamlRefText: yamlRefText, yamlRefItem: yamlRefItem,
    previewSizes: previewSizes, previewDefault: previewDefault, previewFit: previewFit,
    SAVER_DEFAULTS: SAVER_DEFAULTS, saverOptions: saverOptions, saverCustom: saverCustom, saverSummary: saverSummary, saverFollows: saverFollows, kioskSummary: kioskSummary,
    COPY_GROUPS: COPY_GROUPS, COPY_NEVER: COPY_NEVER, copyDefaults: copyDefaults, copyChanges: copyChanges,
    skyPreviewScreen: skyPreviewScreen, skyMoments: skyMoments,
    version: '2.0.0',
    CHIP_LABELS: CHIP_LABELS, CHIP_SOURCES: CHIP_SOURCES, PAGE_LABELS: PAGE_LABELS, COUNT_KINDS: COUNT_KINDS,
    MENU_STYLES: MENU_STYLES, NARROW: NARROW, narrowLabel: narrowLabel,
    ACCENTS: ACCENTS, accentOf: accentOf, tabPosParts: tabPosParts, tabPosJoin: tabPosJoin, tabPosLabel: tabPosLabel,
    MENU_KEYS: MENU_KEYS, houseMenuAsBoard: houseMenuAsBoard, houseMenuSave: houseMenuSave,
    menuOwnChanges: menuOwnChanges, menuSummary: menuSummary, GLASS: GLASS, PRESETS: PRESETS, STATUS_LABELS: STATUS_LABELS,
    BROWSE_LABELS: BROWSE_LABELS, POPUP_KINDS: POPUP_KINDS, CLOSE_AFTER: CLOSE_AFTER, MONTHS: MONTHS,
    PAGE_PILL_DEFAULTS: PAGE_PILL_DEFAULTS, PILL_COLORS: PILL_COLORS, CAL_COLORS: CAL_COLORS, colorLabel: colorLabel,
    CHIP_TOKEN: CHIP_TOKEN, chipsAddCustom: chipsAddCustom, chipsRemoveCustom: chipsRemoveCustom,
    SKY_THEMES: SKY_THEMES, OFTEN_LABELS: OFTEN_LABELS, OFTEN_DEFAULT: OFTEN_DEFAULT, PAGE_TOKEN: PAGE_TOKEN,
    SEARCH: SEARCH,
    errorText: errorText, refusals: refusals,
    menuMode: menuMode, menuFor: menuFor, menuStyleLabel: menuStyleLabel, showsTab: showsTab,
    glassLabel: glassLabel, glassOf: glassOf, amountOf: amountOf, amountsFor: amountsFor,
    chipsModel: chipsModel, chipsSave: chipsSave, chipsAddOwn: chipsAddOwn, chipsRemoveOwn: chipsRemoveOwn,
    chipQuiet: chipQuiet,
    scenesModel: scenesModel, scenesSave: scenesSave, scenesPagePill: scenesPagePill,
    pagesModel: pagesModel, pagesSave: pagesSave, pagesCustom: pagesCustom,
    roomsModel: roomsModel, roomsSave: roomsSave, roomsAuto: roomsAuto, houseRoomsAsBoard: houseRoomsAsBoard,
    houseRoomsSave: houseRoomsSave, roomOnHome: roomOnHome, roomsSummary: roomsSummary,
    MENU_FIXED: MENU_FIXED, MENU_PLACES: MENU_PLACES, menuPathOf: menuPathOf, menuItems: menuItems,
    topsOf: topsOf, placeOf: placeOf, placeSet: placeSet,
    camerasModel: camerasModel, autoCameras: autoCameras, livePlan: livePlan, liveYaml: liveYaml, liveNames: liveNames,
    move: move,
    mmdd: mmdd, dateLabel: dateLabel, skyDate: skyDate, search: search
  };
})();
