import { LoaderCircle, Waypoints } from "lucide-react"
import { useMachineSnapshot } from "@/platform/machine"
import { ReasonButton } from "@/components/workspace/reason-button"

/** Reads the connected device's anchors again; they are read by themselves on connecting. */
export function ReadAnchorsButton({
  reading,
  onRead,
}: {
  reading: boolean
  onRead: () => void
}) {
  const { availability, anchors } = useMachineSnapshot()
  const entry = availability.readAnchors
  const busy = reading || anchors.reading
  let label = "Read anchors"
  if (entry.deferred) label = "Read anchors after the program"
  if (busy) label = "Reading anchors…"
  return (
    <ReasonButton
      label="Read anchors"
      variant="outline"
      size="sm"
      aria-label={label}
      reason={entry.allowed ? null : entry.reason}
      disabled={busy}
      onClick={onRead}
    >
      {busy ? (
        <LoaderCircle className="animate-spin" data-icon="inline-start" />
      ) : (
        <Waypoints data-icon="inline-start" />
      )}
      <span>{label}</span>
    </ReasonButton>
  )
}
