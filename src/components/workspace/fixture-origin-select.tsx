import { OptionSelect } from "@/components/option-select"
import { fixtureModelMountPoints } from "@/domain/fixtures/catalog"
import type { FixtureModel } from "@/domain/fixtures/definitions"
import type { Point3 } from "@/domain/nc/gcode"
import type { MountPoint } from "@/domain/fixtures/mount-points"

/** Points with repeated names numbered in order, as a list tells them apart: Hole, Hole 2. */
function numberedPoints(points: readonly MountPoint[]): MountPoint[] {
  const counts = new Map<string, number>()
  return points.map((point) => {
    const count = (counts.get(point.name) ?? 0) + 1
    counts.set(point.name, count)
    return count > 1 ? { ...point, name: `${point.name} ${count}` } : point
  })
}

/** Stands for the frame's origin while none of the model's points is there. */
const ORIGIN = ""

/**
 * Which point of a fixture's model is its origin: the point the fixture is positioned by and
 * turns about. It lists the model's mount points, and Origin while none of them is there.
 * Choosing one gives its place in the model's frame, for the caller to make it the origin.
 * A model without points shows nothing.
 */
export function FixtureOriginSelect({
  name,
  model,
  disabled,
  onChoose,
}: {
  /** The fixture, as accessible names say it: "{name} origin". */
  name: string
  model: FixtureModel
  disabled?: boolean
  onChoose: (point: Point3) => void
}) {
  const points = numberedPoints(fixtureModelMountPoints(model))
  if (!points.length) return null
  const origin = points.find(({ position }) =>
    position.every((value) => Math.abs(value) < 1e-6)
  )
  const items = [
    ...(origin ? [] : [{ value: ORIGIN, label: "Origin" }]),
    ...points.map((point) => ({ value: point.id, label: point.name })),
  ]
  return (
    <OptionSelect
      options={items}
      value={origin?.id ?? ORIGIN}
      disabled={disabled}
      onValueChange={(id) => {
        const point = points.find((item) => item.id === id)
        if (point) onChoose(point.position)
      }}
      size="sm"
      aria-label={`${name} origin`}
      title="The point it is positioned by and turns about"
      className="min-w-0 font-normal"
    />
  )
}
