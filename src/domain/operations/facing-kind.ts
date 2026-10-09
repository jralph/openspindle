import { PLAIN_NC } from "../compile/nc-unit"
import { error, operationSubject } from "../diagnostics"
import { fail, ok } from "../primitives"
import type { OperationKind } from "./kinds"
import { facingNc, facingToolIssue } from "./facing"

export const facingKind: OperationKind<"facing"> = {
  kind: "facing",
  label: "Facing",
  verbatim: false,
  generated: true,
  phase: () => "machining",
  tools: ({ source }) => [source.tool],
  resolve: (operation, plate, { tools, kit }) => {
    const p = operation.source.params
    const number = operation.tools.find(
      (binding) => binding.local === operation.source.tool
    )?.plate
    const id = plate.tools.find((entry) => entry.number === number)?.toolId
    const tool = tools.find((candidate) => candidate.id === id)
    let issue = facingToolIssue(tool)
    if (!issue && tool?.diameter !== p.diameter)
      issue =
        "The cutter diameter changed. Reopen Facing and apply its current diameter."
    if (!issue && p.removal > (tool?.geometry.fluteLength ?? 0))
      issue = "Removal exceeds the cutter's known cutting length."
    if (
      !issue &&
      kit.spindleRange &&
      (p.rpm < kit.spindleRange.min || p.rpm > kit.spindleRange.max)
    )
      issue = `Spindle RPM must be ${kit.spindleRange.min}–${kit.spindleRange.max} for ${kit.name}.`
    const left = p.x - p.diameter / 2 - 1 + plate.setup.workOrigin[0]
    const right = p.x + p.width + p.diameter / 2 + 1 + plate.setup.workOrigin[0]
    const front = p.y + plate.setup.workOrigin[1]
    const back = front + p.depth
    if (
      !issue &&
      (left < kit.workAreaOrigin[0] ||
        right > kit.workAreaOrigin[0] + kit.workArea[0] ||
        front < kit.workAreaOrigin[1] ||
        back > kit.workAreaOrigin[1] + kit.workArea[1])
    )
      issue =
        "The raster's outside-X travel or Y travel exceeds the modeled work area. Reduce the rectangle or change its placement."
    const stock = plate.setup.stock
    if (
      !issue &&
      stock &&
      p.top - p.removal + plate.setup.workOrigin[2] < plate.setup.stockAnchor[2]
    )
      issue = "The requested cut goes below the modeled stock bottom."
    if (issue)
      return fail(
        error("facing-invalid", `${operation.name}: ${issue}`, {
          subject: operationSubject(operation.id),
          fix: { kind: "edit-operation", operationId: operation.id },
        })
      )
    return ok({
      nc: facingNc(p, operation.source.tool),
      policy: PLAIN_NC,
      reviewLines: [],
    })
  },
}
