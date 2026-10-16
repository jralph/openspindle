import { useId, useState } from "react"
import { createAtom, useSelector } from "@tanstack/react-store"
import { useNavigate } from "@tanstack/react-router"
import { z } from "zod"
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
import {
  anchorCalibrationParams,
  anchorCalibrationSetup,
} from "@/domain/anchors/calibration"
import { createPlate, createPlateSetup } from "@/domain/plate/plate"
import { newProbingOperation, strategyById } from "@/domain/probing/strategies"
import { machineId } from "@/machine/contract"
import { useMachineSnapshot, useReadSwitches } from "@/platform/machine"
import { strategyProbes } from "@/features/probing/probe-tools"
import { ParameterField, probingField } from "@/features/probing/probing-fields"
import { useProbingForm } from "@/features/probing/probing-form"
import { AppDialog } from "@/features/shell/app-dialog"
import { CalibrationIllustration } from "./calibration-illustration"

type Draft = { step: number; toolId: string; fixtureId: string; gap: number }
const draftAtom = createAtom<Draft>({
  step: 0,
  toolId: "",
  fixtureId: "",
  gap: 0.2,
})
const update = (patch: Partial<Draft>) =>
  draftAtom.set((draft) => ({ ...draft, ...patch }))
const GapSchema = z.strictObject({ gap: z.number().finite().min(0.1).max(0.5) })

