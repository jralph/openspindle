import { useId, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { OptionSelect } from "@/components/option-select"
import { ReasonButton } from "@/components/workspace/reason-button"
import { useFixtureLibraryStore } from "@/app/fixtures/fixture-context"
import { projectPlacement } from "@/app/fixtures/plate-profile"
import {
  useWorkspace,
  useWorkspaceStore,
} from "@/app/workspace/workspace-context"
import { kitForSetup } from "@/domain/fixtures/catalog"
import type { FixtureKit } from "@/domain/fixtures/fixture-kit"
import { createPlate, createPlateSetup } from "@/domain/plate/plate"
import { newProbingOperation, strategyById } from "@/domain/probing/strategies"
import { machineId } from "@/machine/contract"
import { useMachineSnapshot } from "@/platform/machine"
import { strategyProbes } from "@/features/probing/probe-tools"
import { AppDialog } from "@/features/shell/app-dialog"
import { CalibrationIllustration } from "./calibration-illustration"

export function AnchorCalibrationDialog({ onClose }: { onClose: () => void }) {
  const id = useId()
  const workspace = useWorkspaceStore()
  const fixtures = useFixtureLibraryStore()
  const library = useWorkspace((state) => state.tools)
  const placement = projectPlacement(workspace.state, fixtures.state)
  const kit: FixtureKit = kitForSetup(placement)
  const reference = kit.anchorCalibration
  const machine = useMachineSnapshot()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [chosen, setChosen] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const strategy = strategyById("inside-corner")!
  const probes = kit.probing
    ? strategyProbes(strategy, library, kit.probing).filter(
        (entry) => entry.refused === null
      )
    : []
  const tool =
    probes.find((entry) => entry.tool.id === chosen)?.tool ?? probes.at(0)?.tool
  const device = machine.connection.device
  const anchors = machine.anchors.value
  let reason = reference
    ? null
    : "This machine has no supported anchor calibration reference."
  if (
    !reason &&
    (!device ||
      machine.connection.status !== "connected" ||
      machineId(device) !== placement.deviceId)
  )
    reason = "Connect the project's device before preparing its calibration."
  if (
    !reason &&
    (!anchors ||
      !anchors.anchors.some((anchor) => anchor.id === reference!.anchorId))
  )
    reason = "Read the device's anchors first."
  if (!reason && !machine.availability.writeAnchors.allowed)
    reason =
      machine.availability.writeAnchors.reason ??
      "Anchor calibration is unavailable."
  if (!reason && machine.connection.restartNeeded)
    reason =
      "Reset the machine to apply its pending settings before calibration."
  if (!reason && !tool)
    reason =
      "Add a compatible 3D touch probe with its effective ball diameter to the library."
  const prepare = () => {
    if (
      reason ||
      !confirmed ||
      !reference ||
      !device ||
      !anchors ||
      !tool ||
      !kit.probing
    )
      return
    const plate = {
      ...createPlate(
        createPlateSetup({ stock: null, stockSource: "assigned", ...placement })
      ),
      name: `Calibrate ${reference.name}`,
    }
    const added = newProbingOperation(plate, tool, strategy, kit.probing)
    const source = added.operation.source
    if (source.kind !== "probing" || source.task !== "origin") return
    const result = workspace.dispatch({
      type: "batch",
      commands: [
        { type: "plates.add", plates: [plate], select: true },
        {
          type: "operation.add",
          plateId: plate.id,
          preferredTools: added.preferredTools,
          operation: {
            ...added.operation,
            name: `Calibrate ${reference.name} — inside corner`,
            source: {
              ...source,
              params: {
                ...source.params,
                corner: "front-left",
                axes: "xy",
                distance: [10, 10],
                depth: 2,
                placement: { kind: "probe-position" },
              },
              anchorCalibration: {
                anchorId: reference.anchorId,
                deviceId: machineId(device),
                expectedAnchors: structuredClone(anchors),
              },
            },
          },
        },
      ],
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onClose()
    void navigate({ to: "/job" })
  }
  return (
    <AppDialog
      title={`Auto calibrate ${reference?.name ?? "anchor"}`}
      width="wide"
      onClose={onClose}
      description="Prepare a probing job, Run it from Job, then review and save the measured X/Y. Opening this guide moves nothing."
      footer={
        <div className="flex w-full justify-between gap-2">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <ReasonButton
              label="Prepare calibration job"
              reason={reason}
              disabled={!confirmed}
              onClick={prepare}
            >
              Prepare calibration job
            </ReasonButton>
          )}
        </div>
      }
    >
      <FieldGroup>
        <FieldDescription>
          Step {step + 1} of 3 ·{" "}
          {["Reference", "Probe and position", "Run and save"][step]}
        </FieldDescription>
        {step === 0 && (
          <>
            <CalibrationIllustration kind="anchor" />
            <p>
              {reference?.reference ?? "Choose a supported machine."}. Remove
              stock from the corner and check that its inner faces and top are
              clean. Keep screws and clamps clear of the probe route.
            </p>
            <p>
              Use the 3D touch probe with its calibrated effective diameter.
              This measures the bracket's corner; it does not calibrate spindle
              alignment or the probe's diameter.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-probe`}>3D touch probe</FieldLabel>
              <OptionSelect
                id={`${id}-probe`}
                value={tool?.id ?? ""}
                options={probes.map(({ tool: probe }) => ({
                  value: probe.id,
                  label: probe.name,
                }))}
                onValueChange={setChosen}
              />
            </Field>
            <CalibrationIllustration kind="anchor" />
            <p>
              Home the machine, install and cable the selected probe, and verify
              that touching it triggers the probe signal. Before Run, jog over
              solid bracket top about 5 mm left and 5 mm forward of the inner
              corner, with Z clear above it.
            </p>
            <p>
              The cycle touches the top, moves into the pocket, then probes the
              left and front inner walls. Its X/Y distances are 10 mm and its
              side contact is 2 mm below the bracket top. Check the complete
              route against the installed bracket.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <p>
              On Job, review the preview and checks, then click Run. Confirm the
              requested 3D probe for tool measurement. The routine replaces the
              active work X/Y/Z origin.
            </p>
            <p>
              After successful completion, choose Save as{" "}
              {reference?.name ?? "anchor"} in the measured result. Review old
              and new machine X/Y before writing. Other anchors retain their
              offsets and move with it. Reset and re-home afterward so the
              firmware's tool setter and tool-change moves use the saved
              calibration.
            </p>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-confirm`}
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
              />
              <FieldLabel htmlFor={`${id}-confirm`}>
                I have checked the reference, probe signal and complete travel
                route.
              </FieldLabel>
            </Field>
          </>
        )}
        {reason && (
          <Alert>
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </AppDialog>
  )
}
