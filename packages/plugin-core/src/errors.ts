/** A plugin manifest, package or template is invalid; the message is shown to the user as-is. */
export class PluginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PluginError"
  }
}

/** A plugin download failed for a network or repository reason; retrying may help. */
export class PluginDownloadError extends PluginError {
  constructor(message: string) {
    super(message)
    this.name = "PluginDownloadError"
  }
}

export function fail(message: string): never {
  throw new PluginError(message)
}
