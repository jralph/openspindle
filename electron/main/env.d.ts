/** Build-time values electron-vite puts in the main process's bundle (electron.vite.config.ts). */
interface ImportMetaEnv {
  /** Where error reports go; builds without one report nothing and only log errors. */
  readonly SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
