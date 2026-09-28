import { contextBridge, ipcRenderer } from "electron"
import "@sentry/electron/preload"
import {
  RPC_CONNECT_CHANNEL,
  RPC_PORT_CHANNEL,
  RPC_PORT_MESSAGE,
} from "../../src/platform/contract/channels"

// The preload holds no feature code: it hands the page one RPC port to the main process and,
// by the import above, Sentry's bridge, which carries the page's error reports to Sentry there.
ipcRenderer.on(RPC_PORT_CHANNEL, (event) => {
  if (event.ports.length === 1)
    window.postMessage(
      { type: RPC_PORT_MESSAGE },
      window.location.origin,
      event.ports
    )
})

contextBridge.exposeInMainWorld("openSpindleBridge", {
  connect: () => ipcRenderer.send(RPC_CONNECT_CHANNEL),
})
