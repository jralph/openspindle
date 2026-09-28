import { z } from "zod"

/**
 * Why a machine request failed, beside its user-facing message. RPC errors carry it as
 * `data.machine`, so callers can act on a failure without reading its message.
 */
export const MachineErrorCodeSchema = z.enum([
  // No verified connection.
  "not-connected",
  // Another operation holds the machine.
  "busy",
  // The admission policy refused the request before anything was sent.
  "refused",
  // The request leaves a running job without the app's Stop: it goes through once it says the
  // user confirmed it.
  "confirmation-required",
  // The machine answered with an error.
  "rejected",
  // The machine did not answer in time.
  "timeout",
  // The command was sent but its effect was not observed.
  "unverified",
  "cancelled",
  "connection-lost",
  "invalid",
  // The principal lacks the grant for this request.
  "permission",
])
export type MachineErrorCode = z.infer<typeof MachineErrorCodeSchema>
