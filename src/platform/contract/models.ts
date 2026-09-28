import { z } from "zod"
import {
  MODEL_LIMITS,
  ModelIdSchema,
  ModelRecordSchema,
} from "../../domain/models/model.ts"
import { TextSchema } from "../../domain/primitives.ts"

/** Binary payloads cross the port as structured clones, never as base64 text. */
const bytes = (maxBytes: number) =>
  z
    .custom<Uint8Array>(
      (value) => value instanceof Uint8Array,
      "Expected bytes."
    )
    .refine(
      (value) => value.byteLength <= maxBytes,
      `At most ${maxBytes / 1024 / 1024} MB.`
    )

const IdParams = z.strictObject({ id: ModelIdSchema })

export const ModelAddSchema = z.strictObject({
  record: ModelRecordSchema,
  mesh: bytes(MODEL_LIMITS.meshBytes),
  source: bytes(MODEL_LIMITS.sourceBytes).nullable(),
})

/** The Models library served by the desktop main process. */
export const modelMethods = {
  "models.list": {
    params: z.undefined(),
    result: z.array(ModelRecordSchema).max(MODEL_LIMITS.models),
    timeoutMs: 60_000,
  },
  "models.mesh": {
    params: IdParams,
    result: bytes(MODEL_LIMITS.meshBytes).nullable(),
    timeoutMs: 60_000,
  },
  "models.source": {
    params: IdParams,
    result: bytes(MODEL_LIMITS.sourceBytes).nullable(),
    timeoutMs: 60_000,
  },
  "models.add": {
    params: ModelAddSchema,
    result: ModelRecordSchema,
    timeoutMs: 120_000,
  },
  "models.rename": {
    params: z.strictObject({ id: ModelIdSchema, name: TextSchema }),
    result: ModelRecordSchema,
    timeoutMs: 60_000,
  },
  "models.remove": {
    params: IdParams,
    result: z.void(),
    timeoutMs: 60_000,
  },
} as const
