import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  PROBE_SAFETY_GUIDELINES,
  UNBOUNDED_PROBE_REASON,
} from "@/machine/contract"

/** The same contact safety instructions accompany every probing entry point. */
export function ProbeSafetyNotice({ native = false }: { native?: boolean }) {
  return (
    <Alert variant={native ? "warning" : "default"}>
      <AlertDescription>
        {native ? UNBOUNDED_PROBE_REASON : PROBE_SAFETY_GUIDELINES}
      </AlertDescription>
    </Alert>
  )
}
