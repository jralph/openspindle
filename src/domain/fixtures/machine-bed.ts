import type { FixtureBounds } from "@/domain/fixtures/definitions"
import type { Point3 } from "@/domain/nc/gcode"
import type { MountPoint } from "@/domain/fixtures/mount-points"

/** How a model's surfaces are drawn: base colour, and metalness and roughness from 0 to 1. */
export type Finish = {
  readonly color: string
  readonly metalness: number
  readonly roughness: number
}

/**
 * The bed a machine is built with, drawn under every plate, with the points fixtures mount to.
 * Bed coordinates are millimetres with the work area's front-left corner at the origin and the
 * bed's top at Z 0.
 */
export abstract class MachineBed {
  /** Its model, bundled with the app (glTF: metres, Y up). */
  abstract readonly modelUrl: string
  /** Where the model's origin is, in bed coordinates. */
  abstract readonly modelOrigin: Point3
  /** Its box, in bed coordinates. */
  abstract readonly bounds: FixtureBounds
  abstract readonly finish: Finish
  /** Its holes and corners, in bed coordinates. */
  abstract readonly mountPoints: readonly MountPoint[]

  /** The middle of its top face, in bed coordinates. */
  get topCenter(): Point3 {
    const { min, max } = this.bounds
    return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2]]
  }
}
