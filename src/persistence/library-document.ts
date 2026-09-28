import { z } from "zod"
import type { WorkspaceLibrary } from "@/domain/workspace/library"
import { TOOL_COUNT_LIMIT, ToolShapeSchema, isTool } from "@/domain/tools/tool"
import type { Tool } from "@/domain/tools/tool"
import { restoreTools, upgradeTool } from "@/formats/tool-library/upgrade"
import { StockSchema, isStock } from "@/domain/stock/stock"
import type { Stock } from "@/domain/stock/stock"
import type { StoragePort } from "@/platform/host"
import { Repository } from "./repository"
import type { Decoded } from "./repository"

const MAX_STOCKS = 1000

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

/** The same item schemas `decodeTools` and `decodeStocks` read with, so saving can never keep
 * an item the next load would drop. */
const LibraryDataSchema = z.object({
  tools: z.array(ToolShapeSchema).max(TOOL_COUNT_LIMIT),
  stocks: z.array(StockSchema).max(MAX_STOCKS),
  defaultToolId: z.string().nullable(),
  defaultStockId: z.string().nullable(),
})

/**
 * Tools of earlier versions are brought up to date; unreadable tools are dropped and counted;
 * a repeated id gets a unique one.
 */
function decodeTools(value: unknown, dropped: string[]): Tool[] {
  if (!Array.isArray(value)) throw new Error("the tool list is missing")
  const tools = value.map(upgradeTool).filter(isTool).slice(0, TOOL_COUNT_LIMIT)
  if (tools.length < value.length)
    dropped.push(
      `${value.length - tools.length} unreadable tools were dropped from the library.`
    )
  return restoreTools(tools) ?? []
}

function decodeStocks(value: unknown, dropped: string[]): Stock[] {
  if (!Array.isArray(value)) throw new Error("the stock list is missing")
  const stocks = value.filter(isStock).slice(0, MAX_STOCKS)
  if (stocks.length < value.length)
    dropped.push(
      `${value.length - stocks.length} unreadable stock entries were dropped.`
    )
  return stocks
}

function decodeLibrary(data: unknown): Decoded<WorkspaceLibrary> {
  if (!record(data)) throw new Error("it is not a tool and stock library")
  const dropped: string[] = []
  const tools = decodeTools(data.tools, dropped)
  const stocks = decodeStocks(data.stocks, dropped)
  return {
    dropped,
    value: {
      tools,
      stocks,
      // library.tools keeps it only if it still names a tool, else the first: no need to check here.
      defaultToolId:
        typeof data.defaultToolId === "string" ? data.defaultToolId : null,
      defaultStockId: stocks.some((stock) => stock.id === data.defaultStockId)
        ? (data.defaultStockId as string)
        : (stocks.at(0)?.id ?? null),
    },
  }
}

/** The tool and stock libraries, kept between launches (projects are not). */
export function libraryRepository(storage: StoragePort) {
  return new Repository<WorkspaceLibrary>(storage, {
    key: "library",
    title: "The tool and stock libraries",
    version: 1,
    decode: decodeLibrary,
    encode: ({ tools, stocks, defaultToolId, defaultStockId }) => ({
      tools,
      stocks,
      defaultToolId,
      defaultStockId,
    }),
    schema: LibraryDataSchema,
  })
}
