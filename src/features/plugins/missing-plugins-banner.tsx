import { Puzzle } from "lucide-react"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { missingPluginIds } from "@/app/workspace/diagnostics"
import type { Plate } from "@/domain/plate/plate"
import { openDialog } from "@/features/shell/dialogs"
import { useInstalledPlugins } from "@/platform/plugins"

/** Offers the plugin manager when a plate's operations come from plugins that are not installed. */
export function MissingPluginsBanner({ plate }: { plate: Plate }) {
  const plugins = useInstalledPlugins().data
  if (!plugins) return null
  const missing = missingPluginIds([plate], plugins)
  if (!missing.length) return null
  const one = missing.length === 1
  return (
    <div className="shrink-0 p-3">
      <Alert>
        <Puzzle />
        <AlertTitle>
          {one ? "A plugin is not installed" : "Plugins are not installed"}
        </AlertTitle>
        <AlertDescription>
          Operations on this plate come from {missing.join(", ")}. They keep
          their NC; install {one ? "the plugin" : "the plugins"} to edit them.
        </AlertDescription>
        <AlertAction>
          <Button
            variant="outline"
            size="xs"
            onClick={() => openDialog({ kind: "plugins" })}
          >
            Install
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}
