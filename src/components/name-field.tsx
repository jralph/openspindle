import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { cn } from "cn"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { TEXT_LIMIT } from "@/domain/primitives"
import type { Result } from "@/domain/primitives"

/**
 * A name that saves on blur or Enter, when it changed, and restores it on Escape. A name
 * refused by `onRename` is reported and restored; one line, its label is "Name" unless the
 * caller says otherwise, visually hidden where the surrounding row already identifies it.
 */
export function NameField({
  name,
  placeholder,
  label = "Name",
  hideLabel = false,
  maxLength = TEXT_LIMIT,
  onRename,
}: {
  name: string
  /** What shows in place of an empty name. */
  placeholder?: string
  label?: string
  hideLabel?: boolean
  /** The longest name the caller keeps; TEXT_LIMIT unless it says otherwise. */
  maxLength?: number
  onRename: (name: string) => Result<unknown>
}) {
  const id = useId()
  const [value, setValue] = useState(name)
  useEffect(() => setValue(name), [name])
  return (
    <Field>
      <FieldLabel htmlFor={`${id}-name`} className={cn(hideLabel && "sr-only")}>
        {label}
      </FieldLabel>
      <Input
        id={`${id}-name`}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() === name) return
          const result = onRename(value)
          if (!result.ok) {
            toast.error(result.error)
            setValue(name)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") setValue(name)
        }}
      />
    </Field>
  )
}
