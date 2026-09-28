import { useContext, useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { QueryKey } from "@tanstack/react-query"
import type {
  CompanionEmit,
  JsonValue,
  Operation,
  OperationDraft,
  OperationPatch,
  ToolChoiceRequest,
  ViewContext,
} from "@openspindle/plugin-core"
import type { CallOptions } from "@openspindle/rpc"
import { SessionContext, openSpindleKeys } from "./session.ts"
import type { PluginSession } from "./session.ts"

/** The plugin's session: its typed peer, identity, grants and current view context. */
export function useOpenSpindle(): PluginSession {
  const session = useContext(SessionContext)
  if (!session)
    throw new Error("OpenSpindle hooks only work inside a plugin view.")
  return session
}

export const useViewContext = (): ViewContext => useOpenSpindle().context

type Revisioned = { readonly revision: number }

/**
 * A query kept current by an app event. Pushed values replace the cache unless they are
 * older than what it holds, so a slow reply never overwrites a newer push.
 */
function useLiveQuery<T extends Revisioned>(options: {
  queryKey: QueryKey
  load: () => Promise<T>
  subscribe: (onData: (data: T) => void) => () => void
  enabled: boolean
}) {
  const client = useQueryClient()
  const { queryKey, subscribe, enabled } = options
  const latest = useRef(subscribe)
  useEffect(() => {
    latest.current = subscribe
  })
  useEffect(() => {
    if (!enabled) return
    return latest.current((next) =>
      client.setQueryData<T>(queryKey, (current) =>
        current && current.revision > next.revision ? current : next
      )
    )
  }, [client, queryKey, enabled])
  return useQuery({
    queryKey,
    queryFn: options.load,
    enabled,
    staleTime: Infinity,
  })
}

/** Plates, stock and selection (workspace:read), kept current. */
export function useWorkspace() {
  const { peer, plugin } = useOpenSpindle()
  return useLiveQuery({
    queryKey: openSpindleKeys.workspace,
    load: () => peer.call("workspace.read", undefined),
    subscribe: (onData) =>
      peer.subscribe("workspace.changed", undefined, onData),
    enabled: plugin.grants.includes("workspace:read"),
  })
}

/** Machine status, anchors and height-map state (machine:read), kept current. */
export function useMachineSnapshot() {
  const { peer, plugin } = useOpenSpindle()
  return useLiveQuery({
    queryKey: openSpindleKeys.machine,
    load: () => peer.call("machine.snapshot", undefined),
    subscribe: (onData) => peer.subscribe("machine.changed", undefined, onData),
    enabled: plugin.grants.includes("machine:read"),
  })
}

/** This plugin's own operations, on one plate or all of them. */
export function useOperations(plateId: string | null = null) {
  const { peer } = useOpenSpindle()
  return useQuery({
    queryKey: openSpindleKeys.operationList(plateId),
    queryFn: () =>
      peer.call("operations.list", plateId === null ? {} : { plateId }),
  })
}

/** What `useOperation().save` sends; `revision` defaults to the one last read. */
export type OperationChanges = Omit<OperationPatch, "id" | "revision"> & {
  /**
   * The revision these changes were made from, such as the one a long generation started
   * at, so a newer read cannot make the save overwrite edits it never saw.
   */
  readonly revision?: string
}

/**
 * One of this plugin's operations and a save that sends the revision it was read at (or
 * the one given). A concurrent change fails the save with CONFLICT and refetches it.
 */
export function useOperation(operationId: string | null) {
  const { peer } = useOpenSpindle()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: openSpindleKeys.operation(operationId ?? ""),
    queryFn: () =>
      peer.call("operations.get", { operationId: operationId ?? "" }),
    enabled: operationId !== null,
  })
  const save = useMutation({
    mutationFn: ({ revision, ...changes }: OperationChanges) => {
      const current = query.data
      if (!current) throw new Error("The operation has not loaded yet.")
      return peer.call("operations.save", {
        operation: {
          ...changes,
          id: current.id,
          revision: revision ?? current.revision,
        },
      })
    },
    onSuccess: (saved: Operation) => {
      client.setQueryData(openSpindleKeys.operation(saved.id), saved)
      void client.invalidateQueries({
        queryKey: openSpindleKeys.operationLists,
      })
    },
    onError: () => void query.refetch(),
  })
  return { ...query, operation: query.data, save }
}

/** Adds operations to a plate; `nc: null` creates them pending generation. */
export function useCreateOperations() {
  const { peer } = useOpenSpindle()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (request: { plateId: string; operations: OperationDraft[] }) =>
      peer.call("operations.create", request),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: openSpindleKeys.operations }),
  })
}

/** The tool library with cutting presets (tools:read). */
export function useTools() {
  const { peer, plugin } = useOpenSpindle()
  return useQuery({
    queryKey: openSpindleKeys.tools,
    queryFn: () => peer.call("tools.list", undefined),
    enabled: plugin.grants.includes("tools:read"),
  })
}

/** Opens the app's tool chooser (and preset step); resolves once the user decides. */
export function useChooseTool() {
  const { peer } = useOpenSpindle()
  return useMutation({
    mutationFn: (request: ToolChoiceRequest) =>
      peer.call("tools.choose", request),
  })
}

/**
 * This plugin's companion: its status (kept current by the app), one-time setup and
 * plugin-defined calls.
 */
export function useCompanion() {
  const { peer, plugin } = useOpenSpindle()
  const client = useQueryClient()
  const status = useQuery({
    queryKey: openSpindleKeys.companion,
    queryFn: () => peer.call("companion.status", undefined),
    enabled: plugin.companion,
  })
  useEffect(() => {
    if (!plugin.companion) return
    return peer.subscribe("companion.status", undefined, (next) =>
      client.setQueryData(openSpindleKeys.companion, next)
    )
  }, [peer, client, plugin.companion])
  const setup = useMutation({
    mutationFn: () => peer.call("companion.setup", undefined),
    onSettled: () =>
      client.invalidateQueries({ queryKey: openSpindleKeys.companion }),
  })
  const call = (
    method: string,
    params?: JsonValue,
    options?: CallOptions
  ): Promise<JsonValue> =>
    peer.call(
      "companion.call",
      params === undefined ? { method } : { method, params },
      options
    )
  return { status, setup, call }
}

/** Events the companion emits for this plugin's views. */
export function useCompanionEvents(listener: (event: CompanionEmit) => void) {
  const { peer, plugin } = useOpenSpindle()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => {
    if (!plugin.companion) return
    return peer.subscribe("companion.events", undefined, (event) =>
      latest.current(event)
    )
  }, [peer, plugin.companion])
}

/**
 * Closes this view. `select` shows one of this plugin's own operations, for example the
 * first one an importer created; the app ignores operations the plugin does not own.
 */
export function useCloseView() {
  const { peer } = useOpenSpindle()
  return async (options: { readonly select?: string } = {}) => {
    await peer.call(
      "view.close",
      options.select === undefined ? undefined : { select: options.select }
    )
  }
}
