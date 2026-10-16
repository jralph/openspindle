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
import {
  anchorCalibrationParams,
  anchorCalibrationSetup,
} from "@/domain/anchors/calibration"
import { createPlate, createPlateSetup } from "@/domain/plate/plate"
import { newProbingOperation, strategyById } from "@/domain/probing/strategies"
import { machineId } from "@/machine/contract"
import { useMachineSnapshot } from "@/platform/machine"
import { strategyProbes } from "@/features/probing/probe-tools"
import { AppDialog } from "@/features/shell/app-dialog"
import { CalibrationIllustration } from "./calibration-illustration"
import { calibrationPreparationIssue } from "./calibration-safety"

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
  const [fixtureId, setFixtureId] = useState("")
  const [confirmedSetup, setConfirmedSetup] = useState<string | null>(null)
  const strategy = strategyById("inside-corner")!
  const probes = kit.probing
    ? strategyProbes(strategy, library, kit.probing).filter(
        (entry) => entry.refused === null
      )
    : []
  const tool =
    probes.find((entry) => entry.tool.id === chosen)?.tool ??
    (!chosen ? probes.at(0)?.tool : undefined)
  const device = machine.connection.device
  const anchors = machine.anchors.value
  const references = kit.fixtures.filter((entry) =>
    reference?.fixtureIds.includes(entry.fixture.id)
  )
  const setupKey = JSON.stringify({
    deviceId: placement.deviceId,
    connectionId: machine.connection.id,
    tool,
    anchors,
    fixtureId,
  })
  const confirmed = confirmedSetup === setupKey
  const changeStep = (next: number) => {
    setStep(next)
    setConfirmedSetup(null)
  }
  let reason = calibrationPreparationIssue(device)
  if (!reason && !reference)
    reason = "This machine has no supported anchor calibration reference."
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
  if (!reason && !references.some((entry) => entry.fixture.id === fixtureId))
    reason = "Select the L-bracket fitted at Anchor 1."
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
    const setup = anchorCalibrationSetup(
      createPlateSetup({ stock: null, stockSource: "assigned", ...placement }),
      kit,
      fixtureId
    )
    const params = anchorCalibrationParams(kit)
    if (!setup.ok || !params) {
      toast.error(
        setup.ok ? "No calibration routine is available." : setup.error
      )
      return
    }
    const plate = {
      ...createPlate(setup.value),
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
              params,
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
      description="Simulator practice only. Physical calibration is disabled following a probe collision. Opening this guide moves nothing."
      footer={
        <div className="flex w-full justify-between gap-2">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => changeStep(step - 1)}
          >
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => changeStep(step + 1)}>Next</Button>
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
            <Field>
              <FieldLabel htmlFor={`${id}-reference`}>
                Installed L-bracket
              </FieldLabel>
              <OptionSelect
                id={`${id}-reference`}
                value={fixtureId}
                options={[
                  { value: "", label: "Choose the fitted bracket" },
                  ...references.map(({ fixture }) => ({
                    value: fixture.id,
                    label: `${fixture.name} · ${fixture.model.bounds.max[2] - fixture.model.bounds.min[2]} mm tall`,
                  })),
                ]}
                onValueChange={(value) => {
                  setFixtureId(value)
                  setConfirmedSetup(null)
                }}
              />
              <FieldDescription>
                The calibration plate includes this bracket at its normal pinned
                position.
              </FieldDescription>
            </Field>
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
                onValueChange={(value) => {
                  setChosen(value)
                  setConfirmedSetup(null)
                }}
              />
            </Field>
            <CalibrationIllustration kind="anchor" />
            <p>
              In the simulator, the program raises to machine clearance, then
              travels to the stored anchor plus X−5 mm, Y−5 mm, over the solid
              bracket top at the bottom left. Manual jogging to the start is not
              required.
            </p>
            <p>
              The cycle touches the top, moves into the pocket, then probes the
              left and front inner walls. Its X/Y distances are 10 mm and its
              side contact is 2 mm below the bracket top. Check the complete
              route against the installed bracket. The existing stored anchor
              must already be close enough to put the start on the bracket; this
              is a fine calibration, not recovery of a missing reference.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <p>
              Use Run on Job only with the local simulator. The preview models
              contact with the bracket; it cannot verify a physical probe signal
              or prove that the machine will stop on contact. The simulated
              routine replaces the active work X/Y/Z origin.
            </p>
            <p>
              After successful simulator completion, choose Save as{" "}
              {reference?.name ?? "anchor"} in the measured result. Review old
              and new simulated machine X/Y before writing. Other simulated
              anchors retain their offsets and move with it. Practice this only
              on the simulator; these results must not be written to the
              physical machine.
            </p>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-confirm`}
                checked={confirmed}
                onCheckedChange={(value) =>
                  setConfirmedSetup(value === true ? setupKey : null)
                }
              />
              <FieldLabel htmlFor={`${id}-confirm`}>
                I am using the local simulator and have reviewed the modeled
                reference and complete travel route.
              </FieldLabel>
            </Field>
          </>
        )}
        {reason && (
          <Alert variant="destructive">
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </AppDialog>
  )
}
