import { open, rename, rm } from "node:fs/promises"
import path from "node:path"

/**
 * Writes to a sibling temporary file, syncs it, then renames it over the target. Removes the
 * temporary file if any step fails, whether the write itself or the rename.
 */
export async function writeFileAtomic(
  filePath: string,
  contents: string | Uint8Array
): Promise<void> {
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  )
  try {
    const handle = await open(temporary, "w", 0o644)
    try {
      await handle.writeFile(contents)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, filePath)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}
