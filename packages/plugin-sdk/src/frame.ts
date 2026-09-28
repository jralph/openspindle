/**
 * The contract between plugin bundles and the frame runtime: modules a bundle leaves
 * external, and the property of the runtime global that provides each one.
 */
export const FRAME_GLOBAL = "OpenSpindleRuntime"

export const FRAME_MODULES = {
  react: "react",
  "react/jsx-runtime": "jsxRuntime",
  "react-dom": "reactDom",
  "react-dom/client": "reactDomClient",
  "@tanstack/react-query": "reactQuery",
  "@openspindle/plugin-sdk": "sdk",
  "@openspindle/plugin-sdk/ui": "ui",
} as const

export type FrameModuleId = keyof typeof FRAME_MODULES
export type FrameModuleKey = (typeof FRAME_MODULES)[FrameModuleId]

/** The runtime's global: one namespace object per external module. */
export type FrameRuntimeGlobal = Readonly<Record<FrameModuleKey, object>>
