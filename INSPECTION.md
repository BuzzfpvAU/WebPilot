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

On the title screen choose **Inspection training**. That seats the caged aircraft in
the storage tank. The tethered aircraft is on the **Aircraft** row of the Quad screen.

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
| R | Restart |

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
- **The shell's part** (keys, lights, panel) is `src/game/inspection.js`.

`npm run check:inspection` flies both aircraft headless through takeoff, holds, full
stick runs and stops, ATTI drift, flat and curved wall contacts and the virtual cage,
and fails on what a pilot of the class would call broken.

## Roadmap

1. Done: the aircraft, the autopilot, the cage, lights and dust in one dark tank.
2. More vessels from the same builder: a boiler, a ship's hold and ballast tanks, a
   sewer or tunnel.
3. Inspection tasks and scoring: defects to find and photograph, coverage, contacts,
   time and battery, and a debrief.
4. The LiDAR map: a live point cloud and a ground station view, with signal loss behind
   steel.
5. Your own structures: import `.glb` / `.gltf` models with collision generated from
   them.
