import { useEffect } from "react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PluginHost } from "./host"
import { useHost } from "./host-context"

export const pluginKeys = {
  all: ["plugins"] as const,
  installed: ["plugins", "installed"] as const,
  /** A view bundle is keyed by the package digest, so an update loads the new one. */
  bundle: (pluginId: string, digest: string) =>
    ["plugins", "bundle", pluginId, digest] as const,
  companionLogs: (pluginId: string) =>
    ["plugins", "companion-logs", pluginId] as const,
}

/** The installed plugins as the host reports them; kept current by `usePluginSync`. */
export const installedPluginsQuery = (plugins: PluginHost) =>
  queryOptions({
    queryKey: pluginKeys.installed,
    queryFn: () => plugins.list(),
    staleTime: Infinity,
  })

export function useInstalledPlugins() {
  return useQuery(installedPluginsQuery(useHost().plugins))
}

/** Mounted once: every change the host reports (installs, updates, companions) lands in the cache. */
export function usePluginSync() {
  const plugins = useHost().plugins
  const client = useQueryClient()
  useEffect(
    () =>
      plugins.subscribe((list) =>
        client.setQueryData(pluginKeys.installed, list)
      ),
    [plugins, client]
  )
}
