import {
  ASSIST_KEYS,
  AnchorConfigurationSchema,
  COORDINATE_LIMIT,
  hasControlCharacter,
  isLocalIPv4,
} from "../../contract/index.ts"
import type {
  AssistKey,
  NetworkDevice,
  PlateAssists,
  Telemetry,
} from "../../contract/index.ts"
import type {
  AssistStep,
  FirmwareAdapter,
  JobProtocol,
  OutboundFrame,
} from "../adapter.ts"
import { FRAME_TYPES, encodeFrame } from "./codec.ts"
import { makeraRules, planMakeraCommand } from "./commands.ts"
import { MakeraCompletion } from "./completion.ts"
import { changesToolBeforeSpindle, prepareMakeraProgram } from "./dialect.ts"
import { parseMakeraHeightMap } from "./height-map.ts"
import { MakeraInterpreter } from "./interpreter.ts"
import { parseFileSize, parseHomedReport } from "./lines.ts"
import { MakeraTransfer } from "./transfer.ts"

const command = (payload: string): OutboundFrame => ({
  type: FRAME_TYPES.command,
  payload,
})

const ASSISTS: Record<
  AssistKey,
  {
    field: "vacuumAuto" | "blowingAuto" | "bedCleanAuto" | "antiStatic"
    suffix: string
  }
> = {
  vacuum: { field: "vacuumAuto", suffix: "" },
  blow: { field: "blowingAuto", suffix: ".1" },
  bedClean: { field: "bedCleanAuto", suffix: ".2" },
  antiStatic: { field: "antiStatic", suffix: ".4" },
}

/** Non-motion firmware modes. Explicit settings persist; nothing is restored automatically. */
function assistPlan(
  assists: PlateAssists | null,
  telemetry: Telemetry
): AssistStep[] {
  if (telemetry.bedCleanAuto === null)
    throw new Error(
      "The device does not report its bed-clean mode; job completion cannot be verified."
    )
  const steps: AssistStep[] = []
  for (const key of ASSIST_KEYS) {
    const mode = assists?.[key] ?? "device"
    if (mode === "device") continue
    const { field, suffix } = ASSISTS[key]
    if (telemetry[field] === null)
      throw new Error(`The device does not report the ${key} assist mode.`)
    const enabled = mode === "on"
    if (telemetry[field] !== enabled)
      steps.push({
        key,
        enabled,
        frame: command(`M${enabled ? 331 : 332}${suffix}`),
        applied: (after) => after[field] === enabled,
      })
  }
  return steps
}

/** The firmware's "no tool" (T-1): the next M6 changes and measures whatever it names. */
const FORGET_TOOL = command("M493.2 T-1")

const makeraJob: JobProtocol = {
  // Where Makera Studio keeps the programs it runs.
  path: (id) => `/sd/gcodes/openspindle-${id}.nc`,
  homedQuery: command("G28.6"),
  homed: parseHomedReport,
  assistPlan,
  bedClean: (telemetry) => telemetry.bedCleanAuto,
  createTransfer: (bytes, md5, path) => new MakeraTransfer(bytes, md5, path),
  // ATCHandler skips M6 for the tool it believes is loaded, so on a manual-change machine the
  // program's first change would neither stop for the tool nor measure it at the tool sensor.
  // Never with an automatic changer: it tracks the clamped tool, and with none set it picks
  // the new one without dropping the old. Never before a spindle start, which halts without
  // a cutting tool.
  toolReset: (program, identity, telemetry) =>
    !identity.atc &&
    telemetry.tool !== -1 &&
    changesToolBeforeSpindle(program.text)
      ? { frame: FORGET_TOOL, applied: (after) => after.tool === -1 }
      : null,
  // As Makera Studio plays a file: the ESP32 streams it to the player, which asks for it by
  // name. `play /sd/<file> -v` never started on a Z1 Pro. Without -v, played lines' replies
  // go nowhere; alarms, halts and automation messages still report.
  play: (path) => command(`play ${path}`),
  playedFileSize: parseFileSize,
  createCompletion: (program, bedClean, now) =>
    new MakeraCompletion(program, bedClean, now),
}

