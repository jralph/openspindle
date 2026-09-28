import { createAtom } from "@tanstack/react-store"
import type { ReadonlyAtom } from "@tanstack/react-store"

/** A step of a history, as `History.latestStep` names it. */
export type StepId = number

/** Whether a history has a step to undo and one to redo. */
export type HistoryStatus = {
  readonly canUndo: boolean
  readonly canRedo: boolean
}

type Step<TState> = {
  readonly id: StepId
  readonly before: TState
  after: TState
  /** Edits with this key merge into the step while they follow each other quickly. */
  readonly key: string | null
  /** The last change noted when the step began, and when its latest edit came. */
  readonly startSeq: number
  endSeq: number
  editedAt: number
}

/** A change that is not an edit, from the state it was made on to the one it made. */
type Change<TState> = {
  readonly seq: number
  readonly from: TState
  readonly to: TState
  readonly apply: (state: TState) => TState
}

export type HistoryOptions<TState> = {
  /** Whether an edit leaves everything an undo restores as it was, so it is no step. */
  readonly same: (before: TState, after: TState) => boolean
  /** How many steps are kept. */
  readonly depth?: number
  /** How soon after an edit, in milliseconds, one with the same key merges into its step. */
  readonly mergeWindow?: number
  readonly now?: () => number
}

const sameStatus = (left: HistoryStatus, right: HistoryStatus) =>
  left.canUndo === right.canUndo && left.canRedo === right.canRedo

/**
 * Undo and Redo over immutable states. An edit is recorded as the states before and after it,
 * which share everything it did not change, so a step costs little. An edit with the same key
 * as the one before, within `mergeWindow` of it, merges into its step, so typing a name is one
 * step; any other edit, an undo or a redo starts a new step. A new edit drops the steps undone.
 *
 * Changes that are not edits (the selection, what a device reports, saving) are noted instead,
 * and outlast undo and redo: restoring a step's state replays the changes noted after it (a
 * change that no longer applies changes nothing). A change replayed on the state it was made on
 * gives the state it gave then, so a restored state keeps the identity of what it shares with
 * the one it was.
 */
export class History<TState> {
  /** Whether there is a step to undo and one to redo, for controls that show it. */
  readonly status: ReadonlyAtom<HistoryStatus>
  private readonly statusAtom = createAtom<HistoryStatus>(
    { canUndo: false, canRedo: false },
    { compare: sameStatus }
  )
  private readonly same: (before: TState, after: TState) => boolean
  private readonly depth: number
  private readonly mergeWindow: number
  private readonly now: () => number
  private steps: Step<TState>[] = []
  /** Steps undone, the next to redo last. */
  private undone: Step<TState>[] = []
  private changes: Change<TState>[] = []
  private seq = 0
  private nextId = 1
  /** Whether the latest step still takes edits with its key. */
  private open = false

  constructor(options: HistoryOptions<TState>) {
    this.status = this.statusAtom
    this.same = options.same
    this.depth = options.depth ?? 200
    this.mergeWindow = options.mergeWindow ?? 1000
    this.now = options.now ?? (() => performance.now())
  }

  get canUndo(): boolean {
    return this.steps.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  /** The step Undo undoes next; null when there is none. */
  get latestStep(): StepId | null {
    return this.steps.at(-1)?.id ?? null
  }

  /** Whether `step` can still be undone, at once or after the steps that followed it. */
  holds(step: StepId): boolean {
    return this.steps.some((item) => item.id === step)
  }

  /**
   * Records an edit from `before` to `after`. False when it changes nothing an undo would
   * restore: then it is no step, and the steps undone stay.
   */
  record(before: TState, after: TState, key: string | null): boolean {
    if (this.same(before, after)) return false
    this.undone = []
    const now = this.now()
    const last = this.steps.at(-1)
    if (
      last &&
      this.open &&
      key !== null &&
      key === last.key &&
      now - last.editedAt <= this.mergeWindow
    ) {
      if (this.same(last.before, after)) {
        // Back where the step began, so there is nothing left to undo.
        this.steps.pop()
        this.open = false
      } else {
        last.after = after
        last.endSeq = this.seq
        last.editedAt = now
      }
    } else {
      this.steps.push({
        id: this.nextId++,
        before,
        after,
        key,
        startSeq: this.seq,
        endSeq: this.seq,
        editedAt: now,
      })
      if (this.steps.length > this.depth) this.steps.shift()
      this.open = key !== null
    }
    this.settle()
    return true
  }

  /**
   * Notes a change that is not an edit, from `before` to `after`: undo and redo replay it with
   * `apply` on the states they restore.
   */
  note(before: TState, after: TState, apply: (state: TState) => TState) {
    this.seq += 1
    if (this.steps.length || this.undone.length)
      this.changes.push({ seq: this.seq, from: before, to: after, apply })
  }

  /**
   * Undoes the latest step, or only `step` while it is the latest: the state to restore, which
   * is the one before it with the changes noted since replayed; null when there is none.
   */
  undo(step?: StepId): TState | null {
    const last = this.steps.at(-1)
    if (!last || (step !== undefined && step !== last.id)) return null
    this.steps.pop()
    this.undone.push(last)
    this.open = false
    const state = this.replay(last.before, last.startSeq)
    this.settle()
    return state
  }

  /** Redoes the step undone last: the state to restore; null when there is none. */
  redo(): TState | null {
    const next = this.undone.pop()
    if (!next) return null
    this.steps.push(next)
    this.open = false
    const state = this.replay(next.after, next.endSeq)
    this.settle()
    return state
  }

  /** Forgets every step, as when the state is replaced as a whole. */
  clear() {
    this.steps = []
    this.undone = []
    this.changes = []
    this.open = false
    this.settle()
  }

  private replay(state: TState, since: number): TState {
    let replayed = state
    for (const change of this.changes)
      if (change.seq > since)
        replayed = change.from === replayed ? change.to : change.apply(replayed)
    return replayed
  }

  /** Forgets the changes no undo or redo replays any more, and publishes the status. */
  private settle() {
    const oldest =
      this.steps.at(0)?.startSeq ?? this.undone.at(-1)?.endSeq ?? this.seq
    const first = this.changes.findIndex((change) => change.seq > oldest)
    if (first !== 0) this.changes = first < 0 ? [] : this.changes.slice(first)
    this.statusAtom.set({ canUndo: this.canUndo, canRedo: this.canRedo })
  }
}

const isPlainObject = (value: object): value is Record<string, unknown> => {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Whether two values of plain data are equal: arrays and plain objects by their contents, other
 * values by identity. Parts they share are not walked, so comparing states is cheap.
 */
export function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  )
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    return (
      left.length === right.length &&
      left.every((item, index) => sameData(item, right[index]))
    )
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && sameData(left[key], right[key])
    )
  )
}
