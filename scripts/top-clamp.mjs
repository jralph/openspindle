#!/usr/bin/env node
/**
 * Tessellates Makera's Top Clamp STEP with OpenCascade, then writes the Z1 top clamp model:
 *
 *   node scripts/top-clamp.mjs
 *
 * The STEP is Makera's Top Clamp Makerables project, expected at
 * ../resources/makerables/TopClamp.step beside this repository. Fusion 360 exported it Y up;
 * turned Z up for the app's own writer (src/formats/models/glb.ts), the GLB keeps the STEP's own
 * coordinates, as glTF is Y up too. The conversion settings and source hash go to
 * makera-z1-top-clamp.json beside it.
 */
import { createRequire } from "node:module"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { writeGlb } from "../src/formats/models/glb.ts"

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = "../resources/makerables/TopClamp.step"
const output = resolve(projectRoot, "public/models")
const createOcct = require(process.env.OCCT_IMPORT_PATH || "occt-import-js")
/** The tessellation settings the bed models were made with. */
const options = {
  linearUnit: "millimeter",
  linearDeflectionType: "absolute_value",
  linearDeflection: 0.12,
  angularDeflection: 0.35,
}
/** The box Z1TopClamp's frame and points are measured in: STEP millimetres, Y up. */
const EXPECTED = { min: [0, 0, -20], max: [65, 5, 0] }

function bounds(array) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  array.forEach((value, index) => {
    const axis = index % 3
    min[axis] = Math.min(min[axis], value)
    max[axis] = Math.max(max[axis], value)
  })
  return { min, max, size: max.map((value, axis) => value - min[axis]) }
}

/** Y up to Z up: +90° about X, (x, y, z) → (x, −z, y). */
function zUp(values) {
  const turned = new Float64Array(values.length)
  for (let index = 0; index < values.length; index += 3) {
    turned[index] = values[index]
    turned[index + 1] = -values[index + 2]
    turned[index + 2] = values[index + 1]
  }
  return turned
}

const content = await readFile(resolve(projectRoot, source))
const occt = await createOcct()
const result = occt.ReadStepFile(content, options)
if (!result.success || result.meshes.length !== 1)
  throw new Error("OpenCascade did not read the top clamp as one body.")
const [body] = result.meshes
const box = bounds(body.attributes.position.array)
if (
  [box.min, box.max].some((corner, end) =>
    corner.some(
      (value, axis) =>
        Math.abs(value - [EXPECTED.min, EXPECTED.max][end][axis]) > 1e-6
    )
  )
)
  throw new Error(
    "The top clamp's box changed; measure Z1TopClamp's frame and points again before updating."
  )

const positions = zUp(body.attributes.position.array)
const glb = writeGlb(
  {
    positions,
    normals: zUp(body.attributes.normal.array),
    indices: body.index.array,
  },
  {
    name: "Makera Z1 top clamp",
    generator: "Makera STEP converter / occt-import-js 0.0.23",
    color: body.color,
    extras: {
      source,
      sourceCoordinates: "millimeters, Y-up, original STEP coordinates",
      coordinates: "meters, Y-up",
    },
  }
)
await writeFile(resolve(output, "makera-z1-top-clamp.glb"), glb)
await writeFile(
  resolve(output, "makera-z1-top-clamp.json"),
  `${JSON.stringify(
    {
      source,
      sourceSha256: createHash("sha256").update(content).digest("hex"),
      tessellation: options,
      file: "makera-z1-top-clamp.glb",
      vertices: body.attributes.position.array.length / 3,
      triangles: body.index.array.length / 3,
      sourceBoundsMm: box,
      turnedBoundsMm: bounds(positions),
      notes: [
        "Fusion 360 exported the clamp Y up. Turned Z up, (x, y, z) → (x, −z, y), it lies flat face up, its underside at Z 0.",
        "glTF is Y up too, so the GLB holds the STEP's own coordinates, in metres.",
        "Z1TopClamp centres its frame on the slot: offset [-32.5, -10, 0].",
      ],
    },
    null,
    2
  )}\n`
)
const size = bounds(positions).size.map((value) => Number(value.toFixed(3)))
console.log(
  `Converted the top clamp: ${body.index.array.length / 3} triangles, ${size.join(" × ")} mm`
)
