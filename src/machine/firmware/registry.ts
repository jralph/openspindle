import type { FirmwareAdapter } from "./adapter.ts"
import { makeraAdapter } from "./makera/adapter.ts"

/** Supporting another controller family is a new adapter here; the core and UI stay unchanged. */
export const FIRMWARE_ADAPTERS: readonly FirmwareAdapter[] = [makeraAdapter]

export const DEFAULT_FIRMWARE = makeraAdapter
