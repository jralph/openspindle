import type { MenuCommand } from "../../../src/platform/contract/menu"

/** Delivers menu commands to the renderer; buffers the latest one until a window listens. */
export class MenuBus {
  private readonly listeners = new Set<(command: MenuCommand) => void>()
  private pending: MenuCommand | null = null

  emit(command: MenuCommand) {
    if (this.listeners.size === 0) {
      this.pending = command
      return
    }
    for (const listener of this.listeners) listener(command)
  }

  subscribe(listener: (command: MenuCommand) => void): () => void {
    this.listeners.add(listener)
    const pending = this.pending
    this.pending = null
    if (pending) listener(pending)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
