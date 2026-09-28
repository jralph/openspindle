import { useState } from "react"
import { Box, PencilLine, Plus, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { FieldDescription } from "@/components/ui/field"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { FilePicker } from "@/components/file-picker"
import { InlineNameInput } from "@/components/workspace/inline-name-input"
import { MODEL_ACCEPT } from "@/domain/models/model"
import type { ModelRecord } from "@/domain/models/model"
import { TEXT_LIMIT, formatBytes, plural } from "@/domain/primitives"
import { AppDialog } from "@/features/shell/app-dialog"
import type { ImportStep } from "./import-model"
import {
  useImportModels,
  useModelLibrary,
  useRemoveModel,
  useRenameModel,
} from "./model-queries"
import { usageText, useModelUsage } from "./model-usage"
import type { ModelUsage } from "./model-usage"

const STEP_LABELS: Record<ImportStep, string> = {
  reading: "Reading",
  tessellating: "Tessellating",
  saving: "Saving",
}

const length = (value: number) =>
  Number(value.toFixed(value < 10 ? 1 : 0)).toLocaleString("en-US")

/**
 * "STEP · 120 × 80 × 25 mm · 48,210 triangles · 3.2 MB". The size is of `bounds`: the model as
 * its file has it, or as a fixture stands it.
 */
export function modelDetails(
  model: ModelRecord,
  bounds: ModelRecord["bounds"] = model.bounds
) {
  const { min, max } = bounds
  const size = max.map((value, axis) => length(value - min[axis])).join(" × ")
  const origin = model.source
    ? model.source.format.toUpperCase()
    : "From a project"
  return [
    origin,
    `${size} mm`,
    plural(model.mesh.triangles, "triangle"),
    formatBytes(model.source?.bytes ?? model.mesh.bytes),
  ].join(" · ")
}

/** Adds STEP and GLB files, one after another, with the running file's step. */
function AddModels() {
  const importing = useImportModels()
  const failures = importing.data?.failures ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <FilePicker
          accept={MODEL_ACCEPT}
          multiple
          aria-label="Model files"
          onSelect={(files) => importing.mutate(files)}
        >
          {(open) => (
            <Button
              variant="outline"
              disabled={importing.isPending}
              onClick={open}
            >
              <Plus data-icon="inline-start" />
              Add models…
            </Button>
          )}
        </FilePicker>
        {importing.progress && (
          <>
            <FieldDescription role="status" className="flex items-center gap-2">
              <Spinner />
              {STEP_LABELS[importing.progress.step]}{" "}
              {importing.progress.fileName}…
            </FieldDescription>
            <Button variant="ghost" onClick={importing.cancel}>
              Cancel
            </Button>
          </>
        )}
      </div>
      <FieldDescription>
        STEP files are tessellated on this computer and kept with their mesh.
        Fixtures place models on the bed.
      </FieldDescription>
      {failures.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            {plural(failures.length, "file")} could not be added
          </AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function ModelRow({
  model,
  usage,
  onDelete,
}: {
  model: ModelRecord
  usage: ModelUsage | undefined
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const rename = useRenameModel()
  return (
    <Item variant="outline" size="sm">
      <ItemMedia variant="icon">
        <Box />
      </ItemMedia>
      <ItemContent className="min-w-0">
        {editing ? (
          <InlineNameInput
            name={model.name}
            label={`Name of ${model.name}`}
            maxLength={TEXT_LIMIT}
            onSave={(name) => rename.mutate({ id: model.id, name })}
            onDone={() => setEditing(false)}
          />
        ) : (
          <ItemTitle className="max-w-full truncate" title={model.name}>
            {model.name}
          </ItemTitle>
        )}
        <ItemDescription className="font-numeric">
          {modelDetails(model)}
        </ItemDescription>
        <ItemDescription>{usageText(usage)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Rename ${model.name}`}
          onClick={() => setEditing(true)}
        >
          <PencilLine />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${model.name}`}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </ItemActions>
    </Item>
  )
}

/** Deleting a model in use leaves its fixtures showing a box of its size. */
function DeleteModel({
  model,
  usage,
  onClose,
}: {
  model: ModelRecord
  usage: ModelUsage | undefined
  onClose: () => void
}) {
  const remove = useRemoveModel()
  const used = !!usage && (usage.definitions > 0 || usage.plates > 0)
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {model.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {used
              ? `${usageText(usage)}. Their fixtures will show a box of its size until they get another model.`
              : "It is not used by any fixture."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => remove.mutate(model.id, { onSettled: onClose })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The Models library: uploaded STEP and GLB models that fixtures place on the bed. */
export function ModelsDialog({ onClose }: { onClose: () => void }) {
  const library = useModelLibrary()
  const usage = useModelUsage()
  const [deleting, setDeleting] = useState<ModelRecord | null>(null)
  const models = library.data ?? []
  return (
    <AppDialog
      title="Models"
      description={
        <span className="font-numeric">{plural(models.length, "model")}</span>
      }
      width="wide"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <AddModels />
        {library.error && (
          <Alert variant="destructive">
            <AlertDescription>{library.error.message}</AlertDescription>
          </Alert>
        )}
        {library.data && !models.length && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box />
              </EmptyMedia>
              <EmptyTitle>No models yet</EmptyTitle>
              <EmptyDescription>
                Add STEP or GLB files of your fixtures, such as vises and
                clamps, to place them on the bed.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="flex flex-col gap-2" aria-label="Models">
          {models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              usage={usage.get(model.id)}
              onDelete={() => setDeleting(model)}
            />
          ))}
        </div>
      </div>
      {deleting && (
        <DeleteModel
          model={deleting}
          usage={usage.get(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </AppDialog>
  )
}
