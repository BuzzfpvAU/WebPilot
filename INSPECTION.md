# Inspection training

This repository is a fork of [WebFPVSimulator](https://github.com/Mathew-Harvey/WebFPVSimulator)
(webfpv.org), GPLv3, with its whole history. It adds training for confined space
industrial inspection flying: aircraft of the caged and tethered classes, the autopilot
they fly under, and inspection worlds lit only by the aircraft. Everything upstream is
still here and still flies exactly as it did; the physics trace of the five inch is bit
identical (`npm run verify`, check 2).

The aircraft are modelled on the published specifications of two classes of machine
and are named for the class, not the product. Neither maker is affiliated with this
simulator or endorses it.

## Fly it

    npm run serve        # then open http://127.0.0.1:8000/

On the title screen choose **Inspection training**, then the aircraft, **Caged (Elios 3
class)** or **Tethered (Scout 137 class)**, then the vessel: the **Storage tank** or the
**Ballast tank**. Esc or Back steps back one question. Both aircraft are also on the
**Aircraft** row of the Quad screen, whose preview shows the model.

The **Ballast tank** is a ship's double bottom: twelve bays 1.6 m deep between floors and
girders, joined only by 800 by 600 mm lightening holes. The caged aircraft fits a hole with
75 mm to spare above and below, so fly it at about 0.8 m and hold your height. The tethered
aircraft's LiDAR cage keeps it 0.5 m off everything in Position mode, which no hole allows:
switch to ATTI (M) to take it through, as a pilot of the real thing would. Its cable comes in
through a manhole in the tank top. The ballast tank's faults are coating breakdown, pitting
on the bottom, cracks at bracket toes, and buckled or holed stiffeners.

The tethered aircraft flies on a 30 m cable from a ground station on the floor behind the
spawn. The cable is physics, not a picture: it weighs on the aircraft, drags, drapes over
the coil, wraps the column and the schoepentoeter, and holds the aircraft back when it is
snagged or all paid out. The panel shows its pull at the aircraft.

| Control | Position mode | ATTI mode |
|---|---|---|
| Right stick | Horizontal speed, in the aircraft's heading | Lean angle; nothing brakes |
| Left stick up/down | Climb or descend; centred holds height | The same |
| Left stick left/right | Yaw | Yaw |
| Sticks centred | Holds position and height | Holds height, drifts |

To take off, push the left stick up. To land, hold it fully down on the floor and the
motors idle.

| Key | Does |
|---|---|
| M | Position or ATTI |
| V | Next speed mode: Close, Normal, Transit, Max |
| J | Lights on or off |
| [ and ] | Lights down and up |
| Q and E (hold) | Camera tilt up and down, straight up to straight down |
| Z | Camera level |
| P | Take a photo |
| O | Photo gallery |
| K | Learn a gamepad or radio's camera tilt (a dial, slider or two buttons) and shutter button |

**On a controller.** A standard gamepad (Xbox, PlayStation) works with no setup: **LB** tilts
up, **RB** tilts down, **A** (cross) takes a photo. For a radio, or to choose your own buttons,
go to **Settings, Camera controls** (shown with an inspection aircraft seated) and choose it,
then turn the dial or slider you want for tilt (or press a tilt up button, then a tilt down
button), then press the button or flip the switch you want for the photo. **Forget camera
controls** goes back to the defaults. K does the same in flight.
| R | Restart |

The camera is on a stabilised gimbal: it holds the horizon level, turns with the aircraft and
tilts from +90 to -90 degrees, and the lights tilt with it.

Every photo is a thumbnail of the real frame, a numbered POI marker where the camera was
aimed, and a grade: **GOOD**, **USABLE** (too close, under 0.3 m, or too far, over 4 m) or
**REJECT** (too dark, overexposed, or motion blur from moving faster than 0.25 m/s or
turning faster than 20 degrees a second). The gallery lists them with time, height, range
and tilt. Restarting clears them.

**Defects.** Every run hides a new set of six to ten faults in the tank, at least one on the
top of the schoepentoeter (the vane inlet device on the nozzle) and one on its underside:

- **Corroded weld**: a stretch of bead grown fat and lumpy with rust, a stain weeping from it.
- **Cracked weld**: a dark line along the crown of a bead, or across it into the plate.
- **Missing bolt**: a nut gone from a flange, clip, bracket or stand, the hole left showing.

A defect is found by the first photo that shows it and grades USABLE or better: it is in
the middle 70% of the frame, near enough (a crack within 1.5 m, a missing bolt 2 m, a
corroded weld 3 m), seen from its own side (the top of a plate is not seen from under it),
and nothing solid is in the way. A photo that shows a defect is ranged on that defect. The
panel counts what has been found; the gallery says what each photo found, and **Reveal the
ones I missed** rings the rest in red, which ends the hunt for that run. The gallery gives
the run's seed.

The panel at the bottom left is the ground station: the flight mode, the speed mode,
height, the nearest surface (tethered aircraft), light output, time left on the pack
(caged aircraft) and how many times the aircraft has touched something.

## The aircraft

| | Caged (Elios 3 class) | Tethered (Scout 137 class) |
|---|---|---|
| Mass | 1.9 kg | 3.0 kg |
| Size | 50 x 50 x 45 cm cage | 448 x 479 x 262 mm |
| Props | 4 x 5 inch, inside the cage | 4 x 8 inch, push configuration |
| Power | 6S HV pack, about 12 minutes | Tether, unlimited |
| Lights | 16,000 lm | 12,000 lm |
| Collisions | Decoupled cage: touch, bounce and keep flying | LiDAR virtual cage stops it 0.5 m short |

Where every number comes from, published or derived, is written beside it in
`src/native/plant.c`.

## How it works

- **Physics** is upstream's: a 1 kHz deterministic plant in C with Betaflight 4.5.1
  compiled to WebAssembly. The two aircraft are two more rows of its airframe table.
- **The autopilot** is `src/native/assist.c`. It turns the sticks into velocity and
  climb requests and hands Betaflight's angle mode the lean that delivers them, which
  is how an aircraft of this class flies. Betaflight's rates, PIDs and mixer are not
  touched. The virtual cage reads the physics world's own shapes through
  `world_proximity` in `src/native/world.c`.
- **The cage** is modelled as decoupled: a contact stops, bounces and drags the
  aircraft, and does not turn it (`cage_decouple` in `plant.c`).
- **The tank** is `src/maps/tank/index.js`, a parametric 14 m by 12 m welded tank whose
  curved shell is a ring of 240 overlapping capsules, so a cage rolls round a smooth
  wall rather than over a staircase of boxes.
- **The welds, bolts and schoepentoeter** are `src/maps/tank/hardware.js`. Every weld is
  a raised bead swept along a seam on the shell, floor, roof, column, nozzle and the
  schoepentoeter's plates; every bolt is an instance (washer, nut, stud) on the manway
  cover, the nozzle flange, the rafter clips, the ladder brackets, the coil stands and
  the schoepentoeter's vanes and legs.
- **The defects** are `src/maps/tank/defects.js`: placed on those seams and bolts from a
  seed, drawn, and asked after each photo which ones its frame shows.
- **The ballast tank** is `src/maps/ballast/index.js` and its faults `defects.js` there.
- **What every inspection world shares** (the aircraft's lights, dust, exposure, the depth
  buffer, photographs, markers, the cable, and the rule for which defects a photo shows) is
  `src/maps/inspect/world.js` and `decals.js`. A new vessel is its geometry, its colliders,
  its defects and one call to `inspectionWorld`.
- **The shell's part** (keys, lights, panel) is `src/game/inspection.js`.
- **The tether** is `src/native/tether.c`, in the plant at 1 kHz: 40 segments from the
  ground station's anchor to the aircraft's tail, gravity, air drag, a fixed length,
  collision with every static shape and the floor, and its pull applied to the aircraft.
  Off for every other aircraft, and an aircraft with no cable steps bit identically to
  before. `npm run check:tether` flies hover, length, snag, floor and repeatability.
- **The models** are `src/render/inspectcraft.js`, each built inside its plant hull;
  `npm run check:craft` measures them.

`npm run check:inspection` flies both aircraft headless through takeoff, holds, full
stick runs and stops, ATTI drift, flat and curved wall contacts and the virtual cage,
and fails on what a pilot of the class would call broken.

## Roadmap

1. Done: the aircraft, the autopilot, the cage, lights and dust in one dark tank.
2. More vessels from the same builder: a boiler, a ship's hold and ballast tanks, a
   sewer or tunnel.
3. Inspection tasks and scoring: coverage, contacts, time and battery, and a debrief.
   Photos, POI markers, photo grading and defects to find and photograph are in.
4. The LiDAR map: a live point cloud and a ground station view, with signal loss behind
   steel.
5. Your own structures: import `.glb` / `.gltf` models with collision generated from
   them.
