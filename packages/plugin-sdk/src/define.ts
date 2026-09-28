import type { ComponentType } from "react"

/** A view reads everything it needs through the SDK hooks, so it takes no props. */
export type PluginView = ComponentType

export type PluginViews = Readonly<Record<string, PluginView>>

export type PluginDefinition<TViews extends PluginViews = PluginViews> = {
  readonly kind: "openspindle/plugin"
  /** Keyed by the view IDs declared in the manifest's `ui.views`. */
  readonly views: TViews
}

/** The default export of a plugin's view bundle. */
export function definePlugin<const TViews extends PluginViews>(definition: {
  readonly views: TViews
}): PluginDefinition<TViews> {
  return { kind: "openspindle/plugin", views: definition.views }
}

/** Checks a bundle's default export; memo and forwardRef views are objects. */
export function isPluginDefinition(value: unknown): value is PluginDefinition {
  if (!value || typeof value !== "object") return false
  const candidate = value as { kind?: unknown; views?: unknown }
  return (
    candidate.kind === "openspindle/plugin" &&
    !!candidate.views &&
    typeof candidate.views === "object" &&
    Object.values(candidate.views).every(
      (view) =>
        typeof view === "function" || (typeof view === "object" && !!view)
    )
  )
}
