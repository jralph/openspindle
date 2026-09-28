import { mkdir, readFile, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { ModelIdSchema } from "../../../src/domain/models/model"
import type { ModelId } from "../../../src/domain/models/model"
import { ModelLibrary } from "../../../src/persistence/models/model-library"
import { writeFileAtomic } from "./atomic-write"

const RECORD = "record.json"

const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/** Node's Buffer views a pooled allocation; hand the port exactly the file's bytes. */
const bytesOf = (buffer: Buffer) =>
  new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

/**
 * Null when nothing is stored at `path`. A file that exists but is not valid JSON is returned
 * as text instead of null, so `ModelLibrary` never mistakes it for no file at all.
 */
async function readJson(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The Models library in the app's data folder: one folder per model, named by its id. */
export function createModelLibrary(root: string): ModelLibrary {
  const directory = join(root, "models")
  const folder = (id: ModelId) => join(directory, ModelIdSchema.parse(id))
  const write = async (
    id: ModelId,
    name: string,
    contents: string | Uint8Array
  ) => {
    await mkdir(folder(id), { recursive: true })
    await writeFileAtomic(join(folder(id), name), contents)
  }
  return new ModelLibrary({
    records: async () => {
      let names: string[]
      try {
        names = await readdir(directory)
      } catch (error) {
        if (missing(error)) return []
        throw error
      }
      const ids = names.filter((name) => ModelIdSchema.safeParse(name).success)
      return Promise.all(ids.map((id) => readJson(join(folder(id), RECORD))))
    },
    record: (id) => readJson(join(folder(id), RECORD)),
    writeRecord: (record) => write(record.id, RECORD, JSON.stringify(record)),
    file: async (id, name) => {
      try {
        return bytesOf(await readFile(join(folder(id), name)))
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
    },
    writeFile: (id, name, bytes) => write(id, name, bytes),
    remove: (id) => rm(folder(id), { recursive: true, force: true }),
  })
}
