import { useEffect } from "react"
import { createAtom, useSelector } from "@tanstack/react-store"
import * as Sentry from "@sentry/electron/renderer"
import { captureReactException, init as reactInit } from "@sentry/react"
import { errorSummary } from "@/platform/contract/diagnostics"
import type { ErrorSummary } from "@/platform/contract/diagnostics"
import type { DiagnosticsHost } from "@/platform/host"
import { log } from "./log"

/** An error the user can report from the error dialog. */
export type ErrorReport = {
  /** Sentry's id of the error: the dialog shows it, and it finds the report in Sentry. */
  readonly eventId: string
  readonly error: ErrorSummary
}

export type ReportAttachment = {
  readonly filename: string
  readonly data: string | Uint8Array
  readonly contentType: string
}

/** Feedback needs a message; a report sent without one says so. */
const NO_DESCRIPTION = "Sent without a description."
/** How long Send report waits for the main process to hand the report on. */
const SEND_TIMEOUT_MS = 30_000

const offerListeners = new Set<(report: ErrorReport) => void>()
/** Offered before anything listened; the first listener gets them. */
let unseen: ErrorReport[] = []

function offer(report: ErrorReport) {
  if (!offerListeners.size) {
    unseen = [...unseen.slice(-4), report]
    return
  }
  for (const listener of offerListeners) listener(report)
}

/** Unhandled errors of the window, offered to the user to report, as they happen. */
export function watchOfferedReports(
  listener: (report: ErrorReport) => void
): () => void {
  offerListeners.add(listener)
  const missed = unseen
  unseen = []
  for (const report of missed) listener(report)
  return () => {
    offerListeners.delete(listener)
  }
}

function breadcrumbText({ category, message, data }: Sentry.Breadcrumb) {
  const detail = message ?? (data ? JSON.stringify(data) : "")
  return `${category ?? "event"}: ${detail}`
}

/**
 * Starts Sentry in the renderer, before anything else runs. Its events go to the main
 * process, which sends them only as the user allows (electron/main/diagnostics). Unhandled
 * errors are logged and offered to the user; at the Debug level the log also records what
 * led up to them (clicks, navigation, console messages).
 */
export function startErrorReporting() {
  Sentry.init(
    {
      beforeSend(event, hint) {
        // Unhandled: caught by Sentry's global handlers or its wrappers of timers and event
        // listeners, which mark the event. The app's own reports (reportRenderError) are handled.
        const unhandled = event.exception?.values?.some(
          (exception) => exception.mechanism?.handled === false
        )
        if (event.event_id && unhandled) {
          const error = hint.originalException ?? event.message
          log.error(`Error ${event.event_id} in the window`, error)
          offer({ eventId: event.event_id, error: errorSummary(error) })
        }
        return event
      },
      beforeBreadcrumb(breadcrumb) {
        if (!breadcrumb.category?.startsWith("sentry."))
          log.debug(breadcrumbText(breadcrumb))
        return breadcrumb
      },
    },
    reactInit
  )
}

const reportsByObject = new WeakMap<object, ErrorReport>()
const reportsByValue = new Map<unknown, ErrorReport>()
/** Counts the reports of errors boundaries caught, so that their fallbacks show them. */
const caughtReports = createAtom(0)

const reportOf = (error: unknown) =>
  typeof error === "object" && error !== null
    ? reportsByObject.get(error)
    : reportsByValue.get(error)

/**
 * Reports an error that took down part of the window, once: the same error again gets the
 * same report. The component stack goes with it when the boundary that caught it has one.
 */
export function reportRenderError(
  error: unknown,
  componentStack?: string | null
): ErrorReport {
  const known = reportOf(error)
  if (known) return known
  const eventId = captureReactException(
    error,
    { componentStack: componentStack ?? "" },
    { mechanism: { handled: true, type: "auto.function.react.error_boundary" } }
  )
  const report = { eventId, error: errorSummary(error) }
  if (typeof error === "object" && error !== null)
    reportsByObject.set(error, report)
  else reportsByValue.set(error, report)
  log.error(`Error ${eventId} in the window`, error)
  caughtReports.set((count) => count + 1)
  return report
}

/**
 * The report of an error a boundary shows. The boundary reports it once it has caught it,
 * after the fallback first renders; one that did not report it is reported here.
 */
export function useRenderErrorReport(error: unknown): ErrorReport | null {
  useSelector(caughtReports)
  useEffect(() => {
    reportRenderError(error)
  }, [error])
  return reportOf(error) ?? null
}

/**
 * Sends a report of an error: the error itself, kept back unless reports are automatic, and
 * the user's description and attachments as feedback on it.
 */
export async function sendErrorReport(
  diagnostics: DiagnosticsHost,
  report: ErrorReport,
  description: string,
  attachments: readonly ReportAttachment[]
): Promise<void> {
  await diagnostics.sendError(report.eventId)
  Sentry.captureFeedback(
    {
      message: description.trim() || NO_DESCRIPTION,
      associatedEventId: report.eventId,
      source: "error dialog",
    },
    { attachments: [...attachments] }
  )
  // The main process sends it, or keeps it to send once the Mac is online again.
  await Sentry.getClient()?.flush(SEND_TIMEOUT_MS)
  log.info(`Sent a report of error ${report.eventId}`)
}
