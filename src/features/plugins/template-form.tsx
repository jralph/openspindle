import { useId, useMemo } from "react"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { parameterValueError } from "@openspindle/plugin-core"
import type {
  ProcessParameter,
  ProcessParameterValues,
  ProcessProgram,
} from "@openspindle/plugin-core"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { MeasurementInput } from "@/components/workspace/measurement-input"
import { templateDefaults } from "@/app/workspace/templates"

/** The same check plugin-core applies before rendering: range, magnitude and step together. */
function parameterSchema(parameter: ProcessParameter) {
  if (parameter.type === "boolean") return z.boolean()
  return z
    .number({ error: `${parameter.label} is required.` })
    .superRefine((value, context) => {
      const error = parameterValueError(parameter, value)
      if (error) context.addIssue({ code: "custom", message: error })
    })
}

/** The parameters a template program declares, as one validated form. */
export function TemplateForm({
  program,
  values,
  submitLabel,
  disabled,
  onSubmit,
}: {
  program: ProcessProgram
  /** Saved values; missing parameters start at their defaults. */
  values?: ProcessParameterValues
  submitLabel: string
  disabled?: boolean
  /** The form stays submitting until a returned promise settles. */
  onSubmit: (values: ProcessParameterValues) => void | Promise<unknown>
}) {
  const id = useId()
  const schema = useMemo(
    () =>
      z.object(
        Object.fromEntries(
          program.parameters.map((parameter) => [
            parameter.id,
            parameterSchema(parameter),
          ])
        )
      ),
    [program]
  )
  const form = useForm({
    defaultValues: { ...templateDefaults(program), ...values },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => onSubmit(value),
  })
  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {program.description && (
        <FieldDescription>{program.description}</FieldDescription>
      )}
      <FieldGroup className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {program.parameters.map((parameter) => (
          <form.Field key={parameter.id} name={parameter.id}>
            {(field) => {
              const fieldId = `${id}-${parameter.id}`
              const invalid = field.state.meta.errors.length > 0
              if (parameter.type === "boolean")
                return (
                  <Field orientation="horizontal" data-invalid={invalid}>
                    <Checkbox
                      id={fieldId}
                      checked={field.state.value === true}
                      disabled={disabled}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                    />
                    <FieldLabel htmlFor={fieldId}>{parameter.label}</FieldLabel>
                    {parameter.description && (
                      <FieldDescription>
                        {parameter.description}
                      </FieldDescription>
                    )}
                  </Field>
                )
              const value = field.state.value
              return (
                <Field data-invalid={invalid} className="min-w-0">
                  <FieldLabel htmlFor={fieldId}>{parameter.label}</FieldLabel>
                  <MeasurementInput
                    id={fieldId}
                    axis={parameter.axis}
                    unit={parameter.unit}
                    type="number"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    disabled={disabled}
                    aria-invalid={invalid}
                    value={
                      typeof value === "number" && !Number.isNaN(value)
                        ? value
                        : ""
                    }
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.valueAsNumber)
                    }
                  />
                  {parameter.description && (
                    <FieldDescription>{parameter.description}</FieldDescription>
                  )}
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )
            }}
          </form.Field>
        ))}
      </FieldGroup>
      <form.Subscribe selector={(state) => state.canSubmit}>
        {(canSubmit) => (
          <Button
            type="submit"
            className="self-end"
            disabled={disabled || !canSubmit}
          >
            {submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
