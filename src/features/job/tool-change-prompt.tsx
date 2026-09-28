import { Alert, AlertDescription } from "@/components/ui/alert"
import { ToolCard } from "@/components/workspace/tool-card"
import { ToolImage } from "@/components/workspace/tool-image"
import type { Tool } from "@/domain/tools/tool"
import { useMachineSnapshot } from "@/platform/machine"
import type { JobViewOf, ToolRequest } from "./job-view"
import { StageCard } from "./stage-card"

/** Product details worth checking against the tool in hand. */
function ToolDetails({ tool }: { tool: Tool }) {
  const details = [
    { label: "Kind", value: tool.kind },
    { label: "Vendor", value: tool.vendor },
    { label: "Product", value: tool.productId },
    { label: "Material", value: tool.material },
    { label: "Coating", value: tool.coating },
    { label: "Notes", value: tool.notes },
  ].filter((detail) => !!detail.value)
  if (!details.length) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {details.map((detail) => (
        <div key={detail.label} className="contents">
          <dt className="text-muted-foreground">{detail.label}</dt>
          <dd className="min-w-0 break-words">{detail.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Why the plate's tool cannot be shown, when it cannot. */
function missingToolNote(
  request: ToolRequest,
  knownPlate: boolean
): string | null {
  if (!knownPlate)
    return "This job was started outside this window, so its plate's tool table is unknown."
  if (request.number === null)
    return "The machine did not report which tool it waits for."
  if (!request.entry)
    return `T${request.number} is not in the plate's tool table as it was run.`
  if (!request.tool)
    return `T${request.number} had no library tool assigned when the job was run.`
  return null
}

/** A manual tool change: which tool to install, confirmed in the job's toolbar. */
export function ToolChangePrompt({
  view,
}: {
  view: JobViewOf<"waiting-tool">
}) {
  const { features } = useMachineSnapshot()
  const atc = features?.atc === true
  const { request } = view
  const slot = request.number === null ? null : `T${request.number}`
  const note = missingToolNote(request, view.session !== null)
  return (
    <StageCard
      title={slot ? `Install ${slot}` : "Change the tool"}
      description={
        atc
          ? "The machine waits for its tool changer."
          : "The machine waits with the spindle stopped. Install the tool, then choose Tool installed."
      }
    >
      {request.tool && (
        <>
          <ToolCard tool={request.tool} slotLabel={slot ?? undefined} />
          <ToolImage tool={request.tool} />
          <ToolDetails tool={request.tool} />
        </>
      )}
      {note && (
        <Alert>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
    </StageCard>
  )
}
