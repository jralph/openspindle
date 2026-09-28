import { readFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import {
  DEFAULT_DIAGNOSTICS_SETTINGS,
  LogLevelSchema,
} from "../../../src/platform/contract/diagnostics"
import type { DiagnosticsSettings } from "../../../src/platform/contract/diagnostics"
import { writeFileAtomic } from "../services/atomic-write"

/**
 * A setting that is missing or unreadable follows the default; the others stay, whatever
 * version wrote the file and whatever other fields it carries.
 */
const StoredSchema = z.object({
  logLevel: LogLevelSchema.optional().catch(undefined),
  reportAutomatically: z.boolean().optional().catch(undefined),
})

/** The settings a patch or the stored file sets. */
function chosenIn({
  logLevel,
  reportAutomatically,
}: Partial<DiagnosticsSettings>): Partial<DiagnosticsSettings> {
  return {
    ...(logLevel === undefined ? {} : { logLevel }),
    ...(reportAutomatically === undefined ? {} : { reportAutomatically }),
  }
}

/**
 * The settings the main process needs before a window opens: how much the log records and
 * whether errors are reported automatically. settings.json in the app's data folder keeps the
 * ones the user changed; the others follow the defaults, also when a version changes them.
 */
export class DiagnosticsSettingsStore {
  private readonly file: string
  private chosen: Partial<DiagnosticsSettings>
  private writes: Promise<void> = Promise.resolve()

  constructor(userData: string) {
    this.file = path.join(userData, "settings.json")
    this.chosen = this.readSync()
  }

  get(): DiagnosticsSettings {
    return { ...DEFAULT_DIAGNOSTICS_SETTINGS, ...this.chosen }
  }

  async update(
    patch: Partial<DiagnosticsSettings>
  ): Promise<DiagnosticsSettings> {
    const previous = this.chosen
    const next = { ...previous, ...chosenIn(patch) }
    // Applies at once, so a change made while this one is written builds on it.
    this.chosen = next
    const contents = `${JSON.stringify({ version: 1, ...next }, null, 2)}\n`
    const write = this.writes.then(() => writeFileAtomic(this.file, contents))
    this.writes = write.catch(() => undefined)
    try {
      await write
    } catch (error) {
      if (this.chosen === next) this.chosen = previous
      throw error
    }
    return this.get()
  }

  private readSync(): Partial<DiagnosticsSettings> {
    try {
      const stored = StoredSchema.safeParse(
        JSON.parse(readFileSync(this.file, "utf8"))
      )
      if (stored.success) return chosenIn(stored.data)
    } catch {
      // Missing or unreadable: the defaults.
    }
    return {}
  }
}
