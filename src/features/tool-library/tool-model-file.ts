import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { validateGlb } from "@/formats/models/glb"
import { TOOL_MODEL_BYTES } from "@/domain/tools/tool"

/**
 * A binary glTF file as a data URL the tool can keep: one self-contained GLB of at most
 * TOOL_MODEL_BYTES that loads.
 */
export async function modelDataUrl(file: Blob): Promise<string> {
  // A byte past the limit is enough to refuse a larger file without reading all of it.
  const bytes = new Uint8Array(
    await file.slice(0, TOOL_MODEL_BYTES + 1).arrayBuffer()
  )
  validateGlb(bytes, TOOL_MODEL_BYTES)
  await new GLTFLoader().parseAsync(bytes.buffer, "")
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Unreadable."))
    reader.readAsDataURL(new Blob([bytes], { type: "model/gltf-binary" }))
  })
}