/** Anchor 1 is stored as a machine position, Anchor 2 as an offset from it. */
const ANCHOR_KEYS = [
  "coordinate.anchor1_x",
  "coordinate.anchor1_y",
  "coordinate.anchor2_offset_x",
  "coordinate.anchor2_offset_y",
] as const
const ANCHOR_REPLY =
  /^(sd|cached): (coordinate\.anchor(?:1_[xy]|2_offset_[xy])) is (?:set to (.*)|not in config)$/

/** Passive discovery format from the Z1-supporting community controller: name,ip,port,busy[,version]. */
function parseAnnouncement(
  data: Uint8Array,
  sender: string
): NetworkDevice | null {
  if (data.length > 512 || !isLocalIPv4(sender)) return null
  const fields = new TextDecoder()
    .decode(data)
    .trim()
    .split(",")
    .map((field) => field.trim())
  if (fields.length !== 4 && fields.length !== 5) return null
  const [name, address, port, busy] = fields
  const version = fields.at(4)
  if (
    !name ||
    name.length > 128 ||
    hasControlCharacter(name) ||
    !isLocalIPv4(address) ||
    !/^\d{1,5}$/.test(port) ||
    !["0", "1"].includes(busy) ||
    (version !== undefined && !/^[\x20-\x7e]{1,64}$/.test(version))
  )
    return null
  const portNumber = Number(port)
  if (portNumber < 1 || portNumber > 65535) return null
  // The sender is authoritative: an announcement cannot redirect a connection elsewhere.
  return { name, host: sender, port: portNumber, busy: busy === "1" }
}

export const makeraAdapter: FirmwareAdapter = {
  id: "makera",
  defaultPort: 2222,
  discovery: { port: 3333, parse: parseAnnouncement },
  createInterpreter: () => new MakeraInterpreter(),
  encode: (frame) => encodeFrame(frame.type, frame.payload),
  queries: {
    identity: command("model"),
    status: { type: FRAME_TYPES.control, payload: "?" },
    diagnostics: command("diagnose"),
  },
  halt: { type: FRAME_TYPES.control, payload: "\x18" },
  // SimpleShell's reset: "Rebooting machine in 3 seconds...".
  restart: command("reset"),
  features: (identity, telemetry) => ({
    atc: identity.atc,
    camera: true,
    bedClean: telemetry?.bedCleanAuto != null,
  }),
  plan: planMakeraCommand,
  rules: makeraRules,
  // Application limits for jogging, spindle speed and overrides, not the machine's rating.
  limits: {
    jogMinDistance: 0.01,
    jogMaxDistance: 10,
    jogMinSpeedScale: 0.01,
    jogMaxSpeedScale: 0.25,
    spindleRpmMin: 1000,
    spindleRpmMax: 10000,
    overrideMin: 50,
    overrideMax: 150,
  },
  prepareProgram: prepareMakeraProgram,
  job: makeraJob,
  anchors: {
    admit: (telemetry) =>
      telemetry.state === "Idle" && telemetry.job === null
        ? null
        : "The device must be idle with no active program.",
    keys: ANCHOR_KEYS,
    // Explicitly the persisted SD source; "cached" replies belong to other clients' reads.
    query: (key) => command(`config-get sd ${key}`),
    parse(text, key) {
      if (text.length > 256) return undefined
      const match = ANCHOR_REPLY.exec(text.trim())
      if (!match || match[1] !== "sd" || match[2] !== key) return undefined
      // Group 3 is absent for "is not in config".
      const value = match.at(3)?.trim()
      if (
        !value ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
      )
        return null
      const number = Number(value)
      return Number.isFinite(number) && Math.abs(number) <= COORDINATE_LIMIT
        ? number
        : null
    },
    isReply: (text) => ANCHOR_REPLY.test(text.trim()),
    // Plates keep positions relative to these ids, and so does the Z1 fixture kit's defaults.
    build: ([x, y, offsetX, offsetY], fetchedAt) =>
      AnchorConfigurationSchema.parse({
        source: "firmware-config",
        anchors: [
          { id: "anchor-1", name: "Anchor 1", x, y },
          { id: "anchor-2", name: "Anchor 2", x: x + offsetX, y: y + offsetY },
        ],
        fetchedAt,
      }),
  },
  heightMap: {
    // M375 without .1 would load the grid and enable compensation.
    query: command("M375.1"),
    parse: parseMakeraHeightMap,
  },
  cameraUrl: (device) => `ws://${device.host}:82/ws_video`,
}
