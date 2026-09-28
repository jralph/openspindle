/** The part of occt-import-js (OpenCascade compiled with Emscripten) the tessellation uses. */
declare module "occt-import-js" {
  export type OcctParams = {
    readonly linearUnit?:
      "millimeter" | "centimeter" | "meter" | "inch" | "foot"
    readonly linearDeflectionType?: "bounding_box_ratio" | "absolute_value"
    readonly linearDeflection?: number
    readonly angularDeflection?: number
  }

  /** One solid, shell or set of loose faces; indices refer to its own vertices. */
  export type OcctMesh = {
    readonly name: string
    readonly color?: readonly [number, number, number]
    readonly attributes: {
      readonly position: { readonly array: readonly number[] }
      readonly normal?: { readonly array: readonly number[] }
    }
    readonly index: { readonly array: readonly number[] }
  }

  export type OcctResult = {
    readonly success: boolean
    readonly meshes?: readonly OcctMesh[]
  }

  export type Occt = {
    readonly ReadStepFile: (
      content: Uint8Array,
      params: OcctParams | null
    ) => OcctResult
  }

  /** Instantiates the module; `locateFile` says where its .wasm is served from. */
  export default function occtimportjs(options?: {
    readonly locateFile?: (path: string, prefix: string) => string
  }): Promise<Occt>
}
