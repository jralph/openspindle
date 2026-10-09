import { useId, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { OptionSelect } from "@/components/option-select"
import {
  selectedPlate,
  useWorkspace,
  useWorkspaceStore,
} from "@/app/workspace/workspace-context"
import { createOperation } from "@/domain/operations/operation"
import { FacingParamsSchema, facingToolIssue } from "@/domain/operations/facing"
import type { FacingParams } from "@/domain/operations/facing"
import { createPreset } from "@/domain/tools/tool"
import type { Tool } from "@/domain/tools/tool"
import { kitForPlate } from "@/domain/fixtures/catalog"
import {
  useProbingDraft,
  useProbingForm,
} from "@/features/probing/probing-form"
import {
  MeasurementField,
  probingField,
} from "@/features/probing/probing-fields"
import { AppDialog } from "@/features/shell/app-dialog"
import { openDialog } from "@/features/shell/dialogs"
import { usePrepareSelection } from "@/features/prepare/plate-tree/use-prepare-selection"

const FIELDS: {
  key: keyof FacingParams
  label: string
  unit: string
  description?: string
}[] = [
  { key: "x", label: "Front-left X", unit: "mm" },
  { key: "y", label: "Front-left Y", unit: "mm" },
  { key: "width", label: "Width · X", unit: "mm" },
  { key: "depth", label: "Depth · Y", unit: "mm" },
  {
    key: "top",
    label: "Starting top Z",
    unit: "mm",
    description:
      "Work coordinates. Match the measured surface and the actual work Z.",
  },
  { key: "removal", label: "Total removal", unit: "mm" },
  { key: "clearance", label: "Clearance above top", unit: "mm" },
  { key: "rpm", label: "Spindle", unit: "rpm" },
  { key: "feed", label: "Cutting feed", unit: "mm/min" },
  {
    key: "plunge",
    label: "Entry feed",
    unit: "mm/min",
    description:
      "Entry is outside the stock along X; confirm this space is clear.",
  },
  { key: "stepdown", label: "Depth per pass", unit: "mm" },
  { key: "stepover", label: "Stepover", unit: "mm" },
]

function ChipLoadCalculator({
  tool,
  params,
  onApply,
}: {
  tool: Tool
  params: FacingParams
  onApply: (feed: number) => void
}) {
  const [chip, setChip] = useState(0)
  const [valid, setValid] = useState(false)
  const form = useProbingForm(
    { chip: 0 },
    z.object({ chip: z.number().positive().max(10) }),
    (value) => setChip(value.chip),
    setValid
  )
  const id = useId()
  const teeth = tool.flutes ?? tool.geometry.numberOfTeeth
  const feed = params.rpm * (teeth ?? 0) * chip
  return (
    <FieldGroup>
      {probingField(
        form,
        "chip"
      )((field) => (
        <MeasurementField
          id={id}
          label="Target chip load · from your cutter data"
          unit="mm/tooth"
          value={field.value || null}
          errors={field.errors}
          disabled={false}
          onBlur={field.onBlur}
          onValueChange={(value) => field.onChange(value ?? NaN)}
        />
      ))}
      <Button
        variant="outline"
        disabled={
          !valid || !teeth || params.rpm <= 0 || feed <= 0 || feed > 100000
        }
        onClick={() => onApply(feed)}
      >
        Use calculated feed
        {valid && teeth && params.rpm > 0 ? ` · ${feed.toFixed(0)} mm/min` : ""}
      </Button>
    </FieldGroup>
  )
}

function FacingFields({
  value,
  onChange,
  onValidityChange,
}: {
  value: FacingParams
  onChange: (p: FacingParams) => void
  onValidityChange: (valid: boolean) => void
}) {
  // Keep raw drafts, including invalid geometry, when presets replace cutting fields.
  const schema: z.ZodType<FacingParams, FacingParams> = FacingParamsSchema
  const form = useForm({
    defaultValues: value,
    validators: { onChange: schema },
    listeners: {
      onChange: ({ formApi }) => {
        onValidityChange(
          FacingParamsSchema.safeParse(formApi.state.values).success
        )
        onChange(formApi.state.values)
      },
    },
  })
  const id = useId()
  return (
    <FieldGroup>
      {FIELDS.map(({ key, label, unit, description }) =>
        probingField(
          form,
          key
        )((field) => (
          <MeasurementField
            key={key}
            id={`${id}-${key}`}
            label={label}
            description={description}
            unit={unit}
            value={field.value}
            errors={field.errors}
            disabled={false}
            onBlur={field.onBlur}
            onValueChange={(v) => field.onChange(v ?? NaN)}
          />
        ))
      )}
    </FieldGroup>
  )
}

export function FacingDialog({
  plateId: requestedPlate,
  operationId,
  onClose,
}: {
  plateId?: string
  operationId?: string
  onClose: () => void
}) {
  const workspace = useWorkspaceStore()
  const selected = useWorkspace(selectedPlate)
  const [plateId] = useState(requestedPlate ?? selected?.id ?? null)
  const plate = useWorkspace((state) =>
    state.plates.find((p) => p.id === plateId)
  )
  const tools = useWorkspace((state) => state.tools)
  const selection = usePrepareSelection()
  const operation = plate?.operations.find((op) => op.id === operationId)
  const source = operation?.source.kind === "facing" ? operation.source : null
  const [revision] = useState(operation?.revision)
  const existingToolId = plate?.tools.find(
    (entry) =>
      entry.number ===
      operation?.tools.find((binding) => binding.local === source?.tool)?.plate
  )?.toolId
  const [toolId, setToolId] = useState(
    existingToolId ?? tools.find((tool) => !facingToolIssue(tool))?.id ?? ""
  )
  const tool = tools.find((item) => item.id === toolId)
  const [params, setParams] = useState<FacingParams>(() => {
    if (source) return source.params
    const stock = plate?.setup.stock
    const origin = plate?.setup.workOrigin ?? [0, 0, 0]
    const anchor = plate?.setup.stockAnchor ?? [0, 0, 0]
    return {
      x: anchor[0] - origin[0],
      y: anchor[1] - origin[1],
      width: stock?.width ?? 100,
      depth: stock?.depth ?? 100,
      top: anchor[2] + (stock?.height ?? 0) - origin[2],
      diameter: tool?.diameter ?? 1,
      removal: 0.1,
      stepdown: 0.1,
      stepover: (tool?.diameter ?? 1) / 2,
      clearance: 5,
      rpm: 0,
      feed: 0,
      plunge: 0,
    }
  })
  const [valid, setValid] = useState(
    FacingParamsSchema.safeParse(params).success
  )
  const draft = useProbingDraft(params, setParams)
  const [presetId, setPresetId] = useState("")
  const [presetName, setPresetName] = useState("")
  const presetForm = useForm({
    defaultValues: { name: "" },
    validators: {
      onChange: z.object({ name: z.string().trim().min(1).max(200) }),
    },
    listeners: {
      onChange: ({ formApi }) => setPresetName(formApi.state.values.name),
    },
  })
  const presetNameId = useId()
  const issue = facingToolIssue(tool)
  const preset = tool?.presets.find((item) => item.id === presetId)
  const kit = plate ? kitForPlate(plate) : null
  const guard =
    !plate ||
    issue !== null ||
    !valid ||
    (operationId !== undefined && (!source || operation?.revision !== revision))
  const savePreset = () => {
    if (!tool || !valid || !presetName.trim()) return
    const next = {
      ...createPreset(tool.presets),
      name: presetName.trim(),
      material: plate?.setup.stock?.material ?? null,
      rpm: params.rpm,
      feedRate: params.feed,
      plungeFeed: params.plunge,
      stepdown: params.stepdown,
      stepover: params.stepover,
      useStepdown: true,
      useStepover: true,
      feedPerTooth: chipLoad(tool, params),
    }
    const result = workspace.dispatch({
      type: "library.tools",
      tools: workspace.state.tools.map((item) =>
        item.id === tool.id
          ? { ...item, presets: [...item.presets, next] }
          : item
      ),
    })
    if (!result.ok) toast.error(result.error)
    else {
      setPresetId(next.id)
      toast.success("Cutting preset saved to this tool.")
    }
  }
  const apply = () => {
    if (guard || !tool || !FacingParamsSchema.safeParse(params).success) return
    const nextSource = {
      kind: "facing" as const,
      tool: source?.tool ?? 1,
      params,
    }
    if (operation) {
      const result = workspace.dispatch({
        type: "operation.source",
        plateId: plate.id,
        operationId: operation.id,
        expectedRevision: revision,
        source: nextSource,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
    } else {
      const added = createOperation("Facing", nextSource)
      const result = workspace.dispatch({
        type: "operation.add",
        plateId: plate.id,
        operation: added,
        preferredTools: new Map([[nextSource.tool, tool.id]]),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      selection.selectOperation(plate.id, added.id)
    }
    onClose()
  }
  return (
    <AppDialog
      title={operation ? "Edit facing" : "Facing wizard"}
      width="wide"
      onClose={onClose}
      footer={
        <Button disabled={guard} onClick={apply}>
          {operation ? "Apply parameters" : "Create facing operation"}
        </Button>
      }
    >
      <FieldGroup>
        <FieldDescription>
          Creates an editable rectangular raster in work coordinates. Each depth
          pass enters outside X and retracts before repositioning. Review the
          generated program and clamp clearances on Job before Run. This does
          not set physical work Z or change the stock model.
        </FieldDescription>
        {!plate && (
          <Button
            variant="outline"
            onClick={() => openDialog({ kind: "guided-setup" })}
          >
            Create a setup first
          </Button>
        )}
        <Field>
          <FieldLabel>Cutter</FieldLabel>
          <OptionSelect
            value={toolId}
            disabled={!!operation}
            options={tools
              .filter((item) => !facingToolIssue(item))
              .map((item) => ({
                value: item.id,
                label: `${item.name} · Ø${item.diameter} mm`,
              }))}
            onValueChange={(id) => {
              setToolId(id)
              setPresetId("")
              const diameter = tools.find((t) => t.id === id)?.diameter ?? 1
              const next = {
                ...params,
                diameter,
                stepover: Math.min(params.stepover, diameter / 2),
              }
              setParams(next)
              setValid(FacingParamsSchema.safeParse(next).success)
            }}
          />
        </Field>
        {issue && (
          <FieldDescription>
            {issue} Edit the tool library before continuing.
          </FieldDescription>
        )}
        {tool && tool.diameter !== params.diameter && (
          <Button
            variant="outline"
            onClick={() => {
              const diameter = tool.diameter ?? params.diameter
              const next = {
                ...params,
                diameter,
                stepover: Math.min(params.stepover, diameter / 2),
              }
              setParams(next)
              setValid(FacingParamsSchema.safeParse(next).success)
            }}
          >
            Use current cutter diameter · {tool.diameter} mm
          </Button>
        )}
        <FieldDescription>
          Feeds and speeds assistant: load cutting data supplied for your cutter
          and material, or enter your own. These values require operator review.
          Imported G-code keeps its original cutting data.
          {kit?.spindleRange &&
            ` This machine's spindle range is ${kit.spindleRange.min}–${kit.spindleRange.max} rpm.`}
        </FieldDescription>
        <Field>
          <FieldLabel>Library cutting preset</FieldLabel>
          <OptionSelect
            value={presetId}
            options={[
              { value: "", label: "Choose a preset" },
              ...(tool?.presets.map((item) => ({
                value: item.id,
                label: `${item.name}${item.material ? ` · ${item.material}` : ""}`,
              })) ?? []),
            ]}
            onValueChange={setPresetId}
          />
        </Field>
        <Button
          variant="outline"
          disabled={!preset}
          onClick={() => {
            if (!preset) return
            const next = {
              ...params,
              rpm: preset.rpm ?? 0,
              feed: preset.feedRate ?? 0,
              plunge: preset.plungeFeed ?? 0,
              stepdown: preset.stepdown ?? params.stepdown,
              stepover: preset.stepover ?? params.stepover,
            }
            setValid(FacingParamsSchema.safeParse(next).success)
            setParams(next)
          }}
        >
          Apply preset to facing parameters
        </Button>
        <FacingFields
          key={`${toolId}-${draft.key}`}
          value={params}
          onChange={draft.onChange}
          onValidityChange={setValid}
        />
        <FieldDescription className="font-numeric">
          Diameter: {params.diameter} mm · Chip load:{" "}
          {tool && valid && chipLoad(tool, params) !== null
            ? `${chipLoad(tool, params)?.toFixed(4)} mm/tooth`
            : "Enter RPM, feed and flute count"}
          . Chip load = feed ÷ (RPM × cutting teeth); it is a calculation, not a
          suitability check.
        </FieldDescription>
        {tool && valid && (
          <ChipLoadCalculator
            tool={tool}
            params={params}
            onApply={(feed) => {
              const next = { ...params, feed }
              setParams(next)
              setValid(FacingParamsSchema.safeParse(next).success)
            }}
          />
        )}
        <Field>
          <FieldLabel htmlFor={presetNameId}>
            Save these cutting values as a preset
          </FieldLabel>
          <presetForm.Field name="name">
            {(field) => (
              <Input
                id={presetNameId}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Name for this cutter and material"
                maxLength={200}
              />
            )}
          </presetForm.Field>
        </Field>
        <Button
          variant="outline"
          disabled={!tool || !valid || !presetName.trim()}
          onClick={savePreset}
        >
          Save named cutting preset
        </Button>
        {!!operation && (
          <Button
            variant="outline"
            onClick={() =>
              openDialog({
                kind: "source",
                plateId: plateId!,
                operationId: operation.id,
              })
            }
          >
            View committed program
          </Button>
        )}
        {!valid && (
          <FieldDescription>
            Complete all numeric fields with valid cutting data. Invalid drafts
            cannot be applied.
          </FieldDescription>
        )}
        {!!operationId && operation?.revision !== revision && (
          <FieldDescription>
            This operation changed while the dialog was open. Reopen it to edit
            the current version.
          </FieldDescription>
        )}
      </FieldGroup>
    </AppDialog>
  )
}

function chipLoad(tool: Tool, params: FacingParams): number | null {
  const teeth = tool.flutes ?? tool.geometry.numberOfTeeth
  return teeth && teeth > 0 && params.rpm > 0
    ? params.feed / (params.rpm * teeth)
    : null
}
