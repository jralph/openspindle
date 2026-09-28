const NUMBER_FORMATS = {
  count: new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  }),
  millimeters: new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }),
}

/**
 * Plain, ungrouped decimals ("3.175"), or an em dash for an unknown value. Millimetres round
 * to three decimals, as the tool editor's fields do; other styles show what is given.
 */
export function formatToolNumber(
  value: number | null | undefined,
  style: keyof typeof NUMBER_FORMATS = "count"
): string {
  return value == null ? "—" : NUMBER_FORMATS[style].format(value)
}

/** 64ths of an inch as a reduced fraction: 24 → "3/8″", 80 → "1-1/4″". */
function inchFraction(sixtyFourths: number): string {
  const whole = Math.floor(sixtyFourths / 64)
  let numerator = sixtyFourths % 64
  let denominator = 64
  while (numerator && numerator % 2 === 0) {
    numerator /= 2
    denominator /= 2
  }
  const part = numerator ? `${numerator}/${denominator}` : ""
  return `${[whole || "", part].filter(Boolean).join("-")}″`
}

/** "6 mm", or with the inch size a shank is sold as: "6.35 mm (1/4″)". */
export function formatShankDiameter(millimeters: number): string {
  const metric = `${NUMBER_FORMATS.count.format(millimeters)} mm`
  const sixtyFourths = (millimeters / 25.4) * 64
  // Shanks are compared to the micrometre, a few thousandths of a 64th.
  if (Math.abs(sixtyFourths - Math.round(sixtyFourths)) > 0.005) return metric
  return `${metric} (${inchFraction(Math.round(sixtyFourths))})`
}
