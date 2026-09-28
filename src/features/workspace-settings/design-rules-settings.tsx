import { useId } from "react"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { OptionSelect } from "@/components/option-select"
import { MeasurementInput } from "@/components/workspace/measurement-input"
import {
  useWorkspace,
  useWorkspaceStore,
} from "@/app/workspace/workspace-context"
import {
  CHECK_RULES,
  CHECK_RULE_INFO,
  LIMIT_RULES,
  LIMIT_RULE_INFO,
  RuleSeveritySchema,
  defaultDesignRules,
  limitValueSchema,
} from "@/domain/design-rules/rules"
import type { DesignRuleId, RuleSeverity } from "@/domain/design-rules/rules"
import { visibleErrors } from "@/features/auto-level/auto-level-settings"

const SEVERITY_OPTIONS: ReadonlyArray<{ value: RuleSeverity; label: string }> =
  [
    { value: "error", label: "Error" },
    { value: "warning", label: "Warning" },
    { value: "ignore", label: "Ignore" },
  ]

/** How a broken rule is reported: as an error, as a warning, or not at all. */
function SeveritySelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: RuleSeverity
  onChange: (value: RuleSeverity) => void
}) {
  return (
    <OptionSelect
      id={id}
      aria-label={label}
      className="w-28 shrink-0"
      options={SEVERITY_OPTIONS}
      value={value}
      onValueChange={(next) => {
        const severity = RuleSeveritySchema.safeParse(next)
        if (severity.success) onChange(severity.data)
      }}
    />
  )
}

/**
 * The project's design rules: each rule's limit and how a broken one is reported. Changes apply
 * on Save; Reset to defaults only fills in the defaults.
 */
export function DesignRulesSettings({ onClose }: { onClose: () => void }) {
  const id = useId()
  const workspace = useWorkspaceStore()
  const rules = useWorkspace((state) => state.designRules)
  const form = useForm({
    defaultValues: rules,
    onSubmit: ({ value }) => {
      const result = workspace.dispatch({
        type: "designRules.set",
        rules: value,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onClose()
    },
  })
  const fieldId = (rule: DesignRuleId, part: string) => `${id}-${rule}-${part}`
  return (
    <form
      // The rules' schemas check the limits and say why; the browser's own check would stop Save
      // without a word.
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          {LIMIT_RULES.map((rule) => {
            const info = LIMIT_RULE_INFO[rule]
            return (
              <form.Field
                key={rule}
                name={`${rule}.value`}
                validators={{ onChange: limitValueSchema(rule) }}
              >
                {(field) => {
                  const errors = visibleErrors(field.state.meta)
                  const invalid = !!errors?.length
                  const value = field.state.value
                  return (
                    <Field orientation="horizontal" data-invalid={invalid}>
                      <FieldContent>
                        <FieldLabel htmlFor={fieldId(rule, "value")}>
                          {info.label}
                        </FieldLabel>
                        <FieldDescription>{info.description}</FieldDescription>
                        <FieldError errors={errors} />
                      </FieldContent>
                      <div className="w-32 shrink-0">
                        <MeasurementInput
                          id={fieldId(rule, "value")}
                          type="number"
                          unit={info.unit}
                          min={info.min}
                          max={info.max}
                          step="any"
                          value={Number.isNaN(value) ? "" : value}
                          aria-invalid={invalid}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.value.trim()
                                ? Number(event.target.value)
                                : Number.NaN
                            )
                          }
                        />
                      </div>
                      <form.Field name={`${rule}.severity`}>
                        {(severity) => (
                          <SeveritySelect
                            id={fieldId(rule, "severity")}
                            label={`${info.label} severity`}
                            value={severity.state.value}
                            onChange={severity.handleChange}
                          />
                        )}
                      </form.Field>
                    </Field>
                  )
                }}
              </form.Field>
            )
          })}
          {CHECK_RULES.map((rule) => {
            const info = CHECK_RULE_INFO[rule]
            return (
              <form.Field key={rule} name={`${rule}.severity`}>
                {(field) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor={fieldId(rule, "severity")}>
                        {info.label}
                      </FieldLabel>
                      <FieldDescription>{info.description}</FieldDescription>
                    </FieldContent>
                    <SeveritySelect
                      id={fieldId(rule, "severity")}
                      label={`${info.label} severity`}
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                  </Field>
                )}
              </form.Field>
            )
          })}
        </FieldGroup>
      </div>
      <DialogFooter className="shrink-0 border-t p-4">
        <Button
          type="button"
          variant="outline"
          className="sm:mr-auto"
          onClick={() => form.reset(defaultDesignRules())}
        >
          Reset to defaults
        </Button>
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={!canSubmit}>
              Save
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
