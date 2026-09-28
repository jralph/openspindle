import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Socket } from "node:net"

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

const WIDTH = 640
const HEIGHT = 480
const BAR = 40
/** Frames per sweep of the test card's bar across the picture. */
const FRAMES = 12

/** A 24-bit BMP test card: a dark grey field with an orange bar at `position` (0 to 1). */
function testCard(position: number): Buffer {
  const row = WIDTH * 3
  const bmp = Buffer.alloc(54 + row * HEIGHT)
  bmp.write("BM", 0, "latin1")
  bmp.writeUInt32LE(bmp.length, 2)
  bmp.writeUInt32LE(54, 10)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(WIDTH, 18)
  bmp.writeInt32LE(HEIGHT, 22)
  bmp.writeUInt16LE(1, 26)
  bmp.writeUInt16LE(24, 28)
  bmp.writeUInt32LE(row * HEIGHT, 34)
  const left = Math.round(position * (WIDTH - BAR))
  for (let y = 0; y < HEIGHT; y++) {
    const grey = 50 + Math.round((y / HEIGHT) * 40)
    for (let x = 0; x < WIDTH; x++) {
      const bar = x >= left && x < left + BAR
      // BMP pixels are blue, green, red.
      bmp.set(bar ? [40, 150, 245] : [grey, grey, grey], 54 + y * row + x * 3)
    }
  }
  return bmp
}

/** A moving test card as JPEG frames, converted with macOS sips; no frames elsewhere. */
function loadFrames(log: (message: string) => void): Buffer[] {
  const folder = mkdtempSync(join(tmpdir(), "z1-camera-"))
  const frames: Buffer[] = []
  for (let index = 0; index < FRAMES; index++) {
    const bmp = join(folder, `${index}.bmp`)
    const jpeg = join(folder, `${index}.jpg`)
    writeFileSync(bmp, testCard(index / (FRAMES - 1)))
    try {
      execFileSync("sips", ["-s", "format", "jpeg", bmp, "--out", jpeg], {
        stdio: "ignore",
      })
      frames.push(readFileSync(jpeg))
    } catch {
      log("camera: could not make its frames (sips is macOS-only)")
      return []
    }
  }
  return frames
}

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length
  let header: Buffer
  if (length < 126) header = Buffer.from([0x80 | opcode, length])
  else if (length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

/** Reads one masked client text frame (enough for "start_stream"). */
function clientText(data: Buffer): string | null {
  if (data.length < 6 || (data[0] & 0x0f) !== 1) return null
  const length = data[1] & 0x7f
  if (length >= 126) return null
  const mask = data.subarray(2, 6)
  const payload = data.subarray(6, 6 + length)
  return Buffer.from(
    payload.map((byte, index) => byte ^ mask[index % 4])
  ).toString("utf8")
}

/** The Z1 ESP32 camera endpoint: ws://host:82/ws_video, JPEG frames after "start_stream". */
export function startCamera(port: number, log: (message: string) => void) {
  const frames = loadFrames(log)
  const server = createServer((_request, response) => {
    response.writeHead(404).end()
  })
  server.on("upgrade", (request, raw) => {
    const socket = raw as Socket
    const key = request.headers["sec-websocket-key"]
    if (request.url !== "/ws_video" || typeof key !== "string") {
      socket.destroy()
      return
    }
    const accept = createHash("sha1")
      .update(key + GUID)
      .digest("base64")
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    let timer: ReturnType<typeof setInterval> | undefined
    let index = 0
    socket.on("data", (data: Buffer) => {
      if (clientText(data) !== "start_stream" || timer || !frames.length) return
      log("camera: streaming")
      timer = setInterval(() => {
        socket.write(frame(2, frames[index++ % frames.length]))
      }, 500)
    })
    const stop = () => clearInterval(timer)
    socket.on("close", stop)
    socket.on("error", stop)
  })
  server.on("error", (error) => log(`camera: ${error.message}`))
  server.listen(port, "127.0.0.1", () =>
    log(`camera on ws://127.0.0.1:${port}/ws_video`)
  )
  return server
}
