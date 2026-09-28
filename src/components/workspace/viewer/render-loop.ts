/** Draws one frame and reports whether the next frame is still needed. */
export type FrameCallback = () => boolean

export type RenderLoop = {
  /** Schedules one frame; requests made before it runs share it. */
  invalidate: () => void
  /** Draws synchronously, for example after a resize cleared the canvas. */
  flush: () => void
  dispose: () => void
}

/**
 * Renders on demand instead of every display refresh. A frame that reports
 * ongoing motion (controls damping settling) schedules the next one itself.
 */
export function createRenderLoop(frame: FrameCallback): RenderLoop {
  let handle: number | null = null
  let disposed = false
  const cancel = () => {
    if (handle !== null) cancelAnimationFrame(handle)
    handle = null
  }
  const run = () => {
    handle = null
    if (frame()) invalidate()
  }
  const invalidate = () => {
    if (!disposed && handle === null) handle = requestAnimationFrame(run)
  }
  return {
    invalidate,
    flush: () => {
      if (disposed) return
      cancel()
      run()
    },
    dispose: () => {
      disposed = true
      cancel()
    },
  }
}
