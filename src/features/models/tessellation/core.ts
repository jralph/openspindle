import type { Occt, OcctMesh } from "occt-import-js"
import { MODEL_LIMITS } from "@/domain/models/model"
import type { MeshArrays } from "@/formats/models/glb"

/**
 * The chord error is 0.1% of each top-level shape's mean bounding-box size (0.1 mm for a
 * 100 mm part), so small parts stay smooth while large assemblies keep a bounded triangle
 * count; 0.35 rad (20°) of angular deflection draws holes and bosses with at least 18 sides.
 */
export const TESSELLATION_PARAMS = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.35,
} as const

export type TessellationResult = {
  /** Every body merged into one mesh, in millimetres, Z up. */
  mesh: MeshArrays
  /** Bodies that produced triangles: solids, and any shells or loose faces outside one. */
  solids: number
  triangles: number
}

/** OpenCascade failed while reading: its instance should not be used again. */
export class OcctFailure extends Error {}

const count = new Intl.NumberFormat("en-US")

function readStep(occt: Occt, step: Uint8Array) {
  try {
    return occt.ReadStepFile(step, TESSELLATION_PARAMS)
  } catch (cause) {
    // An abort inside the wasm: out of memory, or a fault on malformed input.
    throw new OcctFailure(
      "This STEP file could not be converted. It may be damaged, or too complex to process.",
      { cause }
    )
  }
}

/** Area-weighted vertex normals, for a body whose faces came without them. */
function vertexNormals(
  positions: readonly number[],
  indices: readonly number[]
): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let corner = 0; corner < indices.length; corner += 3) {
    const a = indices[corner] * 3
    const b = indices[corner + 1] * 3
    const c = indices[corner + 2] * 3
    const u = [0, 1, 2].map((axis) => positions[b + axis] - positions[a + axis])
    const v = [0, 1, 2].map((axis) => positions[c + axis] - positions[a + axis])
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]
    for (const vertex of [a, b, c])
      for (const axis of [0, 1, 2]) normals[vertex + axis] += normal[axis]
  }
  for (let vertex = 0; vertex < normals.length; vertex += 3) {
    const length =
      Math.hypot(normals[vertex], normals[vertex + 1], normals[vertex + 2]) || 1
    for (const axis of [0, 1, 2]) normals[vertex + axis] /= length
  }
  return normals
}

/** One indexed mesh from OCCT's bodies, each of which indexes its own vertices. */
function merge(bodies: readonly OcctMesh[]): MeshArrays {
  let values = 0
  let corners = 0
  for (const body of bodies) {
    values += body.attributes.position.array.length
    corners += body.index.array.length
  }
  const positions = new Float32Array(values)
  const normals = new Float32Array(values)
  const indices = new Uint32Array(corners)
  values = 0
  corners = 0
  for (const body of bodies) {
    const position = body.attributes.position.array
    const index = body.index.array
    positions.set(position, values)
    normals.set(
      body.attributes.normal?.array ?? vertexNormals(position, index),
      values
    )
    const first = values / 3
    for (let corner = 0; corner < index.length; corner++)
      indices[corners + corner] = first + index[corner]
    values += position.length
    corners += index.length
  }
  return { positions, normals, indices }
}

/** Reads a STEP file with OpenCascade and merges its bodies into one display mesh. */
export function tessellateWith(
  occt: Occt,
  step: Uint8Array
): TessellationResult {
  const result = readStep(occt, step)
  if (!result.success) throw new Error("This file isn't a readable STEP model.")
  const bodies = (result.meshes ?? []).filter(
    (mesh) => mesh.index.array.length >= 3
  )
  let triangles = 0
  for (const body of bodies) triangles += body.index.array.length / 3
  if (!triangles) throw new Error("This STEP file contains no solid geometry.")
  if (triangles > MODEL_LIMITS.triangles)
    throw new Error(
      `This model is too detailed to display: it has ${count.format(triangles)} triangles, and models may have at most ${count.format(MODEL_LIMITS.triangles)}.`
    )
  return { mesh: merge(bodies), solids: bodies.length, triangles }
}
