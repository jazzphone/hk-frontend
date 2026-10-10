# Music

Whole-home music through Music Assistant. Choose one or more rooms on a
screen, tap a playlist, and it plays there, grouped and in step. Music can be
moved to other rooms, added to more rooms, or stopped everywhere.

![The Play Music page on a wall tablet: now playing on the left, the speakers and playlists on the right](images/tablet-play-music.png)

## What you need

- The **Music Assistant** integration, with its players in Home Assistant.
- Each speaker in an **area**. The area names its pill on the screens
  (“Kitchen,” not “Kitchen HomePod”), and the area’s **floor** groups the
  pills. Rename an area and every screen follows.
- Optional: **sync groups** made in Music Assistant, for rooms that should
  always play together (say, the whole downstairs).

## Set it up

1. Add the feature: **HK Frontend → Add feature → Music**. It asks nothing.
2. Select the gear on the new **Music** item:
   - **Speakers (rooms)**: the Music Assistant players, one per room. Leave
     sync groups out here; they are presets (next step).
   - **House playlist volume**: the volume every room is set to when a
     playlist starts (default 35%).
   - Then **Each tablet’s room**: one dropdown per person who signs in. A wall
     tablet signs in as its own user, so this is how a tablet knows the room
     it hangs in. Its Play Music page starts on that room.
3. Optional: select **Add music preset** at the top of HK Frontend’s page for
   each sync group.
   Give it a name, pick the Music Assistant sync group player, and tick the
   rooms it plays in. Home Assistant cannot read a sync group’s rooms from
   Music Assistant, so you pick them here.
4. Select **Add music playlist** for each pill you want on the Play Music page:
   - **Name** and **Icon** (default `mdi:playlist-music`).
   - **Playlists**: one or more playlists from your Music Assistant library.
     They play as one shuffled queue.
   - **Chooser** (optional): playlists with the same chooser name become one
     pill that asks which, for example a “Decades” pill for six decade
     playlists.
   - **Order**: lower comes first.

Every change reaches open screens right away, with no reload.

## What you see

On generated screens (see [Screens](Screens.md)), once Music has at least one
speaker:

- **Play Music**: what is playing, with artwork, controls, progress and
  volume, and beside it the speakers by floor and the playlist pills. Pick
  rooms, then tap a playlist. **Move Music** moves what is playing to the
  rooms you picked (it reads **Add Rooms** when you are adding to it), **Stop
  All** stops everything, and **Clear** clears your selection. When the rooms
  you pick are exactly a preset’s rooms, the music plays through that sync
  group.
- **Browse Music**: your Music Assistant library (playlists, albums, artists,
  radio and more), played on the room the screen is showing.
