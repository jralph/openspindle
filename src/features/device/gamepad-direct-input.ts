import type { ControllerInput } from "./gamepad-step-input"

export function directVector(
  input: ControllerInput
): readonly [number, number] {
  if (
    !input.supported ||
    !input.enableHeld ||
    input.stepModifierHeld ||
    input.stopHeld ||
    input.dpadHeld
  )
    return [0, 0]
  const radius = Math.hypot(input.x, input.y)
  if (radius <= 0.2) return [0, 0]
  const magnitude = (Math.min(radius, 1) - 0.2) / 0.8
  return [(input.x / radius) * magnitude, (-input.y / radius) * magnitude]
}

export class DirectGesture {
  private ready = false
  take(input: ControllerInput): readonly [number, number] {
    if (input.stepModifierHeld || input.dpadHeld) this.ready = false
    else if (Math.hypot(input.x, input.y) <= 0.2) this.ready = true
    return this.ready ? directVector(input) : [0, 0]
  }
}
