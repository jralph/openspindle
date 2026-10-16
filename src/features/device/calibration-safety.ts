import { isSimulator } from "@/machine/contract"
import type { ConnectedDevice } from "@/machine/contract"

/** Preparation remains available for practice, never as a physical validation step. */
export const calibrationPreparationIssue = (device: ConnectedDevice | null) =>
  device && !isSimulator(device)
    ? "This diameter guide still uses the native Boss-X cycle without bounded contacts. Use simulator practice or pasted readings here. Auto calibrate Anchor 1 has its own live signal check and bounded sequence."
    : null
