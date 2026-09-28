import { createHash } from "node:crypto"
import { open, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { PluginError, isPlatform } from "@openspindle/plugin-core"
import type { FolderPort, Platform, Sha256 } from "@openspindle/plugin-core"

/** SHA-256 without copying bytes into Web Crypto. */
export const nodeSha256: Sha256 = async (bytes) =>
  createHash("sha256").update(bytes).digest("hex")

/** This computer's platform, or null where companions are unsupported. */
export function nodePlatform(): Platform | null {
  const platform = `${process.platform}-${process.arch}`
  return isPlatform(platform) ? platform : null
}

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/**
 * Reads package files from a local folder: regular files only, resolved through symbolic
 * links, and never outside the folder.
 */
export async function openNodeFolder(folder: string): Promise<FolderPort> {
  let root: string
  try {
    root = await realpath(folder)
  } catch {
    throw new PluginError(`${folder} does not exist.`)
  }
  if (!(await stat(root)).isDirectory())
    throw new PluginError(`${folder} is not a folder.`)
  return {
    path: root,
    async readFile(relative, maxBytes) {
      let resolved: string
      try {
        resolved = await realpath(path.join(root, ...relative.split("/")))
      } catch (error) {
        if (isMissing(error))
          throw new PluginError(
            `${relative} is missing from the plugin folder.`
          )
        throw error
      }
      const inside = path.relative(root, resolved)
      if (!inside || inside.startsWith("..") || path.isAbsolute(inside))
        throw new PluginError(`${relative} leaves the plugin folder.`)
      const handle = await open(resolved, "r")
      try {
        const info = await handle.stat()
        if (!info.isFile()) throw new PluginError(`${relative} is not a file.`)
        if (info.size > maxBytes)
          throw new PluginError(`${relative} exceeds its size limit.`)
        const bytes = await handle.readFile()
        if (bytes.byteLength > maxBytes)
          throw new PluginError(`${relative} exceeds its size limit.`)
        return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      } finally {
        await handle.close()
      }
    },
  }
}
