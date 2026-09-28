import { MessageChannelMain, ipcMain } from "electron"
import type { IpcMainEvent } from "electron"
import { createEndpoint } from "@openspindle/rpc"
import type { Handlers } from "@openspindle/rpc"
import {
  RPC_CONNECT_CHANNEL,
  RPC_PORT_CHANNEL,
} from "../../../src/platform/contract/channels"
import { hostContract } from "../../../src/platform/contract/host-contract"
import type { HostContract } from "../../../src/platform/contract/host-contract"
import { log } from "../diagnostics/log"
import { portMainTransport } from "./port-main-transport"

/**
 * Serves the host contract to trusted windows. Each page load asks for its own port;
 * every request is validated against the contract before a handler runs, and handler
 * failures that are not an RpcError are logged with their stack.
 */
export function serveHostConnections(options: {
  handlers: Handlers<HostContract>
  isTrusted: (event: IpcMainEvent) => boolean
}) {
  ipcMain.on(RPC_CONNECT_CHANNEL, (event) => {
    if (!options.isTrusted(event)) return
    const { port1, port2 } = new MessageChannelMain()
    createEndpoint({
      transport: portMainTransport(port1),
      serve: { contract: hostContract, handlers: options.handlers },
      log,
    })
    event.sender.postMessage(RPC_PORT_CHANNEL, null, [port2])
  })
}
