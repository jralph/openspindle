import type { ProbeCheckBinding } from "@/machine/contract"

const n = (value: number) => String(Number(value.toFixed(4)))

/** The host independently checks this exact sequence before executing its steps. */
export function boundedAnchorNc(
  binding: ProbeCheckBinding,
  gap: number,
  diameter: number
): string {
  const radius = Number((diameter / 2).toFixed(4))
  const depth = Math.max(2, radius + 0.5)
  const reach = 5 - radius + 0.1
  return [
    `;@OPENSPINDLE_PROBE_CHECK ${JSON.stringify(binding)}`,
    `;@OPENSPINDLE_ANCHOR_PLAN ${JSON.stringify({ gap, diameter })}`,
    "; Bounded Anchor 1: start at the checked near-surface pose, with the measured probe still fitted.",
    "; No tool change or automatic descent from clearance. Every contact is verified before continuing.",
    "M5",
    "G21 G90 G17 G94 G54",
    "M370",
    "M494.1",
    "M400",
    `G38.2 Z-${n(gap + 0.1)} F30`,
    "G10 L20 P0 Z0",
    "G91 G0 Z0.2",
    "M400",
    "G38.2 Z-0.4 F15",
    "G10 L20 P0 Z0",
    "G90 G0 Z5",
    "M400",
    "G91 G0 X10 Y10",
    "M400",
    `G90 G1 Z-${n(depth)} F30`,
    "M400",
    `G38.2 X-${n(reach)} F30`,
    "G91 G0 X0.2",
    "M400",
    "G38.2 X-0.4 F15",
    `G10 L20 P0 X${n(radius)}`,
    "G91 G0 X0.2",
    "G90 G0 X5",
    "M400",
    `G38.2 Y-${n(reach)} F30`,
    "G91 G0 Y0.2",
    "M400",
    "G38.2 Y-0.4 F15",
    `G10 L20 P0 Y${n(radius)}`,
    "G91 G0 Y0.2",
    "M400",
    "G90 G0 Z5",
    "M400",
    "M5",
    "M2",
  ].join("\n")
}

/** Separate explicit setup job: no contact search against the bracket. */
export function anchorPositioningNc([x, y]: readonly [number, number]): string {
  return [
    "; Install and measure the connected 3D probe, then position above the bracket.",
    "M5",
    "G21 G90 G17 G94",
    "M370",
    "M6 T9999",
    "M400",
    "G53 G0 Z-3",
    "M400",
    `G53 G0 X${n(x)} Y${n(y)}`,
    "M400",
    "M5",
    "M2",
  ].join("\n")
}
