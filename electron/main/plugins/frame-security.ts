import type { BrowserWindow, Session, WebContents } from "electron"
import { PLUGIN_FRAME_PATH } from "../../../src/plugin-runtime/frame-policy"

/**
 * Permission requests and checks: the app document keeps its allow-list, while every
 * subframe (plugin views are the only subframes) is refused everything.
 */
export function applyPermissionPolicy(
  target: Session,
  allowed: ReadonlySet<string>
) {
  target.setPermissionRequestHandler(
    (_contents, permission, callback, details) =>
      callback(details.isMainFrame && allowed.has(permission))
  )
  target.setPermissionCheckHandler(
    (_contents, permission, _origin, details) =>
      details.isMainFrame && allowed.has(permission)
  )
}

/**
 * Locks plugin frames inside the app window: a subframe may only ever show the plugin
 * frame document, and may only load app assets or in-memory (blob:, data:) content.
 * Node integration in subframes stays off in the window's webPreferences.
 */
export function lockPluginFrames(window: BrowserWindow, appOrigin: string) {
  const frameUrl = `${appOrigin}${PLUGIN_FRAME_PATH}`
  const appAssets = `${appOrigin}/`
  const contents = window.webContents
  contents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame && event.url !== frameUrl) event.preventDefault()
  })
  contents.session.webRequest.onBeforeRequest((details, callback) => {
    const frame = details.frame
    const fromSubframe =
      details.webContentsId === contents.id && !!frame && frame.parent !== null
    const allowed =
      !fromSubframe ||
      details.url.startsWith(appAssets) ||
      details.url.startsWith("blob:") ||
      details.url.startsWith("data:")
    callback({ cancel: !allowed })
  })
  blockWebRtc(contents)
}

/**
 * Content-Security-Policy's `connect-src` does not reach `RTCPeerConnection`. The frame
 * runtime removes it before any plugin code runs; as a second line, WebRTC's use is cut to
 * Electron's tightest documented settings for the whole window, as plugin frames are
 * `<iframe>`s of this one webContents (not a separate session) and the app itself never uses
 * WebRTC: no local or public IP is exposed, non-proxied UDP is refused, and the UDP port
 * range is pinned to one unusable port. That stops direct peer-to-peer and STUN connections;
 * it does not stop a relay reachable over TCP, such as TURN over TLS on port 443, which
 * Electron has no supported way to refuse.
 */
function blockWebRtc(contents: WebContents) {
  contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp")
  contents.setWebRTCUDPPortRange({ min: 1, max: 1 })
}
