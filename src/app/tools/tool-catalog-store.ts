import { z } from "zod"
import { importToolLibrary } from "@/formats/tool-library/library-file"
import type { Tool } from "@/domain/tools/tool"

export interface LoadedToolCatalog {
  id: string
  name: string
  tools: Tool[]
}

/** The packaged catalogs and the tools a new library starts with; see public/tool-libraries. */
const CATALOG_DIRECTORY = "/tool-libraries/"
const CatalogIndexSchema = z.object({
  catalogs: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      /** Fusion 360 JSON or native libraries in the catalog directory, read in order. */
      files: z.array(z.string().regex(/^[\w.-]+\.json$/)).min(1),
    })
  ),
  starter: z.array(z.object({ catalog: z.string(), tool: z.string() })),
})
type CatalogIndex = z.infer<typeof CatalogIndexSchema>
type CatalogEntry = CatalogIndex["catalogs"][number]

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

async function readCatalogFile(file: string): Promise<string> {
  const response = await fetch(CATALOG_DIRECTORY + file)
  if (!response.ok)
    throw new Error(`Could not load ${file} (${response.status}).`)
  return response.text()
}

let index: Promise<CatalogIndex> | null = null
/** Loaded once; a failure is retried on the next request. */
function readIndex(): Promise<CatalogIndex> {
  index ??= readCatalogFile("catalogs.json")
    .then((text) => CatalogIndexSchema.parse(JSON.parse(text)))
    .catch((error: unknown) => {
      index = null
      throw new Error(errorText(error, "The tool catalog list is unreadable."))
    })
  return index
}

const catalogLoads = new Map<string, Promise<LoadedToolCatalog>>()
/** The catalogs loaded so far; replaced, not changed, so it can stand in for query data. */
let loadedCatalogs: readonly LoadedToolCatalog[] = []

/** A catalog's files, fetched once; a catalog that fails to load is retried on the next request. */
function readCatalog(entry: CatalogEntry): Promise<LoadedToolCatalog> {
  let load = catalogLoads.get(entry.id)
  if (!load) {
    load = (async () => {
      let tools: Tool[] = []
      for (const file of entry.files) {
        const text = await readCatalogFile(file)
        const imported = importToolLibrary(
          text,
          `catalog:${entry.id}/${file}`,
          tools
        )
        tools = [...tools, ...imported.tools]
      }
      const catalog = { id: entry.id, name: entry.name, tools }
      loadedCatalogs = [...loadedCatalogs, catalog]
      return catalog
    })().catch((error: unknown) => {
      catalogLoads.delete(entry.id)
      throw new Error(errorText(error, `Could not load ${entry.name} tools.`))
    })
    catalogLoads.set(entry.id, load)
  }
  return load
}

/** The tools a new library starts with, read from the catalogs that hold them. */
export async function loadStarterTools(): Promise<Tool[]> {
  const { catalogs, starter } = await readIndex()
  const tools: Tool[] = []
  for (const { catalog: catalogId, tool: toolId } of starter) {
    const entry = catalogs.find((catalog) => catalog.id === catalogId)
    if (!entry) throw new Error(`Starter tool ${toolId} names no catalog.`)
    const tool = (await readCatalog(entry)).tools.find(
      ({ id }) => id === toolId
    )
    if (!tool) throw new Error(`${entry.name} has no starter tool ${toolId}.`)
    tools.push(tool)
  }
  return tools
}

/** The catalogs loaded so far, shown while the rest load; catalog tools are only saved once used. */
export function createInitialToolCatalogs(): readonly LoadedToolCatalog[] {
  return loadedCatalogs
}

function sameTool(a: Tool, b: Tool) {
  if (a === b) return true
  const comparable = (tool: Tool) => ({
    ...tool,
    source: tool.source ? { ...tool.source, fileName: null } : null,
  })
  // A tool saved from one catalog file and the same tool read again may name different files.
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))
}

function matchesCatalogId(id: string, catalogId: string, originalId: string) {
  if (id === originalId) return true
  const alias = `catalog:${catalogId}:${originalId}`
  if (id === alias) return true
  return id.startsWith(`${alias}:`) && /^\d+$/.test(id.slice(alias.length + 1))
}

/** Exact identity and contents, never just a Fusion GUID shared by custom copies. */
export function catalogForTool(
  tool: Tool,
  catalogs: readonly LoadedToolCatalog[]
): LoadedToolCatalog | null {
  for (const catalog of catalogs) {
    const bundled = catalog.tools.find((entry) =>
      matchesCatalogId(tool.id, catalog.id, entry.id)
    )
    if (bundled && sameTool(tool, { ...bundled, id: tool.id })) return catalog
  }
  return null
}

/** Stored edits/snapshots win; browsing never overwrites a user's tool definition. */
export function mergeCatalogTools(
  stored: readonly Tool[],
  catalogs: readonly LoadedToolCatalog[]
): Tool[] {
  const entries = new Map<string, Tool>()
  const saved = new Map(stored.map((tool) => [tool.id, tool]))
  for (const catalog of catalogs) {
    for (const tool of catalog.tools) {
      const savedAlias = stored.find(
        (entry) =>
          entry.id !== tool.id &&
          matchesCatalogId(entry.id, catalog.id, tool.id) &&
          sameTool(entry, { ...tool, id: entry.id })
      )
      let id = savedAlias?.id ?? tool.id
      const existing = saved.get(id)
      if (
        entries.has(id) ||
        (existing && catalogForTool(existing, catalogs)?.id !== catalog.id)
      ) {
        const alias = `catalog:${catalog.id}:${tool.id}`
        id = alias
        let suffix = 2
        while (
          entries.has(id) ||
          (saved.has(id) && !sameTool(saved.get(id)!, { ...tool, id }))
        ) {
          id = `${alias}:${suffix++}`
        }
      }
      entries.set(id, id === tool.id ? tool : { ...tool, id })
    }
  }
  for (const tool of stored) entries.set(tool.id, tool)
  return [...entries.values()]
}

/** Every packaged catalog, each fetched once, with partial availability if an asset is missing. */
export async function loadToolCatalogs(): Promise<{
  catalogs: LoadedToolCatalog[]
  error: string | null
}> {
  let entries: CatalogEntry[]
  try {
    entries = (await readIndex()).catalogs
  } catch (error) {
    return {
      catalogs: [],
      error: errorText(error, "Could not load the tool catalogs."),
    }
  }
  const results = await Promise.allSettled(entries.map(readCatalog))
  const catalogs: LoadedToolCatalog[] = []
  const errors: string[] = []
  for (const result of results) {
    if (result.status === "fulfilled") catalogs.push(result.value)
    else errors.push(errorText(result.reason, "Could not load a tool catalog."))
  }
  return { catalogs, error: errors.length ? errors.join(" ") : null }
}
