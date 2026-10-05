"""Energy's constants."""

DATA = "hk_energy"                       # hass.data: the Energy manager's listener, once

# THE STORED OPTIONS (the feature item's options). Every one may be missing:
# missing means Automatic.
CONF_FOLLOW = "follow"        # bool: HA's Energy devices are listed by themselves (default True)
CONF_TITLE = "title"          # the page's name ("Energy")
CONF_TOTAL = "total"          # {power, stat, cost}: the whole home's readings, "" = automatic
CONF_TOP = "top"              # [entity ids] for the readings row, or None = automatic
CONF_COST = "cost"            # bool: Today's Cost first in the readings row (default True)
CONF_USAGES = "usages"        # [{entity, stat?, name?, color?}] for the daily bars, or None = automatic
CONF_SECTIONS = "sections"    # [{id, name, items: [keys], link?: {path, text}}], or None = automatic
CONF_DEVICES = "devices"      # {key: {name, icon, color, power, control, hidden}}
CONF_EXTRA = "extra"          # [{key, name, power?, stat?}]: devices HA's Energy settings do not list
CONF_BATTERIES = "batteries"  # [{entity, name?, label?, label_suffix?, label_decimals?}], or None = automatic
CONF_DETAIL = "detail"        # bool: Home Assistant's own energy charts at the end (default True)

OPTION_KEYS = (CONF_FOLLOW, CONF_TITLE, CONF_TOTAL, CONF_TOP, CONF_COST, CONF_USAGES, CONF_SECTIONS,
               CONF_DEVICES, CONF_EXTRA, CONF_BATTERIES, CONF_DETAIL)

# THE SECTIONS a device is guessed into, in page order: [id, name]
SECTIONS = (("hvac", "Heating & Cooling"), ("rooms", "Rooms"), ("appliances", "Appliances"),
            ("outlets", "Outlets"), ("charging", "Charging"), ("other", "Other"))
COLORS = ("white", "yellow", "orange", "red", "pink", "purple", "blue", "teal", "mint", "green", "cyan")
USAGES_MAX = 9
TOP_MAX = 4
