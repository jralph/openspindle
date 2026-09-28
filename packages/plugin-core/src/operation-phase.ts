/** Descriptive operation metadata; it does not schedule or execute programs. */
export type OperationPhase = "setup" | "machining" | "finish"

export function isOperationPhase(value: unknown): value is OperationPhase {
  return value === "setup" || value === "machining" || value === "finish"
}
