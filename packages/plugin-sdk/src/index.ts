/** Everything a plugin view uses; the frame runtime provides this module's instance. */
export { definePlugin, isPluginDefinition } from "./define.ts"
export type { PluginDefinition, PluginView, PluginViews } from "./define.ts"
export {
  PluginSessionProvider,
  createPluginQueryClient,
  openSpindleKeys,
} from "./session.ts"
export type { PluginSession } from "./session.ts"
export {
  useChooseTool,
  useCloseView,
  useCompanion,
  useCompanionEvents,
  useCreateOperations,
  useMachineSnapshot,
  useOperation,
  useOperations,
  useOpenSpindle,
  useTools,
  useViewContext,
  useWorkspace,
} from "./hooks.ts"
export type { OperationChanges } from "./hooks.ts"
export { CAPABILITIES, CAPABILITY_INFO } from "@openspindle/plugin-core"
export type {
  Capability,
  CompanionEmit,
  CompanionHealth,
  CompanionStatus,
  ConfirmRequest,
  CuttingPreset,
  FrameBoot,
  JsonValue,
  MachineSnapshot,
  Notice,
  Operation,
  OperationDraft,
  OperationPatch,
  PlateSummary,
  PluginIdentity,
  PluginViewContract,
  Progress,
  Tool,
  ToolChoice,
  ToolChoiceRequest,
  ViewContext,
  WorkspaceSummary,
} from "@openspindle/plugin-core"
export { RpcError } from "@openspindle/rpc"
export type { CallOptions, RpcErrorCode } from "@openspindle/rpc"
