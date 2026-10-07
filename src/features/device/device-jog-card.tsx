import { useId, useState } from "react"
import { Move } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type {
  AvailabilityKey,
  Axis,
  ControlLimits,
  MachineCommand,
  MachineSnapshot,
} from "@/machine/contract"
import { OptionSelect } from "@/components/option-select"
import { ControlCard } from "./device-control-card"
import { GamepadStepControls } from "./gamepad-step-controls"

/** The jog steps offered, in millimetres, and speeds, in percent of the machine's maximum. */
const JOG_STEPS = [0.1, 1, 5, 10]
const JOG_SPEEDS = [5, 10, 25]

/** [axis, direction, button text, grid position, accessible label]. */
const JOG_BUTTONS = [
  ["Y", 1, "Y+", "col-start-2 row-start-1", "Jog Y positive"],
  ["X", -1, "X−", "col-start-1 row-start-2", "Jog X negative"],
  ["X", 1, "X+", "col-start-3 row-start-2", "Jog X positive"],
  ["Y", -1, "Y−", "col-start-2 row-start-3", "Jog Y negative"],
] as const

/** [direction, button text, accessible label]. */
const Z_BUTTONS = [
  [1, "Z+", "Jog Z positive"],
  [-1, "Z−", "Jog Z negative"],
] as const

/** Jog steps and speed, and the XY and Z jog pads. */
export function DeviceJogCard({
  limits,
  spindleRpm,
  reason,
  allowed,
  execute,
  stop,
}: {
  limits: ControlLimits | null
  spindleRpm: number
  reason: (key: AvailabilityKey, action?: MachineCommand) => string | null
  allowed: (action: MachineCommand) => boolean
  execute: (action: MachineCommand) => void
  stop: () => Promise<MachineSnapshot>
}) {
  const fieldId = useId()
  const [step, setStep] = useState(1)
  const [speed, setSpeed] = useState(10)
  // Jog steps (mm) and speeds (%) the machine accepts; all of them before it reports its limits.
  const jogSteps = JOG_STEPS.filter(
    (value) =>
      !limits ||
      (value >= limits.jogMinDistance && value <= limits.jogMaxDistance)
  )
  const jogSpeeds = JOG_SPEEDS.filter(
    (value) =>
      !limits ||
      (value / 100 >= limits.jogMinSpeedScale &&
        value / 100 <= limits.jogMaxSpeedScale)
  )
  const jog = (axis: Axis, direction: number): MachineCommand => ({
    type: "jog",
    axis,
    distance: step * direction,
    speedScale: speed / 100,
  })
  return (
    <ControlCard title="Jog" icon={<Move size={16} />}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid grid-cols-3 grid-rows-3 gap-1">
          {JOG_BUTTONS.map(([axis, direction, text, position, label]) => (
            <Button
              key={label}
              variant="outline"
              size="icon-lg"
              className={position}
              aria-label={label}
              title={reason("jog", jog(axis, direction)) ?? label}
              disabled={!allowed(jog(axis, direction))}
              onClick={() => execute(jog(axis, direction))}
            >
              {text}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {Z_BUTTONS.map(([direction, text, label]) => (
            <Button
              key={label}
              variant="outline"
              size="icon-lg"
              aria-label={label}
              title={reason("jog", jog("Z", direction)) ?? label}
              disabled={!allowed(jog("Z", direction))}
              onClick={() => execute(jog("Z", direction))}
            >
              {text}
            </Button>
          ))}
        </div>
        <FieldGroup className="min-w-56 flex-1 gap-3">
          <FieldSet>
            <FieldLegend variant="label">Step · mm</FieldLegend>
            <ToggleGroup
              variant="outline"
              className="w-full font-numeric"
              aria-label="Jog step"
              value={[String(step)]}
              onValueChange={(values) => {
                if (values[0]) setStep(Number(values[0]))
              }}
            >
              {jogSteps.map((value) => (
                <ToggleGroupItem
                  key={value}
                  value={String(value)}
                  className="flex-1"
                >
                  {value.toFixed(3)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor={fieldId}>Speed</FieldLabel>
            <OptionSelect
              id={fieldId}
              options={jogSpeeds.map((value) => ({
                value,
                label: `${value}%`,
              }))}
              value={speed}
              onValueChange={setSpeed}
              numeric
              className="w-full"
              aria-label="Jog speed"
            />
          </Field>
        </FieldGroup>
      </div>
      <GamepadStepControls
        step={step}
        speed={speed}
        spindleRpm={spindleRpm}
        cycleSpeed={() =>
          setSpeed((current) => {
            const index = jogSpeeds.indexOf(current)
            return jogSpeeds[(index + 1) % jogSpeeds.length] ?? current
          })
        }
        adjustStep={(delta) =>
          setStep((current) => {
            const index = jogSteps.indexOf(current)
            return (
              jogSteps[
                Math.max(0, Math.min(jogSteps.length - 1, index + delta))
              ] ?? current
            )
          })
        }
        stop={stop}
      />
    </ControlCard>
  )
}
