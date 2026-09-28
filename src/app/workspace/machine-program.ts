import { kitForPlate } from "@/domain/fixtures/catalog"
import type { FixtureKit } from "@/domain/fixtures/fixture-kit"
import type { FirmwareSetup } from "@/domain/firmware/firmware-model"
import type { Plate } from "@/domain/plate/plate"
import { fixtureSupportHeight } from "@/domain/fixtures/definitions"
import { parseGCode } from "@/domain/nc/gcode"
import type { GCodeProgram } from "@/domain/nc/gcode"

/** Where the plate is on its machine, as its firmware's moves are placed. */
function firmwareSetup(plate: Plate, kit: FixtureKit): FirmwareSetup {
  const { anchors, deviceId, stock, stockAnchor, workOrigin, fixtures } =
    plate.setup
  return {
    anchors: anchors ?? kit.factoryAnchors(deviceId),
    workOrigin,
    stock: stock
      ? {
          min: stockAnchor,
          max: [
            stockAnchor[0] + stock.width,
            stockAnchor[1] + stock.depth,
            stockAnchor[2] + stock.height,
          ],
        }
      : null,
    supportZ: fixtureSupportHeight(fixtures),
  }
}

/** Each program's latest machine program, with the machine and setup it was placed by. */
const parsed = new WeakMap<
  GCodeProgram,
  { readonly setup: string; readonly program: GCodeProgram }
>()

/**
 * A plate's program as its machine moves through it: with its firmware's own moves (tool
 * changes, probing, moves in machine coordinates), placed by the plate's setup. Parsed again
 * only when the program or that setup changes; the program itself when the preview does not
 * follow the machine's firmware.
 */
export function machineProgram(
  plate: Plate,
  program: GCodeProgram
): GCodeProgram {
  const kit = kitForPlate(plate)
  const { firmware } = kit
  if (!firmware) return program
  const setup = firmwareSetup(plate, kit)
  const key = `${kit.name}\n${JSON.stringify(setup)}`
  const saved = parsed.get(program)
  if (saved?.setup === key) return saved.program
  const result = parseGCode(
    program.source,
    program.name,
    firmware.preview(setup)
  )
  parsed.set(program, { setup: key, program: result })
  return result
}
