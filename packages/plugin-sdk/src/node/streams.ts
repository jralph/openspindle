import type { Readable, Writable } from "node:stream"
import type { ByteChannel } from "@openspindle/rpc/ndjson"

/**
 * A byte channel over Node streams: a child's stdout/stdin seen from the app, or a
 * companion's own stdin/stdout.
 */
export function streamChannel(
  input: Readable,
  output: Writable,
  label: string
): ByteChannel {
  return {
    write: (chunk) => {
      if (output.writable) output.write(chunk)
    },
    listen({ data, end }) {
      const onData = (chunk: Buffer | string) =>
        data(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      const onEnd = () => end(`${label} closed.`)
      const onError = (error: Error) => end(`${label} failed: ${error.message}`)
      input.on("data", onData)
      input.on("end", onEnd)
      input.on("close", onEnd)
      input.on("error", onError)
      return () => {
        input.off("data", onData)
        input.off("end", onEnd)
        input.off("close", onEnd)
        input.off("error", onError)
      }
    },
    close: () => {
      output.end()
    },
  }
}
