import path from "node:path"
import type { Plugin, UserConfig } from "vite"
import { FRAME_GLOBAL, FRAME_MODULES } from "./frame.ts"

/**
 * React libraries mark modules "use client"; a bundle for the frame has no server
 * components, so the directive is meaningless and its warnings are noise.
 */
export function quietDirectives(): Plugin {
  return {
    name: "openspindle:quiet-directives",
    onLog: (_level, log) =>
      log.code === "MODULE_LEVEL_DIRECTIVE" ? false : undefined,
  }
}

/**
 * The frame runs React's production build, so its runtime and every plugin view compile
 * for it: production `process.env.NODE_ENV` and production JSX. Vite otherwise takes the
 * JSX mode from the NODE_ENV of the process it runs in, and a build started by a dev
 * server calls `jsxDEV`, which production React does not export.
 */
export function frameReact(): Plugin {
  return {
    name: "openspindle:frame-react",
    config: (): UserConfig => ({
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      oxc: {
        jsx: {
          runtime: "automatic",
          importSource: "react",
          development: false,
        },
      },
    }),
  }
}

/** The IIFE's result variable; the ESM wrapper re-exports its default. */
const BUNDLE_GLOBAL = "__openSpindlePlugin"

export type PluginViewBuild = {
  /** Source module whose default export is `definePlugin(...)`. */
  readonly entry: string
  /** The manifest's `ui.entry`, relative to the plugin root. */
  readonly outFile: string
  /** The manifest's `ui.styles`, when the views import CSS; next to `outFile`. */
  readonly stylesFile?: string
}

/**
 * Builds a plugin's views as one ES module that takes React, the SDK, the UI kit and
 * TanStack Query from the frame runtime's global instead of bundling them.
 */
export function openSpindleView(options: PluginViewBuild): Plugin[] {
  const outDir = path.dirname(options.outFile)
  if (options.stylesFile && path.dirname(options.stylesFile) !== outDir)
    throw new Error("ui.styles must be in the same folder as ui.entry.")
  const globals = Object.fromEntries(
    Object.entries(FRAME_MODULES).map(([id, key]) => [
      id,
      `${FRAME_GLOBAL}.${key}`,
    ])
  )
  const view: Plugin = {
    name: "openspindle:plugin-view",
    config: (): UserConfig => ({
      publicDir: false,
      build: {
        outDir,
        emptyOutDir: false,
        minify: true,
        lib: {
          entry: options.entry,
          formats: ["iife"],
          name: BUNDLE_GLOBAL,
          fileName: () => path.basename(options.outFile),
          ...(options.stylesFile
            ? { cssFileName: path.basename(options.stylesFile, ".css") }
            : {}),
        },
        rolldownOptions: {
          external: Object.keys(FRAME_MODULES),
          output: { globals, exports: "named", codeSplitting: false },
        },
      },
    }),
    // After minification: the frame imports the bundle as a module and reads its default.
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle))
        if (output.type === "chunk" && output.isEntry)
          output.code += `\nexport default ${BUNDLE_GLOBAL}.default;\n`
    },
  }
  return [view, frameReact(), quietDirectives()]
}

export type PluginCompanionBuild = {
  /** Source module that calls `serveCompanion(...)`. */
  readonly entry: string
  /** The manifest's `companion.entry`: `.mjs` builds an ES module, `.js`/`.cjs` CommonJS. */
  readonly outFile: string
}

/** Bundles a Node companion, dependencies included, into the one file the app starts. */
export function openSpindleCompanion(options: PluginCompanionBuild): Plugin[] {
  const companion: Plugin = {
    name: "openspindle:plugin-companion",
    config: (): UserConfig => ({
      publicDir: false,
      ssr: { noExternal: true, target: "node" },
      build: {
        ssr: options.entry,
        outDir: path.dirname(options.outFile),
        emptyOutDir: false,
        minify: false,
        target: "node22",
        rolldownOptions: {
          output: {
            format: options.outFile.endsWith(".mjs") ? "es" : "cjs",
            entryFileNames: path.basename(options.outFile),
            codeSplitting: false,
          },
        },
      },
    }),
  }
  return [companion, quietDirectives()]
}
