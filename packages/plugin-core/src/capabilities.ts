import { RpcError } from "@openspindle/rpc"
import type { Guard } from "@openspindle/rpc"
import { z } from "zod"

/**
 * Everything a plugin may be granted, reviewed once at install. There is deliberately
 * no capability for motion, spindle, overrides, pause/resume or running jobs.
 */
export const CAPABILITIES = [
  "workspace:read",
  "operations:write",
  "programs:import",
  "tools:read",
  "machine:read",
  "machine:accessories",
] as const
export const CapabilitySchema = z.enum(CAPABILITIES)
export type Capability = z.infer<typeof CapabilitySchema>

export const CAPABILITY_INFO: Record<
  Capability,
  { readonly title: string; readonly description: string }
> = {
  "workspace:read": {
    title: "Read the workspace",
    description: "See plates, their stock and which plate is selected.",
  },
  "operations:write": {
    title: "Manage its own operations",
    description:
      "Create and update the operations this plugin added. It cannot see or change other operations.",
  },
  "programs:import": {
    title: "Import NC programs",
    description:
      "Add NC programs to the workspace. Importing never runs a program.",
  },
  "tools:read": {
    title: "Read the tool library",
    description:
      "See your tools and cutting presets, and ask you to choose a tool.",
  },
  "machine:read": {
    title: "Read machine status",
    description:
      "See the connected machine's status, stored anchors and height map.",
  },
  "machine:accessories": {
    title: "Switch machine accessories",
    description:
      "Turn the work light, beeper and vacuum on or off. It cannot move the machine or run programs.",
  },
}

/** The machine subset, handed to the machine gateway's plugin principal. */
export const MACHINE_CAPABILITIES = [
  "machine:read",
  "machine:accessories",
] as const satisfies readonly Capability[]
export type MachineCapability = (typeof MACHINE_CAPABILITIES)[number]

export const isMachineCapability = (
  capability: Capability
): capability is MachineCapability =>
  (MACHINE_CAPABILITIES as readonly Capability[]).includes(capability)

/**
 * What a contract method requires: an install-time capability, or a baseline held by
 * every plugin view ("view") or by plugins that ship a companion ("companion").
 */
export type Requirement = Capability | "view" | "companion"

export type PermissionDiff = {
  readonly added: Capability[]
  readonly removed: Capability[]
  readonly kept: Capability[]
}

/** What an update asks for beyond, and gives up from, what was granted before. */
export function diffPermissions(
  previous: readonly Capability[],
  next: readonly Capability[]
): PermissionDiff {
  const before = new Set(previous)
  const after = new Set(next)
  const ordered = (keep: (capability: Capability) => boolean) =>
    CAPABILITIES.filter(keep)
  return {
    added: ordered(
      (capability) => after.has(capability) && !before.has(capability)
    ),
    removed: ordered(
      (capability) => before.has(capability) && !after.has(capability)
    ),
    kept: ordered(
      (capability) => before.has(capability) && after.has(capability)
    ),
  }
}

/** The requirements a plugin's views or companion hold, from its grants. */
export function heldRequirements(
  grants: readonly Capability[],
  baseline: readonly ("view" | "companion")[]
): ReadonlySet<Requirement> {
  return new Set<Requirement>([...grants, ...baseline])
}

/** Fails closed: a method without a requirement, or with one not held, is refused. */
export function createCapabilityGuard(held: ReadonlySet<Requirement>): Guard {
  return (requires, name) => {
    if (requires !== null && held.has(requires as Requirement)) return
    throw new RpcError(
      "PERMISSION_DENIED",
      requires === null
        ? `${name} is not available to plugins.`
        : `This plugin was not granted ${requires}.`
    )
  }
}
