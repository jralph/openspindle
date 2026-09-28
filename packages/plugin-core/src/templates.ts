import { z } from "zod"
import { isOperationPhase } from "./operation-phase.ts"
import type { OperationPhase } from "./operation-phase.ts"
import { fail } from "./errors.ts"
import { PATH_EXTENSIONS, packagePathSchema } from "./paths.ts"
import {
  finiteSchema,
  hasProgramControlCharacter,
  identifierSchema,
  isUnique,
  listSchema,
  pluginTextBytes,
  strictSchema,
  textSchema,
  unionError,
} from "./text.ts"

/**
 * Declarative gcode-template programs: `{{parameterId}}` substitution of validated
 * numbers and booleans, nothing else. Templates never contain expressions or code.
 */
export const PROCESS_PLUGIN_LIMITS = {
  manifestBytes: 64 * 1024,
  sourceBytes: 256 * 1024,
  totalSourceBytes: 1024 * 1024,
  programs: 16,
  parameters: 20,
} as const

const PLACEHOLDER = /\{\{([a-z][a-zA-Z0-9_]*)\}\}/g

const ParameterIdSchema = textSchema("Parameter ID", 48)
  .refine(
    (id) => /^[a-z][a-zA-Z0-9_]*$/.test(id),
    "Parameter ID must start with a lowercase letter and contain letters, digits, or underscores."
  )
  // Names such as valueOf or toString would read inherited values from plain objects.
  .refine(
    (id) => !(id in Object.prototype) && id !== "prototype",
    "Parameter ID must not be a reserved JavaScript property name."
  )

const parameterBase = {
  id: ParameterIdSchema,
  label: textSchema("Parameter label", 100),
  description: textSchema("Parameter description").optional(),
}

export const BooleanParameterSchema = strictSchema(
  "Parameter",
  {
    ...parameterBase,
    type: z.literal("boolean"),
    default: z.boolean({
      error:
        "Boolean parameters require a boolean default and no numeric limits.",
    }),
  },
  "Boolean parameters require a boolean default and no numeric limits."
)

const NumberParameterShape = strictSchema("Parameter", {
  ...parameterBase,
  type: z.literal("number"),
  default: finiteSchema("Default"),
  min: finiteSchema("Minimum"),
  max: finiteSchema("Maximum"),
  step: finiteSchema("Step"),
  unit: textSchema("Unit", 24).optional(),
  axis: z
    .enum(["X", "Y", "Z"], {
      error: "Numeric parameter axis must be X, Y, or Z.",
    })
    .optional(),
})

export const NumberParameterSchema = NumberParameterShape.superRefine(
  (parameter, context) => {
    if (
      parameter.min > parameter.max ||
      parameter.step <= 0 ||
      parameter.step < 0.000001
    ) {
      context.addIssue({
        code: "custom",
        message: "Numeric parameter limits or step are invalid.",
      })
      return
    }
    const error = parameterValueError(parameter, parameter.default)
    if (error) context.addIssue({ code: "custom", message: error })
  }
)

export const ProcessParameterSchema = z.discriminatedUnion(
  "type",
  [NumberParameterSchema, BooleanParameterSchema],
  {
    error: unionError(
      "Parameter",
      "Only number and boolean parameters are supported."
    ),
  }
)

export type NumberProcessParameter = z.infer<typeof NumberParameterSchema>
export type BooleanProcessParameter = z.infer<typeof BooleanParameterSchema>
export type ProcessParameter = z.infer<typeof ProcessParameterSchema>
export type ProcessParameterValues = Record<string, number | boolean>

export const TemplatePathSchema = packagePathSchema(
  "Program file",
  PATH_EXTENSIONS.template,
  "Program files must be relative NC paths without traversal or URL characters."
)

export const ProcessProgramSchema = strictSchema("Program", {
  id: identifierSchema("Program ID"),
  name: textSchema("Program name", 120),
  description: textSchema("Program description"),
  kind: z.literal("gcode-template", {
    error: "Only declarative gcode-template programs are supported.",
  }),
  phase: z
    .custom<OperationPhase>(
      isOperationPhase,
      "Program phase must be setup, machining, or finish."
    )
    .optional(),
  file: TemplatePathSchema,
  parameters: listSchema(
    ProcessParameterSchema,
    "Parameters",
    PROCESS_PLUGIN_LIMITS.parameters
  ).refine(
    (parameters) => isUnique(parameters.map((parameter) => parameter.id)),
    "Parameter IDs must be unique."
  ),
  requirements: listSchema(textSchema("Requirements"), "Requirements", 20),
  models: listSchema(textSchema("Models"), "Models", 20),
})
export type ProcessProgram = z.infer<typeof ProcessProgramSchema>

