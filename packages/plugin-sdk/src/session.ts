import {
  createContext,
  createElement,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import { QueryClient, useQueryClient } from "@tanstack/react-query"
import type {
  FrameBoot,
  PluginIdentity,
  PluginViewContract,
  ViewContext,
} from "@openspindle/plugin-core"
import type { Peer } from "@openspindle/rpc"

/** One mounted view: its typed connection to the app and what it was started with. */
export type PluginSession = {
  /** Calls the app; every method is checked against the plugin's grants. */
  readonly peer: Peer<PluginViewContract>
  readonly plugin: PluginIdentity
  readonly view: FrameBoot["view"]
  /** The latest context the app pushed (selection, theme, busy state). */
  readonly context: ViewContext
}

export const SessionContext = createContext<PluginSession | null>(null)

export const openSpindleKeys = {
  all: ["openspindle"] as const,
  workspace: ["openspindle", "workspace"] as const,
  operations: ["openspindle", "operations"] as const,
  operationLists: ["openspindle", "operations", "list"] as const,
  operationList: (plateId: string | null) =>
    ["openspindle", "operations", "list", plateId] as const,
  operation: (operationId: string) =>
    ["openspindle", "operations", "one", operationId] as const,
  tools: ["openspindle", "tools"] as const,
  machine: ["openspindle", "machine"] as const,
  companion: ["openspindle", "companion"] as const,
}

/** App calls are message-port IPC: never paused as "offline", never retried blindly. */
export function createPluginQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", retry: false },
      mutations: { networkMode: "always", retry: false },
    },
  })
}

/**
 * Provided by the frame runtime around every view. Keeps the view context current and
 * refreshes cached operations when the app reports changes.
 */
export function PluginSessionProvider({
  peer,
  boot,
  children,
}: {
  peer: Peer<PluginViewContract>
  boot: FrameBoot
  children: ReactNode
}) {
  const [context, setContext] = useState(boot.context)
  const client = useQueryClient()
  const tracksOperations = boot.plugin.grants.includes("operations:write")

  useEffect(() => peer.subscribe("view.context", undefined, setContext), [peer])
  useEffect(() => {
    if (!tracksOperations) return
    return peer.subscribe("operations.changed", undefined, () => {
      void client.invalidateQueries({ queryKey: openSpindleKeys.operations })
    })
  }, [peer, client, tracksOperations])

  const session = useMemo<PluginSession>(
    () => ({ peer, plugin: boot.plugin, view: boot.view, context }),
    [peer, boot.plugin, boot.view, context]
  )
  return createElement(SessionContext.Provider, { value: session }, children)
}
