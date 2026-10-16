import { isFresh } from "../contract/index.ts"
import type {
  ProbeCheck,
  ProbeCheckBinding,
  Telemetry,
} from "../contract/index.ts"
import { MachineError } from "./errors.ts"

/** An actual switch transition, bound to an unchanged stationary tool pose. */
export class ProbeSignalCheck {
  value: ProbeCheck | null = null

  invalidate() {
    this.value = null
  }

  validPose(telemetry: Telemetry | null, connectionId: string, now: number) {
    const check = this.value
    if (!check) return false
    return (
      check.connectionId === connectionId &&
      now <= check.expiresAt &&
      this.matches(check.binding, telemetry, now)
    )
  }

  private matches(
    binding: Pick<ProbeCheckBinding, "position" | "tool" | "toolOffset">,
    telemetry: Telemetry | null,
    now: number
  ) {
    return !!(
      isFresh(telemetry, now) &&
      telemetry.state === "Idle" &&
      telemetry.job === null &&
      telemetry.units === "mm" &&
      telemetry.compensation === 0 &&
      telemetry.spindleRpm === 0 &&
      telemetry.spindleOn !== true &&
      telemetry.tool === binding.tool &&
      telemetry.toolOffset === binding.toolOffset &&
      telemetry.machine &&
      binding.position.every(
        (value, axis) =>
          Math.abs(
            value -
              [
                telemetry.machine!.x,
                telemetry.machine!.y,
                telemetry.machine!.z,
              ][axis]
          ) <= 0.001
      )
    )
  }

  stationaryRead(
    before: Telemetry,
    telemetry: Telemetry,
    now: number,
    tool: number
  ) {
    if (!before.machine || before.toolOffset === null) return false
    const readPose: Pick<
      ProbeCheckBinding,
      "position" | "tool" | "toolOffset"
    > = {
      position: [before.machine.x, before.machine.y, before.machine.z],
      tool,
      toolOffset: before.toolOffset,
    }
    return (
      this.matches(readPose, before, now) &&
      this.matches(readPose, telemetry, now)
    )
  }

  read(
    triggered: boolean | null,
    before: Telemetry,
    telemetry: Telemetry,
    connectionId: string,
    now: number,
    tool: number
  ) {
    if (!this.validPose(telemetry, connectionId, now)) this.invalidate()
    if (
      !telemetry.machine ||
      telemetry.toolOffset === null ||
      triggered === null ||
      !this.stationaryRead(before, telemetry, now, tool)
    ) {
      this.invalidate()
      return
    }
    if (!this.value) {
      if (triggered) return
      const binding: ProbeCheckBinding = {
        id: crypto.randomUUID(),
        position: [
          telemetry.machine.x,
          telemetry.machine.y,
          telemetry.machine.z,
        ],
        tool,
        toolOffset: telemetry.toolOffset,
      }
      if (!this.matches(binding, telemetry, now)) return
      this.value = {
        phase: "released",
        binding,
        connectionId,
        startedAt: now,
        expiresAt: now + 120000,
      }
      return
    }
    if (this.value.phase === "released" && triggered)
      this.value = { ...this.value, phase: "triggered" }
    else if (this.value.phase === "triggered" && !triggered)
      this.value = { ...this.value, phase: "verified" }
    else if (this.value.phase === "verified" && triggered) this.invalidate()
  }

  consume(
    binding: ProbeCheckBinding,
    telemetry: Telemetry | null,
    connectionId: string,
    now: number
  ) {
    const value = this.value
    const valid =
      value?.phase === "verified" &&
      JSON.stringify(value.binding) === JSON.stringify(binding) &&
      this.validPose(telemetry, connectionId, now)
    this.invalidate()
    if (!valid)
      throw new MachineError(
        "refused",
        "Verify the probe input released → triggered → released at this unchanged tool position before Run. The check expires after 120 seconds and can be used once."
      )
  }
}
