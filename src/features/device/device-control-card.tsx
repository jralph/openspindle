import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { FieldLegend, FieldSet } from "@/components/ui/field"

/** One titled, icon-led card of the device panel; every card shares this frame. */
export function ControlCard({
  title,
  icon,
  children,
  action,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <Card size="sm" className="min-w-0">
      <CardContent>
        <FieldSet>
          <FieldLegend className="flex w-full items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              {icon}
              {title}
            </span>
            {action}
          </FieldLegend>
          {children}
        </FieldSet>
      </CardContent>
    </Card>
  )
}
