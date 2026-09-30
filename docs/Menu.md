# Menu

The menu lists a screen’s pages and rooms, like the sidebar of Apple’s Home
app.

The menu lists the screen’s pages and rooms, like the sidebar of Apple’s Home
app: **Home** first, then the pages at the top, then **Categories** and
**Rooms**. The page you are on is highlighted.

Each screen chooses its own menu, under **Screens → (the screen) → Menu**:

- **Off**: no menu. Pages are reached from the chips and pills.
- **Button**: the menu is hidden until opened. **Button Style** picks how:
  - **Automatic**: the round chip when Home has a menu button, otherwise the
    edge tab.
  - **Chip**: a round button at the start of the status chips (and beside the
    back button on other pages).
  - **Chip, Then Tab**: the chip, and a slim tab slides in from the left edge
    when the chip is scrolled out of sight.
  - **Chip on Home, Tab Elsewhere**.
  - **Edge Tab**: a slim tab on the left edge, level with the date. **Tab
    Position** can move it.
- **Always Open**: the menu stays beside the page, with no button. It needs
  room: narrower than **Keep Open Down To** (1,000 px unless you change it),
  it folds away and **When Folded** stands in for it. One screen can then serve
  a computer, an iPad and a phone. With **Time & Weather in Menu**, the time,
  date and weather sit at the top of the menu and the Home page gains the
  header’s space.

**On narrow screens.** Below 1,024 px wide (an iPad held upright, a phone), a
button menu uses **On Narrow Screens** instead of its Button Style: the chip
(the default), the chip then the tab, or the edge tab.

