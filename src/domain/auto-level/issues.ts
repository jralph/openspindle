/** Errors block NC generation or Run; warnings inform without blocking. */
export type AutoLevelIssueSeverity = "error" | "warning"

export type AutoLevelIssueCode =
  // Parameters, within the ranges of the machine's probe
  | "invalid-parameters"
  // Anchor placement against the plate's anchor snapshot
  | "anchor-snapshot-missing"
  | "anchor-unavailable"
  | "anchor-grid-out-of-range"
  | "factory-anchors"
  // Stock
  | "stock-unspecified"
  | "grid-exceeds-stock"
  | "grid-outside-stock"
  // Run against the connected machine
  | "anchors-not-read"
  | "live-anchors-unavailable"
  | "anchors-changed"

export type AutoLevelIssue = {
  code: AutoLevelIssueCode
  /** User-facing explanation, ready to display. */
  message: string
  severity: AutoLevelIssueSeverity
}

export const autoLevelError = (
  code: AutoLevelIssueCode,
  message: string
): AutoLevelIssue => ({ code, message, severity: "error" })

export const autoLevelWarning = (
  code: AutoLevelIssueCode,
  message: string
): AutoLevelIssue => ({ code, message, severity: "warning" })
