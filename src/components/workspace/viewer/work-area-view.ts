import * as THREE from "three"
import type { ToolpathBounds } from "@/domain/compile/toolpath-bounds"
import type { Point3 } from "@/domain/nc/gcode"
import { disposeObjects } from "@/lib/three-assets"

/**
 * Where a plate cuts, as a dashed rectangle on its surface: the toolpath bounds in work
 * coordinates, placed at the work origin so it moves with the design.
 */
export class WorkAreaView {
  readonly group = new THREE.Group()
  private readonly material: THREE.LineDashedMaterial

  constructor(bounds: ToolpathBounds | null, color: THREE.Color) {
    this.material = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      depthTest: false,
      dashSize: 3,
      gapSize: 2,
    })
    if (!bounds) return
    const [x0, y0] = bounds.min
    const [x1, y1] = bounds.max
    const corners = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0, x0, y0, 0]
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(corners, 3)
      ),
      this.material
    )
    outline.computeLineDistances()
    outline.renderOrder = 4
    this.group.add(outline)
  }

  /** At the work origin in X and Y, on the surface at `z`. */
  place(origin: Point3, z: number) {
    this.group.position.set(origin[0], origin[1], z)
  }

  /** The shown plate's outline is drawn at full strength, others fainter. */
  emphasize(active: boolean) {
    this.material.opacity = active ? 0.9 : 0.35
  }

  dispose() {
    this.group.removeFromParent()
    disposeObjects(this.group)
    // Without bounds no line holds the material.
    this.material.dispose()
  }
}