**Tapping the clock** also opens the menu, and the weather beside it opens the
Weather page. Both are [Menu & Rooms](#menu--rooms-settings) settings for
every screen, along with the button’s icon.

**Top of Menu and Categories.** On a generated screen, Weather, Cameras and
Live TV sit at the top of the menu, right under Home, and every other page is
under **Categories**. To move one, open **Pages** and use the menu beside its
row: **Top of Menu**, **Categories** or **Not in Menu** (still one tap away on
its chip or pill). **Use the Automatic Menu** puts them back. Room pages are
always under **Rooms**, and Browse Music always follows Play Music.

**Rooms in the menu** are A to Z, or in the screen’s room order (**Rooms in
Menu**).

**The Home Assistant section.** **Home Assistant Section** adds Home
Assistant’s own pages to the menu, above Categories: Integrations,
Automations and Settings, Notifications, **More** (which folds out the rest
of your Home Assistant sidebar, in your order, without what you hid),
**Show Menu** (Home Assistant’s own sidebar, over the page, even where kiosk
mode hides it) and Profile. Settings shows how many updates and repairs are
waiting and Notifications how many notifications, as Home Assistant’s
sidebar does. Everything is read live from Home Assistant, and each person
sees only what they may open -- a wall tablet’s user gets Notifications,
More, Show Menu and Profile. On Home Assistant’s own pages its sidebar (or
its ☰) is the way back. Leave it off on a wall tablet everyone uses.

![The menu's Home Assistant section, with More folded out](images/desktop-menu-ha.png)

The menu closes itself when you choose a row, tap outside it, press Escape,
leave it untouched for a minute, or when the page changes any other way.

## The menu on your own dashboard

On a YAML dashboard, the menu is read from the dashboard itself:

- The first view is **Home**.
- A view with `area:` is a **room**, named by its title (else the area’s name)
  and pictured by the area’s icon (**Settings → Areas**).
- **Categories** are the pages Home’s status chips open, in chip order. With no
  chips, every other view with a title.

View keys adjust it:

| Key | Effect |
|---|---|
| `area: kitchen` or `area: [backyard, deck]` | The view is a room. |
| `menu: top` | Listed at the top, right under Home. |
| `menu: false` | Not listed. Hidden views, views with no title and views this user can’t see are never listed. |
| `menu_title:` | The name in the menu, when it should differ from the view’s title. |
| `menu_icon:` | The icon in the menu, when it should differ from the view’s `icon:`. |

The screen’s **Pages in Menu** overrides `menu: top` and `menu: false`, page
by page.

A room page for a YAML dashboard is built from its area every time it opens:

```yaml
- title: Kitchen
  path: room-kitchen
  subview: true
  strategy:
    type: custom:hk-room
    area: kitchen          # or a list: [backyard, deck]
```

To make a room heading on Home open it, give the heading the same area:

```yaml
- type: custom:hk-heading-card
  name: Kitchen
  area: kitchen
```

A page you lay out yourself is a room too, as long as the view has `area:`.
Give it a status row with `custom:hk-room-status-card`:

```yaml
- type: custom:hk-room-status-card
  area: kitchen
```

| Option | What it does |
|---|---|
| `area` | Required. One area or a list. |
| `items` | Which kinds show. Default: [Menu & Rooms → Status Row](#menu--rooms-settings). |
| `temperature`, `humidity` | A sensor to use instead of the area’s own. |
| `entities` | The accessories on this page. Outlets, blinds, fans, locks and garage doors are then counted from this list rather than the whole area. |
| `exclude` | Entities to leave out of the counts. |
| `include` | Entities from outside the area to count too. |

Every card’s options: [Card Library](Card-Library.md).

## Menu settings

| Setting | Default | What it does |
|---|---|---|
| Menu | Button (a YAML screen added as *Something Else*: Off) | **Off**: no menu. **Button**: the menu is hidden until you open it. **Always Open**: the menu stays beside the page, like the sidebar of the Home app on a Mac. The screen’s [preset](Screens.md#add-screen) sets this first. |
| Button Style | Automatic | *Menu: Button.* **Automatic**: a round chip at the start of the status chips when the Home page has a menu button, otherwise the edge tab. **Chip**: the round chip. **Chip, Then Tab**: the chip, and a slim tab slides in from the left edge while the chip is scrolled out of sight. **Chip on Home, Tab Elsewhere**: the chip on Home, the edge tab on every other page. **Edge Tab**: a slim tab on the left edge, level with the date. |
| On Narrow Screens | Chip | *Menu: Button.* Below 1,024 px wide (an iPad held upright, a phone), this takes over from Button Style: **Chip**, **Chip, Then Tab** or **Edge Tab**. |
| Tab Position | Level with the date | Shown when the edge tab can appear. Where the tab’s center sits: empty for level with the date under the clock, a distance from the top (`140px`, or just `140`), or a share of the screen’s height (`20%`). |
| Keep Open Down To | 1,000 px | *Menu: Always Open.* Narrower than this (700 to 3,000 px), the menu folds away and When Folded stands in for it. 1,000 keeps it open on a computer and an iPad held sideways and folds it on a small iPad held upright or a phone. |
| When Folded | Chip | *Menu: Always Open.* What stands in for a folded menu: **Chip**, **Chip, Then Tab** or **Edge Tab**. It is the same setting as On Narrow Screens. |
| Time & Weather in Menu | Off (Wall Tablet preset: on) | *Menu: Always Open.* The time, date and weather sit at the top of the menu instead of in the Home page’s header, and the status chips move up into the space. When the menu folds away, the header comes back. |
| Pages in Menu | Automatic | *YAML screens.* For each page: **Top of Menu** (right under Home), **Categories**, or **Not in Menu**. A generated screen sets this on its [Pages](Pages.md) instead. **Use the Automatic Menu** clears your choices. |
| Rooms in Menu | A to Z | **A to Z**, or **Room Order** (the order set in [Rooms](Home-Page.md#rooms)). |
| Home Assistant Section | Off | Adds a **Home Assistant** section to the menu, above Categories: Integrations, Automations, Settings (with its updates-and-repairs count), Notifications (with its count), **More** (the rest of that person’s Home Assistant sidebar, in their order), **Show Menu** (Home Assistant’s own sidebar, even where it is hidden) and Profile. Each person sees only what they may open. Leave it off on a shared wall tablet. |

## Menu & Rooms settings

**All Screens → Menu & Rooms.** What every screen’s menu and room pages share.
Whether a screen has a menu, and its style, is set [on the screen](#menu-settings).

| Setting | Default | What it does |
|---|---|---|
| Button Icon | Sidebar | The menu button’s picture: **Sidebar** or **Three Lines**. |
| Tap Clock to Open Menu | On | Tapping the header’s clock opens the menu. The weather beside it still opens the Weather page. |
| Room Headings Open Room Pages | On | A room heading on Home gets a › and opens that room’s page, when the screen has one. |
| Status Row | All 12 | What a room page’s status row can show, in this order when there’s something to say: Temperature, Humidity, Outlets, Blinds, Fans, Windows, Doors, Locks, Garage Doors, Motion, Occupancy, Leaks. Temperature and humidity are the area’s own sensors (**Settings → Areas → the area → Related sensors**). |
