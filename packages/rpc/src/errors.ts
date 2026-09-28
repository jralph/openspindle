export const RPC_ERROR_CODES = [
  "INVALID_PARAMS",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "CONFLICT",
  "BUSY",
  "UNAVAILABLE",
  "CANCELLED",
  "TIMEOUT",
  "LIMIT_EXCEEDED",
  "FAILED",
  "INTERNAL",
] as const
export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number]

/** Serializable error shape; `data` carries domain detail such as a machine error code. */
export interface RpcErrorData {
  readonly code: RpcErrorCode
  readonly message: string
  readonly data?: unknown
}

export class RpcError extends Error {
  readonly code: RpcErrorCode
  readonly data: unknown

  constructor(code: RpcErrorCode, message: string, data?: unknown) {
    super(message)
    this.name = "RpcError"
    this.code = code
    this.data = data
  }

  toData(): RpcErrorData {
    return this.data === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, data: this.data }
  }
}

const isRpcErrorCode = (value: unknown): value is RpcErrorCode =>
  typeof value === "string" &&
  (RPC_ERROR_CODES as readonly string[]).includes(value)

/** Handler failures cross the boundary as user-readable messages without stacks. */
export function toRpcErrorData(error: unknown): RpcErrorData {
  if (error instanceof RpcError) return error.toData()
  if (error instanceof Error && error.name === "AbortError")
    return { code: "CANCELLED", message: "The request was cancelled." }
  if (error instanceof Error && error.message)
    return { code: "FAILED", message: error.message }
  return { code: "INTERNAL", message: "The request failed." }
}

export function fromRpcErrorData(value: unknown): RpcError {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>
    if (isRpcErrorCode(candidate.code) && typeof candidate.message === "string")
      return new RpcError(candidate.code, candidate.message, candidate.data)
  }
  return new RpcError("INTERNAL", "Received an invalid error response.")
}
