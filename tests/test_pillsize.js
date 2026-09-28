// THE iPAD PILL: one width, --hk-pill, read by everything that sizes a pill
// or its track. The css defines it (165) only in the band between a phone and
// a wall tablet; everywhere else each reader falls back to 192, the Home
// app's pill. The failure this guards -- pills and the scenes row sized by
// different numbers, so they stop lining up -- happens the moment one reader
// goes back to a literal 192px.
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');
var root = HK_ROOT;
var pass = 0, fail = 0;
function check(name, cond) { print((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; }

var css = readFile(root + '/frontend/css/hk-responsive.css');
var band = css.slice(css.indexOf('@media (min-width: 640.02px) and (max-width: 1023.98px)'));
check('the band exists', band.length > 0 && band !== css);
check('the band defines the pill', /--hk-pill:\s*165px;/.test(band));
check('...and the grid tracks read it', /--hk-track:\s*var\(--hk-pill\);/.test(band));
var phone = css.slice(css.indexOf('@media (max-width: 640px) {\n  :root'), css.indexOf('BETWEEN A PHONE'));
check('a phone does not get it (its tracks fill instead)', phone.length > 0 && !/--hk-pill:/.test(phone));
check('nothing outside the two band blocks defines it', css.split('--hk-pill:').length === 3);

// THE BAND TWICE: by the window (the media query) and by the page
// ([data-hk-band], set by hk-menu.js when a docked menu narrows the page).
// A media query cannot be OR'd with an attribute, so the declarations are
// repeated -- and must stay identical.
function decls(block) {
  return block.replace(/\/\*[\s\S]*?\*\//g, '').split(';').map(function (d) {
    return d.replace(/\s+/g, ' ').trim();
  }).filter(function (d) { return /^--/.test(d); });
}
function blockAfter(src, head) {
  var i = src.indexOf(head); if (i < 0) return '';
  var j = src.indexOf('{', i + head.length - 1) + 1, depth = 1, k = j;
  while (depth && k < src.length) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
  return src.slice(j, k - 1);
}
var byWindow = decls(blockAfter(band, ':root:not([data-hk-zoomed]) {'));
var byPage = decls(blockAfter(css, ':root[data-hk-band]:not([data-hk-zoomed]) {'));
check('the page-width band exists', byPage.length > 10);
check('...and says exactly what the window band says', JSON.stringify(byPage) === JSON.stringify(byWindow));

var P = 'width:var(--hk-pill,192px);min-width:var(--hk-pill,192px);max-width:var(--hk-pill,192px)';
[['hk-base.js', '.tile{'], ['hk-tile.js', 'ha-card.card{'], ['hk-stat.js', 'ha-card.rank{']].forEach(function (f) {
  var src = readFile(root + '/frontend/cards/' + f[0]).replace(/',\s*\n\s*'/g, '');
  var at = src.indexOf(f[1]);
  var rule = at < 0 ? '' : src.slice(at, src.indexOf('}', at));
  check(f[0] + ' ' + f[1] + ' is sized by --hk-pill', rule.replace(/\s/g, '').indexOf(P) >= 0);
  check(f[0] + ' ' + f[1] + ' has no literal 192px width', !/(^|[;{\s])(min-|max-)?width:\s*192px/.test(rule));
});

// A detail sheet is the same 460 px on an iPad, so its pill pair keeps 192.
var det = readFile(root + '/frontend/cards/hk-detail.js');
check('the sheet\'s two-column group pins the full pill', /':host\{display:block;--hk-pill:192px;/.test(det));
// ...and has no layout-card cell to bleed over: a phone pill is its cell
// plus --hk-cell-bleed, which would run the right column past the sheet's edge.
check('...with no cell bleed (a phone pill fills its column, no more)', /--hk-pill:192px;--hk-cell-bleed:0px\}'/.test(det));

print(fail ? 'FAIL ' + fail + ' PILL SIZE TESTS' : 'ALL ' + pass + ' PILL SIZE TESTS PASS');
