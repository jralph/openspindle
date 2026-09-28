import type { Telemetry } from "../../contract/index.ts"
import { FAILURE_LINES, excerpt } from "../../firmware/adapter.ts"
import type { FirmwareAdapter } from "../../firmware/adapter.ts"
import type { Admission, AdmissionRequest } from "../admission.ts"
import { MachineError } from "../errors.ts"
import type { Clock } from "../ports.ts"
import type { MachineSession } from "../session.ts"

export const PREFLIGHT_MS = 3000

/** What an operation may use; it owns the machine until it settles. */
export type OperationContext = {
  readonly session: MachineSession
  readonly adapter: FirmwareAdapter
  readonly clock: Clock
  readonly signal: AbortSignal
  /** A program stream exists (acknowledgements are not ours). */
  readonly streaming: () => boolean
  /** Admission against fresh telemetry, ignoring the operation's own activity. */
  readonly admit: (request: AdmissionRequest, telemetry: Telemetry) => Admission
}

/** A status newer than now; nothing is sent to the machine before it arrives. */
export function freshStatus(
  context: OperationContext,
  timeoutMessage: string
): Promise<Telemetry> {
  const after = context.session.store.sequence
  context.session.requestStatus(true)
  return context.session.store.waitFor(() => true, {
    after,
    timeoutMs: PREFLIGHT_MS,
    timeoutMessage,
    signal: context.signal,
  })
}

export function requireAdmission(
  context: OperationContext,
  request: AdmissionRequest,
  telemetry: Telemetry
) {
  const admission = context.admit(request, telemetry)
  if (admission.verdict === "refuse")
    throw new MachineError("refused", admission.reason)
  if (admission.verdict === "defer")
    throw new MachineError("busy", admission.reason)
}

/**
 * The acknowledgement of the command about to be sent. Register before sending;
 * a failure report instead of the acknowledgement rejects it.
 */
export function expectAcknowledgement(
  context: OperationContext,
  label: string,
  timeoutMs: number
): Promise<void> {
  return context.session.expect<void>(
    (event) => {
      if (event.kind !== "line") return "ignored"
      if (event.line.kind === "ack") return { done: undefined }
      if (FAILURE_LINES.has(event.line.kind))
        return {
          fail: new MachineError(
            "rejected",
            `The device rejected ${label}: ${excerpt(event.line.text)}`
          ),
        }
      return "ignored"
    },
    {
      timeoutMs,
      timeoutMessage: `The device did not acknowledge ${label}.`,
      signal: context.signal,
    }
  )
}

export const remaining = (clock: Clock, deadline: number) =>
  Math.max(1, deadline - clock.now())
