import type { MachineErrorCode } from "../contract/index.ts"

export type { MachineErrorCode }

/** A user-facing machine failure; the message is shown as-is. */
export class MachineError extends Error {
  readonly code: MachineErrorCode
  constructor(code: MachineErrorCode, message: string) {
    super(message)
    this.name = "MachineError"
    this.code = code
  }
}

export const cancelled = (message = "The request was cancelled.") =>
  new MachineError("cancelled", message)

/** The error an aborted operation should surface: the abort reason when it is a MachineError. */
export const abortError = (signal: AbortSignal) =>
  signal.reason instanceof MachineError ? signal.reason : cancelled()
