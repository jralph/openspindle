import { RpcError } from "@openspindle/rpc"
import type { Guard, Handlers, ParamsOut } from "@openspindle/rpc"
import {
  createCapabilityGuard,
  heldRequirements,
  operationRevision,
  webCryptoSha256,
} from "@openspindle/plugin-core"
import type {
  CompanionEmit,
  CompanionStatus,
  Operation,
  PluginIdentity,
  PluginViewContract,
  Tool,
  ToolChoice,
  ViewContext,
  ViewDeclaration,
  WorkspaceSummary,
} from "@openspindle/plugin-core"
import type { PluginBundle } from "@/platform/contract/plugin-rpc"
import type { PluginServicesPort } from "@/platform/host"

/*
 * The broker is the Mediator between plugin frames and the app: a frame only ever talks
 * to its broker, which checks the plugin's grants and routes each request to the
 * workspace (implemented by the app) or to the main process (the plugin's principal).
 */

type Params<TMethod extends keyof PluginViewContract["methods"]> = ParamsOut<
  PluginViewContract,
  TMethod
>

/** An operation as the workspace stores it for its plugin; the broker adds revisions. */
export type OperationRecord = Omit<Operation, "revision">

export type OperationDraftRecord =
  Params<"operations.create">["operations"][number]

/**
 * What the workspace provides to plugin views. Every call names the plugin the broker
 * was opened for (never an ID the frame supplied) and must touch only its operations.
 */
export interface WorkspaceMediator {
  readWorkspace: () => WorkspaceSummary
  subscribeWorkspace: (
    listener: (summary: WorkspaceSummary) => void
  ) => () => void
  listOperations: (
    pluginId: string,
    plateId: string | null
  ) => OperationRecord[]
  createOperations: (
    pluginId: string,
    plateId: string,
    drafts: readonly OperationDraftRecord[]
  ) => Promise<OperationRecord[]>
  /** Stores `next` only while the operation still equals `expected`; else CONFLICT. */
  replaceOperation: (
    pluginId: string,
    expected: OperationRecord,
    next: OperationRecord
  ) => Promise<OperationRecord>
  subscribeOperations: (
    pluginId: string,
    listener: (change: { plateId: string; operationIds: string[] }) => void
  ) => () => void
  importPrograms: (files: Params<"programs.import">["files"]) => Promise<number>
  listTools: () => Tool[]
  /** The app's own tool chooser (and preset step); it closes when `signal` aborts. */
  chooseTool: (
    plugin: PluginIdentity,
    request: Params<"tools.choose">,
    signal: AbortSignal
  ) => Promise<ToolChoice>
  confirm: (
    plugin: PluginIdentity,
    request: Params<"ui.confirm">,
    signal: AbortSignal
  ) => Promise<boolean>
  notify: (plugin: PluginIdentity, notice: Params<"ui.notify">) => void
  progress: (plugin: PluginIdentity, progress: Params<"ui.progress">) => void
}

/** An operation to show, on its plate. */
export type OperationSelection = {
  readonly plateId: string
  readonly operationId: string
}

/** One mounted view, as the app shows it. */
export interface ViewHost {
  readonly view: ViewDeclaration
  context: () => ViewContext
  subscribeContext: (listener: (context: ViewContext) => void) => () => void
  resize: (height: number) => void
  /** `select` is one of the plugin's own operations, checked by the broker. */
  close: (select: OperationSelection | null) => void
}

/** A view holds its grants, "view", and "companion" when the plugin has one. */
export function viewGuard(plugin: PluginIdentity): Guard {
  return createCapabilityGuard(
    heldRequirements(
      plugin.grants,
      plugin.companion ? ["view", "companion"] : ["view"]
    )
  )
}

const withRevision = async (record: OperationRecord): Promise<Operation> => ({
  ...record,
  revision: await operationRevision(record, webCryptoSha256),
})

/** What a mounted view is served with; dispose it when the view unmounts. */
export type ViewBroker = {
  readonly handlers: Handlers<PluginViewContract>
  readonly guard: Guard
  dispose: () => void
}

/**
 * Opens the broker for one mounted view: the view contract mapped onto the workspace and
 * the main process, under the plugin's capability guard. While the view is mounted it
 * holds the plugin's companion (so on-view companions run) and fans its events out.
 */
