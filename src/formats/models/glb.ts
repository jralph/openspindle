import { z } from "zod"

/** One indexed triangle mesh in millimetres, Z up: STEP's convention and the bed's. */
export type MeshArrays = {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export type GlbOptions = {
  /** Names the node, mesh and material. */
  readonly name: string
  /** The tool that wrote the file (`asset.generator`). */
  readonly generator: string
  /** Base colour, linear RGB from 0 to 1. */
  readonly color?: readonly [number, number, number]
  /** Provenance kept in `asset.extras`, such as the source file. */
  readonly extras?: Record<string, unknown>
}

/** A part's glTF metallic-roughness material; the colour is linear RGB from 0 to 1. */
export type GlbMaterial = {
  readonly color: readonly [number, number, number]
  readonly metallic: number
  readonly roughness: number
}

/** One part of a model: its mesh and the material it is drawn in, named by `name`. */
export type GlbPart = {
  readonly name: string
  readonly mesh: MeshInput
  readonly material: GlbMaterial
}

const MiB = 1024 * 1024
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const FLOAT = 5126
const UNSIGNED_INT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
/** Aluminium grey, for parts without a colour of their own. */
const DEFAULT_COLOR = [0.72, 0.74, 0.77] as const

/**
 * glTF is metres, Y up: a −90° rotation about X maps (x, y, z) to (x, z, −y). Doubles are
 * scaled before they round to float, so the bed conversion's OCCT output rounds once.
 */
function toGltfAxes(values: ArrayLike<number>, scale: number) {
  const converted = new Float32Array(values.length)
  for (let index = 0; index < values.length; index += 3) {
    converted[index] = values[index] * scale
    converted[index + 1] = values[index + 2] * scale
    converted[index + 2] = -values[index + 1] * scale
  }
  return converted
}

function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  positions.forEach((value, index) => {
    const axis = index % 3
    min[axis] = Math.min(min[axis], value)
    max[axis] = Math.max(max[axis], value)
  })
  return { min, max }
}

const bytesOf = (array: Float32Array | Uint32Array) =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength)

/** `MeshArrays`, or the same layout in plain numbers such as OCCT's doubles. */
type MeshInput = { readonly [Key in keyof MeshArrays]: ArrayLike<number> }

/** Each part's material when a mesh has one colour: `GlbOptions.color` or aluminium grey. */
const SINGLE_FINISH = { metallic: 0.65, roughness: 0.38 } as const

/**
 * One mesh as a self-contained binary glTF 2.0 file, which `glbInBedSpace` returns to
 * bed space. The layout matches the GLBs in public/models.
 */
export function writeGlb(mesh: MeshInput, options: GlbOptions): Uint8Array {
  return writeGlbParts(
    [
      {
        name: options.name,
        mesh,
        material: { color: options.color ?? DEFAULT_COLOR, ...SINGLE_FINISH },
      },
    ],
    options
  )
}

/**
 * Parts in materials of their own as one self-contained binary glTF 2.0 file: one node and
 * mesh named `options.name`, with a primitive per part. A single part is laid out as
 * `writeGlb` always wrote it.
 */
export function writeGlbParts(
  parts: readonly GlbPart[],
  options: Omit<GlbOptions, "color">
): Uint8Array {
  if (!parts.length) throw new Error("A GLB needs at least one part.")
  const arrays = parts.map(({ mesh }) => {
    if (
      !mesh.indices.length ||
      mesh.indices.length % 3 ||
      mesh.positions.length % 3 ||
      mesh.normals.length !== mesh.positions.length
    )
      throw new Error("A GLB mesh needs triangles and a normal per vertex.")
    return [
      toGltfAxes(mesh.positions, 0.001),
      toGltfAxes(mesh.normals, 1),
      mesh.indices instanceof Uint32Array
        ? mesh.indices
        : Uint32Array.from(mesh.indices),
    ] as const
  })
  // Per part, its positions, normals and indices follow each other in the binary chunk.
  const views = arrays.flat()
  const offsets: number[] = []
  let binaryLength = 0
  for (const array of views) {
    offsets.push(binaryLength)
    binaryLength += array.byteLength
  }
  const document = {
    asset: {
      version: "2.0",
      generator: options.generator,
      extras: options.extras,
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: options.name, mesh: 0 }],
    meshes: [
      {
        name: options.name,
        primitives: parts.map((_, part) => ({
          attributes: { POSITION: 3 * part, NORMAL: 3 * part + 1 },
          indices: 3 * part + 2,
          material: part,
        })),
      },
    ],
    materials: parts.map(({ name, material }) => ({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...material.color, 1],
        metallicFactor: material.metallic,
        roughnessFactor: material.roughness,
      },
      doubleSided: false,
    })),
    buffers: [{ byteLength: binaryLength }],
    bufferViews: views.map((array, view) => ({
      buffer: 0,
      byteOffset: offsets[view],
      byteLength: array.byteLength,
      target: view % 3 === 2 ? ELEMENT_ARRAY_BUFFER : ARRAY_BUFFER,
    })),
    accessors: arrays.flatMap(([positions, normals, indices], part) => [
      {
        bufferView: 3 * part,
        componentType: FLOAT,
        count: positions.length / 3,
        type: "VEC3",
        ...bounds(positions),
      },
      {
        bufferView: 3 * part + 1,
        componentType: FLOAT,
        count: normals.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 3 * part + 2,
        componentType: UNSIGNED_INT,
        count: indices.length,
        type: "SCALAR",
      },
    ]),
  }
  const json = new TextEncoder().encode(JSON.stringify(document))
  // Chunks are 4-byte aligned: JSON pads with spaces, binary data with zeros.
  const jsonLength = Math.ceil(json.length / 4) * 4
  const binaryStart = 20 + jsonLength + 8
  const glb = new Uint8Array(binaryStart + binaryLength)
  const view = new DataView(glb.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, glb.length, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, JSON_CHUNK, true)
  glb.set(json, 20)
  glb.fill(0x20, 20 + json.length, 20 + jsonLength)
  view.setUint32(20 + jsonLength, binaryLength, true)
  view.setUint32(24 + jsonLength, BIN_CHUNK, true)
  // Typed arrays are little-endian on every platform the app runs on, as glTF requires.
  views.forEach((array, index) =>
    glb.set(bytesOf(array), binaryStart + offsets[index])
  )
  return glb
}

