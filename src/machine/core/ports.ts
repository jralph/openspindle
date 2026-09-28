/**
 * Everything the machine core needs from its host. Electron main supplies Node
 * implementations; the core itself never touches sockets, timers or crypto directly.
 */

export type TimerHandle = { readonly timer: unknown }

export interface Clock {
  now: () => number
  setTimeout: (callback: () => void, milliseconds: number) => TimerHandle
  clearTimeout: (handle: TimerHandle | null | undefined) => void
}

export interface TcpConnection {
  write: (bytes: Uint8Array) => void
  destroy: () => void
}

export interface TcpConnector {
  connect: (
    host: string,
    port: number,
    events: {
      open: () => void
      data: (bytes: Uint8Array) => void
      /** Called once, after an error, a remote end or a local destroy. */
      closed: (error: string | null) => void
    }
  ) => TcpConnection
}

export interface DatagramListener {
  /** Listens passively; returns a function that stops listening. */
  listen: (
    port: number,
    events: {
      ready: () => void
      message: (data: Uint8Array, sender: string) => void
      error: (message: string) => void
    }
  ) => () => void
}

export interface CameraConnection {
  send: (text: string) => void
  close: () => void
}

export interface CameraConnector {
  open: (
    url: string,
    events: {
      open: () => void
      binary: (data: Uint8Array) => void
      closed: () => void
    }
  ) => CameraConnection
}

/** Where the core records what it cannot tell the user: the host's log. */
export interface MachineLog {
  warn: (message: string, detail?: unknown) => void
}

export type MachinePorts = {
  readonly clock: Clock
  readonly tcp: TcpConnector
  readonly udp: DatagramListener
  readonly camera: CameraConnector
  readonly md5: (bytes: Uint8Array) => string
  /** Without one, the core logs nothing. */
  readonly log?: MachineLog
}
