/**
 * The firmware's own routines as the simulator runs them: ATCHandler fills a script queue and
 * its main loop echoes each line to every connection before running it, so its replies (probe
 * contacts, the G32 report and height map) reach the host even from a played file. Values are
 * those of a Z1 Pro configuration and the replies follow Makera Studio's logs of one.
 */

type Xyz = [number, number, number]

/** One script line: echoed, then what running it prints. */
export type Step = {
  /** The script line as the firmware echoes it; null for output without one. */
  readonly echo: string | null
  /** Printed after the echo, "ok" included; evaluated when the step runs. */
  readonly output: (machine: AutomationMachine) => string[]
  readonly ms: number
  /** Holds the queue until the tool change is confirmed (M490.1). */
  readonly waitsForTool?: number
}

/** What the scripts read and change on the simulated machine. */
export type AutomationMachine = {
  mpos: Xyz
  offset: Xyz
  tool: number
}

const CLEARANCE_Z = -3
const SAFE_Z = -20
const TOOLRACK_Z = -108
const FAST = 500
const SLOW = 100
const RETRACT = 1
/** The stock top on the bed, and the tool sensor's contact for a tool of that number. */
const SURFACE_Z = -82.35
const sensorZ = (tool: number) => (tool === 0 ? -76.5 : -84.47 + tool * 0.01)

const f3 = (value: number) => value.toFixed(3)
const f4 = (value: number) => value.toFixed(4)

/** A smooth, tilted surface: height above the grid's first point, in mm. */
export const surfaceHeight = (x: number, y: number) =>
  0.02 * Math.sin(x / 13) - 0.015 * Math.cos(y / 9) + 0.015 + 0.0025 * y

const say = (echo: string, ms: number, then: string[] = []): Step => ({
  echo,
  output: () => [...then, "ok"],
  ms,
})

/** A straight probe move down to a contact at `z`, reported as the firmware's [PRB] line. */
function touch(echo: string, ms: number, z: () => number): Step {
  return {
    echo,
    ms,
    output: (machine) => {
      machine.mpos[2] = z()
      const [x, y] = machine.mpos
      return [`[PRB:${f3(x)},${f3(y)},${f3(machine.mpos[2])}:1]`, "ok"]
    },
  }
}

type Target = { x?: number; y?: number; z?: number }

function move(echo: string, ms: number, target: Target, work: boolean): Step {
  return {
    echo,
    ms,
    output: (machine: AutomationMachine) => {
      for (const [index, value] of [target.x, target.y, target.z].entries())
        if (value !== undefined)
          machine.mpos[index] = value + (work ? machine.offset[index] : 0)
      return ["ok"]
    },
  }
}

const rise = (by: number, ms: number): Step => ({
  echo: `G91 G0 Z${f3(by)}`,
  ms,
  output: (machine) => {
    machine.mpos[2] += by
    return ["ok"]
  },
})

const setTool = (tool: number, ms: number): Step => ({
  echo: `M493.2 T${tool}`,
  ms,
  output: (machine) => {
    machine.tool = tool
    return ["ok"]
  },
})

/** fill_cali_scripts: the tool's length at the tool sensor, the probe's checked after. */
function calibrate(tool: number, sensor: [number, number], ms: number): Step[] {
  const probe = tool === 0
  return [
    ...(probe ? [say("M494.1", ms)] : []),
    say("M497.3", ms),
    move(`G53 G0 Z${f3(CLEARANCE_Z)}`, ms, { z: CLEARANCE_Z }, false),
    move(
      `G53 G0 X${f3(sensor[0])} Y${f3(sensor[1])}`,
      ms * 3,
      { x: sensor[0], y: sensor[1] },
      false
    ),
    touch(`G38.6 Z${f3(TOOLRACK_Z)} F${f3(FAST)}`, ms * 8, () => sensorZ(tool)),
    rise(RETRACT, ms),
    touch(`G38.6 Z${f3(-1 - RETRACT)} F${f3(SLOW)}`, ms * 3, () =>
      sensorZ(tool)
    ),
    say("M493.1", ms),
    move(`G53 G0 Z${f3(SAFE_Z)}`, ms, { z: SAFE_Z }, false),
    ...(probe ? [say("M492.3", ms * 4), say("M494.2", ms)] : []),
  ]
}

/**
 * A tool change by hand (fill_change_scripts, fill_cali_scripts): to the change position,
 * wait for the confirmation, no tool, measure the new one, then set it.
 */
