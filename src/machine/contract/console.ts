import { z } from "zod"

/** Quiet: an acknowledgement; failure: an error, alarm, halt or refusal the machine reported. */
export const ConsoleToneSchema = z.enum(["plain", "quiet", "failure"])
export type ConsoleTone = z.infer<typeof ConsoleToneSchema>

/**
 * One line of the machine console: a command the app sent, a reply the machine sent back, or
 * the app's note (connecting, Stop, a job's phase). Status polling and transfer blocks are
 * left out; the protocol trace keeps them.
 */
export const ConsoleEntrySchema = z.object({
  /** Increases by one per entry, across connections. */
  sequence: z.int().nonnegative(),
  at: z.number(),
  direction: z.enum(["sent", "received", "note"]),
  text: z.string(),
  tone: ConsoleToneSchema,
})
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>
