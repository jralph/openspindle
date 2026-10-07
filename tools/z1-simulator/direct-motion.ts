import type { Xyz } from "./motion-queue.ts"

export class DirectMotion {
  private position: Xyz
  private velocity: [number, number] = [0, 0]
  private desired: [number, number] = [0, 0]
  private last: number
  private expiresAt = Infinity
  private expired = false
  private speed = 1
  constructor(
    position: Xyz,
    private readonly axisRates: readonly [number, number],
    private readonly acceleration: number,
    private readonly bounds: {
      min: readonly [number, number]
      max: readonly [number, number]
    },
    now: number
  ) {
    this.position = [...position]
    this.last = now
  }
  target(
    vector: readonly [number, number],
    speedScale: number,
    expiresAt: number,
    now: number
  ) {
    this.advance(now, this.speed)
    // Both directions use the slower XY rate so diagonal speed has the same ceiling.
    const rate = (Math.min(...this.axisRates) / 60) * speedScale
    this.desired = [vector[0] * rate, vector[1] * rate]
    this.expiresAt = expiresAt
  }
  zero(now: number) {
    this.advance(now, this.speed)
    this.desired = [0, 0]
    this.expiresAt = Infinity
  }
  advance(now: number, speed: number) {
    this.speed = speed
    const gap = now - this.last
    if (gap < 0 || gap > 50) {
      this.desired = [0, 0]
      this.velocity = [0, 0]
      this.expired = true
      this.last = now
    }
    while (this.last < now) {
      if (this.last >= this.expiresAt) {
        this.desired = [0, 0]
        this.expired = true
      }
      const end = Math.min(
        now,
        this.last + 20,
        this.last < this.expiresAt ? this.expiresAt : now
      )
      const seconds = ((end - this.last) / 1000) * speed
      const dx = this.desired[0] - this.velocity[0]
      const dy = this.desired[1] - this.velocity[1]
      const length = Math.hypot(dx, dy)
      const factor = length
        ? Math.min(1, (this.acceleration * seconds) / length)
        : 0
      for (const axis of [0, 1] as const) {
        const before = this.velocity[axis]
        const after = before + (this.desired[axis] - before) * factor
        const next = this.position[axis] + ((before + after) / 2) * seconds
        const bounded = Math.max(
          this.bounds.min[axis],
          Math.min(this.bounds.max[axis], next)
        )
        this.position[axis] = bounded
        this.velocity[axis] = bounded === next ? after : 0
      }
      this.last = end
    }
    if (now >= this.expiresAt) {
      this.desired = [0, 0]
      this.expired = true
    }
    return {
      position: [...this.position] as Xyz,
      feed: Math.hypot(...this.velocity) * 60,
      moving: this.velocity.some((value) => Math.abs(value) > 1e-8),
      expired: this.expired,
    }
  }
  halt(now: number): Xyz {
    this.advance(now, this.speed)
    this.velocity = [0, 0]
    this.desired = [0, 0]
    return [...this.position]
  }
}
