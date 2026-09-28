import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { FieldDescription, FieldGroup, FieldSet } from "@/components/ui/field"
import { NameField } from "@/components/name-field"
import { PointFields } from "@/components/workspace/coordinate-input"
import { newId, normalizeText, ok, fail } from "@/domain/primitives"
import { fixtureModelMountPoints } from "@/domain/fixtures/catalog"
import type { FixtureModel } from "@/domain/fixtures/definitions"
import { MOUNT_POINT_LIMIT } from "@/domain/fixtures/mount-points"
import type { MountPoint } from "@/domain/fixtures/mount-points"

function sourceNote(model: FixtureModel) {
  if (model.mountPoints) return "Defined for this fixture."
  if (model.source.kind === "bundled")
    return "Measured from the bundled model: its holes and corners."
  return "The corners and centres of the model's box, until you define its own."
}

/**
 * The points a fixture mounts and lines up by, in its frame: moves in the 3D view snap to
 * them, and to the points of everything else on the bed.
 */
export function MountPointsField({
  model,
  onChange,
}: {
  model: FixtureModel
  onChange: (model: FixtureModel) => void
}) {
  const points = fixtureModelMountPoints(model)
  const save = (next: MountPoint[]) => onChange({ ...model, mountPoints: next })
  const change = (id: string, patch: Partial<MountPoint>) =>
    save(
      points.map((point) => (point.id === id ? { ...point, ...patch } : point))
    )
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button variant="ghost" className="w-full justify-start px-0" />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left">Mount points</span>
        <Badge variant="secondary" className="font-numeric">
          {points.length}
        </Badge>
        <ChevronDown data-icon="inline-end" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <FieldGroup className="gap-4">
          <FieldDescription>
            Millimetres from the fixture's position, before it is rotated.{" "}
            {sourceNote(model)}
          </FieldDescription>
          {points.map((point) => (
            <FieldSet key={point.id} aria-label={`Mount point ${point.name}`}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <NameField
                    name={point.name}
                    label="Mount point name"
                    hideLabel
                    onRename={(typed) => {
                      const next = normalizeText(typed)
                      if (!next) return fail("Enter a name.")
                      change(point.id, { name: next })
                      return ok(next)
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove mount point ${point.name}`}
                  onClick={() =>
                    save(points.filter(({ id }) => id !== point.id))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <PointFields
                label={point.name}
                value={point.position}
                onChange={(position) => change(point.id, { position })}
              />
            </FieldSet>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={points.length >= MOUNT_POINT_LIMIT}
              onClick={() =>
                save([
                  ...points,
                  {
                    id: newId(),
                    name: `Point ${points.length + 1}`,
                    position: [0, 0, 0],
                  },
                ])
              }
            >
              <Plus data-icon="inline-start" />
              Add point
            </Button>
            {model.mountPoints && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const { mountPoints: _defined, ...rest } = model
                  onChange(rest)
                }}
              >
                <RotateCcw data-icon="inline-start" />
                Use the model's points
              </Button>
            )}
          </div>
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  )
}
