import { toast } from "sonner"
import { useWorkspaceStore } from "@/app/workspace/workspace-context"
import type { WorkspaceStore } from "@/app/workspace/store"
import type {
  ArrangeEvents,
  ArrangeMenuRequest,
  ArrangePick,
} from "@/components/workspace/bed-viewer"
import type { Plate } from "@/domain/plate/plate"
import { setupItem } from "@/domain/plate/setup-items"
import type { SetupItem, SetupItemRef } from "@/domain/plate/setup-items"
import type { PrepareSearch } from "@/routes/_workspace/prepare"
import { usePrepareSelection } from "../plate-tree/use-prepare-selection"
import {
  dragAtom,
  isArrangeSelection,
  selectSetupItem,
  setMoving,
} from "./arrange-state"

/** The inspector panel with an item's settings; undefined keeps the panel shown. */
function panelOf(item: SetupItemRef): PrepareSearch["panel"] {
  switch (item.kind) {
    case "fixture":
      return "fixtures"
    case "stock":
    case "design":
      return "setup"
    case "bed":
      return undefined
  }
}

/** What a fixture's lock control needs of the item it locks or unlocks. */
type LockTarget = { plate: Plate; item: Pick<SetupItem, "ref" | "locked"> }

/** What a lock control says: the same wording wherever a fixture can be locked or unlocked. */
export function lockToggleCopy(locked: boolean) {
  return {
    label: locked ? "Unlock" : "Lock",
    description: locked ? "Let it move again." : "Keep it in place.",
  }
}

/**
 * Locks or unlocks a fixture; locking ends move mode when the fixture was the one selected and
 * moving.
 */
export function toggleLock(workspace: WorkspaceStore, target: LockTarget) {
  const { plate, item } = target
  if (item.ref.kind !== "fixture" || item.locked === null) return
  const locked = !item.locked
  const result = workspace.dispatch({
    type: "fixture.lock",
    plateId: plate.id,
    fixtureId: item.ref.id,
    locked,
  })
  if (!result.ok) toast.error(result.error)
  else if (locked && isArrangeSelection(plate.id, item.ref)) setMoving(false)
}

/**
 * What the Prepare viewer does when setup items are clicked and moved: the inspector shows the
 * selected item's settings, and moves are workspace commands.
 */
export function useArrangeEvents(handlers: {
  menu: (request: ArrangeMenuRequest) => void
  pick: (pick: ArrangePick) => void
}): ArrangeEvents {
  const workspace = useWorkspaceStore()
  const selection = usePrepareSelection()
  return {
    select: (plateId, item) => {
      const plate = workspace.state.plates.find(({ id }) => id === plateId)
      if (!plate || !item) {
        selectSetupItem(null)
        if (plate) selection.selectPlate(plate.id)
        return
      }
      const movable = !setupItem(plate.setup, item)?.fixed
      selectSetupItem({ plateId: plate.id, item }, movable)
      const panel = panelOf(item)
      // The machine bed has no settings of its own: what the inspector shows stays.
      if (panel) selection.showPlateSetup(plate.id, panel)
      else if (workspace.state.selectedPlateId !== plate.id)
        selection.selectPlate(plate.id)
    },
    move: (plateId, item, delta) => {
      const result = workspace.dispatch({
        type: "plate.moveItem",
        plateId,
        item,
        delta,
      })
      if (!result.ok) toast.error(result.error)
      return result.ok
    },
    menu: handlers.menu,
    pick: handlers.pick,
    drag: (drag) => dragAtom.set(() => drag),
  }
}