- The **Speakers** status chip, and the optional **now-playing bar** on a
  screen (see [Wall tablets](#the-now-playing-bar)).

![Browse Music on a wall tablet](images/tablet-browse-music.png)

## Settings

| Setting | Default | What it does |
|---|---|---|
| Speakers | None | The rooms music plays in: Music Assistant players, one per room. Each is named by its area and grouped by floor; within a floor, in the order you drag them. A preset’s sync group can’t also be a room. |
| Home Rooms | None | For each Home Assistant user, the room they start in when they play music. A wall tablet signs in as its own user, so this is where each tablet hangs. |
| House Volume | 35% | The volume every room is set to when a playlist starts. |
| Presets & Playlists → Presets | None | A Music Assistant sync group and the rooms it plays in (**Name**, **Sync Group**, **Rooms**). Choosing exactly those rooms on a screen plays through the group, in step. |
| Presets & Playlists → Playlists | None | The pills on Play Music, in order (**Name**, **Icon**, **Chooser**, and the library playlists it **Plays**, as one queue). Pills with the same Chooser become one pill that asks which. |
| Browse Music → Categories | All shown | Music Assistant’s categories at the top of Browse Music: Artists, Albums, Songs, Playlists, Radio, Podcasts, Audiobooks. Untick the ones nobody opens. |
| Browse Music → Discover Rows | Recently played, Favorite playlists, Most played, Recently added, Favorite radio | The rows under the categories, in order. None: no Discover section. A row with nothing in it yet isn’t shown. |
| Advanced → Browse Page | `music-browse` | The page a speaker’s sheet opens with **Browse Music**, on YAML screens (a path on the same dashboard). Generated screens always use their own. Empty: no Browse button. |

A Browse Music card whose YAML sets its own `hide:` or `discover:` keeps them.

The Discover rows you can pick: Recently played, Recently played albums,
Recently played playlists, Recently played artists, Recently played podcasts,
Favorite playlists, Favorite songs, Favorite albums, Favorite artists, Favorite
radio, Favorite podcasts, Most played, Most played songs, Most played playlists,
Most played artists, Recently added, Recently added playlists, Recently added
songs, Newest albums, Albums at random.

**HK Settings → Features → Music** holds these; the gear on the Music item
under **Settings → Devices & services → HK Frontend** has the first three, and
**Add music preset** and **Add music playlist** at the top of that page add
the others. Deleting a preset leaves the group in Music Assistant; deleting a
playlist pill leaves the playlists in your library.

![The Music settings on the HK Settings page](images/settings-music.png)

## The now-playing bar

With Music added, a generated screen can
show a bar along the bottom while music plays on its room or a quick timer
runs: artwork, the track, play and skip, volume and progress. Turn on **Now
Playing Bar** under the screen’s **Behavior**.

The bar rises when music starts on the room the screen is showing, and stays
for 20 seconds after it stops. Close it and it stays closed on that screen
until the music or the timers change. The dashboard keeps working under it.

Quick timers need HK Frontend’s optional timer helpers; see
[Your First Screen](Your-First-Screen.md#what-next).

## Actions

The Play Music page uses these actions, and your automations and scripts can
too. Every one **answers**: call it with a response variable and read
`ok: true` (with `leader`, the player now leading the group) or `ok: false`
with a `message` written for a person. Called without a response variable, a
failure raises an error with that same message, so an automation never fails
silently.

A request for rooms that another request is still working on waits its turn.
When a newer request replaces it, it answers `superseded: true` and does
nothing. `hk_frontend.music_stop` cancels whatever is still running for its
rooms.

### `hk_frontend.music_play`

Plays one of your playlist pills on a set of rooms: each room is set to the
house volume, shuffle is turned on, and the rooms are grouped. If the rooms
are exactly a preset’s rooms, it plays through the preset’s sync group.

| Field | Required | Description |
|---|---|---|
| `rooms` | yes | Room players: the speakers chosen under Speakers (not a preset’s group). |
| `playlist` | yes | The playlist’s id (below). |

```yaml
action: hk_frontend.music_play
data:
  rooms:
    - media_player.kitchen
    - media_player.living_room
  playlist: 01JC3Z7Q4M8V2R6N0D5K9T1XWB
response_variable: result
```

**Finding a playlist’s id.** Each playlist pill is an item of HK Frontend’s
entry. On HK Frontend’s integration page, open the entry’s ⋮ menu →
**Download diagnostics**; under `features` → Music → `subentries` the file
lists every preset and playlist, each with its `subentry_id` and `title`. That
`subentry_id` is the playlist’s id.

A playlist whose library playlist has since been removed is refused rather
than played (Music Assistant would otherwise play a search result).

### `hk_frontend.music_transfer`

Moves what is playing to a set of rooms, or adds rooms to it, keeping the
queue and the position in the track.

| Field | Required | Description |
|---|---|---|
| `rooms` | yes | Where the music should be. |
| `source` | yes | The player the music is on now: a room or a preset’s sync group. |

```yaml
action: hk_frontend.music_transfer
data:
  source: media_player.kitchen
  rooms:
    - media_player.kitchen
    - media_player.patio
```

### `hk_frontend.music_stop`

Stops and ungroups rooms. With no rooms, it stops the whole house, including
every preset’s sync group.

| Field | Required | Description |
|---|---|---|
| `rooms` | no | The rooms to stop. Leave it out for the whole house. |

```yaml
action: hk_frontend.music_stop
data: {}
```

### `hk_frontend.music_transport`

Play/pause, skip, stop or change the volume on one player.

| Field | Required | Description |
|---|---|---|
| `player` | yes | A room, or a preset’s sync group. |
| `command` | yes | `play_pause`, `next`, `previous`, `stop`, `volume_up`, `volume_down` or `volume_set`. |
| `level` | for `volume_set` | 0 to 1. |

```yaml
action: hk_frontend.music_transport
data:
  player: media_player.living_room
  command: volume_set
  level: 0.3
```

### `hk_frontend.music_play_media`

Plays one item from the Music Assistant library on a player, the way Browse
Music does. It does not group rooms or set the house volume. It answers once
the item is actually playing.

| Field | Required | Description |
|---|---|---|
| `player` | yes | A room, or a preset’s sync group. |
| `media_content_id` | yes | A library URI, for example `library://album/42`. |
| `media_content_type` | yes | The media type, for example `album`, `playlist`, `track` or `radio`. |

```yaml
action: hk_frontend.music_play_media
data:
  player: media_player.office
  media_content_id: library://playlist/12
  media_content_type: playlist
```

## Notes

- **Failures people should know about** (a group that would not form, a
  playlist that did not start or is no longer in the library, a move that did
  not arrive, a Stop All that left something playing) also appear as a
  notification in Home Assistant, so a screen that did not make the request
  still hears about it.
- **Presets are not checked against Music Assistant.** If you change a sync
  group’s rooms in Music Assistant, edit the preset too.
- **Every request is logged** in one line: who, what, where and how long. To
  see them all, turn on debug logging:

  ```yaml
  logger:
    logs:
      custom_components.hk_frontend.features.music: debug
  ```

---
