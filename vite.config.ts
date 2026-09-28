import { defineConfig } from "vite"

/**
 * Not a build: the app builds with electron-vite (electron.vite.config.ts) and has no browser
 * version. The shadcn CLI recognises a Vite project by this file; without it, `shadcn apply`
 * and `shadcn init` stop with "could not detect a supported framework".
 */
export default defineConfig({})
