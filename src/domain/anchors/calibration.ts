import { z } from "zod"
import {
  AnchorConfigurationSchema,
  ProbeCheckBindingSchema,
} from "@/machine/contract"
import type { AnchorConfiguration } from "@/machine/contract"
import { EntityIdSchema, fail, ok } from "../primitives"
import type { Result } from "../primitives"
import type { FixtureKit } from "../fixtures/fixture-kit"
import { fixtureInstance } from "../fixtures/definitions"
import type { PlateSetup } from "../plate/plate"
import type { OriginParams } from "../probing/tasks/origin/params"
import { originStartOffset } from "../probing/tasks/origin/plan"
import type { ProbingSourceOf } from "../operations/operation"
import { bedAnchors, deviceAnchorsOf } from "./stored-anchors"

/** A calibration's intended anchor and configuration when its job was prepared. */
export const AnchorCalibrationSchema = z.strictObject({
  anchorId: EntityIdSchema,
  deviceId: z.string().min(1).max(500),
  expectedAnchors: AnchorConfigurationSchema,
  approach: z
    .strictObject({
      binding: ProbeCheckBindingSchema,
      gap: z.number().finite().min(0.1).max(0.5),
      diameter: z.number().finite().min(0.5).max(3.2),
    })
    .optional(),
})
export type AnchorCalibration = z.infer<typeof AnchorCalibrationSchema>

/** A fixed start from the existing stored anchor; never the current probe or work position. */
export function anchorCalibrationParams(kit: FixtureKit): OriginParams | null {
  const reference = kit.anchorCalibration
  if (!reference) return null
  const params: OriginParams = {
    ...reference.params,
    distance: [...reference.params.distance],
    routine: "inside-corner",
    axes: "xy",
    placement: { kind: "probe-position" },
  }
  return {
    ...params,
    placement: {
      kind: "anchor",
      anchorId: reference.anchorId,
      offset: [...originStartOffset(params)],
    },
  }
}

/** Only the kit's exact, anchored setup program owns its modes and clearance travel. */
export function isAnchorPositioningNc(
  nc: string,
  setup: PlateSetup,
  kit: FixtureKit
): boolean {
  const generate = kit.anchorCalibration?.positioningNc
  const placement = anchorCalibrationParams(kit)?.placement
  const stored = setup.anchors
  if (
    !generate ||
    placement?.kind !== "anchor" ||
    stored?.source !== "firmware-config" ||
    stored.deviceId !== setup.deviceId
  )
    return false
  const anchor = stored.anchors.find((item) => item.id === placement.anchorId)
  if (!anchor) return false
  const [dx, dy] = placement.offset
  return (
    nc ===
    generate([anchor.machinePosition[0] + dx, anchor.machinePosition[1] + dy])
  )
}

/** Includes the selected canonical reference at its normal pinned position, not profile defaults. */
export function anchorCalibrationSetup(
  setup: PlateSetup,
  kit: FixtureKit,
  fixtureId: string
): Result<PlateSetup> {
  const reference = kit.anchorCalibration
  const fixture = kit.fixtures.find(
    (entry) => entry.fixture.id === fixtureId
  )?.fixture
  const anchor = bedAnchors(setup.anchors ?? undefined).find(
    (entry) => entry.id === reference?.anchorId
  )
  if (!reference || !fixture || !reference.fixtureIds.includes(fixtureId))
    return fail("Choose the installed calibration reference.")
  if (!anchor) return fail("Read the calibration anchor from the device first.")
  const instance = fixtureInstance(fixture.definition())
  instance.position = [
    fixture.defaultPosition[0] + anchor.position[0],
    fixture.defaultPosition[1] + anchor.position[1],
    fixture.defaultPosition[2],
  ]
  instance.relativeTo = reference.anchorId
  return ok({
    ...setup,
    workOrigin: [anchor.position[0], anchor.position[1], 0],
    workOriginAnchor: reference.anchorId,
    fixtures: [
      ...setup.fixtures.filter(
        (item) => !reference.fixtureIds.includes(item.definition.id)
      ),
      instance,
    ],
  })
}

