import { isSimulator } from "@/machine/contract"
import type { ConnectedDevice } from "@/machine/contract"

/** Preparation remains available for practice, never as a physical validation step. */
export const calibrationPreparationIssue = (device: ConnectedDevice | null) =>
  device && !isSimulator(device)
    ? "Physical probe calibration is disabled following a probe collision. Contact detection and bounded stopping have not been verified. Connect the local simulator for practice; do not rerun this on the machine."
    : null
