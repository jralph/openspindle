import { parseGitHubRepository } from "@openspindle/plugin-core"
import { z } from "zod"
import { TextSchema } from "../primitives"

/** A canonical https://github.com/owner/repository URL, as installation provenance records it. */
function isCanonicalRepository(url: string): boolean {
  try {
    const parsed = parseGitHubRepository(url)
    return parsed.ref === null && parsed.repository === url
  } catch {
    return false
  }
}

/** Where a referenced plugin comes from, so a missing one can be installed again. */
export const PluginSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("github"),
    repository: z
      .string()
      .max(500)
      .refine(
        isCanonicalRepository,
        "Use a canonical https://github.com/owner/repository URL."
      ),
    /** The immutable commit it was installed from. */
    commit: z.string().regex(/^[a-f0-9]{40}$/, "Use a full commit hash."),
  }),
  /** Loaded from a local folder; it cannot be installed automatically. */
  z.strictObject({ kind: z.literal("folder") }),
])
export type PluginSource = z.infer<typeof PluginSourceSchema>

/** What a project records about a plugin its operations use, instead of the plugin itself. */
export const PluginReferenceSchema = z.strictObject({
  /** The id operations name in their source. */
  id: TextSchema,
  name: TextSchema,
  /** The installed version when the project was saved. */
  version: TextSchema,
  source: PluginSourceSchema,
})
export type PluginReference = z.infer<typeof PluginReferenceSchema>
