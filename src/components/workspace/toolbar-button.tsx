import { useId } from "react"
import type { ComponentProps, ReactElement } from "react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ToolbarControlProps = {
  /** The control's accessible name, and the title of its tooltip. */
  label: string
  /** What the control does, under its title. */
  description: string
}

/**
 * The tooltip of an icon-only toolbar control: its name, and what it does or why it is
 * unavailable. Disabled controls receive no pointer or focus events, so the reason lives on a
 * focusable wrapper.
 */
function ToolbarTooltip({
  id,
  label,
  text,
  unavailable,
  control,
}: {
  id: string
  label: string
  text: string
  unavailable: boolean
  control: ReactElement
}) {
  const trigger = unavailable ? (
    <TooltipTrigger
      delay={200}
      closeOnClick={false}
      render={
        <span
          className="inline-flex"
          role="group"
          aria-label={`${label} unavailable`}
          aria-describedby={id}
          tabIndex={0}
        />
      }
    >
      {control}
    </TooltipTrigger>
  ) : (
    <TooltipTrigger delay={200} render={control} />
  )
  return (
    <Tooltip>
      {trigger}
      <TooltipContent
        id={id}
        side="bottom"
        sideOffset={8}
        className="flex-col items-start gap-0.5"
      >
        <span className="font-medium">{label}</span>
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * An icon-only toolbar button; hovering or focusing it shows its name and what it does, or why
 * it is unavailable.
 */
export function ToolbarButton({
  label,
  description,
  reason = null,
  ...props
}: ComponentProps<typeof Button> &
  ToolbarControlProps & {
    /** Why the button is unavailable; null (the default) when it is available. */
    reason?: string | null
  }) {
  const id = useId()
  return (
    <ToolbarTooltip
      id={id}
      label={label}
      text={reason ?? description}
      unavailable={reason !== null}
      control={
        <Button
          variant="ghost"
          size="icon-lg"
          {...props}
          aria-label={label}
          disabled={reason !== null}
          aria-describedby={id}
        />
      }
    />
  )
}

/**
 * An icon-only toolbar toggle, the size of a toolbar button; hovering or focusing it shows its
 * name and what it does, or why it is unavailable.
 */
export function ToolbarToggle({
  label,
  description,
  reason,
  ...props
}: ComponentProps<typeof Toggle> &
  ToolbarControlProps & {
    /** Why the toggle is unavailable; null when it is available. */
    reason: string | null
  }) {
  const id = useId()
  return (
    <ToolbarTooltip
      id={id}
      label={label}
      text={reason ?? description}
      unavailable={reason !== null}
      control={
        <Toggle
          size="lg"
          className="px-2"
          {...props}
          aria-label={label}
          disabled={reason !== null}
          aria-describedby={id}
        />
      }
    />
  )
}