/** A model must be one self-contained GLB; never load resource URIs from its metadata. */
export function validateGlb(bytes: Uint8Array, maxBytes: number): void {
  if (bytes.byteLength > maxBytes)
    throw new Error(`Models must be ${maxBytes / MiB} MB or smaller.`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.byteLength < 20 ||
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throw new Error("Choose a valid binary glTF (.glb) model.")
  let offset = 12
  let chunks = 0
  let document: unknown
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength)
      throw new Error("The model file is incomplete.")
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    offset += 8
    const expected = chunks === 0 ? JSON_CHUNK : BIN_CHUNK
    if (
      length % 4 ||
      offset + length > bytes.byteLength ||
      chunks > 1 ||
      type !== expected
    )
      throw new Error("The model has invalid GLB chunks.")
    if (chunks === 0) {
      try {
        document = JSON.parse(
          new TextDecoder().decode(bytes.subarray(offset, offset + length))
        )
      } catch {
        throw new Error("The model has invalid glTF metadata.")
      }
    }
    offset += length
    chunks++
  }
  let nodes = 0
  function inspect(value: unknown, depth = 0) {
    if (++nodes > 100000 || depth > 32)
      throw new Error("The model metadata is too complex.")
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri")
        throw new Error("GLB models must embed all geometry and textures.")
      inspect(child, depth + 1)
    }
  }
  inspect(document)
  if (
    !document ||
    typeof document !== "object" ||
    !("asset" in document) ||
    !document.asset ||
    typeof document.asset !== "object" ||
    !("version" in document.asset) ||
    document.asset.version !== "2.0"
  )
    throw new Error("Only glTF 2.0 models are supported.")
}

const Index = z.int().nonnegative()

/** The parts of a glTF document that size its meshes. */
const MeshCountsSchema = z.object({
  accessors: z.array(z.object({ count: Index })).default([]),
  meshes: z
    .array(
      z.object({
        primitives: z.array(
          z.object({
            attributes: z.object({ POSITION: Index.optional() }),
            indices: Index.optional(),
            mode: z.int().optional(),
          })
        ),
      })
    )
    .default([]),
})

/** Triangles and vertices of a GLB that passed `validateGlb`, counting each mesh once. */
export function glbStats(bytes: Uint8Array): {
  triangles: number
  vertices: number
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const json = bytes.subarray(20, 20 + view.getUint32(12, true))
  const parsed = MeshCountsSchema.safeParse(
    JSON.parse(new TextDecoder().decode(json))
  )
  if (!parsed.success) throw new Error("The model has invalid glTF metadata.")
  const { accessors, meshes } = parsed.data
  const count = (accessor: number | undefined) => {
    const found = accessor === undefined ? undefined : accessors[accessor]
    if (!found) throw new Error("The model has invalid glTF metadata.")
    return found.count
  }
  let triangles = 0
  let vertices = 0
  for (const mesh of meshes)
    for (const primitive of mesh.primitives) {
      // Only triangle lists (mode 4, the default) are drawn as surfaces.
      if ((primitive.mode ?? 4) !== 4) continue
      const positions = count(primitive.attributes.POSITION)
      const corners =
        primitive.indices === undefined ? positions : count(primitive.indices)
      triangles += Math.floor(corners / 3)
      vertices += positions
    }
  return { triangles, vertices }
}
