import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** Plugin code is untrusted: show at most a bounded message from what it threw. */
export function viewErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000)
  return "The plugin view could not be opened."
}

export function ViewFailure({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle>Plugin view unavailable</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </CardFooter>
    </Card>
  )
}

/** Keeps a failing plugin view from taking down whatever renders it. */
export class ViewBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { error: string | null }
> {
  state = { error: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: viewErrorMessage(error) }
  }

  render() {
    if (this.state.error)
      return (
        <ViewFailure message={this.state.error} onClose={this.props.onClose} />
      )
    return this.props.children
  }
}
