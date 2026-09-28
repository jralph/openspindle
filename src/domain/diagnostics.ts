/** A fix the UI can offer next to a diagnostic. */
export type QuickFix =
  | { readonly kind: "assign-tool"; readonly toolNumber: number | null }
  | { readonly kind: "update-operation"; readonly operationId: string }
  | { readonly kind: "install-plugin"; readonly pluginId: string }
  | { readonly kind: "read-anchors" }
  | { readonly kind: "edit-operation"; readonly operationId: string }

/**
 * Something about a plate the user should see. Errors block Run and NC export;
 * warnings do not. Compilation reports problems this way instead of throwing.
 */
export type Diagnostic = {
  readonly severity: "error" | "warning"
  readonly code: string
  readonly message: string
  readonly operationId?: string
  /** 1-based line in the operation's own NC, when known. */
  readonly line?: number
  readonly fix?: QuickFix
}

export const error = (
  code: string,
  message: string,
  extra: Omit<Diagnostic, "severity" | "code" | "message"> = {}
): Diagnostic => ({ severity: "error", code, message, ...extra })

export const warning = (
  code: string,
  message: string,
  extra: Omit<Diagnostic, "severity" | "code" | "message"> = {}
): Diagnostic => ({ severity: "warning", code, message, ...extra })

export const blocking = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === "error")
