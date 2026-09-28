import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { exportPlateProgram } from "@/app/workspace/export-program"
import { usePlateDiagnostics } from "@/app/workspace/use-plate-diagnostics"
import { usePlateIndex, useWorkspace } from "@/app/workspace/workspace-context"
import { compilePlate } from "@/domain/compile/compile"
import { resolveOperation } from "@/domain/operations/kinds"
import { plateLabel } from "@/domain/plate/plate"
import type { Plate } from "@/domain/plate/plate"
import { AppDialog } from "@/features/shell/app-dialog"
import { suggestedFileName } from "@/platform/contract/files"
import { useHost } from "@/platform/host-context"

type View = "nc" | "setup"

/** The NC an operation contributes, or the plate's whole program. */
function sourceText(plate: Plate, operationId: string | null) {
  const operation = plate.operations.find((item) => item.id === operationId)
  if (!operation) return compilePlate(plate).program.source
  const resolved = resolveOperation(operation, plate)
  return resolved.ok ? resolved.value.nc : resolved.error.message
}

/** The plate's setup as it is embedded in exported NC; models are shortened for reading. */
const setupText = (plate: Plate) =>
  JSON.stringify(
    { name: plate.name, setup: plate.setup, tools: plate.tools },
    (key, value: unknown) =>
      key === "url" && typeof value === "string" && value.startsWith("data:")
        ? `${value.slice(0, 35)}… (embedded GLB)`
        : value,
    2
  )

/** Exports the plate unless what blocks Run (the Prepare inspector's diagnostics) blocks it. */
function useExportProgram(plate: Plate) {
  const host = useHost()
  const diagnostics = usePlateDiagnostics(plate)
  const label = plateLabel(plate, usePlateIndex(plate.id))
  return useMutation({
    mutationFn: async () => {
      const exported = exportPlateProgram(plate, diagnostics)
      if (!exported.ok) throw new Error(exported.error)
      return host.files.save({
        kind: "program",
        suggestedName: suggestedFileName("program", label, "program"),
        contents: exported.value,
      })
    },
    onSuccess: (result) => {
      if (result.status === "canceled") return
      toast.success("Saved with the plate's setup.")
    },
  })
}

/** Reads an operation's or plate's NC, and exports the plate with its setup embedded. */
export function ProgramSourceDialog({
  plateId,
  operationId,
  onClose,
}: {
  plateId: string
  operationId: string | null
  onClose: () => void
}) {
  const plate = useWorkspace((state) =>
    state.plates.find((item) => item.id === plateId)
  )
  const index = usePlateIndex(plateId)
  const [view, setView] = useState<View>("nc")
  const text = useMemo(() => {
    if (!plate) return ""
    return view === "nc" ? sourceText(plate, operationId) : setupText(plate)
  }, [plate, view, operationId])
  if (!plate) return null
  const operation = plate.operations.find((item) => item.id === operationId)
  return (
    <AppDialog
      title={operation?.name ?? plateLabel(plate, index)}
      width="wide"
      onClose={onClose}
      footer={<ExportButton plate={plate} />}
    >
      <Tabs
        value={view}
        onValueChange={(value) => setView(value === "setup" ? "setup" : "nc")}
      >
        <TabsList aria-label="Source view">
          <TabsTrigger value="nc">NC source</TabsTrigger>
          <TabsTrigger value="setup">Plate setup</TabsTrigger>
        </TabsList>
        <TabsContent value={view}>
          <Textarea
            className="h-[50vh] resize-none"
            aria-label={view === "nc" ? "NC source" : "Plate setup"}
            readOnly
            spellCheck={false}
            value={text}
          />
        </TabsContent>
      </Tabs>
    </AppDialog>
  )
}

function ExportButton({ plate }: { plate: Plate }) {
  const exporting = useExportProgram(plate)
  return (
    <div className="flex w-full items-center justify-end gap-2">
      {exporting.error && (
        <Alert variant="destructive" className="flex-1">
          <AlertDescription>{exporting.error.message}</AlertDescription>
        </Alert>
      )}
      <Button disabled={exporting.isPending} onClick={() => exporting.mutate()}>
        <Download />
        {exporting.isPending ? "Saving…" : "Export NC with setup"}
      </Button>
    </div>
  )
}
