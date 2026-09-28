import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { GLTF } from "three/addons/loaders/GLTFLoader.js"
import type { MachineBed } from "@/domain/fixtures/machine-bed"
import type { ModelId } from "@/domain/models/model"
import type { FixtureMeshSource } from "@/domain/fixtures/definitions"
import {
  disposeMaterials,
  disposeObjects,
  glbInBedSpace,
  materialsOf,
} from "@/lib/three-assets"

export type ViewerAssetEvents = {
  /** Every plate on this bed should clone its new template. */
  bedChange: (machineBed: MachineBed, template: THREE.Object3D) => void
  error: (message: string) => void
}

/** A Models library mesh (binary glTF); null when the library does not have it. */
export type ModelMeshes = (id: ModelId) => Promise<Uint8Array | null>

const sourceKey = (source: FixtureMeshSource) =>
  source.kind === "bundled"
    ? `bundled:${source.url}`
    : `library:${source.modelId}`

/** A plain block of the machine bed's box until its model loads. */
function bedFallback({ bounds: { min, max }, finish }: MachineBed) {
  const template = new THREE.Group()
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
    new THREE.MeshStandardMaterial(finish)
  )
  bed.position.set(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  )
  template.add(bed)
  return template
}

/** GLB templates shared by every plate; clones reuse their geometry and materials. */
export class ViewerAssets {
  private readonly events: ViewerAssetEvents
  private readonly meshes: ModelMeshes
  /** Each machine's bed as the plates on it clone it. */
  private readonly beds = new Map<MachineBed, THREE.Object3D>()
  private readonly fixtures = new Map<string, Promise<THREE.Group | null>>()
  private readonly tools = new Map<string, Promise<THREE.Group | null>>()
  private readonly templates = new Set<THREE.Group>()
  private disposed = false

  constructor(events: ViewerAssetEvents, meshes: ModelMeshes) {
    this.events = events
    this.meshes = meshes
  }

  /**
   * A machine's bed, whose model loads once per viewer: a plain block of its box until the
   * model arrives (`bedChange`).
   */
  bed(machineBed: MachineBed): THREE.Object3D {
    const drawn = this.beds.get(machineBed)
    if (drawn) return drawn
    const fallback = bedFallback(machineBed)
    this.beds.set(machineBed, fallback)
    new GLTFLoader().load(
      machineBed.modelUrl,
      (gltf) => this.receiveBed(machineBed, gltf.scene),
      undefined,
      () => {
        if (!this.disposed) this.events.error("Bed model unavailable.")
      }
    )
    return fallback
  }

  /**
   * Loads each fixture model once per viewer. Null when it is unavailable: a library model
   * that is missing is looked up again next time, as it may be added meanwhile.
   */
  fixture(source: FixtureMeshSource) {
    const key = sourceKey(source)
    const cached = this.fixtures.get(key)
    if (cached) return cached
    const promise = this.loadFixture(source)
    this.fixtures.set(key, promise)
    void promise.then((template) => {
      if (!template && source.kind === "library") this.fixtures.delete(key)
    })
    return promise
  }

  /**
   * Loads each tool model (a GLB's URL) once per viewer, in tool space: the tip at the
   * origin, the axis along Z. Null when it is unavailable.
   */
  toolModel(url: string) {
    let model = this.tools.get(url)
    if (!model) {
      model = this.template(
        new GLTFLoader().loadAsync(url),
        "Tool model unavailable."
      )
      this.tools.set(url, model)
    }
    return model
  }

  dispose() {
    this.disposed = true
    disposeObjects(...this.beds.values(), ...this.templates)
  }

  private receiveBed(machineBed: MachineBed, scene: THREE.Group) {
    if (this.disposed) {
      disposeObjects(scene)
      return
    }
    // One shared finish replaces the model's own materials.
    const material = new THREE.MeshStandardMaterial(machineBed.finish)
    const originals = new Set<THREE.Material>()
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      for (const original of materialsOf(child)) originals.add(original)
      child.material = material
    })
    disposeMaterials(originals)
    const template = glbInBedSpace(scene)
    template.position.set(...machineBed.modelOrigin)
    const previous = this.beds.get(machineBed)
    this.beds.set(machineBed, template)
    this.events.bedChange(machineBed, template)
    if (previous) disposeObjects(previous)
  }

  private async parse(source: FixtureMeshSource) {
    const loader = new GLTFLoader()
    if (source.kind === "bundled") return loader.loadAsync(source.url)
    const mesh = await this.meshes(source.modelId)
    if (!mesh) return null
    return loader.parseAsync(new Uint8Array(mesh).buffer, "")
  }

  private loadFixture(source: FixtureMeshSource) {
    return this.template(this.parse(source), "Fixture model unavailable.")
  }

  /** A loaded model in bed space, kept until the viewer is disposed; `error` reports a failure. */
  private async template(loading: Promise<GLTF | null>, error: string) {
    try {
      const gltf = await loading
      if (!gltf) return null
      if (this.disposed) {
        disposeObjects(gltf.scene)
        return null
      }
      const template = glbInBedSpace(gltf.scene)
      this.templates.add(template)
      return template
    } catch {
      if (!this.disposed) this.events.error(error)
      return null
    }
  }
}
