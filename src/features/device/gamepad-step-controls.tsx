import { useId } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { OptionSelect } from "@/components/option-select"
import { isSimulator } from "@/machine/contract"
import type { MachineCommand, MachineSnapshot } from "@/machine/contract"
import { useMachineSnapshot } from "@/platform/machine"
import { useGamepadStepJog } from "./use-gamepad-step-jog"

/** Throwaway feasibility probe: input monitoring everywhere, motion only on a local simulator. */
export function GamepadStepControls({
  step,
  speed,
  adjustStep,
  allowed,
  execute,
  stop,
}: {
  step: number
  speed: number
  adjustStep: (delta: -1 | 1) => void
  allowed: (action: MachineCommand) => boolean
  execute: (action: MachineCommand) => Promise<MachineSnapshot>
  stop: () => Promise<MachineSnapshot>
}) {
  const id = useId()
  const snapshot = useMachineSnapshot()
  const device = snapshot.connection.device
  const simulator = device !== null && isSimulator(device)
  const input = useGamepadStepJog({
    connectionId: snapshot.connection.id,
    simulator,
    step,
    speed,
    adjustStep,
    allowed,
    execute,
    stop,
  })
  const selected = input.selected
  const canArm =
    simulator &&
    selected?.supported === true &&
    snapshot.availability.jog.allowed &&
    !input.pending
  const modeId = `${id}-mode`
  let status = "No controller detected — wake it with a button"
  if (selected)
    status = selected.supported
      ? "Standard Xbox-style mapping"
      : "Mapping unsupported — input monitor only"
  return (
    <FieldSet>
      <FieldLegend
        variant="label"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        Gamepad prototype
        <Badge variant="secondary">Simulator only</Badge>
      </FieldLegend>
      {input.controllers.length > 0 && (
        <Field>
          <FieldLabel htmlFor={id}>Controller</FieldLabel>
          <OptionSelect
            id={id}
            className="w-full"
            value={input.selection}
            options={input.controllers.map((entry) => ({
              value: entry.key,
              label: entry.name,
            }))}
            onValueChange={input.select}
          />
        </Field>
      )}
      <FieldDescription>{status}</FieldDescription>
      <Field>
        <FieldLabel htmlFor={modeId}>Control mode</FieldLabel>
        <OptionSelect
          id={modeId}
          className="w-full"
          value={input.mode}
          options={[
            { value: "step", label: "Step" },
            { value: "direct", label: "Direct" },
          ]}
          onValueChange={input.setMode}
        />
      </Field>
      {selected && (
        <FieldDescription className="font-numeric">
          Stick X {selected.x.toFixed(2)} · Y {selected.y.toFixed(2)} · LB{" "}
          {selected.enableHeld ? "held" : "released"}
        </FieldDescription>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={input.armed ? "secondary" : "outline"}
          disabled={!input.armed && !canArm}
          title={snapshot.availability.jog.reason ?? undefined}
          onClick={() => {
            if (input.armed) input.disarm()
            else void input.arm()
          }}
        >
          {input.armed ? "Disarm controller" : "Arm simulator jogging"}
        </Button>
        <Badge variant={input.armed ? "default" : "outline"}>
          {input.armed ? "Armed" : "Disarmed"}
        </Badge>
      </div>
      {input.mode === "step" && (
        <FieldDescription>
          Hold LB, then move the left stick or press the D-pad for one XY step.
          Return to centre before the next step. B halts the simulator and
          disarms. Z stays locked.
        </FieldDescription>
      )}
      {input.mode === "step" && (
        <FieldDescription>
          A sent step runs to its selected distance. Return to centre before
          another step. Continuous steering is not enabled in Step mode.
        </FieldDescription>
      )}
      {input.mode === "direct" && (
        <FieldDescription>
          Hold LB to steer; release the stick or LB to stop. Jog speed is the
          maximum speed. B halts and disarms. Z stays locked. Disarm to use
          other machine controls.
        </FieldDescription>
      )}
      {!simulator && (
        <FieldDescription>
          Connect the local Z1 simulator to enable jogging.
        </FieldDescription>
      )}
      <FieldDescription role="status">{input.notice}</FieldDescription>
      <FieldDescription>
        Hold RB and tap D-pad left/right to decrease/increase the step size.
        Release LB first. This shortcut never jogs.
      </FieldDescription>
    </FieldSet>
  )
}
