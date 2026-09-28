import { z } from "zod"
import { PluginDownloadError, PluginError, fail } from "../errors.ts"
import { isPackagePath } from "../paths.ts"
import { decodeUtf8, issueMessage, parseJson, textSchema } from "../text.ts"
import type { PackageReader } from "./source.ts"

export interface GitHubRepository {
  owner: string
  repo: string
  ref: string | null
  repository: string
}

/** Public HTTPS github.com repositories, optionally at /tree/<branch-or-tag>. */
export function parseGitHubRepository(input: unknown): GitHubRepository {
  if (typeof input !== "string" || input.length > 500)
    fail("Enter a public GitHub repository URL.")
  if (
    /\s/.test(input.trim()) ||
    input.split("/").some((part) => part === "." || part === "..")
  )
    fail("Repository URLs cannot contain whitespace or traversal segments.")
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return fail("Enter a public HTTPS GitHub repository URL.")
  }
  if (
    url.protocol !== "https:" ||
    // Not every URL implementation lowercases the host or drops the default port.
    url.hostname.toLowerCase() !== "github.com" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[%\\]/.test(input)
  )
    fail(
      "Only HTTPS github.com repository URLs without credentials, queries, or fragments are supported."
    )
  const parts = url.pathname.replace(/\/$/, "").split("/").slice(1)
  const owner = parts[0] ?? ""
  const repo = (parts[1] ?? "").replace(/\.git$/, "")
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner) ||
    !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,99}$/.test(repo) ||
    repo.endsWith(".")
  )
    fail("Invalid GitHub owner or repository name.")
  let ref: string | null = null
  if (parts.length > 2) {
    ref = parts.slice(3).join("/")
    if (
      parts[2] !== "tree" ||
      !ref ||
      ref.length > 200 ||
      !/^[a-zA-Z0-9_./-]+$/.test(ref) ||
      ref
        .split("/")
        .some(
          (part) =>
            !part ||
            part.startsWith(".") ||
            part.endsWith(".") ||
            part.endsWith(".lock")
        ) ||
      ref.includes("..")
    )
      fail("Use a repository URL or /tree/branch-or-tag URL.")
  }
  return { owner, repo, ref, repository: `https://github.com/${owner}/${repo}` }
}

/** The installer creates every URL; this additional boundary prevents adapter misuse. */
export function isPluginResourceURL(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[%\\]/.test(url.host)
  )
    return false
  if (url.hostname === "api.github.com")
    return /^\/repos\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+(?:\/commits\/[^/]+)?$/.test(
      url.pathname
    )
  return (
    url.hostname === "raw.githubusercontent.com" &&
    /^\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\/[a-f0-9]{40}\/[a-zA-Z0-9_.+/-]+$/.test(
      url.pathname
    ) &&
    !url.pathname.split("/").some((part) => part === "." || part === "..")
  )
}

export type PluginFetch = (
  input: string,
  init: RequestInit
) => Promise<Response>

/** Reads one pinned resource; adapters enforce HTTPS, byte limits, no redirects and timeouts. */
export type PluginByteReader = (
  url: string,
  maxBytes: number,
  accept: string
) => Promise<Uint8Array>
export type PluginTextReader = (
  url: string,
  maxBytes: number,
  accept: string
) => Promise<string>

export type PluginReaderOptions = {
  readonly signal?: AbortSignal
  /** Extra request headers, such as the host's User-Agent. */
  readonly headers?: Record<string, string>
  /** The largest single resource this reader will fetch. */
  readonly maxResourceBytes?: number
  readonly requestTimeoutMs?: number
}

const DEFAULT_MAX_RESOURCE_BYTES = 256 * 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

