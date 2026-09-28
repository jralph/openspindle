/**
 * The workspace the window's page kept as it went away, for the page a reload brings (⌘R, or
 * the dev server's after a code change). It stays until a page keeps another, so reloads in
 * quick succession all find it. Only memory holds it: a new launch starts with a new project,
 * and so does the reload after a crash, as the crashed page kept nothing newer.
 */
export class KeptWorkspace {
  private workspace: string | null = null

  keep(workspace: string | null) {
    this.workspace = workspace
  }

  kept(): string | null {
    return this.workspace
  }

  forget() {
    this.workspace = null
  }
}
