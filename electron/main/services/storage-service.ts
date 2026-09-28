import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import type {
  BackupResult,
  StorageKey,
} from "../../../src/platform/contract/storage"
import { writeFileAtomic } from "./atomic-write"

const BACKUPS_PER_STORE = 10

const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/**
 * Stores each document as a JSON file in the app's data folder, written atomically,
 * with timestamped backups before anything destructive.
 */
export class StorageService {
  private readonly directory: string
  private readonly backups: string
  /** Serializes writes per document so a slow write never lands after a newer one. */
  private readonly queues = new Map<StorageKey, Promise<unknown>>()

  constructor(root: string) {
    this.directory = join(root, "storage")
    this.backups = join(root, "backups")
  }

  private file(key: StorageKey) {
    return join(this.directory, `${key}.json`)
  }

  private enqueue<TResult>(key: StorageKey, work: () => Promise<TResult>) {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.then(work, work)
    this.queues.set(
      key,
      next.catch(() => undefined)
    )
    return next
  }

  /** Settles once every queued write has finished (used before quitting). */
  async idle(): Promise<void> {
    await Promise.all(this.queues.values())
  }

  async read(key: StorageKey): Promise<string | null> {
    try {
      return await readFile(this.file(key), "utf8")
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  write(key: StorageKey, value: string): Promise<void> {
    return this.enqueue(key, async () => {
      await mkdir(this.directory, { recursive: true })
      await writeFileAtomic(this.file(key), value)
    })
  }

  remove(key: StorageKey): Promise<void> {
    return this.enqueue(key, () => rm(this.file(key), { force: true }))
  }

  backup(key: StorageKey): Promise<BackupResult> {
    return this.enqueue(key, async () => {
      await mkdir(this.backups, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, "-")
      const target = join(this.backups, `${key}-${stamp}.json`)
      try {
        await copyFile(this.file(key), target)
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
      await this.prune(key)
      return { location: target }
    })
  }

  private async prune(key: StorageKey) {
    const old = (await readdir(this.backups))
      .filter((name) => name.startsWith(`${key}-`) && name.endsWith(".json"))
      .sort()
      .reverse()
      .slice(BACKUPS_PER_STORE)
    await Promise.all(
      old.map((name) => rm(join(this.backups, name), { force: true }))
    )
  }
}