async function readLimited(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    void response.body?.cancel()
    throw new PluginDownloadError(
      "Downloaded plugin data exceeds its size limit."
    )
  }
  if (!response.body)
    throw new PluginDownloadError("GitHub returned an empty response.")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.length
      if (length > maxBytes) {
        await reader.cancel()
        throw new PluginDownloadError(
          "Downloaded plugin data exceeds its size limit."
        )
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** Size-limited, pinned-URL byte reader with a per-request deadline. */
export function createPluginByteReader(
  fetcher: PluginFetch,
  options: PluginReaderOptions = {}
): PluginByteReader {
  const {
    signal: overallSignal,
    headers = {},
    maxResourceBytes = DEFAULT_MAX_RESOURCE_BYTES,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options
  return async (url, maxBytes, accept) => {
    if (
      !isPluginResourceURL(url) ||
      !Number.isInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > maxResourceBytes
    )
      throw new PluginError("Invalid plugin download resource.")
    const controller = new AbortController()
    const cancel = () => controller.abort()
    overallSignal?.addEventListener("abort", cancel, { once: true })
    if (overallSignal?.aborted) controller.abort()
    const timer = setTimeout(cancel, requestTimeoutMs)
    try {
      const response = await fetcher(url, {
        headers: { ...headers, Accept: accept },
        redirect: "error",
        credentials: "omit",
        signal: controller.signal,
      })
      if (!response.ok) {
        void response.body?.cancel()
        if (response.status === 404)
          throw new PluginDownloadError(
            "Public repository, reference, manifest, or program file was not found. Private repositories are not supported."
          )
        if (response.status === 403 || response.status === 429)
          throw new PluginDownloadError(
            "GitHub denied the download or its public API limit was reached. Try again later."
          )
        throw new PluginDownloadError(
          `GitHub download failed (HTTP ${response.status}).`
        )
      }
      return await readLimited(response, maxBytes)
    } catch (error) {
      if (error instanceof PluginError) throw error
      throw new PluginDownloadError(
        controller.signal.aborted
          ? "Plugin download timed out. Try again."
          : "Could not download this public GitHub plugin. Check your connection and repository URL."
      )
    } finally {
      clearTimeout(timer)
      overallSignal?.removeEventListener("abort", cancel)
    }
  }
}

/** The byte reader for UTF-8 text resources (manifests, templates, API responses). */
export function createPluginTextReader(
  fetcher: PluginFetch,
  options: PluginReaderOptions = {}
): PluginTextReader {
  const read = createPluginByteReader(fetcher, options)
  return async (url, maxBytes, accept) =>
    decodeUtf8(await read(url, maxBytes, accept), "Downloaded plugin files")
}

const API_RESPONSE_BYTES = 64 * 1024

const RepositoryMetadataSchema = z.object({
  private: z.literal(false, {
    error: "Only public GitHub repositories are supported.",
  }),
  default_branch: textSchema("Default branch", 200),
})

export type PinnedRepository = GitHubRepository & {
  readonly commit: string
  /** raw.githubusercontent.com base for files at the pinned commit. */
  readonly raw: string
}

/** Resolves the requested (or default) branch or tag to one immutable commit. */
export async function resolvePinnedRepository(
  repository: string,
  readText: PluginTextReader
): Promise<PinnedRepository> {
  const target = parseGitHubRepository(repository)
  const api = `https://api.github.com/repos/${target.owner}/${target.repo}`
  const metadata = RepositoryMetadataSchema.safeParse(
    parseJson(
      await readText(api, API_RESPONSE_BYTES, "application/vnd.github+json"),
      "GitHub's repository information"
    )
  )
  if (!metadata.success) fail(issueMessage(metadata.error))
  const ref = target.ref ?? metadata.data.default_branch
  const commit = (
    await readText(
      `${api}/commits/${encodeURIComponent(ref)}`,
      128,
      "application/vnd.github.sha"
    )
  )
    .trim()
    .toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(commit))
    fail("GitHub did not return a valid immutable commit.")
  return {
    ...target,
    commit,
    raw: `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${commit}`,
  }
}

export const GITHUB_PACKAGE_LIMITS = {
  files: 64,
  fileBytes: 4 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
} as const

/** A plugin package read from a public repository at one pinned commit. */
export async function openGitHubSource(
  repository: string,
  fetcher: PluginFetch,
  options: Omit<PluginReaderOptions, "maxResourceBytes"> = {}
): Promise<PackageReader> {
  const readerOptions = {
    requestTimeoutMs: 30_000,
    ...options,
    maxResourceBytes: GITHUB_PACKAGE_LIMITS.fileBytes,
  }
  const pinned = await resolvePinnedRepository(
    repository,
    createPluginTextReader(fetcher, readerOptions)
  )
  const readBytes = createPluginByteReader(fetcher, readerOptions)
  return {
    origin: {
      kind: "github",
      repository: pinned.repository,
      commit: pinned.commit,
    },
    limits: GITHUB_PACKAGE_LIMITS,
    readFile: (path, maxBytes) => {
      if (!isPackagePath(path)) fail(`${path} is not a valid package path.`)
      return readBytes(`${pinned.raw}/${path}`, maxBytes, "*/*")
    },
  }
}
