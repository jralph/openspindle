import { useId, useRef, useState } from "react"
import type { PluginIdentity } from "@openspindle/plugin-core"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { ToolCard } from "@/components/workspace/tool-card"
import { useWorkspaceStore } from "@/app/workspace/workspace-context"
import type { Tool } from "@/domain/tools/tool"
import { ToolLibraryDialog } from "@/features/tool-library"
import { OptionSelect } from "@/components/option-select"
import { useWorkspaceLibrary } from "@/features/tool-library/workspace-tool-library"
import { usePluginRequest } from "./plugin-requests"
import type { ConfirmRequest, ToolRequest } from "./plugin-requests"

/** No preset chosen yet; library presets always have an ID. */
const NO_PRESET = ""

/** The preset the plugin suggests for the chosen tool, when that tool has it. */
function suggestedPreset(
  tool: Tool,
  step: NonNullable<ToolRequest["request"]["presetStep"]>
): string {
  const suggested = Object.hasOwn(step.defaultPresetIds, tool.id)
    ? step.defaultPresetIds[tool.id]
    : step.defaultPresetId
  return tool.presets.find((preset) => preset.id === suggested)?.id ?? NO_PRESET
}

/** After a tool, whether to apply one of its cutting presets; closing cancels the choice. */
function PresetStep({
  plugin,
  tool,
  suggested,
  onChoose,
  onCancel,
}: {
  plugin: PluginIdentity
  tool: Tool
  suggested: string
  onChoose: (presetId: string | null) => void
  onCancel: () => void
}) {
  const id = useId()
  const [presetId, setPresetId] = useState(suggested)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply a cutting preset?</DialogTitle>
          <DialogDescription>
            {plugin.name} can take the preset's spindle speed, feeds and depths,
            or keep the operation's current cutting values.
          </DialogDescription>
        </DialogHeader>
        <ToolCard tool={tool} />
        <Field>
          <FieldLabel htmlFor={id}>Cutting preset</FieldLabel>
          <OptionSelect
            id={id}
            className="w-full"
            options={[
              { value: NO_PRESET, label: "Choose a preset…" },
              ...tool.presets.map((preset) => ({
                value: preset.id,
                label: preset.name,
              })),
            ]}
            value={presetId}
            onValueChange={setPresetId}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose(null)}>
            Keep current values
          </Button>
          <Button
            disabled={presetId === NO_PRESET}
            onClick={() => onChoose(presetId)}
          >
            Apply preset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The tool library in selection mode, opened on the plugin's recommended types but offering
 * every tool, then the preset step when the plugin asks for it.
 */
function ToolChoiceDialog({ request: asked }: { request: ToolRequest }) {
  const { plugin, request, settle } = asked
  const workspace = useWorkspaceStore()
  const library = useWorkspaceLibrary()
  const picked = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool | null>(null)
  if (tool && request.presetStep)
    return (
      <PresetStep
        plugin={plugin}
        tool={tool}
        suggested={suggestedPreset(tool, request.presetStep)}
        onChoose={(presetId) => settle({ toolId: tool.id, presetId })}
        onCancel={() => settle(null)}
      />
    )
  return (
    <ToolLibraryDialog
      title={request.title ?? "Choose a tool"}
      tools={library.tools}
      selectedId={request.selectedToolId ?? ""}
      selectionOnly
      recommendedKinds={request.recommendedKinds}
      onChange={library.onChange}
      // "Use tool" selects, then closes; closing without a selection cancels.
      onSelect={(toolId) => {
        picked.current = toolId
      }}
      onClose={() => {
        const chosen = workspace.state.tools.find(
          (item) => item.id === picked.current
        )
        if (!chosen) settle(null)
        else if (request.presetStep && chosen.presets.length) setTool(chosen)
        else settle({ toolId: chosen.id, presetId: null })
      }}
    />
  )
}

function ConfirmDialog({ request: asked }: { request: ConfirmRequest }) {
  const { plugin, request, settle } = asked
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) settle(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          {request.description && (
            <AlertDialogDescription>
              {request.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <FieldDescription>Asked by {plugin.name}.</FieldDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {request.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={request.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Dialogs the app shows for plugin views (tools.choose, ui.confirm), above any open
 * workspace dialog so an importer inside Add operation keeps its frame.
 */
export function PluginRequestHost() {
  const request = usePluginRequest()
  if (!request) return null
  if (request.kind === "tool")
    return <ToolChoiceDialog key={request.id} request={request} />
  return <ConfirmDialog key={request.id} request={request} />
}