/** Old unpositioned drafts or edited reference geometry must not run as anchor calibration. */
export function anchorCalibrationIssue(
  source: ProbingSourceOf<"origin">,
  setup: PlateSetup,
  kit: FixtureKit
): string | null {
  const calibration = source.anchorCalibration
  if (!calibration) return null
  if (!calibration.approach)
    return "Recreate this calibration with the guide: it needs a live contact-signal check and bounded approach."
  const reference = kit.anchorCalibration
  const expected = anchorCalibrationParams(kit)
  const expectedPlacement = expected?.placement
  const params = source.params
  const stored = setup.anchors
  const deviceAnchors = stored ? deviceAnchorsOf(stored) : []
  if (
    stored?.source !== "firmware-config" ||
    stored.deviceId !== calibration.deviceId ||
    deviceAnchors.length !== calibration.expectedAnchors.anchors.length ||
    deviceAnchors.some((anchor, index) => {
      const previous = calibration.expectedAnchors.anchors[index]
      return (
        anchor.id !== previous.id ||
        anchor.machinePosition[0] !== previous.x ||
        anchor.machinePosition[1] !== previous.y
      )
    })
  )
    return "Stored anchors changed after preparation. Recreate the calibration before Run."
  if (
    !reference ||
    !expected ||
    calibration.deviceId !== setup.deviceId ||
    calibration.anchorId !== reference.anchorId ||
    params.routine !== expected.routine ||
    params.corner !== expected.corner ||
    params.axes !== expected.axes ||
    params.depth !== Math.max(2, calibration.approach.diameter / 2 + 0.5) ||
    params.distance.some((value, axis) => value !== expected.distance[axis]) ||
    params.placement.kind !== "anchor" ||
    expectedPlacement?.kind !== "anchor" ||
    params.placement.anchorId !== expectedPlacement.anchorId ||
    params.placement.height !== undefined ||
    params.placement.offset.some(
      (value, axis) => value !== expectedPlacement.offset[axis]
    )
  )
    return `Recreate this calibration with Auto calibrate ${reference?.name ?? "anchor"}: it needs the fixed anchored start.`
  const nativeAnchor = calibration.expectedAnchors.anchors.find(
    (item) => item.id === reference.anchorId
  )
  const checked = calibration.approach.binding
  if (
    !nativeAnchor ||
    checked.tool !== source.probe ||
    Math.abs(
      checked.position[0] - nativeAnchor.x - expectedPlacement.offset[0]
    ) > 0.01 ||
    Math.abs(
      checked.position[1] - nativeAnchor.y - expectedPlacement.offset[1]
    ) > 0.01
  )
    return "The checked probe position is not over the anchored bracket start. Reposition and check the signal again."
  const references = setup.fixtures.filter((item) =>
    reference.fixtureIds.includes(item.definition.id)
  )
  const instance = references.at(0)
  const fixture = kit.fixtures.find(
    (entry) => entry.fixture.id === instance?.definition.id
  )?.fixture
  const anchor = bedAnchors(setup.anchors ?? undefined).find(
    (entry) => entry.id === reference.anchorId
  )
  if (
    references.length !== 1 ||
    !instance?.enabled ||
    !fixture ||
    !anchor ||
    instance.definition.kind !== fixture.kind ||
    JSON.stringify(instance.definition.model) !==
      JSON.stringify(fixture.model) ||
    instance.position.some(
      (value, axis) =>
        value !==
        fixture.defaultPosition[axis] + (axis < 2 ? anchor.position[axis] : 0)
    ) ||
    instance.rotation.some(
      (value, axis) => value !== fixture.defaultRotation[axis]
    )
  )
    return `Recreate this calibration with the installed reference at its normal ${reference.name} position.`
  return null
}

/** Rereading identical settings is not a calibration change; read timestamps are provenance. */
export function calibrationAnchorsMatch(
  expected: AnchorConfiguration,
  actual: AnchorConfiguration
) {
  return (
    JSON.stringify({
      anchors: expected.anchors,
      added: expected.added ?? [],
    }) ===
    JSON.stringify({ anchors: actual.anchors, added: actual.added ?? [] })
  )
}