export function openViewBroker(options: {
  readonly bundle: PluginBundle
  readonly host: ViewHost
  readonly workspace: WorkspaceMediator
  readonly services: PluginServicesPort
}): ViewBroker {
  const { bundle, host, workspace, services } = options
  const { plugin } = bundle
  const emitListeners = new Set<(event: CompanionEmit) => void>()
  const statusListeners = new Set<(status: CompanionStatus) => void>()
  let status: CompanionStatus | null = null
  // A stuck toast.loading toast, its progress never finished: the view closing (below) or the
  // companion leaving "running" both call this with the same shape `ui.progress` uses to
  // dismiss one, so there is one place that knows how.
  const dismissProgress = () =>
    workspace.progress(plugin, { label: "Done.", value: null, done: true })
  const releaseCompanion = plugin.companion
    ? services.subscribeCompanion(plugin.id, (event) => {
        switch (event.kind) {
          case "emit":
            for (const listener of emitListeners) listener(event.event)
            return
          case "status":
            status = event.status
            for (const listener of statusListeners) listener(event.status)
            // A companion that stops mid-call leaves its progress toast stuck open.
            if (event.status.state !== "running") dismissProgress()
            return
          case "progress":
            workspace.progress(plugin, event.progress)
        }
      })
    : () => undefined
  const own = (operationId: string) => {
    const record = workspace
      .listOperations(plugin.id, null)
      .find((operation) => operation.id === operationId)
    if (!record)
      throw new RpcError("NOT_FOUND", "This plugin has no such operation.")
    return record
  }
  const handlers: Handlers<PluginViewContract> = {
    methods: {
      "view.load": () => ({
        plugin,
        view: host.view,
        context: host.context(),
        bundle: { script: bundle.script, styles: bundle.styles },
      }),
      "view.resize": ({ height }) => {
        host.resize(height)
        return null
      },
      "view.close": (params) => {
        const select = params?.select
        const owned =
          select === undefined
            ? undefined
            : workspace
                .listOperations(plugin.id, null)
                .find((operation) => operation.id === select)
        host.close(
          owned ? { plateId: owned.plateId, operationId: owned.id } : null
        )
        return null
      },
      "ui.notify": (notice) => {
        workspace.notify(plugin, notice)
        return null
      },
      "ui.progress": (progress) => {
        workspace.progress(plugin, progress)
        return null
      },
      "ui.confirm": (request, { signal }) =>
        workspace.confirm(plugin, request, signal),
      "workspace.read": () => workspace.readWorkspace(),
      "operations.list": ({ plateId }) =>
        Promise.all(
          workspace.listOperations(plugin.id, plateId ?? null).map(withRevision)
        ),
      "operations.get": ({ operationId }) => withRevision(own(operationId)),
      "operations.create": async ({ plateId, operations }) =>
        Promise.all(
          (
            await workspace.createOperations(plugin.id, plateId, operations)
          ).map(withRevision)
        ),
      "operations.save": async ({ operation: patch }) => {
        const current = own(patch.id)
        if ((await withRevision(current)).revision !== patch.revision)
          throw new RpcError(
            "CONFLICT",
            "This operation changed since it was read. Load it again and retry."
          )
        const next: OperationRecord = {
          ...current,
          name: patch.name ?? current.name,
          stopBefore: patch.stopBefore ?? current.stopBefore,
          toolAssignments: patch.toolAssignments ?? current.toolAssignments,
          data: patch.data === undefined ? current.data : patch.data,
          nc: patch.nc === undefined ? current.nc : patch.nc,
        }
        return withRevision(
          await workspace.replaceOperation(plugin.id, current, next)
        )
      },
      "programs.import": async ({ files }) => ({
        imported: await workspace.importPrograms(files),
      }),
      "tools.list": () => workspace.listTools(),
      "tools.choose": (request, { signal }) =>
        workspace.chooseTool(plugin, request, signal),
      "machine.snapshot": () => services.machineSnapshot(plugin.id),
      "machine.readAnchors": (_params, { signal }) =>
        services.readAnchors(plugin.id, signal),
      "machine.readHeightMap": (_params, { signal }) =>
        services.readHeightMap(plugin.id, signal),
      "machine.accessory": (request) =>
        services.machineAccessory(plugin.id, request),
      "companion.call": (request, { signal }) =>
        services.companionCall(plugin.id, request, signal),
      "companion.status": () => services.companionStatus(plugin.id),
      "companion.setup": (_params, { signal }) =>
        services.companionSetup(plugin.id, signal),
    },
    events: {
      "view.context": (_params, emit) => host.subscribeContext(emit),
      "workspace.changed": (_params, emit) =>
        workspace.subscribeWorkspace(emit),
      "operations.changed": (_params, emit) =>
        workspace.subscribeOperations(plugin.id, emit),
      "machine.changed": (_params, emit) =>
        services.subscribeMachine(plugin.id, emit),
      "companion.events": (_params, emit) => {
        emitListeners.add(emit)
        return () => {
          emitListeners.delete(emit)
        }
      },
      "companion.status": (_params, emit) => {
        statusListeners.add(emit)
        if (status) emit(status)
        return () => {
          statusListeners.delete(emit)
        }
      },
    },
  }
  return {
    handlers,
    guard: viewGuard(plugin),
    dispose: () => {
      emitListeners.clear()
      statusListeners.clear()
      releaseCompanion()
      // A view that closes mid-progress must not leave its toast on screen.
      dismissProgress()
    },
  }
}
