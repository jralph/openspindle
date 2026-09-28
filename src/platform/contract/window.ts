import { z } from "zod"

/** The longest workspace a page keeps for the next one, in UTF-16 code units. */
export const KEPT_WORKSPACE_MAX_LENGTH = 256 * 1024 * 1024

/** The app window, served by the desktop main process. */
export const windowMethods = {
  /** Whether the project has unsaved changes, and its name: closing asks before losing them. */
  "window.setEdited": {
    params: z.strictObject({
      edited: z.boolean(),
      name: z.string().max(200),
    }),
    result: z.void(),
    timeoutMs: 10_000,
  },
  /** Closes the window without asking again: its changes were saved. */
  "window.close": {
    params: z.undefined(),
    result: z.void(),
    timeoutMs: 10_000,
  },
  /**
   * Keeps the workspace (JSON) for the page that replaces this one when the window reloads;
   * null keeps none. Only memory holds it, so a new launch starts with a new project.
   */
  "window.keepWorkspace": {
    params: z.strictObject({
      workspace: z.string().max(KEPT_WORKSPACE_MAX_LENGTH).nullable(),
    }),
    result: z.void(),
    timeoutMs: 60_000,
  },
  /** The workspace the window's previous page kept, if any. */
  "window.keptWorkspace": {
    params: z.undefined(),
    result: z.string().nullable(),
    timeoutMs: 60_000,
  },
} as const
