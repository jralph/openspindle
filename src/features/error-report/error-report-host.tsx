import { useEffect, useState } from "react"
import { toast } from "sonner"
import { watchOfferedReports } from "@/app/errors/reports"
import type { ErrorReport } from "@/app/errors/reports"
import { useHost } from "@/platform/host-context"
import { ErrorReportDialog } from "./error-report-dialog"

/** Long enough to reach Report… in it. */
const TOAST_DURATION_MS = 10_000

/**
 * Errors that took nothing down, the window's unhandled errors and the main process's, show
 * in a toast; its Report… opens the error dialog. The same error again replaces its toast.
 */
export function ErrorReportHost() {
  const host = useHost()
  const [open, setOpen] = useState<ErrorReport | null>(null)
  useEffect(() => {
    const show = (report: ErrorReport) => {
      const { name, message } = report.error
      toast.error("Something went wrong", {
        id: `error:${name}:${message}`,
        description: message || name,
        duration: TOAST_DURATION_MS,
        action: { label: "Report…", onClick: () => setOpen(report) },
      })
    }
    const stopOffers = watchOfferedReports(show)
    const stopMainErrors = host.diagnostics.watchMainErrors(show)
    return () => {
      stopOffers()
      stopMainErrors()
    }
  }, [host])
  // Keyed: another error's report starts over, even while the dialog is open.
  return open ? (
    <ErrorReportDialog
      key={open.eventId}
      report={open}
      onClose={() => setOpen(null)}
    />
  ) : null
}
