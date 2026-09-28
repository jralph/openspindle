import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { frameReact, quietDirectives } from "@openspindle/plugin-sdk/vite"
import tailwindcss from "@tailwindcss/vite"
import { build } from "vite"
import type { AliasOptions, InlineConfig, Plugin } from "vite"
import {
  PLUGIN_FRAME_CSP,
  PLUGIN_FRAME_CSP_HEADER,
  PLUGIN_FRAME_DIRECTORY,
} from "../../src/plugin-runtime/frame-policy.ts"
import { thirdPartyNotices } from "./third-party.ts"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const RUNTIME = path.join(ROOT, "src/plugin-runtime")
const RUNTIME_GLOBAL = "OpenSpindleFrameRuntime"

const FILES: Readonly<Record<string, string>> = {
  "index.html": "text/html; charset=utf-8",
  "runtime.js": "text/javascript; charset=utf-8",
  "runtime.css": "text/css; charset=utf-8",
}

/** Emits the frame document with its policy filled in. */
function frameDocument(): Plugin {
  return {
    name: "openspindle:plugin-frame-document",
    async generateBundle() {
      const template = await readFile(path.join(RUNTIME, "index.html"), "utf8")
      this.emitFile({
        type: "asset",
        fileName: "index.html",
        source: template.replace("%PLUGIN_FRAME_CSP%", PLUGIN_FRAME_CSP),
      })
    },
  }
}

/**
 * The dedicated plugin-frame build: its own document, one classic script exposing the
 * shared modules, and one stylesheet with fonts inlined (the frame loads nothing else).
 */
export function pluginFrameConfig(options: {
  readonly outDir: string
  readonly alias: AliasOptions
  readonly watch?: boolean
}): InlineConfig {
  return {
    configFile: false,
    root: ROOT,
    publicDir: false,
    logLevel: "warn",
    resolve: { alias: options.alias },
    plugins: [
      tailwindcss(),
      frameDocument(),
      frameReact(),
      quietDirectives(),
      thirdPartyNotices("frame"),
    ],
    build: {
      outDir: options.outDir,
      emptyOutDir: true,
      minify: true,
      assetsInlineLimit: () => true,
      lib: {
        entry: path.join(RUNTIME, "main.tsx"),
        formats: ["iife"],
        name: RUNTIME_GLOBAL,
        fileName: () => "runtime.js",
        cssFileName: "runtime",
      },
      rolldownOptions: { output: { codeSplitting: false } },
      watch: options.watch ? {} : null,
    },
  }
}

/**
 * Builds the plugin frame into `<renderer output>/plugin-frame/` after every renderer
 * build, and serves a watched build of it during development.
 */
export function pluginFrame(options: { readonly alias: AliasOptions }): Plugin {
  let outDir = ""
  return {
    name: "openspindle:plugin-frame",
    configResolved(config) {
      outDir = path.resolve(
        config.root,
        config.build.outDir,
        PLUGIN_FRAME_DIRECTORY
      )
    },
    async closeBundle() {
      await build(pluginFrameConfig({ outDir, alias: options.alias }))
    },
    configureServer(server) {
      const cache = path.join(server.config.cacheDir, PLUGIN_FRAME_DIRECTORY)
      const watcher = build(
        pluginFrameConfig({ outDir: cache, alias: options.alias, watch: true })
      )
      watcher.catch((error: unknown) => {
        server.config.logger.error(
          `Plugin frame build failed: ${String(error)}`
        )
      })
      server.httpServer?.once("close", () => {
        void watcher.then(
          (result) => {
            if ("close" in result) void result.close()
          },
          () => undefined
        )
      })
      server.middlewares.use(
        `/${PLUGIN_FRAME_DIRECTORY}`,
        (request, response, next) => {
          const name = (request.url ?? "").split("?")[0].replace(/^\//, "")
          const type = Object.hasOwn(FILES, name) ? FILES[name] : undefined
          if (!type) {
            next()
            return
          }
          readFile(path.join(cache, name)).then(
            (contents) => {
              response.setHeader("Content-Type", type)
              response.setHeader("Cache-Control", "no-cache")
              if (name === "index.html")
                response.setHeader(
                  "Content-Security-Policy",
                  PLUGIN_FRAME_CSP_HEADER
                )
              response.end(contents)
            },
            () => {
              response.statusCode = 503
              response.end("The plugin frame is still building.")
            }
          )
        }
      )
    },
  }
}
