/**
 * The plugin platform's host-agnostic core. Hosts (Electron main, the renderer, the SDK
 * CLI) inject fetch, hashing and file access; nothing here touches the DOM or Node.
 */
export * from "./capabilities.ts"
export * from "./contracts.ts"
export * from "./dto.ts"
export * from "./errors.ts"
export * from "./installer/github.ts"
export * from "./installer/hash.ts"
export * from "./installer/package.ts"
export * from "./installer/record.ts"
export * from "./installer/source.ts"
export * from "./manifest.ts"
export { isPackagePath } from "./paths.ts"
export * from "./templates.ts"
export { Sha256Schema, decodeUtf8, parseJson, pluginTextBytes } from "./text.ts"
