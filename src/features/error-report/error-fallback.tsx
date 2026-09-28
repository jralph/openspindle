import { Component, createContext, useContext, useState } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { reportRenderError, useRenderErrorReport } from "@/app/errors/reports"
import { errorSummary } from "@/platform/contract/diagnostics"
import { ErrorReportDialog } from "./error-report-dialog"

/**
 * Whether a fallback fills the window or a workspace section under the tabs, which stay. The
 * window's fallback clears the title bar, which it also drags by.
 */
const FallbackPlacement = createContext<"window" | "section">("window")

/** Fallbacks inside show in place of a workspace section. */
export function SectionErrorPlacement({ children }: { children: ReactNode }) {
  return (
    <FallbackPlacement.Provider value="section">
      {children}
    </FallbackPlacement.Provider>
  )
}

/**
 * In place of what an error took down (a route's component, or the whole window): the error,
 * Try again, and the error dialog, which opens at once and again from Report….
 */
export function ErrorFallback({
  error,
  reset,
}: {
  error: unknown
  reset?: () => void
}) {
  const report = useRenderErrorReport(error)
  const [dialogOpen, setDialogOpen] = useState(true)
  const placement = useContext(FallbackPlacement)
  const { name, message } = errorSummary(error)
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        placement === "window" && "h-dvh"
      )}
    >
      {placement === "window" && (
        <div className="h-[env(titlebar-area-height,0px)] shrink-0 [app-region:drag]" />
      )}
      <Empty role="alert">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription className="line-clamp-4 break-words">
            {message || name}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          {reset && (
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          )}
          <Button disabled={!report} onClick={() => setDialogOpen(true)}>
            Report…
          </Button>
        </EmptyContent>
      </Empty>
      {report && dialogOpen && (
        <ErrorReportDialog
          key={report.eventId}
          report={report}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}

/** The last boundary, around the router: it catches what the routes' own do not. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failure: { error: unknown } | null }
> {
  state = { failure: null as { error: unknown } | null }

  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportRenderError(error, info.componentStack)
  }

  render() {
    if (this.state.failure)
      return (
        <ErrorFallback
          error={this.state.failure.error}
          reset={() => this.setState({ failure: null })}
        />
      )
    return this.props.children
  }
}
