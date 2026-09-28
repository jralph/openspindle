import * as THREE from "three"
import type {
  ProfilePoint,
  ToolPartRole,
  ToolShape,
} from "@/domain/tools/tool-shape"

/** Materials for a tool's parts; whoever created them disposes them. */
export type ToolMaterials = Readonly<Record<ToolPartRole, THREE.Material>>

/** Facets around the tool's axis. */
const FACETS = 48
/** Outline corners sharper than this stay edges; gentler ones are shaded smooth. */
const CREASE_ANGLE = THREE.MathUtils.degToRad(30)

/**
 * The outline for LatheGeometry, which smooths each point's normal over both of its edges:
 * a sharp corner is given twice, so each of its edges keeps its own normal.
 */
function lathePoints(outline: readonly ProfilePoint[]) {
  const points: THREE.Vector2[] = []
  outline.forEach(([radius, height], index) => {
    const point = new THREE.Vector2(radius, height)
    points.push(point)
    if (index === 0 || index === outline.length - 1) return
    const previous = outline[index - 1]
    const next = outline[index + 1]
    const incoming = new THREE.Vector2(
      radius - previous[0],
      height - previous[1]
    )
    const outgoing = new THREE.Vector2(next[0] - radius, next[1] - height)
    if (incoming.angleTo(outgoing) > CREASE_ANGLE) points.push(point.clone())
  })
  return points
}

/** The flutes in `cut`, the colour cutting moves are drawn in, and the shaft in steel. */
export function toolMaterials(cut: THREE.ColorRepresentation): ToolMaterials {
  const metal = (color: THREE.ColorRepresentation, roughness: number) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness })
  return {
    flutes: metal(cut, 0.35),
    shaft: metal(0xaab1b9, 0.3),
  }
}

/**
 * A tool's parts as solids of revolution in bed space: the axis along Z, the tip at the
 * origin. Each mesh owns its geometry and names its part in `userData.toolPart`.
 */
export function toolModel(shape: ToolShape, materials: ToolMaterials) {
  const model = new THREE.Group()
  for (const part of shape.parts) {
    const mesh = new THREE.Mesh(
      new THREE.LatheGeometry(lathePoints(part.outline), FACETS),
      materials[part.role]
    )
    // The lathe turns its outline around Y; the tool's axis is Z.
    mesh.rotation.x = Math.PI / 2
    mesh.userData.toolPart = part.role
    model.add(mesh)
  }
  return model
}

/** Releases a model's geometry; its materials stay with whoever created them. */
export function disposeToolModel(model: THREE.Object3D) {
  model.removeFromParent()
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose()
  })
}
