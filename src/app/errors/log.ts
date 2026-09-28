import {
  DEFAULT_DIAGNOSTICS_SETTINGS,
  errorText,
  recordsLevel,
} from "@/platform/contract/diagnostics"
import type { LogLevel, LogRecord } from "@/platform/contract/diagnostics"
import type { DiagnosticsHost } from "@/platform/host"

/** Records go to the main process together, this long after the first of them. */
const SEND_DELAY_MS = 250
/** Before the log is connected, at most this many records wait. */
const MAX_WAITING = 1000
const MAX_BATCH = 500

let host: DiagnosticsHost | null = null
/** The log's level; unknown until the host says, while records wait. */
let level: LogLevel | null = null
let waiting: LogRecord[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function send() {
  if (timer) clearTimeout(timer)
  timer = null
  if (!host || !level) return
  const chosen = level
  const records = waiting.filter((record) => recordsLevel(chosen, record.level))
  waiting = []
  for (let start = 0; start < records.length; start += MAX_BATCH)
    host.log(records.slice(start, start + MAX_BATCH))
}

function write(recordLevel: LogLevel, message: string, detail?: unknown) {
  if (level && !recordsLevel(level, recordLevel)) return
  const text =
    detail === undefined ? message : `${message}: ${errorText(detail)}`
  waiting.push({
    level: recordLevel,
    message: text.slice(0, 40_000),
    time: Date.now(),
  })
  if (waiting.length > MAX_WAITING)
    waiting.splice(0, waiting.length - MAX_WAITING)
  if (host && !timer) timer = setTimeout(send, SEND_DELAY_MS)
}

/**
 * The renderer's side of the app's log, which the main process writes (Settings › Debug
 * level sets how much it records). Records made before the host connects wait for it.
 */
export const log = {
  error: (message: string, detail?: unknown) => write("error", message, detail),
  warn: (message: string, detail?: unknown) => write("warn", message, detail),
  info: (message: string, detail?: unknown) => write("info", message, detail),
  debug: (message: string, detail?: unknown) => write("debug", message, detail),
}

/** Starts sending records to the host's log, once it says at what level. */
export function connectLog(diagnostics: DiagnosticsHost) {
  host = diagnostics
  void diagnostics
    .status()
    .then(({ settings }) => settings.logLevel)
    .catch(() => DEFAULT_DIAGNOSTICS_SETTINGS.logLevel)
    .then((logLevel) => {
      level ??= logLevel
      send()
    })
  // Records of the last moments go before the page does.
  window.addEventListener("pagehide", send)
}

export function setLogLevel(logLevel: LogLevel) {
  level = logLevel
}
