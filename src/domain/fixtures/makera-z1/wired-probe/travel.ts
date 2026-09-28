/**
 * Machine Z the Z1 moves in (G53): the firmware stops a move above Z -1, its soft limit, and
 * below `soft_endstop.z_min`, -102 in Makera's Z1 and Z1 Pro configurations.
 */
export const MACHINE_Z = { min: -102, max: -1 } as const

/**
 * Where probing rises to before it moves in X and Y, as Makera Studio's probing does: the
 * clearance Makera configures (`coordinate.clearance_z`), 2 mm under the soft limit so height
 * compensation cannot lift a G53 move past it.
 */
export const CLEARANCE_Z = -3
