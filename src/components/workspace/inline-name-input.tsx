import { cn } from "cn"
import { Input } from "@/components/ui/input"

/** Edits a name in place: Enter or leaving the field saves a changed name, Escape cancels. */
export function InlineNameInput({
  name,
  label,
  maxLength,
  className,
  onSave,
  onDone,
}: {
  name: string
  /** The field's accessible name. */
  label: string
  maxLength?: number
  className?: string
  onSave: (name: string) => void
  onDone: () => void
}) {
  return (
    <Input
      className={cn("h-7 min-w-0 flex-1", className)}
      aria-label={label}
      autoFocus
      defaultValue={name}
      maxLength={maxLength}
      onBlur={(event) => {
        const next = event.target.value.trim()
        if (next && next !== name) onSave(next)
        onDone()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") onDone()
      }}
    />
  )
}
