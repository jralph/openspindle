import type {
  CameraConnection,
  CameraConnector,
  Clock,
  TimerHandle,
} from "./ports.ts"

const MAX_FRAME_BYTES = 4 * 1024 * 1024
const CONNECT_TIMEOUT_MS = 8000
const FRAME_TIMEOUT_MS = 15000

export type CameraEvent =
  | {
      readonly kind: "status"
      readonly status: "connecting" | "live" | "error"
    }
  | {
      readonly kind: "frame"
      readonly jpeg: Uint8Array
      readonly receivedAt: number
    }

type Feed = {
  readonly url: string
  readonly listeners: Set<(event: CameraEvent) => void>
  connection: CameraConnection | null
  timer: TimerHandle | null
  status: "connecting" | "live" | "error"
}

const isJpeg = (bytes: Uint8Array) =>
  bytes.length >= 4 &&
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[bytes.length - 2] === 0xff &&
  bytes[bytes.length - 1] === 0xd9

/**
 * The Z1 camera: a WebSocket that streams one JPEG per binary message after
 * "start_stream". One connection per URL, shared by every subscriber.
 */
export class CameraFeed {
  private readonly feeds = new Map<string, Feed>()
  private readonly connector: CameraConnector
  private readonly clock: Clock

  constructor(connector: CameraConnector, clock: Clock) {
    this.connector = connector
    this.clock = clock
  }

  subscribe(url: string, listener: (event: CameraEvent) => void): () => void {
    let feed = this.feeds.get(url)
    if (!feed) {
      feed = {
        url,
        listeners: new Set(),
        connection: null,
        timer: null,
        status: "connecting",
      }
      this.feeds.set(url, feed)
      this.open(feed)
    }
    feed.listeners.add(listener)
    listener({ kind: "status", status: feed.status })
    const current = feed
    return () => {
      current.listeners.delete(listener)
      if (!current.listeners.size) this.close(current)
    }
  }

  dispose() {
    for (const feed of [...this.feeds.values()]) this.close(feed)
  }

  private emit(feed: Feed, event: CameraEvent) {
    for (const listener of [...feed.listeners]) listener(event)
  }

  private arm(feed: Feed, milliseconds: number) {
    this.clock.clearTimeout(feed.timer)
    feed.timer = this.clock.setTimeout(() => this.fail(feed), milliseconds)
  }

  private open(feed: Feed) {
    this.arm(feed, CONNECT_TIMEOUT_MS)
    try {
      feed.connection = this.connector.open(feed.url, {
        open: () => feed.connection?.send("start_stream"),
        binary: (data) => {
          if (this.feeds.get(feed.url) !== feed) return
          if (data.length > MAX_FRAME_BYTES || !isJpeg(data)) {
            this.fail(feed)
            return
          }
          this.arm(feed, FRAME_TIMEOUT_MS)
          if (feed.status !== "live") {
            feed.status = "live"
            this.emit(feed, { kind: "status", status: "live" })
          }
          this.emit(feed, {
            kind: "frame",
            jpeg: data,
            receivedAt: this.clock.now(),
          })
        },
        closed: () => this.fail(feed),
      })
    } catch {
      this.fail(feed)
    }
  }

  /** The feed stays failed until every subscriber leaves; a new subscription retries. */
  private fail(feed: Feed) {
    if (this.feeds.get(feed.url) !== feed || feed.status === "error") return
    this.clock.clearTimeout(feed.timer)
    feed.status = "error"
    const connection = feed.connection
    feed.connection = null
    connection?.close()
    this.emit(feed, { kind: "status", status: "error" })
  }

  private close(feed: Feed) {
    this.clock.clearTimeout(feed.timer)
    if (this.feeds.get(feed.url) === feed) this.feeds.delete(feed.url)
    const connection = feed.connection
    feed.connection = null
    connection?.close()
  }
}
