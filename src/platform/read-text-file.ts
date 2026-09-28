import { FILE_KINDS, validateOpenedFile } from "./contract/files"
import type { FileKind } from "./contract/files"

/**
 * Reads a file dropped or chosen in the renderer exactly as the host reads one it opens: a size
 * check, a strict UTF-8 decode (never the lossy replacement `file.text()` makes), then the
 * kind's own name and content checks. Throws with the host's own messages, so a file ⌘O refuses
 * fails the same way when it is dropped instead.
 */
export async function readTextFile(
  kind: FileKind,
  file: File
): Promise<{ fileName: string; contents: string }> {
  const spec = FILE_KINDS[kind]
  if (file.size > spec.maxBytes)
    throw new Error(`${file.name} exceeds the file size limit.`)
  let contents: string
  try {
    contents = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer()
    )
  } catch {
    throw new Error(`${file.name} is not valid UTF-8 text.`)
  }
  return validateOpenedFile(kind, file.name, contents)
}
