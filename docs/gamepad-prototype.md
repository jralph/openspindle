# Gamepad feasibility prototype

This local prototype explores an Xbox-style GameSir controller with OpenSpindle. Step mode uses stock Makera Z1 protocols; Direct mode uses a new simulator-only extension. It is throwaway development code on `codex/gamepad-feasibility`, based on the upstream checkout. There is no published GitHub fork or pull request. Physical-machine connections are blocked by the machine process in this build.

## Try it

Start the built app with `npm start` from the repository, or use `Launch OpenSpindle Prototype.cmd` in the parent folder. The launcher uses a separate local profile. Close an already-running prototype before launching another instance; the built-in simulator uses port 2223.

1. Open **Device**, then **Connect device** and select **Z1 Simulator** (`127.0.0.1:2223`). The simulator setting is enabled by default.
2. Connect the GameSir dock by USB, turn on the controller, focus OpenSpindle and press a controller button to make it visible to the Gamepad API.
3. In **Jog → Gamepad prototype**, confirm the controller name and **Standard Xbox-style mapping**. Unsupported mappings stay monitor-only.
4. Leave **Control mode → Step** selected and choose the existing Jog step and speed. Centre the stick and release the D-pad, LB, RB and B; click **Arm simulator jogging**.
5. Hold **LB**, then deflect the left stick or press one D-pad direction. One finite XY step is sent. Return to neutral before the next step. Z is locked for gamepad input in both modes.
6. **B** while armed requests Stop and disarms. This uses OpenSpindle's existing halt into Alarm. Use the simulator's existing Unlock control to clear it, then arm again when ready.

Step mode never repeats a held direction. Disarming, releasing LB, leaving the page or losing the controller prevents further steps; a finite step already sent completes unless Stop interrupts it. Input delay, focus loss, controller changes and connection changes require rearming. Rejected gestures are never queued for later.

To change step size on the controller, release LB, hold **RB** and tap D-pad left/right. It moves once per press through 0.1, 1, 5 and 10 mm, subject to reported jog limits, without jogging. Release RB and return to neutral before jogging again.

Choose **Simulator preview → Start** to see the bed and tool in 3D, including in an empty project. Drag to orbit; scroll to zoom. The marker follows reported simulator positions. **Camera angle** switches to the fixed simulated camera preset. No camera feed or imported NC file is required. The simulator interprets jog speed as a fraction of the axis maximum and starts jogs immediately.

## Direct mode

Select **Control mode → Direct**, choose a speed ceiling (5%, 10% or 25%), centre the left stick and release the buttons, then arm. Hold **LB** and move the left stick to steer XY together. Deflection controls speed above a radial 20% dead zone; a diagonal retains the selected vector-speed ceiling. Release the stick or LB to decelerate to rest without Alarm or Unlock. A valid session stays armed for the next movement. **B** still uses Stop into Alarm and disarms. The right stick and Z remain unbound.

RB or any D-pad input suppresses Direct steering. The existing RB + D-pad left/right shortcut changes the Step distance without jogging; return the left stick to centre after using it before steering again. Mode changes, controller changes/loss, focus loss, leaving the page and delayed input disarm. Normal Direct end must finish before another arm or ordinary machine control is available.

The machine process reserves **Direct simulator jogging** as its foreground activity. The renderer sends at most one sample exchange at a time, keeping only its newest captured input. Both the owner and simulator reject samples older than 150 ms, future timestamps and out-of-order sequences; expiry ends the session and requires rearming. An old token cannot revive motion or end a newer session. A simulator loop gap above 50 ms holds position instead of replaying the missed interval. Normal end retains ownership until fresh stationary Idle telemetry confirms it; an unverified end closes the connection without retrying motion.

Direct preserves Z and clamps XY to the Z1 fixture kit's configured work envelope, with inward steering still available at an edge. It refuses to arm outside that envelope. Home can leave the tool outside it; use ordinary finite jogging to enter the bed area first. Known minor limitation: an acknowledged Direct begin refusal currently disconnects the simulator, so reconnect before following the finite-jog instruction. The simulator speed multiplier affects movement, while sample expiry remains in wall-clock milliseconds.

