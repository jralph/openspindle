/**
 * Makera controller framing, shared by the app and the dev simulator:
 * 0x8668 | length u16 | type u8 | payload | CRC-16/XMODEM u16 | 0x55AA,
 * where length counts type + payload + CRC.
 */

export const FRAME_TYPES = {
  control: 0xa1,
  command: 0xa2,
  fileStart: 0xb0,
  fileMd5: 0xb1,
  fileView: 0xb2,
  fileData: 0xb3,
  fileEnd: 0xb4,
  fileCancel: 0xb5,
  fileRetry: 0xb6,
  status: 0x81,
  diagnostics: 0x82,
  loadInfo: 0x83,
  loadFinish: 0x84,
  loadError: 0x85,
  normalInfo: 0x90,
} as const

/** File data frames carry an 8 KiB block plus a 4-byte sequence. */
export const FILE_BLOCK_BYTES = 8192
const MAX_PAYLOAD = 512
const MAX_DATA_PAYLOAD = FILE_BLOCK_BYTES + 4
const MAX_BUFFER = 131072
const MAX_SKIPPED = 1024

export type Frame = { type: number; payload: Uint8Array }

export class FrameError extends Error {}

const encoder = new TextEncoder()

/** CRC-16/XMODEM, matching the firmware's crc16_ccitt. */
export function crc16(data: Uint8Array): number {
  let crc = 0
  for (const byte of data) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff
  }
  return crc
}

const payloadLimit = (type: number) =>
  type === FRAME_TYPES.fileData ? MAX_DATA_PAYLOAD : MAX_PAYLOAD

export function encodeFrame(
  type: number,
  payload: Uint8Array | string = new Uint8Array(0)
): Uint8Array {
  const data = typeof payload === "string" ? encoder.encode(payload) : payload
  if (data.length > payloadLimit(type))
    throw new FrameError(`Frame payload exceeds ${payloadLimit(type)} bytes.`)
  const frame = new Uint8Array(data.length + 9)
  const view = new DataView(frame.buffer)
  view.setUint16(0, 0x8668)
  view.setUint16(2, data.length + 3)
  frame[4] = type
  frame.set(data, 5)
  view.setUint16(data.length + 5, crc16(frame.subarray(2, data.length + 5)))
  view.setUint16(data.length + 7, 0x55aa)
  return frame
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const result = new Uint8Array(a.length + b.length)
  result.set(a)
  result.set(b, a.length)
  return result
}

function headerIndex(buffer: Uint8Array): number {
  for (let index = 0; index + 1 < buffer.length; index++)
    if (buffer[index] === 0x86 && buffer[index + 1] === 0x68) return index
  return -1
}

/** Bounded stream decoder; a corrupt frame is an error, never a guess. */
export class FrameDecoder {
  private buffer = new Uint8Array(0)
  private skipped = 0

  push(chunk: Uint8Array): Frame[] {
    if (this.buffer.length + chunk.length > MAX_BUFFER)
      throw new FrameError("Device frame buffer exceeded its limit.")
    this.buffer = concat(this.buffer, chunk)
    const frames: Frame[] = []
    while (this.buffer.length >= 2) {
      const header = headerIndex(this.buffer)
      if (header < 0) {
        const keep = this.buffer.at(-1) === 0x86 ? 1 : 0
        this.skipped += this.buffer.length - keep
        this.buffer = this.buffer.slice(this.buffer.length - keep)
      } else if (header > 0) {
        this.skipped += header
        this.buffer = this.buffer.slice(header)
      }
      if (this.skipped > MAX_SKIPPED)
        throw new FrameError("Device did not return Makera framed data.")
      if (this.buffer.length < 5) break
      const view = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        this.buffer.byteLength
      )
      const length = view.getUint16(2)
      const type = this.buffer[4]
      if (length < 3 || length - 3 > payloadLimit(type))
        throw new FrameError("Invalid device frame length.")
      const total = length + 6
      if (this.buffer.length < total) break
      if (view.getUint16(total - 2) !== 0x55aa)
        throw new FrameError("Invalid device frame footer.")
      if (
        view.getUint16(total - 4) !== crc16(this.buffer.subarray(2, length + 2))
      )
        throw new FrameError("Device frame CRC verification failed.")
      frames.push({ type, payload: this.buffer.slice(5, total - 4) })
      this.buffer = this.buffer.slice(total)
      this.skipped = 0
    }
    return frames
  }
}
