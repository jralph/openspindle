import type { PersistedDocument } from "./document"

/** A model that can be replaced wholesale and observed; stores implement it. */
export type DocumentTarget<TValue> = {
  readonly state: TValue
  readonly hydrate: (value: TValue) => void
  readonly subscribe: (listener: (value: TValue) => void) => () => void
}

/**
 * Keeps a model and its persisted document in step: the model is hydrated whenever the
 * document is (re)placed (first load, cleared), and every later change is saved. A blocked
 * document writes nothing until the user accepts what was restored, then writes the latest
 * change, so unresolved load issues lose nothing and neither do edits made meanwhile.
 * Changes before the first load would be replaced by it; the app renders only after it.
 */
export function bindDocument<TValue>(
  document: PersistedDocument<TValue>,
  target: DocumentTarget<TValue>,
  initial: () => TValue
): () => void {
  let generation = -1
  let hydrated: TValue | null = null
  const sync = () => {
    const state = document.state.state
    if (state.phase === "loading" || state.generation === generation) return
    generation = state.generation
    hydrated = state.value ?? initial()
    target.hydrate(hydrated)
  }
  sync()
  const documentSubscription = document.state.subscribe(sync)
  // A TanStack Store subscriber also reruns when the atoms it reads change, and saving reads
  // the document's and its debouncer's state: the target then notifies again with an
  // unchanged value. Only a new value is a change, or one edit would be saved forever.
  let latest = target.state
  const stopTarget = target.subscribe((value) => {
    if (value === latest) return
    latest = value
    // The hydrated value is what is stored already; only later changes are written.
    if (generation >= 0 && value !== hydrated) document.save(value)
  })
  return () => {
    documentSubscription.unsubscribe()
    stopTarget()
  }
}
