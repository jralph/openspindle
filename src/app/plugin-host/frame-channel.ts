import { createEndpoint } from "@openspindle/rpc"
import type { EmptyContract, Peer } from "@openspindle/rpc"
import { messagePortTransport } from "@openspindle/rpc/message-port"
import { pluginViewContract } from "@openspindle/plugin-core"
import {
  FRAME_CONNECT_MESSAGE,
  FRAME_READY_MESSAGE,
  PLUGIN_FRAME_PATH,
  PLUGIN_FRAME_SANDBOX,
} from "@/plugin-runtime/frame-policy"
import { log } from "@/app/errors/log"
import type { ViewBroker } from "./broker"

/** The iframe every plugin view renders in: an opaque origin with scripts and forms only. */
export const PLUGIN_FRAME_ATTRIBUTES = {
  src: PLUGIN_FRAME_PATH,
  sandbox: PLUGIN_FRAME_SANDBOX,
  referrerPolicy: "no-referrer",
} as const

const isReady = (data: unknown) =>
  !!data &&
  typeof data === "object" &&
  (data as { type?: unknown }).type === FRAME_READY_MESSAGE

/**
 * Serves the view contract to one plugin frame. The frame announces itself; it gets a
 * fresh MessagePort each time (a reload replaces the previous connection). Messages
 * are accepted only from this iframe's own window, whose origin is opaque.
 */
export function connectPluginFrame(options: {
  readonly iframe: HTMLIFrameElement
  readonly broker: Pick<ViewBroker, "handlers" | "guard">
}): () => void {
  let peer: Peer<EmptyContract> | null = null
  const receive = (event: MessageEvent) => {
    const frame = options.iframe.contentWindow
    if (!frame || event.source !== frame || !isReady(event.data)) return
    peer?.close("The plugin frame reloaded.")
    const channel = new MessageChannel()
    peer = createEndpoint({
      transport: messagePortTransport(channel.port1),
      serve: {
        contract: pluginViewContract,
        handlers: options.broker.handlers,
        guard: options.broker.guard,
      },
      log,
    })
    frame.postMessage({ type: FRAME_CONNECT_MESSAGE }, "*", [channel.port2])
  }
  window.addEventListener("message", receive)
  return () => {
    window.removeEventListener("message", receive)
    peer?.close("The plugin view closed.")
  }
}
