import type { ComponentProps, ReactNode } from "react"
import { Pause, Play, Square } from "lucide-react"
import type { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ReasonButton } from "@/components/workspace/reason-button"
import type { MachineAction } from "./job-hooks"

/**
 * The Job tab's panel for one situation: what is happening and its details. What to do about
 * it is in the job's toolbar.
 */
export function StageCard({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <Card size="sm" role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {/* Details that render nothing leave no empty section behind. */}
      <CardContent className="flex flex-col gap-3 empty:hidden">
        {children}
      </CardContent>
    </Card>
  )
}

/** A machine action button: availability explains why it is disabled; a spinner while it runs. */
export function MachineActionButton({
  action,
  label,
  pendingLabel = label,
  icon,
  variant = "outline",
  size,
  repeatable = false,
}: {
  action: MachineAction
  label: string
  pendingLabel?: string
  /** An icon with `data-icon="inline-start"`. */
  icon: ReactNode
  variant?: ComponentProps<typeof Button>["variant"]
  size?: ComponentProps<typeof Button>["size"]
  /** The action can be sent again while it runs. */
  repeatable?: boolean
}) {
  return (
    <ReasonButton
      label={label}
      reason={action.reason}
      disabled={action.pending && !repeatable}
      variant={variant}
      size={size}
      onClick={action.run}
    >
      {action.pending ? <Spinner data-icon="inline-start" /> : icon}
      {action.pending ? pendingLabel : label}
    </ReasonButton>
  )
}

/** Stop stays available while it waits for the machine to confirm, as the Device panel's does. */
export function StopButton({ action }: { action: MachineAction }) {
  return (
    <MachineActionButton
      action={action}
      label="Stop"
      pendingLabel="Stopping…"
      variant="destructive"
      repeatable
      icon={<Square data-icon="inline-start" fill="currentColor" />}
    />
  )
}

export function PauseButton({ action }: { action: MachineAction }) {
  return (
    <MachineActionButton
      action={action}
      label="Pause"
      icon={<Pause data-icon="inline-start" />}
    />
  )
}

export function ResumeButton({ action }: { action: MachineAction }) {
  return (
    <MachineActionButton
      action={action}
      label="Resume"
      variant="default"
      icon={<Play data-icon="inline-start" />}
    />
  )
}