export function AnchorCalibrationDialog({ onClose }: { onClose: () => void }) {
  const id = useId()
  const draft = useSelector(draftAtom)
  const workspace = useWorkspaceStore()
  const fixtures = useFixtureLibraryStore()
  const library = useWorkspace((state) => state.tools)
  const placement = projectPlacement(workspace.state, fixtures.state)
  const kit = kitForSetup(placement)
  const reference = kit.anchorCalibration
  const machine = useMachineSnapshot()
  const readSwitches = useReadSwitches()
  const navigate = useNavigate()
  const [confirmedSetup, setConfirmedSetup] = useState<string | null>(null)
  const [valid, setValid] = useState(true)
  const form = useProbingForm(
    { gap: draft.gap },
    GapSchema,
    ({ gap }) => update({ gap }),
    setValid
  )
  const strategy = strategyById("inside-corner")!
  const probes = kit.probing
    ? strategyProbes(strategy, library, kit.probing).filter(
        (entry) => entry.refused === null
      )
    : []
  const tool =
    probes.find((entry) => entry.tool.id === draft.toolId)?.tool ??
    (!draft.toolId ? probes.at(0)?.tool : undefined)
  const device = machine.connection.device
  const anchors = machine.anchors.value
  const anchor = anchors?.anchors.find(
    (item) => item.id === reference?.anchorId
  )
  const params = anchorCalibrationParams(kit)
  const offset =
    params?.placement.kind === "anchor" ? params.placement.offset : null
  const target: [number, number] | null =
    anchor && offset ? [anchor.x + offset[0], anchor.y + offset[1]] : null
  const references = kit.fixtures.filter((entry) =>
    reference?.fixtureIds.includes(entry.fixture.id)
  )
  const check = machine.probeCheck
  const binding =
    check?.phase === "verified" && check.connectionId === machine.connection.id
      ? check.binding
      : null
  const setupKey = JSON.stringify({
    deviceId: placement.deviceId,
    connectionId: machine.connection.id,
    tool,
    anchors,
    fixtureId: draft.fixtureId,
    gap: draft.gap,
    binding,
  })
  const confirmed = confirmedSetup === setupKey
  const changeStep = (step: number) => {
    update({ step })
    setConfirmedSetup(null)
  }
  let reason: string | null = null
  if (!reference?.boundedNc || !reference.positioningNc)
    reason = "This machine has no supported bounded anchor calibration."
  if (
    !reason &&
    (!device ||
      machine.connection.status !== "connected" ||
      machineId(device) !== placement.deviceId)
  )
    reason = "Connect the project's device before preparing its calibration."
  if (!reason && (!anchors || !target))
    reason = "Read the device's anchors first."
  if (!reason && !machine.availability.writeAnchors.allowed)
    reason =
      machine.availability.writeAnchors.reason ??
      "Anchor calibration is unavailable."
  if (!reason && machine.connection.restartNeeded)
    reason = "Reset the machine to apply pending settings first."
  if (
    !reason &&
    (!tool ||
      tool.diameter === null ||
      tool.diameter < 0.5 ||
      tool.diameter > 3.2)
  )
    reason =
      "Choose a connected XYZ probe with its own 0.5–3.2 mm tip diameter in the library."
  if (
    !reason &&
    !references.some((entry) => entry.fixture.id === draft.fixtureId)
  )
    reason = "Select the L-bracket fitted at Anchor 1."
  let runReason = reason
  if (!runReason && !binding)
    runReason =
      "Complete the live released → triggered → released signal check after positioning."
  if (
    !runReason &&
    binding &&
    target &&
    (Math.abs(binding.position[0] - target[0]) > 0.01 ||
      Math.abs(binding.position[1] - target[1]) > 0.01)
  )
    runReason =
      "The checked XY is not above the anchored start. Run positioning, approach in Z only, then repeat the signal check."
  if (!runReason && !valid)
    runReason = "Enter a measured top gap from 0.1 to 0.5 mm."

  const prepare = (positioning: boolean) => {
    if (
      (positioning ? reason : runReason) ||
      (!positioning && !confirmed) ||
      !reference ||
      !device ||
      !anchors ||
      !tool ||
      !kit.probing ||
      !params ||
      !target
    )
      return
    const setup = anchorCalibrationSetup(
      createPlateSetup({ stock: null, stockSource: "assigned", ...placement }),
      kit,
      draft.fixtureId
    )
    if (!setup.ok) {
      toast.error(setup.error)
      return
    }
    const plate = {
      ...createPlate(
        positioning ? { ...setup.value, workOriginAnchor: null } : setup.value
      ),
      name: positioning
        ? "Anchor 1 — probe measurement and positioning"
        : "Calibrate Anchor 1 — bounded contacts",
    }
    const added = newProbingOperation(plate, tool, strategy, kit.probing)
    const source = added.operation.source
    if (source.kind !== "probing" || source.task !== "origin") return
    if (!positioning && (!binding || tool.diameter === null)) return
    const operation = {
      ...added.operation,
      name: plate.name,
      source: positioning
        ? {
            kind: "file" as const,
            nc: reference.positioningNc!(target),
            park: false,
            phase: "setup" as const,
          }
        : {
            ...source,
            params: { ...params, depth: Math.max(2, tool.diameter! / 2 + 0.5) },
            anchorCalibration: {
              anchorId: reference.anchorId,
              deviceId: machineId(device),
              expectedAnchors: structuredClone(anchors),
              approach: {
                binding: structuredClone(binding!),
                gap: draft.gap,
                diameter: tool.diameter!,
              },
            },
          },
    }
    const result = workspace.dispatch({
      type: "batch",
      commands: [
        { type: "plates.add", plates: [plate], select: true },
        {
          type: "operation.add",
          plateId: plate.id,
          preferredTools: added.preferredTools,
          operation,
        },
      ],
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (positioning) update({ step: 1 })
    onClose()
    void navigate({ to: "/job" })
  }
  let readLabel = "Read released probe / start again"
  if (check?.phase === "released") readLabel = "Read while touching probe"
  else if (check?.phase === "triggered")
    readLabel = "Read after releasing probe"
  return (
    <AppDialog
      title={`Auto calibrate ${reference?.name ?? "anchor"}`}
      width="wide"
      onClose={onClose}
      description="Measure and position the probe, approach the top manually, verify its live contact signal, then run bounded contacts and review the anchor. Opening this guide moves nothing."
      footer={
        <div className="flex w-full justify-between gap-2">
          <Button
            variant="outline"
            disabled={draft.step === 0}
            onClick={() => changeStep(draft.step - 1)}
          >
            Back
          </Button>
          {draft.step < 2 ? (
            <Button onClick={() => changeStep(draft.step + 1)}>Next</Button>
          ) : (
            <ReasonButton
              label="Prepare bounded calibration"
              reason={runReason}
              disabled={!confirmed}
              onClick={() => prepare(false)}
            >
              Prepare bounded calibration
            </ReasonButton>
          )}
        </div>
      }
    >
      <FieldGroup>
        <FieldDescription>
          Step {draft.step + 1} of 3 ·{" "}
          {
            [
              "Reference and positioning",
              "Near-surface approach and signal",
              "Review and prepare",
            ][draft.step]
          }
          . This draft stays while the app is open.
        </FieldDescription>
        {draft.step === 0 && (
          <>
            <CalibrationIllustration kind="anchor" />
            <Field>
              <FieldLabel htmlFor={`${id}-reference`}>
                Installed L-bracket
              </FieldLabel>
              <OptionSelect
                id={`${id}-reference`}
                value={draft.fixtureId}
                options={[
                  { value: "", label: "Choose the fitted bracket" },
                  ...references.map(({ fixture }) => ({
                    value: fixture.id,
                    label: `${fixture.name} · ${fixture.model.bounds.max[2] - fixture.model.bounds.min[2]} mm tall`,
                  })),
                ]}
                onValueChange={(fixtureId) => {
                  update({ fixtureId })
                  setConfirmedSetup(null)
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-probe`}>
                Connected XYZ probe
              </FieldLabel>
              <OptionSelect
                id={`${id}-probe`}
                value={tool?.id ?? ""}
                options={probes.map(({ tool: probe }) => ({
                  value: probe.id,
                  label: probe.name,
                }))}
                onValueChange={(toolId) => {
                  update({ toolId })
                  setConfirmedSetup(null)
                }}
              />
            </Field>
            <p>
              Secure and clean the bracket in its normal pinned position. Fit
              the selected, undamaged probe and connect its signal cable. Use
              the actual tip's library entry and diameter; do not reuse the
              broken probe's dimensions for a conductive rod.
            </p>
            <p>
              The separate positioning job measures the probe on the tool setter
              and travels at clearance to the solid bracket top, X−5 and Y−5 mm
              from Anchor 1. It does not descend onto the bracket. Review it and
              Run on Job, then reopen this guide.
            </p>
            {target && (
              <FieldDescription>
                Expected machine XY: {target[0].toFixed(3)},{" "}
                {target[1].toFixed(3)} mm.
              </FieldDescription>
            )}
            <ReasonButton
              label="Prepare probe and positioning job"
              reason={reason}
              onClick={() => prepare(true)}
            >
              Prepare probe and positioning job
            </ReasonButton>
          </>
        )}
        {draft.step === 1 && (
          <>
            <CalibrationIllustration kind="anchor" />
            <p>
              After positioning finishes, dismiss its completed result. Close
              this guide and jog Z only, slowly, until the tip is 0.1–0.5 mm
              above the solid bracket top. Verify the gap with a suitable gauge
              and remove the gauge before continuing. Keep XY at the expected
              start, clear of screws. Reopen this guide; its selections stay.
            </p>
            <ParameterField
              id={`${id}-gap`}
              parameter={{
                label: "Verified gap above bracket top",
                unit: "mm",
                min: 0.1,
                max: 0.5,
                step: 0.05,
                default: 0.2,
              }}
              field={probingField(form, "gap")}
              disabled={false}
            />
            <p>
              With the spindle stopped and the machine stationary: read the
              released signal, gently trigger the probe and hold it while
              reading, then release and read again. For a conductive rod, use a
              conductive contact connected to the table without moving the axes;
              verify the bracket's contacted surfaces also conduct. The app must
              observe all three states. A tool-setter measurement or LED alone
              does not count.
            </p>
            <FieldDescription>
              Live check: {check?.phase ?? "not started"}. Moving, changing
              tools or reconnecting requires a new check. A completed check
              expires after two minutes and is used for one Run.
            </FieldDescription>
            <ReasonButton
              label={readLabel}
              reason={
                reason ??
                (!machine.availability.readSwitches.allowed
                  ? machine.availability.readSwitches.reason
                  : null)
              }
              disabled={readSwitches.isPending}
              onClick={() =>
                readSwitches.mutate(undefined, {
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              {readLabel}
            </ReasonButton>
          </>
        )}
        {draft.step === 2 && (
          <>
            <p>
              The first search starts at the checked near-surface pose and is
              limited to {(draft.gap + 0.1).toFixed(2)} mm at 30 mm/min. Further
              top touches are limited to 0.4 mm at 15 mm/min. It then rises 5 mm
              above the touched top, moves into the pocket and probes the two
              inner walls, releasing X before Y. Each successful contact must be
              received before the next step.
            </p>
            <p>
              These are maximum travel distances, not guaranteed compression
              distances. An incorrect gap, anchor position or missing contact
              signal can still cause contact with the reference. The normal
              approximately 108 mm native top search is not used.
            </p>
            <p>
              Prepare, review and Run this job alone without moving the probe or
              changing its mounting. After six successful contacts, review Save
              as Anchor 1. Saving is separate and keeps the other anchors'
              offsets; reset and re-home after a verified write.
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
                The same probe is fitted, the gap is measured, the gauge is
                removed, and the bracket, pocket and complete travel are clear.
              </FieldLabel>
            </Field>
          </>
        )}
        {(draft.step === 2 ? runReason : reason) && (
          <Alert>
            <AlertDescription>
              {draft.step === 2 ? runReason : reason}
            </AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </AppDialog>
  )
}
