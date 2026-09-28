import * as THREE from "three"
import { disposeObjects } from "@/lib/three-assets"
import { createRenderLoop } from "./render-loop"
import type { FrameCallback } from "./render-loop"

/** The muted grid lines under a bed or a fixture model: the line colour, then the section. */
export const GRID_COLORS = [0xc2c9d1, 0xd7dde3] as const

export type ViewerStageEvents = {
  /** The renderer's new client size, both non-zero: update the camera's projection here. */
  resize: (width: number, height: number) => void
}

/**
 * What the bed viewer and the fixture model preview share: a WebGL renderer sized to its
 * container, the same light rig, a render-on-demand loop, and disposal. The caller creates
 * its own camera and controls and adds its own content to `scene`; call `resize()` once,
 * after they are ready, to size the renderer for the first frame.
 */
export class ViewerStage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  private readonly container: HTMLElement
  private readonly events: ViewerStageEvents
  private readonly loop: ReturnType<typeof createRenderLoop>
  private readonly observer: ResizeObserver

  constructor(
    container: HTMLElement,
    renderer: THREE.WebGLRenderer,
    frame: FrameCallback,
    events: ViewerStageEvents
  ) {
    this.container = container
    this.renderer = renderer
    this.events = events
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0xe9ecef, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.4))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(0, -100, 400)
    this.scene.add(light)
    const fill = new THREE.DirectionalLight(0xd4e5ff, 1.8)
    fill.position.set(300, 250, 100)
    this.scene.add(fill)
    this.loop = createRenderLoop(frame)
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(container)
  }

  get canvas() {
    return this.renderer.domElement
  }

  readonly invalidate = () => this.loop.invalidate()

  /** Sizes the renderer to the container and lets the caller update its camera; then draws. */
  readonly resize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    if (!width || !height) return
    this.renderer.setSize(width, height)
    this.events.resize(width, height)
    // Resizing clears the canvas; draw in this frame so it never shows blank.
    this.loop.flush()
  }

  dispose() {
    this.observer.disconnect()
    this.loop.dispose()
    disposeObjects(this.scene)
    this.renderer.dispose()
    // The context goes now, not once the canvas is collected: Chromium keeps only a few
    // alive and drops the oldest, which may be one still in use.
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
