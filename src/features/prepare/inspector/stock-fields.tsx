import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { BoundedMeasurementInput } from "@/components/workspace/coordinate-input"
import { DIMENSION_AXES } from "@/components/workspace/measurement-input"
import { kitForSetup } from "@/domain/fixtures/catalog"
import type { PlateSetup } from "@/domain/plate/plate"
import { openDialog } from "@/features/shell/dialogs"
import { StockSwatch } from "../stock/stock-swatch"

/** The stock's size, each at most the machine's work area along its axis. */
const DIMENSIONS = [
  { key: "width", label: "Width", axis: 0 },
  { key: "depth", label: "Depth", axis: 1 },
  { key: "height", label: "Height", axis: 2 },
] as const

/** The plate's stock: which material block, and its size. */
export function StockFields({
  plateId,
  setup,
  disabled,
  onChange,
}: {
  plateId: string
  setup: PlateSetup
  disabled?: boolean
  onChange: (patch: Partial<PlateSetup>) => void
}) {
  const stock = setup.stock
  const { workArea } = kitForSetup(setup)
  return (
    <FieldSet aria-label="Stock">
      <FieldLegend className="w-full">
        <div className="flex items-center gap-3">
          <StockSwatch color={stock?.color} />
          <span className="min-w-0 flex-1 truncate">
            {stock?.name ?? "No stock"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Choose stock"
            title="Choose stock"
            disabled={disabled}
            onClick={() => openDialog({ kind: "stock", plateId })}
          >
            <Pencil />
          </Button>
          {stock && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove stock"
              title="Remove stock"
              disabled={disabled}
              onClick={() =>
                onChange({ stock: null, stockSource: "unspecified" })
              }
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </FieldLegend>
      {stock && (
        <FieldGroup>
          {DIMENSIONS.map(({ key, label, axis }) => (
            <Field key={key} orientation="horizontal">
              <FieldLabel htmlFor={`stock-${key}`} className="w-20 shrink-0">
                {label}
              </FieldLabel>
              <BoundedMeasurementInput
                id={`stock-${key}`}
                axis={DIMENSION_AXES[key]}
                unit="mm"
                label={`Stock ${key}`}
                min={0.01}
                max={workArea[axis]}
                disabled={disabled}
                value={stock[key]}
                onCommit={(value) =>
                  onChange({
                    stock: { ...stock, [key]: value },
                    stockSource: "assigned",
                  })
                }
              />
            </Field>
          ))}
        </FieldGroup>
      )}
    </FieldSet>
  )
}
