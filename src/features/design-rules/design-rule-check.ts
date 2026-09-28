import { createAtom, useSelector } from "@tanstack/react-store"
import { selectedPlate } from "@/app/workspace/workspace-context"
import { compilePlate } from "@/domain/compile/compile"
import { checkDesignRules } from "@/domain/design-rules/check"
import type {
  DesignRuleCheck,
  DesignRuleViolation,
} from "@/domain/design-rules/check"
import type { DesignRules } from "@/domain/design-rules/rules"
import type { Plate } from "@/domain/plate/plate"
import type { WorkspaceState } from "@/domain/workspace/workspace"

/** A plate's last check: the plate and rules as checked, and what it found. */
export type DesignRuleResult = {
  readonly plate: Plate
  readonly rules: DesignRules
  readonly check: DesignRuleCheck
}

type ResultsState = {
  readonly result: DesignRuleResult | null
  /** The violation shown in the 3D view, by its place in the result. */
  readonly selected: number | null
}

const resultsAtom = createAtom<ResultsState>({ result: null, selected: null })

export const useDesignRuleResults = () => useSelector(resultsAtom)

/**
 * Checks a plate of the workspace (the selected one unless named) against the project's design
 * rules, and shows what it finds; the check only reports.
 */
export function checkPlateDesignRules(state: WorkspaceState, plateId?: string) {
  const plate = plateId
    ? state.plates.find((item) => item.id === plateId)
    : selectedPlate(state)
  if (!plate) return
  const rules = state.designRules
  const check = checkDesignRules(plate, compilePlate(plate), rules, state.tools)
  resultsAtom.set(() => ({ result: { plate, rules, check }, selected: null }))
}

export const closeDesignRuleResults = () =>
  resultsAtom.set(() => ({ result: null, selected: null }))

export const selectViolation = (index: number | null) =>
  resultsAtom.set((state) => ({ ...state, selected: index }))

/** A result no longer matches the workspace once its plate or the rules change. */
export const isOutOfDate = (result: DesignRuleResult, state: WorkspaceState) =>
  state.designRules !== result.rules || !state.plates.includes(result.plate)

/** The violation to show in the 3D view, while its result still matches this plate. */
export function shownViolation(
  results: ResultsState,
  plate: Plate | null
): DesignRuleViolation | null {
  const { result, selected } = results
  if (!result || selected === null || result.plate !== plate) return null
  return result.check.violations.at(selected) ?? null
}
