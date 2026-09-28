/** Renderer → main: request a fresh RPC port for this page. */
export const RPC_CONNECT_CHANNEL = "openspindle:rpc-connect"
/** Main → preload: carries the RPC port. */
export const RPC_PORT_CHANNEL = "openspindle:rpc-port"
/** Preload → page (window message type) that hands the port to the main world. */
export const RPC_PORT_MESSAGE = "openspindle:rpc-port"

/** The packaged renderer's origin. */
export const APP_SCHEME = "app"
export const APP_HOST = "openspindle"
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
