import type { ReactNode } from "react"
import { cn } from "cn"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

const WIDTHS = { default: "sm:max-w-xl", wide: "sm:max-w-3xl" } as const

/** A workspace dialog: a title, a scrolling body and optional footer actions. */
export function AppDialog({
  title,
  description,
  width = "default",
  onClose,
  footer,
  children,
}: {
  title: string
  description?: ReactNode
  width?: keyof typeof WIDTHS
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={cn("flex max-h-[85vh] flex-col", WIDTHS[width])}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ScrollArea
          className="min-h-0 min-w-0 flex-1"
          viewportClassName="max-h-[calc(85vh-5rem)] overflow-x-hidden"
        >
          <div className="min-w-0 pr-3">{children}</div>
        </ScrollArea>
        {footer && <DialogFooter className="shrink-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
