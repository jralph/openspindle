import { z } from "zod"
import { SaveFileResultSchema } from "./files"

/** How much the log records, from errors only to everything (Settings › Debug level). */
export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const
export const LogLevelSchema = z.enum(LOG_LEVELS)
export type LogLevel = z.infer<typeof LogLevelSchema>

/** Whether the log records a message of `level` when it is set to `chosen`. */
export const recordsLevel = (chosen: LogLevel, level: LogLevel) =>
  LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(chosen)

export const DiagnosticsSettingsSchema = z.strictObject({
  logLevel: LogLevelSchema,
  /** Errors are reported as they happen; otherwise only the ones the user sends. */
  reportAutomatically: z.boolean(),
})
export type DiagnosticsSettings = z.infer<typeof DiagnosticsSettingsSchema>

export const DEFAULT_DIAGNOSTICS_SETTINGS: DiagnosticsSettings = {
  logLevel: "info",
  reportAutomatically: true,
}

/** A Sentry event id: 32 lowercase hex digits. The error dialog shows it. */
export const EventIdSchema = z.string().regex(/^[0-9a-f]{32}$/)

/** What the app and system are, for an issue report. */
export const AppInfoSchema = z.strictObject({
  version: z.string().max(100),
  electron: z.string().max(100),
  os: z.string().max(200),
})
export type AppInfo = z.infer<typeof AppInfoSchema>

export const DiagnosticsStatusSchema = z.strictObject({
  settings: DiagnosticsSettingsSchema,
  /** Whether this build sends error reports; builds without a Sentry DSN only log errors. */
  reporting: z.boolean(),
  app: AppInfoSchema,
})
export type DiagnosticsStatus = z.infer<typeof DiagnosticsStatusSchema>

/** An error as the error dialog shows it and an issue report quotes it. */
export const ErrorSummarySchema = z.strictObject({
  name: z.string().max(200),
  message: z.string().max(4000),
  stack: z.string().max(20_000),
})
export type ErrorSummary = z.infer<typeof ErrorSummarySchema>

export function errorSummary(error: unknown): ErrorSummary {
  if (error instanceof Error)
    return {
      name: error.name.slice(0, 200),
      message: error.message.slice(0, 4000),
      stack: (error.stack ?? "").slice(0, 20_000),
    }
  return { name: "Error", message: String(error).slice(0, 4000), stack: "" }
}

/** An error of the main process, offered to the user to report. */
export const MainErrorSchema = z.strictObject({
  eventId: EventIdSchema,
  error: ErrorSummarySchema,
})
export type MainError = z.infer<typeof MainErrorSchema>

export const LogRecordSchema = z.strictObject({
  level: LogLevelSchema,
  message: z.string().max(40_000),
  /** When it happened, in milliseconds since the epoch: records arrive in batches. */
  time: z.number(),
})
export type LogRecord = z.infer<typeof LogRecordSchema>

/** An error as the log writes it: its stack, then its causes; anything else as JSON. */
export function errorText(value: unknown, depth = 0): string {
  if (value instanceof Error) {
    const heading = `${value.name}: ${value.message}`
    const stack = value.stack ?? heading
    // A stack of frames alone (React's component stack) gets the error's name and message.
    const text = stack.trimStart().startsWith("at ")
      ? `${heading}\n${stack.replace(/^\n+/, "")}`
      : stack
    if (value.cause === undefined || depth >= 4) return text
    return `${text}\nCaused by: ${errorText(value.cause, depth + 1)}`
  }
  if (typeof value === "string") return value
  try {
    // Undefined for undefined and functions, which TypeScript's declaration leaves out.
    const json = JSON.stringify(value) as string | undefined
    return json ?? String(value)
  } catch {
    return String(value)
  }
}

/** At most this much of the log goes with a report. */
export const REPORT_LOG_BYTES = 1024 * 1024

/** The log and error reports, served by the desktop main process. */
export const diagnosticsMethods = {
  "diagnostics.status": {
    params: z.undefined(),
    result: DiagnosticsStatusSchema,
    timeoutMs: 10_000,
  },
  "diagnostics.updateSettings": {
    params: DiagnosticsSettingsSchema.partial(),
    result: DiagnosticsSettingsSchema,
    timeoutMs: 10_000,
  },
  /** The renderer's log records, written to the app's log file. */
  "diagnostics.log": {
    params: z.strictObject({ records: z.array(LogRecordSchema).max(500) }),
    result: z.void(),
    timeoutMs: 10_000,
  },
  /** The end of the log, at most REPORT_LOG_BYTES, to attach to a report. */
  "diagnostics.readLog": {
    params: z.undefined(),
    result: z.string(),
    timeoutMs: 30_000,
  },
  /** Saves the log where the user chooses. */
  "diagnostics.exportLog": {
    params: z.undefined(),
    result: SaveFileResultSchema,
    timeoutMs: 0,
  },
  /** Sends an error the user reports, which was kept back when reports are not automatic. */
  "diagnostics.sendError": {
    params: z.strictObject({ eventId: EventIdSchema }),
    result: z.void(),
    timeoutMs: 30_000,
  },
} as const

export const diagnosticsEvents = {
  /** Errors of the main process, as they happen. */
  "diagnostics.mainError": { params: z.undefined(), data: MainErrorSchema },
} as const
