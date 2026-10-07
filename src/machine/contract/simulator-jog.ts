import { z } from "zod"

export const DIRECT_INPUT_TTL_MS = 150
export const DIRECT_SAMPLE_MS = 50
// Cross-process wall clocks can straddle a millisecond. Clamp small skew; never add it to TTL.
export const DIRECT_CLOCK_SKEW_MS = 5
export const SimulatedJogSessionSchema = z.strictObject({
  connectionId: z.string().uuid(),
  sessionId: z.string().uuid(),
})
export const BeginSimulatedJogRequestSchema = z.strictObject({
  connectionId: z.string().uuid(),
})
export const SimulatedJogSampleSchema = SimulatedJogSessionSchema.extend({
  sequence: z.int().positive().safe(),
  capturedAt: z.int().nonnegative().safe(),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  speedScale: z.number().min(0.05).max(0.25),
}).refine(
  (sample) => Math.hypot(sample.x, sample.y) <= 1.000001,
  "XY vector exceeds full deflection"
)
export const SimulatedJogReceiptSchema = z.strictObject({
  sessionId: z.string().uuid(),
  sequence: z.int().nonnegative().safe(),
})
export type BeginSimulatedJogRequest = z.infer<
  typeof BeginSimulatedJogRequestSchema
>
export type SimulatedJogSession = z.infer<typeof SimulatedJogSessionSchema>
export type SimulatedJogSample = z.infer<typeof SimulatedJogSampleSchema>
export type SimulatedJogReceipt = z.infer<typeof SimulatedJogReceiptSchema>
