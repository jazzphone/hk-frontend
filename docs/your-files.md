# Your files: Apple’s font and glyphs

HK Frontend is designed around Apple’s **SF Pro** font and **SF Symbols** glyphs. Apple’s license doesn’t allow passing them on, so they can’t be bundled with the integration. Instead, you put your own copies in a folder under `/config`, and HK Frontend serves them to your screens.

This is optional. Everything works without them.

## What you get without them

- **Text** uses Home Assistant’s own font, Roboto. Sizes and spacing were measured against SF Pro, so text sits a little differently, but nothing is cut off or missing.
- **Icons** are drawn as the [Material Design Icons](https://pictogrammers.com/library/mdi/) of the same name, read from Home Assistant’s own icon set. The few glyph names that Material Design doesn’t have use a close stand-in (a HomePod is drawn as a speaker, for example).
- **Weather** shows Material Design’s weather icons, in white (the sun in yellow), instead of the multicolor SF Symbols the Weather app uses.
- **Settings** → **Repairs** shows *SF Pro font not installed* and *SF Symbols glyphs not installed*, and Setup Check shows a note. Neither is an error.

## What you need

- A **Mac**, once, for the glyphs: they are exported from Apple’s SF Symbols app, which runs only on macOS. The font can be had without one — see [Without a Mac](#without-a-mac). After that, the files live in Home Assistant.
- **Python 3** (`python3 --version` in Terminal). The tools run on Windows and Linux too; only the SF Symbols export needs the Mac, and that part needs no Python — see [No Python on the Mac](#no-python-on-the-mac).
- The HK Frontend **tools**. They are in the GitHub repository, not in what HACS installs. Download the repository from [github.com/jazzphone/hk-frontend](https://github.com/jazzphone/hk-frontend) — **Code** → **Download ZIP**, or `git clone` — preferably the release that matches the version you have installed.

Whether and how you may use Apple’s font and symbols is governed by Apple’s license terms, which you accept when you download them.

## Where the files go

The files folder is `hk_local` by default — `/config/hk_local`. It doesn’t exist until you create it. The layout:

```
/config/hk_local/
├── fonts/
│   └── SF-Pro.woff2       (or SF-Pro.ttf)
└── iconset/
    └── hk-glyphs.js
```

| File | What it is | Where it comes from |
|---|---|---|
| `fonts/SF-Pro.woff2` | SF Pro as a web font, about 8 MB instead of 21 | Made from Apple’s `SF-Pro.ttf` with `tools/font/make_woff2.py` |
| `fonts/SF-Pro.ttf` | Apple’s variable SF Pro, as Apple ships it | Works as-is instead of the woff2. Screens use the woff2 when both are there. |
| `iconset/hk-glyphs.js` | The glyph data for every `hk:` icon, and the multicolor weather symbols | Built from 155 SF Symbols with `tools/sf_symbols/build_glyphs.py` |

The names must be exactly these, capitals included.

### Using a different folder

You can choose another folder under `/config` in either place:

- **HK Settings** → **Advanced** → **Your Files** → **Folder**, or
- **Settings** → **Devices & services** → **HK Frontend** → **Configure** → **Your files**.

Both show whether the font and glyphs were found. `hk_local`, `/hk_local` and `/config/hk_local` all mean the same folder. The folder must be inside `/config`, can’t be `/config` itself, and can’t be a folder holding Home Assistant’s own files (one with `secrets.yaml`, `.storage` or `configuration.yaml` in it) — see [Security](#security).

## The files, by name

**The font.** Apple’s SF Pro download installs 46 font files. HK Frontend uses exactly one of them:

| File from Apple | Use it? | Why |
|---|---|---|
| `SF-Pro.ttf` | **Yes — this one** | The upright SF Pro as one *variable* font: every weight from 1 to 1000, and optical sizes from Text (small labels) to Display (large numbers), about 21 MB. Its family name is *SF Pro*. |
| `SF-Pro-Italic.ttf` | No | The italic. It would slant every screen; the font tool refuses it. |
| `SF-Pro-Display-*.otf`, `SF-Pro-Text-*.otf` (36 files) | No | One fixed weight each: every weight on the screens would draw the same. The font tool refuses them. |
| `SF-Pro-Rounded-*.otf` (9 files) | No | The rounded design, not the one the screens are measured against. |

On a Mac the installer puts them all in `/Library/Fonts`. In Apple’s installer package they sit at `Library/Fonts/`.

**The glyphs.** Every `hk:` icon is drawn from one SF Symbol, 155 in all. [Glyph names](glyph-names.md) lists each icon with its symbol’s name, and `tools/sf_symbols/symbols.txt` lists the symbols one per line. You don’t need either to build the file, but they tell you what to look for in the SF Symbols app.

The folder lives outside the integration’s own folder on purpose: an HK Frontend update from HACS replaces the integration’s folder, and your files survive it.

## Step 1: Set up Python on your Mac

In Terminal, make a Python environment with the three packages the tools need:

```sh
python3 -m venv ~/.venvs/hk-sf
~/.venvs/hk-sf/bin/pip install fonttools brotli svgpathtools
```

Then change to the folder where you unpacked the HK Frontend repository:

```sh
cd ~/Downloads/hk-frontend      # wherever you put it
```

In the steps below, the output goes to a folder called `hk_local` on your Desktop. If you have Home Assistant’s config folder mounted on your Mac (through the Samba share add-on, for example), you can write straight into its `hk_local` folder instead.

## Step 2: The font

1. Download **SF Pro** from Apple: [developer.apple.com/fonts](https://developer.apple.com/fonts/).
2. Open the downloaded disk image and run the installer. It puts the fonts in `/Library/Fonts`.
3. Convert the variable font to a web font:

   ```sh
   ~/.venvs/hk-sf/bin/python tools/font/make_woff2.py /Library/Fonts/SF-Pro.ttf ~/Desktop/hk_local/fonts/SF-Pro.woff2
   ```

   It prints the font’s family and axes, then the size before and after.

Use `SF-Pro.ttf`, the **variable** font. The installer also adds static cuts such as `SF-Pro-Display-Bold.otf`; with one of those every weight would draw the same, so the tool refuses them (*not the variable SF Pro*).

**Skipping the conversion:** you can copy `/Library/Fonts/SF-Pro.ttf` to `fonts/SF-Pro.ttf` instead. It works the same, but every screen downloads a file about two and a half times larger the first time it loads.

### Without a Mac

Apple’s download, `SF-Pro.dmg`, is a Mac disk image with an installer package inside, and the font is inside the package, at `Library/Fonts/SF-Pro.ttf`. An archive tool that reads Mac disk images can usually open all three layers: on Windows, [7-Zip](https://www.7-zip.org) opens the `.dmg`, then the `.pkg` inside it, then the `Payload` inside that. Copy out `SF-Pro.ttf` — only that file; see [the table](#the-files-by-name).

Then convert it on the same computer. On Windows, in Command Prompt or PowerShell, in the folder where you unpacked the HK Frontend repository:

```bat
py -m venv hk-sf
.\hk-sf\Scripts\pip install fonttools brotli
.\hk-sf\Scripts\python tools\font\make_woff2.py SF-Pro.ttf SF-Pro.woff2
```

Or skip the conversion and use `SF-Pro.ttf` as it is.

## Step 3: The glyphs

1. Install Apple’s **SF Symbols** app from [developer.apple.com/sf-symbols](https://developer.apple.com/sf-symbols/), into `/Applications`.
2. Build the glyph file:

   ```sh
   ~/.venvs/hk-sf/bin/python tools/sf_symbols/build_glyphs.py --out ~/Desktop/hk_local/iconset/hk-glyphs.js
   ```

   For every `hk:` icon, `tools/sf_symbols/manifest.json` names the SF Symbol it is drawn from. The script exports each one with the command-line exporter inside the SF Symbols app and fits it into the icon set’s 24 × 24 box. The weather symbols are kept as they are, in layers, so they can be drawn in color. The first run exports every symbol and takes a while; the exports are kept in `tools/sf_symbols/.sfcache`, so a second run is quick. It ends with `wrote …: N glyphs, M two-tone, W weather`.

If the script stops:

| Message | What to do |
|---|---|
| `sfsymbols CLI not found` | The script looks for `SF Symbols.app` or `SF Symbols Beta.app` in `/Applications`. Install the app there — a current version, which includes the `sfsymbols` exporter in its `Contents/Executables` folder — or set `SFSYMBOLS_CLI` to the exporter’s full path. |
| `SF symbol not found: <name>` | Your version of SF Symbols doesn’t have that symbol, or has renamed it. Try the current SF Symbols app; if it still fails, [open an issue](https://github.com/jazzphone/hk-frontend/issues) naming the symbol. |
| `No module named 'svgpathtools'` | Run the tool with the environment’s Python (`~/.venvs/hk-sf/bin/python`), as shown. |

### No Python on the Mac

The SF Symbols app has to run on a Mac, but nothing else does. If the Mac you can use has no Python — or it isn’t yours — export the symbols there with a plain script, then build the glyph file on any computer with Python:

1. On the Mac, with the SF Symbols app in `/Applications`, open Terminal in the folder where you unpacked the HK Frontend repository and run:

   ```sh
   sh tools/sf_symbols/export_all.sh ~/Desktop/sf-exports
   ```

   It exports every symbol in `tools/sf_symbols/symbols.txt` as an SVG file into `sf-exports` on the Desktop — 155 files, about three minutes — and ends with `155 symbols in …, 0 not found`. If it stops, run it again: symbols already exported are skipped.
2. Copy the `sf-exports` folder to the computer with Python, and build from it there. On a Mac or Linux:

   ```sh
   python3 -m venv ~/.venvs/hk-sf && ~/.venvs/hk-sf/bin/pip install svgpathtools
   ~/.venvs/hk-sf/bin/python tools/sf_symbols/build_glyphs.py --cache sf-exports --out hk-glyphs.js
   ```

   On Windows, in Command Prompt or PowerShell:

   ```bat
   py -m venv hk-sf
   .\hk-sf\Scripts\pip install svgpathtools
   .\hk-sf\Scripts\python tools\sf_symbols\build_glyphs.py --cache sf-exports --out hk-glyphs.js
   ```

   With every symbol already in the folder, the builder never looks for the SF Symbols app. The file is the same as one built on the Mac.

A later version of HK Frontend may add glyphs. After updating, build the file again from the matching tools; until then, a new glyph is drawn as its Material Design stand-in.

## Step 4: Copy the files to Home Assistant

Copy the `fonts` and `iconset` folders into `/config/hk_local` on your Home Assistant — through the Samba share add-on, the Studio Code Server add-on’s upload, `scp` over SSH, or however you usually copy files there. Keep the folder names exactly as shown: `fonts/SF-Pro.woff2` and `iconset/hk-glyphs.js`.

## Step 5: Reload and check

1. **If you just created the folder**, reload HK Frontend: **Settings** → **Devices & services** → **HK Frontend** → **⋮** on the HK Frontend entry → **Reload** (or restart Home Assistant). HK Frontend looks for the folder when it starts and when you change the folder setting, so a folder created afterwards isn’t served until then. Reloading also clears the two Repairs entries.
2. Open **HK Settings** → **Setup Check**. It should say **SF Pro and the SF Symbols glyphs — Found.** (HK Settings → **Advanced** → **Your Files** shows *Found* for each as well.)
3. Reload each screen. If a screen still shows Roboto or Material Design icons, reload it once more: the first load after a change can still use the browser’s previous copy. See [A change doesn’t show on a screen](troubleshooting.md#a-change-doesnt-show-on-a-screen).

No restart of Home Assistant is needed for files you replace later: screens check for a newer copy every time they load.

## Other files in the folder

Anything else you put in the folder is served too, at the same address under `/hk/`, and a file at the same path as one of HK Frontend’s own takes its place. For example, `hk_local/sky/clouds-a.png` replaces the bundled cloud texture. Your copy stays in place after updates, so if an update changes that file, you keep the old one until you remove yours.

## Security

The files folder is served **without signing in**, exactly like `/config/www` (`/local/`): browsers fetch fonts and scripts without Home Assistant’s credentials, so it has to be. Anyone who can reach your Home Assistant’s address can download any file in the folder, by its path under `/hk/`.

- Use a folder that holds only these files. **Never put secrets, backups, camera snapshots or anything private in it.**
- HK Frontend refuses to serve `/config` itself, any folder outside `/config`, and any folder that contains `secrets.yaml`, `.storage` or `configuration.yaml`.
- Nothing outside the folder is served: a path or link that leads out of it is ignored.
- If your Home Assistant is reachable from the internet, so is this folder.
