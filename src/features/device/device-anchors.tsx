import { CircleAlert, Waypoints } from "lucide-react"
import type { ReactNode } from "react"
import { bedAnchors } from "@/domain/anchors/stored-anchors"
import type {
  AnchorXY,
  StoredAnchorSetup,
} from "@/domain/anchors/stored-anchors"
import { CoordinateInput } from "@/components/workspace/coordinate-input"
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"

/** Bed coordinates show three decimals, a micrometre, as every millimetre does. */
const coordinateFormat = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

/**
 * Where the first anchor sits on the bed model. It registers the machine's anchor coordinates
 * to the bed for display only; it never writes the firmware configuration.
 */
function AnchorAlignment({
  name,
  position,
  onAlign,
}: {
  /** The first anchor's name. */
  name: string
  position: AnchorXY
  onAlign: (position: AnchorXY) => void
}) {
  return (
    <FieldSet>
      <FieldLegend>{name} on bed</FieldLegend>
      <FieldDescription>
        Aligns the anchors with the bed for the viewer; the device is not
        changed.
      </FieldDescription>
      <FieldGroup className="grid grid-cols-2 gap-3">
        {(["X", "Y"] as const).map((axis, index) => (
          <CoordinateInput
            key={axis}
            axis={axis}
            unit="mm"
            label={`${name} bed ${axis}`}
            value={position[index]}
            onCommit={(value) => {
              const next: AnchorXY = [...position]
              next[index] = value
              onAlign(next)
            }}
          />
        ))}
      </FieldGroup>
    </FieldSet>
  )
}

export function DeviceAnchors({
  setup,
  loading,
  error,
  onAlign,
  action,
}: {
  setup?: StoredAnchorSetup
  loading: boolean
  error?: string
  /** Moves the first anchor on the bed; absent when the alignment cannot be edited. */
  onAlign?: (position: AnchorXY) => void
  /** Shown in the header, such as reading the anchors again. */
  action?: ReactNode
}) {
  if (!setup && !loading && !error && !action) return null
  let sourceLabel = setup ? "Defaults" : "Not read yet"
  if (setup?.source === "firmware-config") sourceLabel = "Device configuration"
  if (loading) sourceLabel = "Reading…"
  return (
    <Card
      size="sm"
      role="region"
      className="min-w-0"
      aria-label="Stored anchors"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waypoints size={16} />
          Anchors
        </CardTitle>
        <CardDescription>{sourceLabel}</CardDescription>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {setup && (
        <CardContent className="min-w-0">
          <Table className="table-fixed font-numeric [&_td]:text-right [&_th:not(:first-child)]:text-right">
            <colgroup>
              <col />
              <col className="w-20" />
              <col className="w-20" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Anchor</TableHead>
                <TableHead>Bed X · mm</TableHead>
                <TableHead>Bed Y · mm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bedAnchors(setup).map((anchor, index) => (
                <TableRow
                  key={anchor.id}
                  title={`Machine X ${setup.anchors[index].machinePosition[0].toFixed(3)} mm · Y ${setup.anchors[index].machinePosition[1].toFixed(3)} mm`}
                >
                  <TableHead scope="row">
                    <span
                      className="mr-2 inline-block size-1.5 rounded-full bg-orange-500"
                      aria-hidden="true"
                    />
                    {anchor.name}
                  </TableHead>
                  <TableCell>
                    {coordinateFormat.format(anchor.position[0])}
                  </TableCell>
                  <TableCell>
                    {coordinateFormat.format(anchor.position[1])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {onAlign && (
            <AnchorAlignment
              name={setup.anchors[0].name}
              position={setup.anchor1BedPosition}
              onAlign={onAlign}
            />
          )}
        </CardContent>
      )}
      {error && (
        <CardContent>
          <FieldError className="flex items-start gap-2" title={error}>
            <CircleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              {error.startsWith("Timed out reading firmware")
                ? "Reading device anchors timed out."
                : error}
            </span>
          </FieldError>
        </CardContent>
      )}
    </Card>
  )
}
