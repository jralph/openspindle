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
import { probeProfile } from "@/domain/tools/tool"
import { useMachineSnapshot, useReadSwitches } from "@/platform/machine"
import { strategyProbes } from "@/features/probing/probe-tools"
import { ParameterField, probingField } from "@/features/probing/probing-fields"
import { useProbingForm } from "@/features/probing/probing-form"
import { AppDialog } from "@/features/shell/app-dialog"
import { CalibrationIllustration } from "./calibration-illustration"

type Draft = {
  step: number
  toolId: string
  fixtureId: string
  gap: number
  maxX: number
  maxY: number
  maxDown: number
}
const draftAtom = createAtom<Draft>({
  step: 0,
  toolId: "",
  fixtureId: "",
  gap: 5,
  maxX: 6,
  maxY: 6,
  maxDown: 6,
})
const update = (patch: Partial<Draft>) =>
  draftAtom.set((draft) => ({ ...draft, ...patch }))
const SearchSchema = z
  .strictObject({
    gap: z.number().finite().min(0.1).max(5),
    maxX: z.number().finite().min(0.4).max(10),
    maxY: z.number().finite().min(0.4).max(10),
    maxDown: z.number().finite().min(0.4).max(10),
  })
  .refine((value) => value.maxDown > value.gap, {
    path: ["maxDown"],
    message: "Maximum downward search must exceed the estimated top gap.",
  })

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
    {
      gap: draft.gap,
      maxX: draft.maxX,
      maxY: draft.maxY,
      maxDown: draft.maxDown,
    },
    SearchSchema,
    (value) => update(value),
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
  const profile = tool && probeProfile(tool)
  const probeNumber = profile && kit.probing?.slot(profile)
  const activeProbe =
    probeNumber !== null &&
    probeNumber !== undefined &&
    machine.telemetry?.tool === probeNumber &&
    machine.telemetry.toolOffset !== null
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
    maxTravel: [draft.maxX, draft.maxY, draft.maxDown],
    binding,
  })
  const confirmed = confirmedSetup === setupKey
  const changeStep = (step: number) => {
    update({ step })
    setConfirmedSetup(null)
  }
  let reason: string | null = null
  if (!reference?.boundedNc || !reference.measurementNc)
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
    (Math.abs(binding.position[0] - target[0]) > reference!.startTolerance ||
      Math.abs(binding.position[1] - target[1]) > reference!.startTolerance)
  )
    runReason =
      "Position manually over the solid bracket top near the indicated XY, then repeat the signal check."
  if (!runReason && !valid)
    runReason =
      "Enter an estimated gap and valid maximum search distances. Downward search must exceed the gap."

  const prepare = (measurement: boolean) => {
    if (
      (measurement ? reason : runReason) ||
      (!measurement && !confirmed) ||
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
        measurement ? { ...setup.value, workOriginAnchor: null } : setup.value
      ),
      name: measurement
        ? "Anchor 1 — tool-setter detection"
        : "Calibrate Anchor 1 — bounded contacts",
    }
    const added = newProbingOperation(plate, tool, strategy, kit.probing)
    const source = added.operation.source
    if (source.kind !== "probing" || source.task !== "origin") return
    if (!measurement && (!binding || tool.diameter === null)) return
    const operation = {
      ...added.operation,
      name: plate.name,
      source: measurement
        ? {
            kind: "file" as const,
            nc: reference.measurementNc!(),
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
                maxTravel: [draft.maxX, draft.maxY, draft.maxDown] as [
                  number,
                  number,
                  number,
                ],
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
    if (measurement) update({ step: 1 })
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
      description="Fit and connect the probe, reuse or obtain its tool-setter measurement, position manually above the bracket, then verify its signal and run bounded contacts. Opening this guide moves nothing."
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
              "Probe and reference",
              "Manual position, limits and signal",
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
              the selected, undamaged probe. Use the actual tip's library entry
              and diameter; do not reuse the broken probe's dimensions for a
              conductive rod.
            </p>
            <p>
              Insert the selected 3D probe securely and connect its signal
              cable. If it has just been fitted or remounted, prepare
              tool-setter detection below and Run it on Job. Follow the
              machine's prompts. If the same fitted probe is already measured
              and active, reuse that measurement and continue. There is no
              automatic bracket positioning.
            </p>
            <ReasonButton
              label="Prepare tool-setter detection"
              reason={reason}
              onClick={() => prepare(true)}
            >
              Prepare tool-setter detection
            </ReasonButton>
          </>
        )}
        {draft.step === 1 && (
          <>
            <CalibrationIllustration kind="anchor" />
            <p>
              After tool detection, dismiss its completed result. Close this
              guide and manually jog the probe over the solid top at the
              L-bracket's front-left elbow, clear of screws and holes. Aim about
              5 mm left and 5 mm forward of its inner corner, with the tip
              roughly 5 mm above the aluminium top. Reopen this guide without
              moving the probe again.
            </p>
            {target && (
              <FieldDescription>
                Expected machine XY: {target[0].toFixed(3)},{" "}
                {target[1].toFixed(3)} mm (within{" "}
                {reference!.startTolerance.toFixed(1)} mm). The bracket is at
                the front left of the bed.
              </FieldDescription>
            )}
            <ParameterField
              id={`${id}-gap`}
              parameter={{
                label: "Estimated gap above bracket top",
                unit: "mm",
                min: 0.1,
                max: 5,
                step: 0.1,
                default: 5,
              }}
              field={probingField(form, "gap")}
              disabled={false}
            />
            {(
              [
                ["maxX", "Maximum left search · X−"],
                ["maxY", "Maximum front search · Y−"],
                ["maxDown", "Maximum downward search · Z−"],
              ] as const
            ).map(([name, label]) => (
              <ParameterField
                key={name}
                id={`${id}-${name}`}
                parameter={{
                  label,
                  unit: "mm",
                  min: 0.4,
                  max: 10,
                  step: 0.1,
                  default: 6,
                }}
                field={probingField(form, name)}
                disabled={false}
              />
            ))}
            <FieldDescription>
              These limits are total search travel from each search's start, not
              the probe's safe deflection. A roughly 5 mm top gap needs more
              than 5 mm downward search. Choose limits for the actual
              clearances; failure to trigger stops the job without retrying.
            </FieldDescription>
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
                (!activeProbe
                  ? "Use tool-setter detection to make the fitted probe active, then position manually before checking its signal."
                  : null) ??
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
              The first search starts at your manually positioned,
              signal-checked pose and is limited to {draft.maxDown.toFixed(2)}{" "}
              mm down at 30 mm/min. Further top touches are limited to 0.4 mm at
              15 mm/min. It then rises 5 mm above the touched top, moves into
              the pocket and probes the two inner walls with limits of{" "}
              {draft.maxX.toFixed(2)} mm left and {draft.maxY.toFixed(2)} mm
              forward, releasing X before Y. Each successful contact must be
              received and verified before the next step.
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
                The same measured probe remains fitted and connected, it is over
                the solid bracket top, the search limits match the clearances,
                and the pocket and complete travel are clear.
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
