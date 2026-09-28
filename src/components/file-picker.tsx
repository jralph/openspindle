import { useRef } from "react"
import type { ReactNode } from "react"

/**
 * A hidden file input behind a trigger the caller renders: `hidden` keeps it out of the tab
 * order (a visually-hidden input needs `tabIndex={-1}` for that; a display-none one does not).
 */
export function FilePicker({
  accept,
  multiple,
  "aria-label": ariaLabel,
  onSelect,
  children,
}: {
  accept?: string
  multiple?: boolean
  "aria-label": string
  onSelect: (files: File[]) => void
  /** Renders the trigger; call the given function to open the file dialog. */
  children: (open: () => void) => ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      {children(() => input.current?.click())}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        aria-label={ariaLabel}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ""
          if (files.length) onSelect(files)
        }}
      />
    </>
  )
}
