import { useId } from "react"
import { Fan, Lightbulb, Power, RotateCw, Volume2 } from "lucide-react"
import type { ReactNode } from "react"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import type {
  AvailabilityKey,
  MachineCommand,
  Telemetry,
} from "@/machine/contract"
import { ControlCard } from "./device-control-card"

function OutputControl({
  label,
  description,
  icon,
  value,
  disabled,
  onChange,
}: {
  label: string
  description?: string
  icon: ReactNode
  value: boolean | null | undefined
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <Field
      orientation="horizontal"
      data-disabled={disabled}
      className="items-center gap-3"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch
        id={id}
        aria-label={label}
        checked={value === true}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </Field>
  )
}

/** The machine's on/off accessories: the work light, beep, vacuum and following the spindle. */
export function DeviceAccessoriesCard({
  telemetry,
  pending,
  reason,
  execute,
}: {
  telemetry: Telemetry | null
  pending: boolean
  reason: (key: AvailabilityKey, action?: MachineCommand) => string | null
  execute: (action: MachineCommand) => void
}) {
  return (
    <ControlCard title="Accessories" icon={<Power size={16} />}>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <OutputControl
          label="Work light"
          icon={<Lightbulb size={19} />}
          value={telemetry?.lightOn}
          disabled={pending || reason("light") !== null}
          onChange={(enabled) => execute({ type: "light", enabled })}
        />
        <OutputControl
          label="Beep"
          icon={<Volume2 size={19} />}
          value={telemetry?.beepOn}
          disabled={pending || reason("beep") !== null}
          onChange={(enabled) => execute({ type: "beep", enabled })}
        />
        <OutputControl
          label="Vacuum"
          description="External extractor"
          icon={<Fan size={19} />}
          value={telemetry?.vacuumOn}
          disabled={pending || reason("vacuum") !== null}
          onChange={(enabled) => execute({ type: "vacuum", enabled })}
        />
        <OutputControl
          label="Follow spindle"
          icon={<RotateCw size={19} />}
          value={telemetry?.vacuumAuto}
          disabled={pending || reason("vacuumAuto") !== null}
          onChange={(enabled) => execute({ type: "vacuumAuto", enabled })}
        />
      </FieldGroup>
    </ControlCard>
  )
}
