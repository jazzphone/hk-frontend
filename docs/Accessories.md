# Accessories

How one accessory shows up on every screen: its name, room, icon, what its
states are called, and where it appears.

How one accessory shows up on every screen: its name, room, icon, what its
states are called, and where it appears. These don’t change Home Assistant’s
own names or icons (only the room is Home Assistant’s own), so voice assistants
and other dashboards are untouched.

There are two ways in, to the same settings:

- **On a screen**: open the accessory’s detail sheet and tap the **gear**
  beside the close button. Tap it again (a check mark) when you are done. The
  gear is there for administrators only, and not on a camera sheet or a sheet
  of several accessories.
- **In HK Settings**: **Library → Accessories**, then its room (or search).

Everything saves as you change it and reaches every screen; a generated screen
redraws within about ten seconds. Each setting and its default:
[Accessories](#accessories-settings).

## Name and room

- **Name**: the name on its tiles and sheet, short and room-relative like the
  Home app’s: “Lamp”, not “Living Room Lamp”. Empty: the entity’s name with its
  room’s name dropped.
- **Only on this dashboard** (on a screen’s sheet): the name is this screen’s
  alone.
- **Room**: Home Assistant’s own area for the entity. Choosing the device’s
  area goes back to following the device.

On Doors & Windows each tile shows its room above its name; on Security and
Climate the room goes in front of a name you give it (“Hallway Thermostat”).

## Show as

For switches, lights and input booleans: **Light**, **Switch**, **Outlet** or
**Fan**. It sets the tile, the glyph, and which chip counts it: a lamp on a
smart plug shown as a Light is counted by the Lights chip; a coffee maker shown
as an Outlet isn’t.

## Tile size

**Automatic**, **Regular** or **Tall**: the height of its tile on a generated
screen’s rooms, room pages and category pages. Automatic is what its kind is
drawn as — a pill for a light, a tall tile for a lock, a thermostat, a garage
door or a vacuum. Tall makes any accessory a tall tile (a lamp you reach for
most), Regular makes a lock or a thermostat a pill. The tiles around it move
to make room. A favorite keeps the favorites’ one height.

## Arrange

![Arrange in a light’s settings: Move Left and Move Right over a small copy of the room’s lights](images/sheet-arrange.png)

*Opened from a tile on a generated screen.* **Move Left** and **Move Right**
move the tile one place among the tiles it sits with, under a small copy of
them laid out as the screen shows them, with this one picked out. Left and
right go in reading order, so moving right from the end of a row puts it at
the start of the next. A line underneath says what it moves among:

- On **Home**: the tiles in its room’s section.
- On a **room page**: its group there (the lights, the speakers and TVs…).
- In **Favorites**: the favorites on this screen only.

Home and room pages share the room’s **Tile Order**, on every screen: the
first move saves the room’s current order as its own, and its Tile Order
(in [Rooms](Rooms.md#a-rooms-settings)) then says Custom. Each tap saves; the
screen shows the new order when the sheet closes. Arrange isn’t shown when
there’s nothing to move it past, or on pages like Lights that follow each
room’s order.

## What it says

For switches and input booleans: what its states are called, **When on** and
**When off**, on its tiles and as a favorite. For example “Blocked” and
“Allowed” for a switch that blocks a game console. Whether it looks lit still
follows its state.

## Icon

A glyph for its tiles and sheet. It first offers the ones that suit what it
is: Apple’s Home glyphs for that kind of accessory (a ceiling fan, a desk fan
and an air purifier for a fan; curtains, a Roman shade and a skylight for a
shade). A door or window sensor’s glyph comes as an open and a shut pair.

![Search all icons: Apple’s glyphs first, then Home Assistant’s Material ones](images/sheet-icon-search.png)

**Search all icons** finds any glyph by name, then any of Home Assistant’s
Material Design icons by name or keyword (“burger” finds the hamburger). A
Material icon with an Apple glyph of the same name is drawn as the Apple one.

## Where it shows

- **Include in Status**: off, no chip counts it, and What Counts leaves it out
  of every kind. Because the category pages list what What Counts counts, it
  also leaves those pages.
- **Show on Home**: off, it isn’t on a generated screen’s Home. Its room page
  and the category pages still list it, as in the Home app.
- **Favorite on this dashboard** (on a generated screen’s sheet): adds it to,
  or removes it from, this screen’s Favorites.

## As a favorite

Shown for something that is a favorite on any screen:

- **Name**, **Room** and glyph as a favorite, on the Favorites row of every
  screen where it is one. **Room** is for something with no area of its own,
  such as a helper.
- **Together with** (lights, switches and input booleans): up to eight more it
  controls as one favorite. “Main + Table Lights” turns both on and off, is lit
  while either is, and shows their brightness.

## Color and chip settings

Shown for a chip, a scene pill or a favorite:

- **Color**: its color as a chip, a scene pill, or a favorite’s glyph while it
  is on.
- For an accessory chip: **Show only when it is** (a state), **Shows** (its
  state or one of its attributes) and **Label** (words to show instead).

## Reset to Automatic

Clears every setting of the accessory and this screen’s name for it. The room,
other screens’ names and favorites stay.

## Page order for Vacuums and Security

Pages that mix rooms list things A to Z. Two pages can have an order of your
own, in **HK Settings → Library → Accessories → Page Order**:

- **Vacuums**: the order of the vacuums.
- **Security**: the order of the locks and garage doors (automatic: the locks
  A to Z, then the garage doors), so you can list them the way you think of
  them: Front Door, Garage Door, Back Door.

A YAML dashboard’s tiles keep the names and glyphs written in its YAML; its
detail sheets use these settings.

## Accessories settings

**Library → Accessories.** How each accessory shows up on every screen: its
name, room, icon and where it appears. Home Assistant’s own names and icons
are untouched.

![The Accessories page in HK Settings](images/settings-accessories.png)

| Setting | Default | What it does |
|---|---|---|
| Search Accessories | — | Find an accessory by name, entity ID or room. |
| Hidden from Screens | None | Rooms (**Hide a Room…**), devices (**Hide a Device…**) and single accessories (**Hide an Accessory…**) left off every generated screen (its rooms, chips and pages) and never counted by What Counts, on any screen. To hide something from Home only, use its **Show on Home**. |
| Also Shown | None | Things a generated screen wouldn’t show by itself: scenes, scripts, sensors. Each appears in its room, or in a section called **More** at the end of Home if it has no room. |
| Page Order → Vacuums | A to Z | The order of the Vacuums page. |
| Page Order → Security | Locks A to Z, then garage doors | The order of the locks and garage doors on the Security page. |
| Rooms | — | Every room with accessories, then Timers and No Room. |

A room’s page lists its accessories, with **Room Settings** to open that
room’s own settings in [Rooms](Rooms.md#a-rooms-settings): its scenes, tile
order, whether it shows and what it’s part of.

An accessory’s page holds the same settings as the gear on its
[detail sheet](Detail-Sheets-and-Popups.md) (below):

| Setting | Default | What it does |
|---|---|---|
| Name | The entity’s name, less its room’s | The name on its tiles and sheet on every screen (“Lamp”, not “Living Room Lamp”). |
| Only on this dashboard | Off | *On a dashboard’s sheet only.* The name above is this dashboard’s alone. Turning it off shows the house-wide name again. |
| Room | Its area | Home Assistant’s own area for the entity: the one setting here that changes Home Assistant. Choosing the device’s area goes back to following the device. |
| Show as | Automatic | *Switches, lights and input booleans.* **Light**, **Switch**, **Outlet** or **Fan**: the tile it gets, its glyph, and which chip counts it (a lamp on an outlet counts as a light; a coffee maker doesn’t). |
| Tile size | Automatic | **Regular** or **Tall**: its tile’s height on generated screens, over what its kind is drawn as. Favorites keep their one height. |
| What it says → When on · When off | On · Off | *Switches and input booleans.* What its states are called on its tiles and as a favorite (“Blocked” and “Allowed” for a switch that blocks a game). Whether it is lit still follows its state. |
| Icon | Auto | A glyph offered by what it is, or any glyph or Material Design icon found with **Search all icons**. A door or window sensor’s glyph comes as an open and shut pair. |
| Include in Status | On | Off: no chip counts it, and What Counts leaves it out everywhere. |
| Show on Home | On | Off: not on a generated screen’s Home. Its room page and the category pages still list it. |
| Favorite on this dashboard | Off | *On a generated screen’s sheet only.* Adds it to, or takes it off, this screen’s Favorites. |
| As a favorite → Name · Room · glyph · Together with | Its own | *Shown for a favorite.* Its name, the room line above it and its glyph on the Favorites row of every screen where it is a favorite. **Room** is for something with no area of its own (a helper). **Together with** (lights, switches and input booleans): up to 8 more it controls as one favorite (“Main + Table Lights”). |
| Color | Auto | *Shown for a chip, a scene pill or a favorite.* White, Yellow, Orange, Red, Pink, Purple, Blue, Teal, Mint or Green: its color as a chip, a scene pill, or a favorite’s glyph while it is on. |
| Show only when it is | Any state | *Shown for an accessory chip.* The chip appears only in this state. |
| Shows | Its state | *Shown for an accessory chip.* One of its attributes instead of its state. |
| Label | What it shows | *Shown for an accessory chip.* Words to show instead. |
| Reset to Automatic | — | Asks first. Clears every setting above and this dashboard’s name. The room, other dashboards’ names and favorites stay. |

A YAML screen’s tiles keep their own YAML names and glyphs; its detail sheets
use these.
