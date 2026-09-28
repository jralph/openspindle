import type { PackageOrigin } from "@openspindle/plugin-core"
import { operationPluginId } from "@/domain/operations/operation"
import type { Plate } from "@/domain/plate/plate"
import { PluginReferenceSchema } from "@/domain/workspace/plugin-reference"
import type { PluginReference } from "@/domain/workspace/plugin-reference"

/** What a reference needs of an installed plugin; the host's plugin summaries fit. */
export type InstalledPluginInfo = {
  readonly id: string
  readonly version: string
  readonly manifest: { readonly name: string }
  readonly source: PackageOrigin
}

/** An installed plugin as a reference; null when its provenance cannot be referred to. */
export function pluginReference(
  plugin: InstalledPluginInfo
): PluginReference | null {
  const { source } = plugin
  const parsed = PluginReferenceSchema.safeParse({
    id: plugin.id,
    name: plugin.manifest.name,
    version: plugin.version,
    source:
      source.kind === "github"
        ? {
            kind: "github",
            repository: source.repository,
            commit: source.commit,
          }
        : { kind: "folder" },
  })
  return parsed.success ? parsed.data : null
}

/** Ids of the plugins the plates' operations use, in first-use order. */
export function usedPluginIds(plates: readonly Plate[]): string[] {
  const ids = new Set<string>()
  for (const plate of plates)
    for (const operation of plate.operations) {
      const pluginId = operationPluginId(operation)
      if (pluginId !== null) ids.add(pluginId)
    }
  return [...ids]
}

/**
 * References for the plugins the plates' operations use, in first-use order. Installed
 * plugins describe themselves; `retained` references (those of the opened project) keep
 * describing plugins that are not installed, so saving never forgets where they came from.
 * A plugin that is neither installed nor retained gets no reference.
 */
export function referencedPlugins(
  plates: readonly Plate[],
  installed: readonly InstalledPluginInfo[],
  retained: readonly PluginReference[] = []
): PluginReference[] {
  const known = new Map(retained.map((reference) => [reference.id, reference]))
  for (const plugin of installed) {
    const reference = pluginReference(plugin)
    if (reference) known.set(reference.id, reference)
  }
  return usedPluginIds(plates).flatMap((id) => {
    const reference = known.get(id)
    return reference ? [reference] : []
  })
}

/** The references whose plugin is not installed. */
export function missingPlugins(
  references: readonly PluginReference[],
  installed: readonly { readonly id: string }[]
): PluginReference[] {
  const ids = new Set(installed.map((plugin) => plugin.id))
  return references.filter((reference) => !ids.has(reference.id))
}