This protocol is implemented only in the local simulator. It does not establish Direct support, stopping distance or cutting capability on stock or community Z1 firmware. Local diagnostics distinguish a requested zero vector from confirmed Idle, and report its observed delay and final position. A rejected owner sample records its sequence, capture/receipt times and age, with a specific reason for inactive or mismatched sessions, non-increasing sequences, future timestamps or expired input.

## Cancellation findings

The inspected stock firmware's [SimpleShell jog implementation](https://github.com/MakeraInc/MakeraZ1Firmware/blob/main/src/modules/utils/simpleshell/SimpleShell.cpp) accepts finite, relative `$J` moves, including multiple axes; `F` is a fraction of maximum axis speed. OpenSpindle currently wraps single-axis finite jogs and waits for telemetry to verify their completion before another command is admitted.

The firmware's [SerialConsole](https://github.com/MakeraInc/MakeraZ1Firmware/blob/main/src/modules/communication/SerialConsole.cpp) handles realtime Ctrl-X as a halt. It also contains configuration-dependent feed-hold handling, but [Robot](https://github.com/MakeraInc/MakeraZ1Firmware/blob/main/src/modules/robot/Robot.cpp) waits on that flag before appending a new planner block. This does not establish prompt cancellation of an already-planned finite jog. The [Player](https://github.com/MakeraInc/MakeraZ1Firmware/blob/main/src/modules/utils/player/Player.cpp) waits for queued motion to finish during suspend/abort. Neither should be treated as the requested release-to-stop mechanism without measurement on the actual device and firmware revision.

No dedicated jog-cancel command was identified in these paths. This is source inspection, not a real-machine timing measurement. A simulator cannot validate physical stopping distance, Wi-Fi latency, controller radio loss behaviour or the shipped firmware's exact behaviour.

## Scope and next decision

Validation on 2026-10-07: type-checking, lint, formatting and the production build passed. The restarted app reported its simulator listening and connected at 127.0.0.1:2223. The user's screenshot confirmed the GameSir appearing as **Xbox 360 Controller for Windows (STANDARD GAMEPAD)** with standard mapping and a centred stick. The user confirmed the live 3D preview working. Local logs recorded RB step-size changes in both directions, confirmed 5 mm and 10 mm X jogs returning to Idle at the expected positions, refusal of extra gestures while a step was busy, and disarming on focus loss. Earlier logs showed Stop interrupting a command; its final Alarm state still needs an observed trial in this build. Physical-machine motion and stop timing have not been tested. No automated tests were added or run, following the repository's instructions.

Direct implementation checks on 2026-10-07: type-checking, lint, formatting and the production build passed. One independent review identified two material races, corrected in one pass: end confirmation now requires telemetry newer than the end acknowledgement, and controller identity changes invalidate pending arming. The review's minor refusal/disconnection issue above remains deferred. Source paths were inspected; delayed-telemetry and pending-controller-replacement fault trials remain unverified. The updated app restarted and reconnected to the simulator. Direct controller trials have not yet been observed. Still to verify manually: partial/full cardinal and diagonal steering, reversals, stick/LB release and stable subsequent position, B into Alarm, mode/RB changes, focus/controller loss, travel limits/inward recovery, renderer stalls and machine-process replacement. No automated tests were added or run, following repository instructions. Earlier Step/preview evidence above remains separate from Direct validation.

This prototype contains controller discovery, a live left-stick/LB readout, neutral-gated arming, finite XY steps, proportional continuous simulator XY steering through a machine-owned session, the RB step-size shortcut, the existing Stop binding, a rotatable live simulator preview and local diagnostics. It does not implement latched-direction cutting, Z jogging, gamepad spindle/feed controls, a facing wizard or scripts. Future requested bindings are right-stick vertical for Z, horizontal for a configured fourth axis, and held modifier + D-pad up/down for RPM/feed. Those require a separate implementation; they are not active here.

The next decision for physical support is how to provide a bounded motion horizon and a measured stopping mechanism on the Z1. The simulator's connection-bound sessions exercise the ownership design, but firmware and physical stop behaviour still need verification. Latched cutting also needs a defined work area and cancellation on controller loss. The facing wizard can be developed separately as an operation generating ordinary NC files.
