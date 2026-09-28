import type { Plugin } from "vite"
import { APPEARANCE_INIT_SCRIPT } from "../../src/lib/appearance.ts"

const FILE_NAME = "appearance-init.js"

/**
 * Serves the pre-paint appearance script as a same-origin file, so the page's
 * Content-Security-Policy needs no inline-script hash and the script keeps one source.
 */
export function appearanceInit(): Plugin {
  return {
    name: "openspindle:appearance-init",
    configureServer(server) {
      server.middlewares.use(`/${FILE_NAME}`, (_request, response) => {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8")
        response.end(APPEARANCE_INIT_SCRIPT)
      })
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: FILE_NAME,
        source: APPEARANCE_INIT_SCRIPT,
      })
    },
    transformIndexHtml: () => [
      { tag: "script", attrs: { src: `/${FILE_NAME}` }, injectTo: "head" },
    ],
  }
}
