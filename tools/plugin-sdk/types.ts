import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

/*
 * Declarations for @openspindle/plugin-sdk, so plugins type-check against the SDK without
 * this repository's layout: the public entry points with the plugin core, the RPC
 * package, the UI kit's components and the app types they reach, emitted to
 * packages/plugin-sdk/types/. Specifiers that only resolve here (the app's "@/" alias,
 * the workspace packages and .ts extensions) become relative paths inside that folder;
 * everything else (React, TanStack Query, zod, Base UI and so on) stays a peer dependency.
 *
 *   node tools/plugin-sdk/types.ts
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const SDK = path.join(ROOT, "packages/plugin-sdk")
const OUT = path.join(SDK, "types")
const ENTRIES = ["index", "ui", "companion", "frame", "vite"]

/** Workspace packages resolve through node_modules links; declarations need their source. */
const WORKSPACE: Readonly<Record<string, string>> = {
  "@openspindle/plugin-core": "packages/plugin-core/src/index.ts",
  "@openspindle/rpc": "packages/rpc/src/index.ts",
  "@openspindle/rpc/message-port": "packages/rpc/src/message-port.ts",
  "@openspindle/rpc/ndjson": "packages/rpc/src/ndjson.ts",
}

const SPECIFIER =
  /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bdeclare\s+module\s+)"([^"]+)"/g
const LOCAL = /^(?:@\/|@openspindle\/)/

const toPosix = (file: string) => file.split(path.sep).join("/")
const withoutExtension = (file: string) => file.replace(/\.(?:d\.)?tsx?$/, "")

/** The declaration of a source file, as emitted below OUT. */
const declarationOf = (source: string) =>
  path.join(OUT, withoutExtension(path.relative(ROOT, source)))

function relativeTo(declaration: string, target: string): string {
  const relative = toPosix(path.relative(path.dirname(declaration), target))
  return relative.startsWith(".") ? relative : `./${relative}`
}

/** A module specifier as a plugin's compiler must see it from `declaration`. */
function rewrite(declaration: string, specifier: string): string {
  if (specifier.startsWith("@/"))
    return relativeTo(
      declaration,
      declarationOf(path.join(ROOT, "src", specifier.slice(2)))
    )
  if (Object.hasOwn(WORKSPACE, specifier))
    return relativeTo(
      declaration,
      declarationOf(path.join(ROOT, WORKSPACE[specifier]))
    )
  if (specifier.startsWith(".")) return withoutExtension(specifier)
  return specifier
}

/**
 * The declarations the entry points reach through their (rewritten) imports: the program
 * also emits files only implementations import, which plugins never see.
 */
function reachableFrom(
  entries: readonly string[],
  declarations: ReadonlyMap<string, string>
): Map<string, string> {
  const reachable = new Map<string, string>()
  const pending = [...entries]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const text = declarations.get(file)
    if (text === undefined)
      throw new Error(`${path.relative(ROOT, file)} was not emitted.`)
    if (reachable.has(file)) continue
    reachable.set(file, text)
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match[2]
      if (!specifier.startsWith(".")) continue
      const target = path.resolve(path.dirname(file), specifier)
      const candidates = [`${target}.d.ts`, path.join(target, "index.d.ts")]
      const found = candidates.find((candidate) => declarations.has(candidate))
      if (!found)
        throw new Error(
          `${path.relative(ROOT, file)} imports ${specifier}, which has no declaration.`
        )
      pending.push(found)
    }
  }
  return reachable
}

function report(diagnostics: readonly ts.Diagnostic[]) {
  if (!diagnostics.length) return
  console.warn(
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => "\n",
    })
  )
}

async function main() {
  const config = ts.parseJsonConfigFileContent(
    {
      extends: "./tsconfig.base.json",
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        rootDir: ".",
        outDir: toPosix(path.relative(ROOT, OUT)),
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        types: ["node", "vite/client"],
        noUnusedLocals: false,
        noUnusedParameters: false,
        paths: {
          "@/*": ["./src/*"],
          ...Object.fromEntries(
            Object.entries(WORKSPACE).map(([name, file]) => [
              name,
              [`./${file}`],
            ])
          ),
        },
      },
      files: ENTRIES.map((entry) => `./packages/plugin-sdk/src/${entry}.ts`),
    },
    ts.sys,
    ROOT
  )
  report(config.errors)
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
  })
  const declarations = new Map<string, string>()
  const result = program.emit(
    undefined,
    (file, text) => {
      declarations.set(
        file,
        text.replace(
          SPECIFIER,
          (_match, lead: string, specifier: string) =>
            `${lead}"${rewrite(file, specifier)}"`
        )
      )
    },
    undefined,
    true
  )
  report(result.diagnostics)
  const reachable = reachableFrom(
    ENTRIES.map((entry) =>
      path.join(OUT, "packages/plugin-sdk/src", `${entry}.d.ts`)
    ),
    declarations
  )
  const unresolved = [...reachable].flatMap(([file, text]) =>
    [...text.matchAll(SPECIFIER)]
      .map((match) => match[2])
      .filter((specifier) => LOCAL.test(specifier))
      .map((specifier) => `${path.relative(ROOT, file)}: ${specifier}`)
  )
  if (unresolved.length)
    throw new Error(
      `These declarations still name repository modules:\n${unresolved.join("\n")}`
    )
  await rm(OUT, { recursive: true, force: true })
  for (const [file, text] of reachable) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
  }
  console.log(
    `Wrote ${reachable.size} declaration files to ${path.relative(ROOT, OUT)}.`
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
