import {
  FIXTURE_LIMIT,
  isBedKind,
  isLocked,
  namedFixtures,
  withInstanceOrigin,
} from "@/domain/fixtures/definitions"
import type { FixtureInstance } from "@/domain/fixtures/definitions"
import { fail, ok } from "../primitives"
import type { Point3, Result } from "../primitives"
import type { PlateSetup } from "./plate"

/**
 * What `fixture.update` changes of a fixture: where it is and how it is turned, the anchor it is
 * kept relative to, and its origin, one of its model's points (in the model's frame) that it is
 * then positioned by (`withInstanceOrigin`: it stays where it is). The origin changes first.
 */
export type FixturePatch = Partial<
  Pick<FixtureInstance, "position" | "rotation" | "relativeTo">
> & { readonly origin?: Point3 }

const FULL = `A plate holds at most ${FIXTURE_LIMIT} fixtures.`
const HELD = "The plate already holds this fixture."

const withFixtures = (
  setup: PlateSetup,
  fixtures: FixtureInstance[]
): PlateSetup => ({ ...setup, fixtures })

/** A fixture's name as the plate lists it: numbered among the fixtures on its bed. */
function fixtureName(setup: PlateSetup, instance: FixtureInstance): string {
  const listed = namedFixtures(setup.fixtures.filter((item) => item.enabled))
  return (
    listed.find((item) => item.instance === instance)?.name ??
    instance.definition.name
  )
}

const samePoint = (a: Point3, b: Point3) =>
  a.every((value, axis) => value === b[axis])

/** Whether a fixture stands where it stood, turned the same, and kept relative to the same. */
const samePlacement = (a: FixtureInstance, b: FixtureInstance) =>
  a.definition === b.definition &&
  samePoint(a.position, b.position) &&
  samePoint(a.rotation, b.rotation) &&
  (a.relativeTo ?? null) === (b.relativeTo ?? null)

/** The setup with one of its fixtures as `change` makes it, which may refuse. */
function changeFixture(
  setup: PlateSetup,
  id: string,
  change: (instance: FixtureInstance, name: string) => Result<FixtureInstance>
): Result<PlateSetup> {
  const instance = setup.fixtures.find((item) => item.id === id)
  if (!instance) return fail("The fixture is no longer on the plate.")
  const changed = change(instance, fixtureName(setup, instance))
  if (!changed.ok) return changed
  if (changed.value === instance) return ok(setup)
  return ok(
    withFixtures(
      setup,
      setup.fixtures.map((item) => (item === instance ? changed.value : item))
    )
  )
}

/**
 * The setup with `bed` as its bed, or with none: a plate has one. The plate's own fixture of the
 * bed's definition stays as it is, enabled, else `bed` is added; every other bed goes.
 */
export function withBed(
  setup: PlateSetup,
  bed: FixtureInstance | null
): Result<PlateSetup> {
  if (bed && !isBedKind(bed.definition.kind))
    return fail(`${bed.definition.name} is not a bed.`)
  const own = setup.fixtures.find(
    (item) =>
      isBedKind(item.definition.kind) &&
      item.definition.id === bed?.definition.id
  )
  const fixtures = setup.fixtures.flatMap((item) => {
    if (!isBedKind(item.definition.kind)) return [item]
    if (item !== own) return []
    return [item.enabled ? item : { ...item, enabled: true }]
  })
  if (bed && !own) {
    if (fixtures.some((item) => item.id === bed.id)) return fail(HELD)
    if (fixtures.length >= FIXTURE_LIMIT) return fail(FULL)
    fixtures.push(bed)
  }
  const same =
    fixtures.length === setup.fixtures.length &&
    fixtures.every((item, index) => item === setup.fixtures[index])
  return ok(same ? setup : withFixtures(setup, fixtures))
}

/** The setup with a fixture added at the end; a bed becomes the plate's bed (`withBed`). */
export function addFixture(
  setup: PlateSetup,
  fixture: FixtureInstance
): Result<PlateSetup> {
  if (isBedKind(fixture.definition.kind)) return withBed(setup, fixture)
  if (setup.fixtures.some((item) => item.id === fixture.id)) return fail(HELD)
  if (setup.fixtures.length >= FIXTURE_LIMIT) return fail(FULL)
  return ok(withFixtures(setup, [...setup.fixtures, fixture]))
}

/** The setup without a fixture; a locked one stays until it is unlocked. */
export function removeFixture(
  setup: PlateSetup,
  id: string
): Result<PlateSetup> {
  const instance = setup.fixtures.find((item) => item.id === id)
  if (!instance) return ok(setup)
  if (isLocked(instance))
    return fail(
      `${fixtureName(setup, instance)} is locked. Unlock it to remove it.`
    )
  return ok(
    withFixtures(
      setup,
      setup.fixtures.filter((item) => item !== instance)
    )
  )
}

/** The setup with a fixture placed as `patch` says; a locked one stays as it is. */
export function updateFixture(
  setup: PlateSetup,
  id: string,
  patch: FixturePatch
): Result<PlateSetup> {
  return changeFixture(setup, id, (instance, name) => {
    const { origin, ...placement } = patch
    const framed = origin ? withInstanceOrigin(instance, origin) : instance
    const next = { ...framed, ...placement }
    if (samePlacement(instance, next)) return ok(instance)
    if (isLocked(instance))
      return fail(`${name} is locked. Unlock it to move it.`)
    return ok(next)
  })
}

/** The setup with a fixture locked in place, or unlocked; beds stay in place without a lock. */
export function lockFixture(
  setup: PlateSetup,
  id: string,
  locked: boolean
): Result<PlateSetup> {
  return changeFixture(setup, id, (instance, name) => {
    if (locked && isBedKind(instance.definition.kind))
      return fail(`${name} is a bed: beds stay in place without a lock.`)
    if ((instance.locked === true) === locked) return ok(instance)
    return ok({ ...instance, locked })
  })
}

/**
 * The fixtures of a device profile (`defaults`, its fixtures for new plates) on a plate: the
 * plate's locked fixtures stay where they are, and the first of the profile's beds is its bed.
 */
export function defaultFixtures(
  setup: PlateSetup,
  defaults: readonly FixtureInstance[]
): Result<FixtureInstance[]> {
  const bed = defaults.find((item) => isBedKind(item.definition.kind))
  const fixtures = [
    ...setup.fixtures.filter(isLocked),
    ...defaults.filter(
      (item) => item === bed || !isBedKind(item.definition.kind)
    ),
  ]
  if (fixtures.length > FIXTURE_LIMIT) return fail(FULL)
  if (new Set(fixtures.map((item) => item.id)).size < fixtures.length)
    return fail(HELD)
  return ok(fixtures)
}