export function changeTool(
  tool: number,
  sensor: [number, number],
  ms: number
): Step[] {
  const position: [number, number] = [sensor[0] - 0.2, sensor[1]]
  return [
    move(`G53 G0 Z${f3(CLEARANCE_Z)}`, ms, { z: CLEARANCE_Z }, false),
    move(
      `G53 G0 X${f3(position[0])} Y${f3(position[1])}`,
      ms * 3,
      { x: position[0], y: position[1] },
      false
    ),
    say("M497.2", ms),
    { ...say("M490.1", ms), waitsForTool: tool },
    setTool(-1, ms),
    ...calibrate(tool, sensor, ms),
    setTool(tool, ms),
    say(tool === 9999 ? "M494.1" : "M494.2", ms),
  ]
}

/** fill_zprobe_scripts: over X Y (work), fast and slow touches, work Z0 at the contact. */
export function probeZ(x: number, y: number, ms: number): Step[] {
  return [
    say("M497.5", ms),
    say("M494.1", ms),
    move(`G53 G0 Z${f3(CLEARANCE_Z)}`, ms, { z: CLEARANCE_Z }, false),
    move(`G90 G0 X${f3(x)} Y${f3(y)}`, ms * 3, { x, y }, true),
    touch(`G38.2 Z${f3(TOOLRACK_Z)} F${f3(FAST)}`, ms * 8, () => SURFACE_Z),
    rise(RETRACT, ms),
    touch(`G38.2 Z${f3(-1 - RETRACT)} F${f3(SLOW)}`, ms * 3, () => SURFACE_Z),
    {
      echo: "G10 L20 P0 Z0.000",
      ms,
      output: (machine) => {
        machine.offset[2] = machine.mpos[2]
        return ["ok"]
      },
    },
    rise(RETRACT, ms),
    say("M494.2", ms),
  ]
}

export type Grid = {
  width: number
  depth: number
  columns: number
  rows: number
  height: number
}

/** CartGridStrategy::print_bed_level: rows from the far edge down, then the X axis. */
export function heightTable(grid: Grid): string[] {
  const { width, depth, columns, rows } = grid
  const axis = (size: number, count: number) =>
    Array.from({ length: count }, (_, index) => (size * index) / (count - 1))
  const xs = axis(width, columns)
  const ys = axis(depth, rows)
  const first = surfaceHeight(0, 0)
  return [
    ...ys
      .map(
        (y) =>
          `${f4(y).padStart(10)}|${xs.map((x) => `${f4(surfaceHeight(x, y) - first).padStart(10)} `).join("")}`
      )
      .reverse(),
    "-----+-----".repeat(xs.length),
    xs.map((x) => `${f4(x).padStart(10)} `).join(""),
  ]
}

/**
 * fill_autolevel_scripts and CartGridStrategy's rectangular probe: over X Y (work), then G32 R1
 * reports its start, every point it probes (serpentine rows) and the height map.
 */
export function levelGrid(
  x: number,
  y: number,
  grid: Grid,
  ms: number
): Step[] {
  const { width, depth, columns, rows, height } = grid
  const first = surfaceHeight(0, 0)
  const points: Step[] = []
  let maxDeviation = 0
  let lowest = Infinity
  let highest = -Infinity
  for (let row = 0; row < rows; row++)
    for (let step = 0; step < columns; step++) {
      const column = row % 2 ? columns - step - 1 : step
      const dx = (width * column) / (columns - 1)
      const dy = (depth * row) / (rows - 1)
      const z = surfaceHeight(dx, dy) - first
      maxDeviation = Math.max(maxDeviation, Math.abs(z))
      lowest = Math.min(lowest, z)
      highest = Math.max(highest, z)
      points.push({
        echo: null,
        ms: ms * 4,
        output: (machine) => [
          `DEBUG: X${f3(machine.mpos[0] + dx)}, Y${f3(machine.mpos[1] + dy)}, Z${f3(z)}`,
        ],
      })
    }
  return [
    say("M497.6", ms),
    say("M494.0", ms),
    move(`G90 G0 X${f3(x)} Y${f3(y)}`, ms * 3, { x, y }, true),
    {
      echo: `G32R1X0Y0A${f3(width)}B${f3(depth)}I${columns}J${rows}H${f3(height)}`,
      ms: ms * 4,
      output: (machine) => [
        "Rectangular Grid Probe...",
        "Leveling start, offset by XY",
        `Probe start ht: ${f3(height)} mm, start MCS x,y: ${f3(machine.mpos[0])},${f3(machine.mpos[1])}, rectangular bed width,height in mm: ${f3(width)},${f3(depth)}, grid size: ${columns}x${rows}`,
        `probe at 0,0 is ${f3(0.01)} mm`,
      ],
    },
    ...points,
    {
      echo: null,
      ms,
      output: () => [
        ...heightTable(grid),
        `Max deviation from zero: ${f3(maxDeviation)}`,
        `Max deviation between highest and lowest: ${f3(highest - lowest)}`,
        "Probe completed.",
        "ok",
      ],
    },
  ]
}
