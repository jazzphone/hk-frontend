# Climate

Open **Climate** from the menu or the Home page’s Climate chip. The status row
sits directly below the Climate heading, above the room accessories and
thermostats.

![The Climate page with its summary row and two thermostats side by side](images/desktop-climate.jpg)

These screenshots use fictional rooms, devices and readings.

## The status row

The row uses the same summaries as a room page, across the included rooms:

| Summary | Shows |
|---|---|
| Temperature | The lowest and highest current temperatures, in Home Assistant’s configured temperature unit. Equal rounded endpoints become one value. |
| Humidity | The lowest and highest humidity readings. Equal rounded endpoints become one value. |
| Blinds | How many blinds participate, and whether they are open, closed or a mixture. |
| Fans | How many fans participate, and whether they are on, off or a mixture. |

A kind with no sources does not show. Choose the summaries and their order
in **HK Settings → All Screens → Status Rows → Climate**. Turning all four off
hides the row. The Lights, Doors & Windows, Water and Security pages have rows
of their own ([Status rows](Status-Rows.md)).

## Tap for the accessory list

Tap any summary to open a sheet of accessory pills. Each pill carries its room
and current reading or state. Even a summary with only one source opens this
list.

![Temperature sources shown as room-labelled pills](images/sheet-climate-temperature.jpg)

Tap a pill to open that accessory’s controls or sensor details. **Back to
Temperature** (or the category you opened), closing the accessory sheet, or
browser Back returns to the category list. Closing the category returns to
Climate. Escape and the backdrop also dismiss a sheet. Left alone, an accessory
opened from a category closes together with the category.

The summary and its open list update as readings and membership change. An
unavailable reading stays in the list, labelled **Unavailable**, and does not
affect the range. If every reading is unavailable, the summary says so.

<img src="images/phone-climate-temperature.jpg" width="300" alt="The Temperature list on a phone, using fictional readings">

## Choose the sources

Automatic temperature and humidity discovery uses the sensors selected in
**Home Assistant → Settings → Areas → (the area) → Related sensors**. When
an area has no designated sensor for a reading, its thermostat’s **current**
reading is used instead. Target temperatures are never range readings.
Unrelated equipment and diagnostic sensors are not pulled in just because
they report temperature or humidity.

To adjust individual sources, open **HK Settings → All Screens → Status & Chips
→ Temperature** or **Humidity**. **Leave Out…** removes a source; **Also
Count…** adds a compatible source. Exclusions win if a source is in both
lists. **Reset to Automatic…** restores automatic discovery.

Fans and blinds follow the existing **Status & Chips → Fans / Blinds** lists,
including any switches explicitly counted as fans. Generated-screen
accessory exclusions still apply.

To leave an entire area out of the Climate summaries, uncheck it in
**All Screens → Status Rows → Climate → Rooms**. This is useful for outdoor areas, an attic
or equipment spaces. It affects the Climate summary row and its lists; it
does not hide that area’s accessories from the rest of the dashboard.

## Thermostat layout

The rooms take only the width their busiest room needs — two to four pills
across — and the thermostats sit right beside them, as many dials across as
fit, with any spare width at the right as on every other page. On narrower
pages the rooms give way first and the dials stack. On a phone the room
accessories and thermostat section also stack, with no horizontal page
overflow. The Thermostats heading stays aligned with the first dial at every
width.

![The Climate page at tablet width, with stacked thermostats](images/tablet-climate.jpg)

After updating HK Frontend, restart Home Assistant and reload each dashboard
to load the new source discovery and frontend files.
