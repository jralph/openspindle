import { Lock, LockOpen, Move } from "lucide-react"
import { ToolbarToggle } from "@/components/workspace/toolbar-button"
import { useWorkspaceStore } from "@/app/workspace/workspace-context"
import { setMoving, useArrange, useArrangeTarget } from "./arrange-state"
import type { ArrangeTarget } from "./arrange-state"
import { lockToggleCopy, toggleLock } from "./use-arrange-events"

function lockReason(target: ArrangeTarget | null) {
  if (!target) return "Select a fixture to lock it."
  if (target.item.locked !== null) return null
  if (target.item.fixed) return target.item.fixed
  return "Only fixtures lock."
}

/** Tools for the setup item selected in the viewer: move it, lock it. */
export function ArrangeTools() {
  const workspace = useWorkspaceStore()
  const target = useArrangeTarget()
  const { moving } = useArrange()
  const moveReason = target
    ? target.item.fixed
    : "Select a fixture, the stock or the design to move it."
  const locked = target?.item.locked === true
  const lock = lockToggleCopy(locked)
  return (
    <>
      <ToolbarToggle
        label="Move (M)"
        description="Drag the selected fixture, stock or design, or click one of its points and then another."
        reason={moveReason}
        pressed={moving && moveReason === null}
        onPressedChange={setMoving}
      >
        <Move />
      </ToolbarToggle>
      <ToolbarToggle
        label={`${lock.label} (L)`}
        description={lock.description}
        reason={lockReason(target)}
        pressed={locked}
        onPressedChange={() => {
          if (target) toggleLock(workspace, target)
        }}
      >
        {locked ? <Lock /> : <LockOpen />}
      </ToolbarToggle>
    </>
  )
}
