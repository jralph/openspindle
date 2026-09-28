import { createAtom, useSelector } from "@tanstack/react-store"
import { toast } from "sonner"
import { RpcError } from "@openspindle/rpc"
import type { ParamsOut } from "@openspindle/rpc"
import type {
  PluginIdentity,
  PluginViewContract,
} from "@openspindle/plugin-core"
import type {
  ChosenTool,
  PluginDialogs,
} from "@/app/plugin-host/workspace-mediator"

type Params<TMethod extends keyof PluginViewContract["methods"]> = ParamsOut<
  PluginViewContract,
  TMethod
>

type Request<TKind extends string, TRequest, TResult> = {
  readonly id: string
  readonly kind: TKind
  readonly plugin: PluginIdentity
  readonly request: TRequest
  /** Answers the waiting frame and closes the dialog. */
  readonly settle: (result: TResult) => void
}

export type ToolRequest = Request<
  "tool",
  Params<"tools.choose">,
  ChosenTool | null
>
export type ConfirmRequest = Request<"confirm", Params<"ui.confirm">, boolean>
export type PluginRequest = ToolRequest | ConfirmRequest

/** Questions plugin views wait on, oldest first; the dialog host shows the first. */
const requests = createAtom<readonly PluginRequest[]>([])

export const usePluginRequest = () =>
  useSelector(requests, (list) => list.at(0) ?? null)

/**
 * Queues a question for the user. A plugin waits on one question at a time, and when its
 * view goes away (the frame's call is aborted) the question closes with `canceled`.
 */
function ask<TResult>(
  plugin: PluginIdentity,
  signal: AbortSignal,
  canceled: TResult,
  create: (id: string, settle: (result: TResult) => void) => PluginRequest
): Promise<TResult> {
  if (requests.get().some((item) => item.plugin.id === plugin.id))
    return Promise.reject(
      new RpcError("BUSY", `${plugin.name} is already waiting for an answer.`)
    )
  if (signal.aborted) return Promise.resolve(canceled)
  return new Promise((resolve) => {
    const id = crypto.randomUUID()
    const settle = (result: TResult) => {
      requests.set((list) => list.filter((item) => item.id !== id))
      resolve(result)
    }
    signal.addEventListener("abort", () => settle(canceled), { once: true })
    requests.set((list) => [...list, create(id, settle)])
  })
}

const NOTICES = {
  info: toast.info,
  success: toast.success,
  warning: toast.warning,
  error: toast.error,
} as const

/** How the app answers plugin views: its own dialogs and notices, never the plugin's. */
export const pluginDialogs: PluginDialogs = {
  chooseTool: (plugin, request, signal) =>
    ask<ChosenTool | null>(plugin, signal, null, (id, settle) => ({
      id,
      kind: "tool",
      plugin,
      request,
      settle,
    })),
  confirm: (plugin, request, signal) =>
    ask(plugin, signal, false, (id, settle) => ({
      id,
      kind: "confirm",
      plugin,
      request,
      settle,
    })),
  notify: (plugin, notice) =>
    NOTICES[notice.tone](notice.message, { description: plugin.name }),
  progress: (plugin, { label, value, done }) => {
    const id = `plugin-progress:${plugin.id}`
    if (done) {
      toast.dismiss(id)
      return
    }
    const percent = value === null ? "" : ` · ${Math.round(value * 100)}%`
    toast.loading(label, { id, description: `${plugin.name}${percent}` })
  },
}
