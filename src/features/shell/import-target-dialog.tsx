import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  useWorkspace,
  useWorkspaceStore,
} from "@/app/workspace/workspace-context"
import { plateLabel } from "@/domain/plate/plate"
import { plural } from "@/domain/primitives"
import { clearSectionSelection } from "@/features/prepare/selection"
import { AppDialog } from "./app-dialog"
import { closeDialog } from "./dialogs"
import { useImportOperations, useImportPlates } from "./use-import"

/** The choice that makes the files new plates; no plate has an empty id. */
const NEW_PLATE = ""

/**
 * NC files dropped while there are several plates: they become operations of the plate chosen
 * here (the selected one at first), which is then selected, or each a new plate.
 */
export function ImportTargetDialog({ files }: { files: readonly File[] }) {
  const workspace = useWorkspaceStore()
  const plates = useWorkspace((state) => state.plates)
  const [target, setTarget] = useState(
    () => workspace.state.selectedPlateId ?? NEW_PLATE
  )
  const importPlates = useImportPlates()
  const importOperations = useImportOperations()
  const busy = importPlates.isPending || importOperations.isPending
  const id = useId()
  const submit = () => {
    if (target === NEW_PLATE) {
      importPlates.mutate(files, { onSuccess: closeDialog })
      return
    }
    importOperations.mutate(
      { plateId: target, files },
      {
        onSuccess: () => {
          if (workspace.state.selectedPlateId !== target) {
            workspace.dispatch({ type: "plate.select", plateId: target })
            clearSectionSelection()
          }
          closeDialog()
        },
      }
    )
  }
  const options = [
    ...plates.map((plate, index) => ({
      value: plate.id,
      label: plateLabel(plate, index),
    })),
    {
      value: NEW_PLATE,
      label: files.length === 1 ? "New plate" : "New plate for each file",
    },
  ]
  return (
    <AppDialog
      title={`Import ${files.length === 1 ? files[0].name : plural(files.length, "program")}`}
      onClose={closeDialog}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={closeDialog}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </>
      }
    >
      <FieldSet>
        <FieldLegend>Add to</FieldLegend>
        {/* The bottom padding holds the last radio's hit area, which would scroll the dialog. */}
        <RadioGroup
          className="pb-2"
          value={target}
          onValueChange={(value) => setTarget(String(value))}
        >
          {options.map((option, index) => (
            <Field key={option.value} orientation="horizontal">
              <RadioGroupItem
                value={option.value}
                id={`${id}-${index}`}
                disabled={busy}
              />
              <FieldLabel htmlFor={`${id}-${index}`} className="font-normal">
                {option.label}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
    </AppDialog>
  )
}
