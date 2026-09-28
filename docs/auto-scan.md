# Auto-scan

Auto-scan traces the edges of the plate's work area with the wired probe's laser at a safe height, so the outline can be checked against the stock and fixtures before anything is cut. It is the explicit equivalent of the margin scan in the firmware's `M495` automation. **Auto-scan** on the Prepare toolbar, or in **Add operation**, adds one to the selected plate. Like [auto-level](auto-level.md) and [auto Z-height](auto-z-height.md) it is a built-in setup operation whose NC is generated when the plate is compiled.

The trace follows the firmware's own margin scan and has been checked against its source, but it has not run on a machine yet: read the [firmware background](#firmware-background) first.

As with [auto-level](auto-level.md), the operation is machine-neutral and its NC, defaults and ranges are the machine's probe's; it needs a pointer to trace with, such as the Makera wired Probe 2.0's laser described here. A machine without one offers no auto-scan.

## What it traces

The outline is the plate's [toolpath bounds](#toolpath-bounds): where its machining operations cut, not clipped to the stock, so cuts that overhang the stock show as an outline that does too. It is derived on every compile and never goes stale. The 3D view draws the same bounds as a dashed outline on the stock.

## Settings

| Setting              | Meaning                                                     | Range           | Default     |
| -------------------- | ----------------------------------------------------------- | --------------- | ----------- |
| Machine Z            | Machine Z of the trace (`G53`), clear of stock and fixtures | −102 to −1 mm   | −3 mm       |
| Trace feed           | Feed of the traced edges                                    | 100–3000 mm/min | 1000 mm/min |
| Pause after scanning | Pause after the trace to check the outline                  |                 | On          |

The defaults are the firmware's own on the Z1: its configured clearance Z (`coordinate.clearance_z`: −3 on the Z1 Pro as Makera sets it; the published default file has −1) and margin speed (`atc.margin_rate_mm_m`). Machine Z stays within the Z the Z1 moves in: its firmware stops a move above −1 and below −102.

## Generated program

For cuts from X5 Y5 to X45 Y30:

```gcode
; Makera wired Probe 2.0 - auto-scan
; Traces the edges of the plate's work area with the probe's laser.
; REQUIRE: homed machine, installed probe; work X/Y set to the plate's work origin.
; Outline: X5 to X45, Y5 to Y30 in work coordinates.
M5
G21 G90
M6 T0
M494.0
G53 G0 Z-3
G0 X5 Y5
G1 X5 Y30 F1000
G1 X45 Y30
G1 X45 Y5
G1 X5 Y5
; Check the outline against the stock and fixtures, then Resume or Stop.
M0
M2
```

- `M494.0` switches the probe's laser on. The firmware switches it off itself after five minutes or when another tool is loaded; the program does not, because `M494` is not queued with the moves and would switch it off before the trace ran.
- The rectangle is in work coordinates, from its lower-left corner, as the firmware's margin scan: it shows where the machine will cut with the work X and Y it has, set by hand or by the plate's work origin kept relative to an anchor. The bounds are rounded outwards to hundredths.
- The pause is a standard `M0` program stop (sent as `M600`); Resume continues, Stop ends the job before it cuts.

The traced moves form one **Probe scan** section: feed moves with the probe (T0 is always the probe) never cut, so the Plates list, the G-code list and the Job timeline name them as a scan, and the 3D view draws them in the probe's green ([firmware-preview.md](firmware-preview.md)).

## Checks

Errors block Run; warnings inform.

| Check                                                                                  | Severity |
| -------------------------------------------------------------------------------------- | -------- |
| A setting is missing or out of range                                                   | error    |
| Nothing to trace: the plate has no machining operations, or they have no cutting moves | error    |
| The toolpath bounds reach beyond the stock as placed                                   | warning  |
| A machining operation runs before the scan, which then checks too late                 | warning  |

## Toolpath bounds

The toolpath bounds are where a plate cuts. One definition, in `src/domain/compile/toolpath-bounds.ts`, serves auto-scan, auto-level's **Fit grid**, auto Z-height's **Center** and the 3D view:

- A cutting move is a feed move that is not the probe's. Rapids and probe moves travel.
- A program's cutting bounds are the extent of its cutting moves. The start of the program's first move is the preview's assumed position, not a place it moves to, and does not count.
- A plate's toolpath bounds are the union over its operations outside the setup phase, each measured from its own NC, so a setup operation such as auto-scan can trace them while its plate compiles.
- The work area, which Fit grid and Center use, is those bounds on the bed within the stock.

The 3D view outlines the bounds, and the design's snap points and selection box use them.

## Firmware background

[`ATCHandler.cpp`](https://github.com/MakeraInc/MakeraZ1Firmware/blob/b3a2e26a9eaa2b01358f74ccdef549b993a08175/src/modules/tools/atc/ATCHandler.cpp) in Makera's Z1 firmware: `M495 X Y C D` runs `fill_margin_scripts` (lines 304–340): `M494.0`, `G53 G0 Z<clearance_z>`, `G90 G0` to the start, then `G1` around the rectangle at `margin_rate` and back; the laser is left on (`M494.2` is commented out). `countdown_probe_laser` (1709–1742) switches the laser off after 300 s or as soon as a tool other than the probe is active. [`configZ1.default`](https://github.com/MakeraInc/MakeraZ1Firmware/blob/b3a2e26a9eaa2b01358f74ccdef549b993a08175/src/configZ1.default): `coordinate.clearance_z` (427), `atc.margin_rate_mm_m` (463).

Before running: home all axes, install the probe, set work X and Y (or use a work origin kept relative to an anchor), and keep the trace height clear of fixtures.

The code is in `src/domain/auto-scan`, the settings form in `src/features/auto-scan` (its numeric field row and form helpers shared with auto-level and auto Z-height through `src/features/probing`), and the Makera Z1's laser trace (program and settings) in `src/domain/fixtures/makera-z1/wired-probe/laser-trace.ts`.
