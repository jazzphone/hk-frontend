# Cameras

The camera strip on Home, and the Cameras page.

One camera plays live; the others show snapshots that refresh. Tap any camera
to open it full size, with sound, and hold-to-talk if it has a speaker (talking
needs Home Assistant over https).

- **Choose the cameras**: **Screens → (the screen) → Cameras**, turn
  **Automatic** off, then add, remove and drag. Automatic shows one tile per
  camera, using its low-resolution channel when it has several, and never a
  wall tablet’s own camera or a Live TV channel.
- **Choose the live one**: see [Live Camera Follows](#live-camera-follows)
  below. Nothing chosen: the first camera.
- **Turn it off**: **Show Camera Strip**.

A generated screen’s Cameras page shows the same cameras, all live.

## Live Camera Follows

The strip plays one camera live. **Live Camera Follows** lets something else
choose which one, so the strip can jump to where someone was just seen.

It takes a **dropdown helper** (an `input_select`, or a `select`) whose options
are your cameras’ names. Whichever option is chosen, that camera plays live.
An option names a camera when it is the camera’s name or the start of it, so
`Front Door` names *Front Door Camera Low resolution channel*. An option that
names no camera, or nothing chosen, plays the first camera.

**HK Settings → Screens → (the screen) → Cameras → Set Up Live Camera Follows**
does the rest for you:

1. **The dropdown.** It lists the option each camera in the strip needs.
   **Create the Dropdown** makes a helper called *Live Camera* with those
   options and chooses it. If you already chose one, it shows which cameras
   your dropdown has no option for.
2. **The automation.** It writes one for your cameras, from the person
   sensor on each camera’s device (or its motion sensor): when that sensor
   turns on, its camera is chosen; after five minutes with every sensor off,
   the first camera is chosen again. **Copy Automation**, then in
   **Settings → Automations & Scenes** choose **Create Automation → Create New
   Automation → ⋮ → Edit in YAML**, paste it over everything there, and save.

The automation it writes looks like this, for two cameras:

```yaml
alias: Live camera follows motion
mode: queued
triggers:
  - trigger: state
    entity_id: binary_sensor.front_door_person_detected
    to: "on"
    id: "Front Door"
  - trigger: state
    entity_id: binary_sensor.driveway_person_detected
    to: "on"
    id: "Driveway"
  - trigger: state
    entity_id:
      - binary_sensor.front_door_person_detected
      - binary_sensor.driveway_person_detected
    to: "off"
    for:
      minutes: 5
    id: all quiet
actions:
  - if:
      - condition: trigger
        id: all quiet
    then:
      - condition: state
        entity_id:
          - binary_sensor.front_door_person_detected
          - binary_sensor.driveway_person_detected
        state: "off"
      - action: input_select.select_option
        target:
          entity_id: input_select.live_camera
        data:
          option: "Front Door"
    else:
      - action: input_select.select_option
        target:
          entity_id: input_select.live_camera
        data:
          option: "{{ trigger.id }}"
```

Each trigger’s `id` is the option it chooses, so it must be spelled exactly as
in the dropdown.

## Cameras settings

| Setting | Default | What it does |
|---|---|---|
| Show Camera Strip | On | *Generated.* The live camera strip under the chips. |
| Live Camera Follows | First Camera | A dropdown helper (input select or select) whose option names the camera to show live, set by an automation (for example on person detection). An option matches the camera whose name starts with it. The other tiles show snapshots. |
| Set Up Live Camera Follows | — | Explains it, lists the option each camera needs, makes the dropdown for you (**Create the Dropdown**), and writes the automation for your cameras’ person or motion sensors (**Copy Automation**). See [Screens](#live-camera-follows). |
| Automatic | On | One tile per camera, using its low-resolution channel when it has several. Never a wall tablet’s own camera or a Live TV channel. |
| Shown / More | — | The cameras, in order. A generated screen’s Cameras page shows the same ones. |
