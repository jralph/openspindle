import type { Transport } from "./transport.ts"

/**
 * A duplex byte channel, such as a child process's stdio seen from its parent or a
 * process's own stdin/stdout. Hosts adapt their streams to this; nothing here is Node-specific.
 */
export interface ByteChannel {
  write: (chunk: string) => void
  listen: (handlers: {
    readonly data: (chunk: Uint8Array) => void
    readonly end: (reason?: string) => void
  }) => () => void
  close: () => void
}

export interface NdjsonOptions {
  /** A longer line closes the channel instead of buffering without bound. */
  readonly maxLineBytes?: number
  /** Lines that are not JSON (a stray log line on stdout) are reported here and skipped. */
  readonly onInvalidLine?: (line: string) => void
}

const NEWLINE = 0x0a
const DEFAULT_MAX_LINE_BYTES = 64 * 1024 * 1024

function concat(parts: readonly Uint8Array[], length: number): Uint8Array {
  if (parts.length === 1 && parts[0].byteLength === length) return parts[0]
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

/** One JSON message per line; JSON never contains a raw newline, so framing is exact. */
export function ndjsonTransport(
  channel: ByteChannel,
  options: NdjsonOptions = {}
): Transport {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
  const decoder = new TextDecoder()
  let closed = false

  const deliver = (
    bytes: Uint8Array,
    onMessage: (message: unknown) => void
  ) => {
    const line = decoder.decode(bytes).replace(/\r$/, "")
    if (!line.trim()) return
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      options.onInvalidLine?.(line)
      return
    }
    onMessage(message)
  }

  return {
    send(message) {
      if (!closed) channel.write(`${JSON.stringify(message)}\n`)
    },
    listen(onMessage, onClose) {
      let parts: Uint8Array[] = []
      let pending = 0
      let ended = false
      let stop = () => {}
      const end = (reason?: string) => {
        if (ended) return
        ended = true
        stop()
        onClose(reason)
      }
      stop = channel.listen({
        data(chunk) {
          if (ended) return
          let start = 0
          for (
            let index = chunk.indexOf(NEWLINE);
            index !== -1;
            index = chunk.indexOf(NEWLINE, start)
          ) {
            const piece = chunk.subarray(start, index)
            if (pending + piece.byteLength > maxLineBytes) {
              end("A message exceeded the size limit.")
              return
            }
            deliver(
              concat([...parts, piece], pending + piece.byteLength),
              onMessage
            )
            parts = []
            pending = 0
            start = index + 1
          }
          const rest = chunk.subarray(start)
          if (!rest.byteLength) return
          if (pending + rest.byteLength > maxLineBytes) {
            end("A message exceeded the size limit.")
            return
          }
          // Copied: a host may reuse its chunk buffer after this callback returns.
          parts.push(rest.slice())
          pending += rest.byteLength
        },
        end: (reason) => end(reason ?? "The stream ended."),
      })
      return () => {
        ended = true
        stop()
      }
    },
    close() {
      if (closed) return
      closed = true
      channel.close()
    },
  }
}