export const ProcessProgramsSchema = listSchema(
  ProcessProgramSchema,
  "Programs",
  PROCESS_PLUGIN_LIMITS.programs
).refine(
  (programs) => isUnique(programs.map((program) => program.id)),
  "Program IDs must be unique."
)

/** Why a value is not acceptable for a parameter, or null. */
export function parameterValueError(
  parameter: ProcessParameter,
  value: unknown
): string | null {
  if (parameter.type === "boolean")
    return typeof value === "boolean"
      ? null
      : `${parameter.label} must be a boolean.`
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e9
  )
    return `${parameter.label} must be a finite number between -1000000000 and 1000000000.`
  if (value < parameter.min || value > parameter.max)
    return `${parameter.label} must be between ${parameter.min} and ${parameter.max}.`
  const steps = (value - parameter.min) / parameter.step
  if (
    Math.abs(steps - Math.round(steps)) >
    Math.max(1e-7, Math.abs(steps) * Number.EPSILON * 4)
  )
    return `${parameter.label} must follow a step of ${parameter.step}.`
  return null
}

export function validateParameterValue(
  parameter: ProcessParameter,
  value: unknown
): number | boolean {
  const error = parameterValueError(parameter, value)
  if (error) fail(error)
  return value as number | boolean
}

/** Checks a template's text against its program's declared parameters. */
export function validateTemplate(
  source: unknown,
  program: ProcessProgram
): string {
  if (
    typeof source !== "string" ||
    !source.trim() ||
    pluginTextBytes(source) > PROCESS_PLUGIN_LIMITS.sourceBytes
  )
    fail(`Program ${program.name} must contain source text of at most 256 KB.`)
  if (hasProgramControlCharacter(source))
    fail("Program source contains a control character.")
  const ids = new Set(program.parameters.map((item) => item.id))
  const seen = new Set<string>()
  const remainder = source.replace(PLACEHOLDER, (_, id: string) => {
    if (!ids.has(id)) fail(`Undeclared template parameter: ${id}.`)
    seen.add(id)
    return ""
  })
  if (remainder.includes("{{") || remainder.includes("}}"))
    fail(
      "Templates allow only {{parameterId}} placeholders, without expressions."
    )
  if ([...ids].some((id) => !seen.has(id)))
    fail("Every declared parameter must be used in its program template.")
  return source
}

/** Expands exponent notation without rounding values or introducing expression syntax. */
export function decimalToken(value: number): string {
  const token = String(value)
  if (!/[eE]/.test(token)) return token
  const [mantissa, exponent] = token.toLowerCase().split("e")
  const negative = mantissa.startsWith("-")
  const digits = mantissa.replace(/[.-]/g, "")
  const point =
    mantissa.replace("-", "").split(".")[0].length + Number(exponent)
  let expanded: string
  if (point <= 0) expanded = `0.${"0".repeat(-point)}${digits}`
  else if (point >= digits.length)
    expanded = `${digits}${"0".repeat(point - digits.length)}`
  else expanded = `${digits.slice(0, point)}.${digits.slice(point)}`
  return `${negative ? "-" : ""}${expanded}`
}

export function substitutionToken(value: number | boolean): string {
  if (typeof value === "boolean") return value ? "1" : "0"
  return decimalToken(value)
}

/** Renders one program: every value is validated, defaults fill the rest. */
export function renderProgram(
  program: ProcessProgram,
  template: string,
  values: ProcessParameterValues = {}
): { name: string; source: string } {
  validateTemplate(template, program)
  if (
    Object.keys(values).some(
      (id) => !program.parameters.some((item) => item.id === id)
    )
  )
    fail("An unknown parameter value was supplied.")
  const substitutions = new Map<string, string>()
  for (const parameter of program.parameters) {
    const value = validateParameterValue(
      parameter,
      Object.hasOwn(values, parameter.id)
        ? values[parameter.id]
        : parameter.default
    )
    substitutions.set(parameter.id, substitutionToken(value))
  }
  const source = template.replace(
    PLACEHOLDER,
    (_, id: string) =>
      substitutions.get(id) ?? fail(`Undeclared template parameter: ${id}.`)
  )
  if (pluginTextBytes(source) > PROCESS_PLUGIN_LIMITS.sourceBytes)
    fail("Generated program exceeds 256 KB.")
  return { name: `${program.id}.nc`, source }
}
