import type { RpcErrorData } from "./errors.ts"

export type RpcMessage =
  | { rpc: 1; kind: "call"; id: number; method: string; params: unknown }
  | { rpc: 1; kind: "result"; id: number; result: unknown }
  | { rpc: 1; kind: "error"; id: number; error: RpcErrorData }
  | { rpc: 1; kind: "cancel"; id: number }
  | { rpc: 1; kind: "subscribe"; id: number; event: string; params: unknown }
  | { rpc: 1; kind: "event"; id: number; data: unknown }
  | { rpc: 1; kind: "end"; id: number; error?: RpcErrorData }

/** Adapter over a concrete channel (MessagePort, Electron port, stdio). */
export interface Transport {
  send: (message: RpcMessage) => void
  listen: (
    onMessage: (message: unknown) => void,
    onClose: (reason?: string) => void
  ) => () => void
  close: () => void
}

const KINDS = new Set([
  "call",
  "result",
  "error",
  "cancel",
  "subscribe",
  "event",
  "end",
])

/** Structural check only; payloads are validated against the contract separately. */
export function isRpcMessage(value: unknown): value is RpcMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const message = value as Record<string, unknown>
  return (
    message.rpc === 1 &&
    typeof message.kind === "string" &&
    KINDS.has(message.kind) &&
    typeof message.id === "number" &&
    Number.isSafeInteger(message.id)
  )
}
