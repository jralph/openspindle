import { CircleAlert, TriangleAlert, Waypoints } from "lucide-react"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Diagnostic } from "@/domain/diagnostics"
import type { Plate } from "@/domain/plate/plate"
import { MachineActionButton } from "@/features/job/stage-card"
import { QUICK_FIX_LABELS, useQuickFix, useReadAnchorsFix } from "../quick-fix"

/** Problems and advice for a plate or operation, each with the fix it offers. */
export function DiagnosticsList({
  plate,
  diagnostics,
}: {
  plate: Plate
  diagnostics: readonly Diagnostic[]
}) {
  const quickFix = useQuickFix()
  const readAnchors = useReadAnchorsFix()
  if (!diagnostics.length) return null
  return (
    <div className="flex flex-col gap-2" aria-label="Problems">
      {diagnostics.map((diagnostic, index) => {
        const error = diagnostic.severity === "error"
        const Icon = error ? CircleAlert : TriangleAlert
        const { fix } = diagnostic
        return (
          <Alert
            key={`${diagnostic.code}:${diagnostic.operationId ?? ""}:${index}`}
            variant={error ? "warning" : "default"}
          >
            <Icon />
            <AlertDescription>{diagnostic.message}</AlertDescription>
            {fix && (
              <AlertAction>
                {fix.kind === "read-anchors" ? (
                  <MachineActionButton
                    action={readAnchors}
                    label={QUICK_FIX_LABELS[fix.kind]}
                    pendingLabel="Reading anchors…"
                    variant={error ? "warning" : "outline"}
                    size="xs"
                    icon={<Waypoints data-icon="inline-start" />}
                  />
                ) : (
                  <Button
                    variant={error ? "warning" : "outline"}
                    size="xs"
                    onClick={() => quickFix(plate, fix)}
                  >
                    {QUICK_FIX_LABELS[fix.kind]}
                  </Button>
                )}
              </AlertAction>
            )}
          </Alert>
        )
      })}
    </div>
  )
}
