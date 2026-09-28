import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { ModelBounds } from "@/domain/models/model"
import { COORDINATE_LIMIT, toMicrometre } from "@/domain/primitives"
import type { Point3 } from "@/domain/primitives"
import { disposeObjects, glbInBedSpace } from "@/lib/three-assets"

/**
 * A mesh's bounds as the viewer draws it: millimetres, Z up, node transforms applied. Its
 * positions are floats in metres, which hold millimetres only to about 1e-5 mm (a STEP's
 * 50.5 mm reads back as 50.50000176), so the bounds are kept to the micrometre.
 */
export async function meshBounds(mesh: Uint8Array): Promise<ModelBounds> {
  const gltf = await new GLTFLoader().parseAsync(
    new Uint8Array(mesh).buffer,
    ""
  )
  try {
    const world = glbInBedSpace(gltf.scene)
    world.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(world, true)
    const min = box.min.toArray().map(toMicrometre) as Point3
    const max = box.max.toArray().map(toMicrometre) as Point3
    if (
      box.isEmpty() ||
      [...min, ...max].some(
        (value) => !Number.isFinite(value) || Math.abs(value) > COORDINATE_LIMIT
      )
    )
      throw new Error(
        "The model must contain finite geometry within 10 metres of its origin."
      )
    return { min, max }
  } finally {
    disposeObjects(gltf.scene)
  }
}
