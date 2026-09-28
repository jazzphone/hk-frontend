"""Music's constants.

Speakers, the house playlist volume and each user's home room are the entry's
options; presets and playlists are its items (subentries).
"""

# ---- entry options
CONF_SPEAKERS = "speakers"      # room players, in pill order
CONF_VOLUME = "volume"          # the house playlist volume, 0..1
CONF_HOMES = "homes"            # {user_id: room player} -- each tablet's own room

# ---- item (subentry) types: stored with every preset and playlist, so they
# keep these names
SUB_PRESET = "preset"
SUB_PLAYLIST = "playlist"

# ---- preset data
CONF_NAME = "name"
CONF_GROUP = "group"            # the Music Assistant SYNC GROUP player
CONF_MEMBERS = "members"        # its rooms -- HA cannot read them from MA

# ---- playlist data
CONF_ICON = "icon"
CONF_ITEMS = "items"            # library:// uris, played as one queue
CONF_CHOOSER = "chooser"        # playlists sharing a chooser become one pill
CONF_ORDER = "order"

DEFAULT_VOLUME = 0.35

# ---- actions (hk_frontend.music_*)
SERVICE_PLAY = "music_play"
SERVICE_TRANSFER = "music_transfer"
SERVICE_STOP = "music_stop"
SERVICE_TRANSPORT = "music_transport"
SERVICE_PLAY_MEDIA = "music_play_media"

ATTR_ROOMS = "rooms"
ATTR_PLAYLIST = "playlist"
ATTR_SOURCE = "source"
ATTR_PLAYER = "player"
ATTR_COMMAND = "command"
ATTR_LEVEL = "level"

COMMANDS = ("play_pause", "next", "previous", "stop",
            "volume_up", "volume_down", "volume_set")

# ---- the failure notifications the Speakers picker shows on the screens
NOTE_PLAY = "music_play_failed"
NOTE_GROUP = "speaker_group_failed"
NOTE_PRESET = "music_preset_failed"
NOTE_TRANSFER = "music_transfer_failed"
NOTE_PARTIAL = "music_transfer_partial"
NOTE_STOP = "music_stop_failed"

# ---- measured timings (seconds). Every one of these is a bound on a WAIT for
# a state, not a sleep, except JOIN_SETTLE -- see music.py.
RELEASE_TIMEOUT = 20      # a group coming apart
PAUSE_TIMEOUT = 10        # a player that is streaming going quiet
JOIN_TIMEOUT = 10         # a join becoming exactly the group asked for
JOIN_SETTLE = 1.0         # MA says group_members: [] before a released player
                          # is joinable. Binary-searched: fails at 0.0, works
                          # from 0.5. One second is twice that.
START_TIMEOUT = 15        # after play_media returns, `playing` must show
TRANSFER_TIMEOUT = 15     # the destination holding the moved queue
STOP_TIMEOUT = 10
VOLUME_STEP = 0.05        # a UI decision; MA's own step is 0.02 (measured)

# the configuration changed: every screen's feed re-sends
SIGNAL_CONFIG = "hk_music_config"
