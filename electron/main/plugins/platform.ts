import path from "node:path"
import { dialog } from "electron"
import type { BrowserWindow, OpenDialogOptions } from "electron"
import { RpcError } from "@openspindle/rpc"
import {
  PROCESS_PLUGIN_LIMITS,
  isMachineCapability,
  renderProgram,
} from "@openspindle/plugin-core"
import type {
  InstalledPluginRecord,
  PluginFetch,
  ProcessParameterValues,
} from "@openspindle/plugin-core"
import { nodePlatform } from "@openspindle/plugin-sdk/node"
import type { MachineController } from "../../../src/machine/core/controller.ts"
import { MachineGateway } from "../../../src/machine/core/gateway.ts"
import { pluginSummary } from "../../../src/platform/contract/plugin-rpc"
import type {
  PluginBundle,
  PluginSummary,
} from "../../../src/platform/contract/plugin-rpc"
import { CompanionManager } from "./companions"
import { PluginInstaller } from "./installer"
import { PluginRegistry } from "./registry"

const VIEW_BUNDLE_BYTES = 4 * 1024 * 1024
const VIEW_STYLES_BYTES = 1024 * 1024

export type PluginPlatformOptions = {
  readonly userData: string
  readonly temp: string
  readonly machine: MachineController
  readonly window: () => BrowserWindow | null
  readonly fetch: PluginFetch
}

/**
 * The desktop plugin platform: installed packages, the install pipeline and companion
 * processes. Every plugin-scoped request is checked against the plugin's record here.
 */
export class PluginPlatform {
  readonly registry: PluginRegistry
  readonly installer: PluginInstaller
  readonly companions: CompanionManager | null
  private readonly listeners = new Set<() => void>()
  private folderDialog = false

  constructor(private readonly options: PluginPlatformOptions) {
    const platform = nodePlatform()
    this.registry = new PluginRegistry(path.join(options.userData, "plugins"))
    this.installer = new PluginInstaller({
      registry: this.registry,
      fetch: options.fetch,
      chooseFolder: () => this.chooseFolder(),
      // The running companion must not outlive the files it was started from.
      beforeCommit: (pluginId) =>
        this.companions?.stop(pluginId, "Stopped for an update.") ??
        Promise.resolve(),
      platform,
    })
    this.companions = platform
      ? new CompanionManager({
          registry: this.registry,
          platform,
          dataRoot: path.join(options.userData, "plugin-data"),
          tmpRoot: path.join(options.temp, "openspindle-plugins"),
          gateway: (record) => this.gateway(record),
          onStatus: () => this.changed(),
        })
      : null
    this.registry.subscribe(() => this.changed())
  }

  get ready(): Promise<void> {
    return this.registry.ready
  }

  /** A plugin's machine principal: its own grants, re-checked by the gateway. */
  gateway(record: InstalledPluginRecord): MachineGateway {
    return new MachineGateway(this.options.machine, {
      kind: "plugin",
      pluginId: record.id,
      grants: new Set(record.grants.filter(isMachineCapability)),
    })
  }

  requireCompanions(): CompanionManager {
    if (!this.companions)
      throw new RpcError(
        "UNAVAILABLE",
        "Plugin companions are not supported on this computer."
      )
    return this.companions
  }

  summaries(): PluginSummary[] {
    return this.registry
      .list()
      .map((record) =>
        pluginSummary(record, this.companions?.statusOf(record) ?? null)
      )
  }

  summary(pluginId: string): PluginSummary {
    const summary = this.summaries().find((item) => item.id === pluginId)
    if (!summary)
      throw new RpcError("NOT_FOUND", "This plugin is not installed.")
    return summary
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async confirmInstall(reviewId: string): Promise<PluginSummary> {
    await this.ready
    const record = await this.installer.confirm(reviewId)
    return this.summary(record.id)
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginSummary> {
    await this.ready
    // Locked for the whole sequence: a start beginning between the stop and the record
    // actually flipping to disabled would otherwise bring the companion right back.
    if (!enabled)
      await this.registry.withLock(pluginId, async () => {
        await this.companions?.stop(pluginId, "Stopped: disabled.")
        await this.registry.setEnabled(pluginId, enabled)
      })
    else await this.registry.setEnabled(pluginId, enabled)
    return this.summary(pluginId)
  }

  async remove(pluginId: string): Promise<void> {
    await this.ready
    this.registry.require(pluginId)
    // See setEnabled: locked so a start cannot land between forgetting the companion and
    // the record actually being removed.
    await this.registry.withLock(pluginId, async () => {
      await this.companions?.forget(pluginId)
      await this.registry.remove(pluginId)
    })
  }

  /** The view bundle a frame receives as text, verified against the inventory. */
  async readBundle(pluginId: string): Promise<PluginBundle> {
    await this.ready
    const record = this.registry.requireEnabled(pluginId)
    const ui = record.manifest.ui
    if (!ui)
      throw new RpcError("NOT_FOUND", `${record.manifest.name} has no views.`)
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
    const script = decode(
      await this.registry.readVerified(record, ui.entry, VIEW_BUNDLE_BYTES)
    )
    const styles = ui.styles
      ? decode(
          await this.registry.readVerified(record, ui.styles, VIEW_STYLES_BYTES)
        )
      : null
    return {
      plugin: {
        id: record.id,
        name: record.manifest.name,
        version: record.version,
        grants: record.grants,
        companion: !!record.manifest.companion,
      },
      views: ui.views,
      script,
      styles,
    }
  }

  /** Generates a template program from the installed, verified template file. */
  async renderProgram(
    pluginId: string,
    programId: string,
    values: ProcessParameterValues
  ): Promise<{ name: string; source: string }> {
    await this.ready
    const record = this.registry.requireEnabled(pluginId)
    const program = record.manifest.programs.find(
      (item) => item.id === programId
    )
    if (!program)
      throw new RpcError("NOT_FOUND", "This plugin has no such program.")
    const template = new TextDecoder().decode(
      await this.registry.readVerified(
        record,
        program.file,
        PROCESS_PLUGIN_LIMITS.sourceBytes
      )
    )
    return renderProgram(program, template, values)
  }

  /** Stops companions synchronously; the app is quitting. */
  dispose() {
    this.companions?.killAll()
    void this.installer.dispose()
  }

  private changed() {
    for (const listener of this.listeners) listener()
  }

  private async chooseFolder(): Promise<string | null> {
    if (this.folderDialog)
      throw new RpcError("BUSY", "A folder dialog is already open.")
    this.folderDialog = true
    try {
      const options: OpenDialogOptions = {
        title: "Choose a plugin folder (development)",
        buttonLabel: "Install",
        properties: ["openDirectory"],
      }
      const window = this.options.window()
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths.at(0) ?? null)
    } finally {
      this.folderDialog = false
    }
  }
}
