import * as THREE from "three"

/** GLB models use meters/Y-up; the bed and fixtures use millimeters/Z-up. */
export function glbInBedSpace(scene: THREE.Object3D) {
  const group = new THREE.Group()
  group.rotation.x = Math.PI / 2
  group.scale.setScalar(1000)
  group.add(scene)
  return group
}

/** A fixture model's mesh (in bed space) in the fixture's frame: turned, then moved by its offset. */
export function inFixtureFrame(
  model: {
    readonly offset: readonly [number, number, number]
    /** Rotations about X, Y and Z, in degrees. */
    readonly orientation?: readonly [number, number, number]
  },
  mesh: THREE.Object3D
) {
  const frame = new THREE.Group()
  frame.position.set(...model.offset)
  const [x, y, z] = (model.orientation ?? [0, 0, 0]).map((angle) =>
    THREE.MathUtils.degToRad(angle)
  )
  frame.rotation.set(x, y, z)
  frame.add(mesh)
  return frame
}

export function materialsOf(object: {
  material: THREE.Material | THREE.Material[]
}) {
  return Array.isArray(object.material) ? object.material : [object.material]
}

/** Releases materials together with the textures they reference. */
export function disposeMaterials(materials: Iterable<THREE.Material>) {
  const textures = new Set<THREE.Texture>()
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) texture.dispose()
}

/** Clones share geometry, materials and textures; release every GPU resource once. */
export function disposeObjects(...objects: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  for (const object of objects)
    object.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line ||
        child instanceof THREE.Points
      ) {
        geometries.add(child.geometry)
        for (const material of materialsOf(child)) materials.add(material)
      } else if (child instanceof THREE.Sprite) materials.add(child.material)
    })
  disposeMaterials(materials)
  for (const geometry of geometries) geometry.dispose()
}
