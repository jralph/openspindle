import * as THREE from "three"
import type { Point3 } from "@/domain/nc/gcode"

/** How a point shows: on the item being moved, on something else, or a device anchor. */
export type MarkerStyle = "own" | "target" | "anchor"

export type Marker = {
  readonly position: Point3
  readonly style: MarkerStyle
  /** A ring around the point: picked, hovered or snapped to. */
  readonly ring?: boolean
}

/** Diameters in CSS pixels; markers keep their size at every zoom. */
const DOT_SIZE: Record<MarkerStyle, number> = { own: 11, target: 8, anchor: 10 }
const RING_SIZE = 22

const vertexShader = /* glsl */ `
  attribute vec3 markerColor;
  attribute float markerSize;
  attribute float markerRing;
  uniform float pixelRatio;
  varying vec3 vColor;
  varying float vRing;
  void main() {
    vColor = markerColor;
    vRing = markerRing;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = markerSize * pixelRatio;
  }
`

/** Dots have a white rim, so they read on the light metal bed and the dark MDF alike. */
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vRing;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float aa = fwidth(r);
    float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
    vec3 color;
    if (vRing > 0.5) {
      alpha *= smoothstep(0.6 - aa, 0.6, r);
      float band = smoothstep(0.68 - aa, 0.68, r) * (1.0 - smoothstep(0.88 - aa, 0.88, r));
      color = mix(vec3(1.0), vColor, band);
    } else {
      color = mix(vColor, vec3(1.0), smoothstep(0.6 - aa, 0.6, r));
    }
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`

/** The mount points of a plate's setup items, drawn over everything while moving. */
export class SetupMarkers {
  readonly object: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private readonly colors: Record<MarkerStyle, THREE.Color>

  constructor(primary: THREE.Color, pixelRatio: number) {
    this.colors = {
      own: primary,
      target: new THREE.Color(0x3d444d),
      anchor: new THREE.Color(0xf58b24),
    }
    this.object = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: { pixelRatio: { value: pixelRatio } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    )
    this.object.renderOrder = 12
    this.object.frustumCulled = false
    this.object.visible = false
  }

  /** Shows these markers; rings draw first, so their dots stay on top. */
  show(markers: readonly Marker[] | null) {
    if (!markers?.length) {
      this.object.visible = false
      return
    }
    const ordered = [
      ...markers.filter((marker) => marker.ring),
      ...markers.filter((marker) => !marker.ring),
    ]
    const geometry = this.geometryFor(ordered.length)
    const attribute = (name: string) =>
      geometry.getAttribute(name) as THREE.BufferAttribute
    const positions = attribute("position")
    const colors = attribute("markerColor")
    const sizes = attribute("markerSize")
    const rings = attribute("markerRing")
    ordered.forEach((marker, index) => {
      const color = this.colors[marker.style]
      positions.setXYZ(index, ...marker.position)
      colors.setXYZ(index, color.r, color.g, color.b)
      sizes.setX(index, marker.ring ? RING_SIZE : DOT_SIZE[marker.style])
      rings.setX(index, marker.ring ? 1 : 0)
    })
    for (const changed of [positions, colors, sizes, rings])
      changed.needsUpdate = true
    this.object.visible = true
  }

  dispose() {
    this.object.removeFromParent()
    this.object.geometry.dispose()
    this.object.material.dispose()
  }

  /** Reuses the buffers while the count stays; a new count gets new ones. */
  private geometryFor(count: number) {
    const current = this.object.geometry
    if (
      current.hasAttribute("position") &&
      current.getAttribute("position").count === count
    )
      return current
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    )
    geometry.setAttribute(
      "markerColor",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    )
    geometry.setAttribute(
      "markerSize",
      new THREE.BufferAttribute(new Float32Array(count), 1)
    )
    geometry.setAttribute(
      "markerRing",
      new THREE.BufferAttribute(new Float32Array(count), 1)
    )
    this.object.geometry = geometry
    current.dispose()
    return geometry
  }
}
