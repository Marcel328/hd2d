// Interiors are "areas" of a loaded scene: they live in the same three.js scene as the village,
// far from its coordinates, and are shown instead of it. Walking through a door only swaps which
// area is visible and active — the village is never unloaded or rebuilt.
//
// Ashdown Cottage — Mira's family home — sits behind the slate-roofed cottage door in Elmbrook.
// Room coordinates below are local (x: 0..10 west→east, z: 0..7 north→south) and converted to
// world space with ORIGIN.
import type { Dir } from './layout'
import type { Box } from './collision'

export type AreaId = 'outdoor' | 'cottage'

export const ORIGIN = { x: 100, z: 100 }
export const ROOM = { w: 10, d: 7, wallH: 3, wall: 0.3 }

export const w = (x: number, z: number) => ({ x: ORIGIN.x + x, z: ORIGIN.z + z })

export const COTTAGE_INFO = { name: 'Ashdown Cottage', subtitle: "Mira's family home" }

/** The cottage's front door in Elmbrook (see VILLAGE_LAYOUT, house id "cottage"). */
export const COTTAGE_DOOR_OUTSIDE = { x: 15.5, z: 5.5, halfWidth: 0.5 }
/** Where the player appears when leaving the cottage. */
export const COTTAGE_EXIT_SPOT = { x: 15.5, z: 6.35, facing: 'down' as Dir }
/** Where the player appears when entering, just inside the door. */
export const COTTAGE_ENTRY_SPOT = { ...w(5, 6.15), facing: 'up' as Dir }
/** The doorway gap in the front wall (local x). */
export const DOORWAY = { x0: 4.4, x1: 5.6 }

export type FurnitureMaterial = 'planks' | 'darkPlanks' | 'timber' | 'stone' | 'soot' | 'quilt' | 'linen' | 'books' | 'counter'

/** Furniture as boxes in local space: [material, x0, y0, z0, x1, y1, z1]. */
export const FURNITURE: [FurnitureMaterial, number, number, number, number, number, number][] = [
  // Hearth: chimney breast built around an open firebox, mantel, hearthstone, logs.
  ['stone', 0.4, 0, 0, 2.6, 3, 0.35],
  ['stone', 0.4, 0, 0.35, 0.9, 1.1, 0.75],
  ['stone', 2.1, 0, 0.35, 2.6, 1.1, 0.75],
  ['stone', 0.4, 1.1, 0.35, 2.6, 3, 0.75],
  ['soot', 0.9, 0, 0.35, 2.1, 0.1, 0.75],
  ['soot', 0.9, 0.1, 0.35, 2.1, 1.1, 0.38],
  ['timber', 0.3, 1.24, 0.6, 2.7, 1.36, 0.98],
  ['stone', 0.45, 0, 0.75, 2.55, 0.07, 1.25],
  ['timber', 1.1, 0.1, 0.45, 1.9, 0.2, 0.62],
  // Kitchen counter with cupboard doors and a wall shelf.
  ['counter', 3.1, 0, 0, 5.9, 0.92, 0.75],
  ['timber', 3.05, 0.92, 0, 5.95, 1.0, 0.82],
  ['darkPlanks', 3.25, 0.12, 0.75, 4.45, 0.8, 0.78],
  ['darkPlanks', 4.55, 0.12, 0.75, 5.75, 0.8, 0.78],
  ['timber', 3.3, 1.86, 0, 5.7, 1.94, 0.34],
  // Bookshelf.
  ['darkPlanks', 8.1, 0, 0, 9.8, 2.45, 0.5],
  ['books', 8.2, 0.1, 0.5, 9.7, 2.3, 0.52],
  // Bed: frame, headboard, quilt, pillow.
  ['planks', 0, 0, 3.35, 1.55, 0.42, 5.6],
  ['planks', 0, 0, 3.2, 1.55, 1.05, 3.38],
  ['quilt', 0.05, 0.42, 3.75, 1.5, 0.6, 5.55],
  ['linen', 0.15, 0.42, 3.42, 1.4, 0.72, 3.78],
  // Chest at the foot of the bed.
  ['darkPlanks', 0.25, 0, 5.78, 1.25, 0.55, 6.4],
  ['timber', 0.22, 0.55, 5.75, 1.28, 0.64, 6.43],
  // Wardrobe.
  ['darkPlanks', 9.2, 0, 1.15, 10, 2.3, 2.65],
  ['timber', 9.15, 2.3, 1.1, 10, 2.4, 2.7],
  // Barrel stand by the sacks.
  ['planks', 9.15, 0, 5.45, 9.85, 0.75, 6.15],
  // Dining table (top and legs) and two stools.
  ['planks', 4.15, 0.7, 3.25, 6.25, 0.8, 4.35],
  ['timber', 4.25, 0, 3.35, 4.37, 0.7, 3.47],
  ['timber', 6.03, 0, 3.35, 6.15, 0.7, 3.47],
  ['timber', 4.25, 0, 4.13, 4.37, 0.7, 4.25],
  ['timber', 6.03, 0, 4.13, 6.15, 0.7, 4.25],
  ['timber', 3.55, 0, 3.6, 3.95, 0.45, 4.0],
  ['timber', 6.45, 0, 3.6, 6.85, 0.45, 4.0],
]

/** Extra collision for things drawn as sprites (sacks, plant, cat). */
const SPRITE_BLOCKERS: [number, number, number, number][] = [
  [9.0, 4.25, 9.95, 5.1], // flour sacks
  [9.2, 3.05, 9.8, 3.55], // potted plant
  [2.62, 1.3, 3.2, 1.8], // the cat, who will not move
]

/** Collision boxes in world space: walls (with the doorway gap), then furniture footprints. */
export function cottageColliders(): Box[] {
  const t = 1
  const local: [number, number, number, number][] = [
    [-t, -t, 0, ROOM.d + t], // west wall
    [ROOM.w, -t, ROOM.w + t, ROOM.d + t], // east wall
    [-t, -t, ROOM.w + t, 0], // back wall
    [-t, ROOM.d, DOORWAY.x0, ROOM.d + t], // front wall, west of the door
    [DOORWAY.x1, ROOM.d, ROOM.w + t, ROOM.d + t], // front wall, east of the door
    [DOORWAY.x0, ROOM.d + 0.25, DOORWAY.x1, ROOM.d + t], // the doorway itself: step in, not through
    // Furniture footprints (a little generous so sprites never clip into them).
    [0.4, 0, 2.6, 1.2], // hearth + hearthstone
    [3.05, 0, 5.95, 0.82], // counter
    [8.1, 0, 9.8, 0.55], // bookshelf
    [0, 3.2, 1.55, 5.6], // bed
    [0.22, 5.75, 1.28, 6.43], // chest
    [9.15, 1.1, 10, 2.7], // wardrobe
    [9.15, 5.45, 9.85, 6.15], // barrel stand
    [4.15, 3.25, 6.25, 4.35], // table
    [3.55, 3.6, 3.95, 4.0], // stool
    [6.45, 3.6, 6.85, 4.0], // stool
    ...SPRITE_BLOCKERS,
  ]
  return local.map(([x0, z0, x1, z1]) => ({ x0: ORIGIN.x + x0, z0: ORIGIN.z + z0, x1: ORIGIN.x + x1, z1: ORIGIN.z + z1 }))
}

export const COTTAGE_BOUNDS = { x0: ORIGIN.x - 1.5, z0: ORIGIN.z - 1.5, x1: ORIGIN.x + ROOM.w + 1.5, z1: ORIGIN.z + ROOM.d + 1.5 }

/** Interior light sources (world space). They borrow the shared point-light pool while inside. */
export const COTTAGE_LIGHTS = [
  { ...w(1.5, 1.0), y: 0.75, power: 1.35, color: '#ff8f45', flicker: 1 }, // hearth
  { ...w(5.45, 3.8), y: 1.1, power: 0.45, color: '#ffc477', flicker: 0.6 }, // table candle
  { ...w(0.22, 2.0), y: 1.85, power: 0.6, color: '#ffb25e', flicker: 0.4 }, // wall sconce
]

/** Small props drawn as billboards from the sprite atlas (local coordinates, y = height). */
export const COTTAGE_SPRITES: { sprite: string; x: number; y: number; z: number; scale?: number; flip?: boolean }[] = [
  { sprite: 'jars', x: 3.9, y: 1.94, z: 0.17 },
  { sprite: 'jars', x: 5.15, y: 1.94, z: 0.17, flip: true },
  { sprite: 'bread', x: 3.75, y: 1.0, z: 0.45 },
  { sprite: 'pot', x: 5.35, y: 1.0, z: 0.42 },
  { sprite: 'bowl', x: 4.8, y: 0.8, z: 3.75 },
  { sprite: 'candle', x: 5.45, y: 0.8, z: 3.8 },
  { sprite: 'logs', x: 2.95, y: 0, z: 0.55 },
  { sprite: 'sacks', x: 9.45, y: 0, z: 4.8 },
  { sprite: 'barrel', x: 9.5, y: 0.75, z: 5.85, scale: 0.85 },
  { sprite: 'plant', x: 9.5, y: 0, z: 3.4 },
  { sprite: 'plant', x: 7.0, y: 1.2, z: 0.12, scale: 0.6 },
  { sprite: 'cat', x: 2.9, y: 0.02, z: 1.55 },
  { sprite: 'candle', x: 0.22, y: 1.6, z: 2.0 },
]

export interface ScavengeSpot {
  id: string
  name: string
  /** Interaction anchor (world space). */
  x: number
  z: number
  reach: number
  iconHeight: number
  /** Where the twinkle that hints at hidden items floats. */
  glint: { x: number; y: number; z: number }
  intro: string
  /** Shown after the items are listed (e.g. a note found with them). */
  outro?: string
  empty: string
}

export const COTTAGE_SPOTS: ScavengeSpot[] = [
  {
    id: 'cottage-cupboard',
    name: 'Kitchen Cupboard',
    ...w(4.5, 1.0),
    reach: 1.3,
    iconHeight: 1.9,
    glint: { ...w(4.5, 0.95), y: 0.55 },
    intro: 'You open the kitchen cupboard. It smells of fresh bread and beeswax.',
    empty: 'Only crumbs and an empty jar remain in the cupboard.',
  },
  {
    id: 'cottage-chest',
    name: 'Old Chest',
    ...w(0.75, 6.45),
    reach: 1.35,
    iconHeight: 1.5,
    glint: { ...w(0.75, 6.45), y: 0.85 },
    intro: 'The old chest creaks open. Supplies are packed neatly inside.',
    outro: 'A note is tucked under the lid: “For any traveller who needs them. — Brann Ashdown”',
    empty: 'The chest holds only folded blankets now.',
  },
  {
    id: 'cottage-sacks',
    name: 'Flour Sacks',
    ...w(9.45, 4.7),
    reach: 1.35,
    iconHeight: 1.45,
    glint: { ...w(9.3, 4.9), y: 0.75 },
    intro: 'You rummage between the sacks from the Riverside Mill.',
    empty: 'The rest of the flour is sealed up tight for the bakery.',
  },
]

/** A purely flavourful "read" point. */
export const COTTAGE_CAT = { ...w(2.9, 1.55), name: 'Sleepy Cat' }

/** Trigger tests, run by the player controller every frame while moving. */
export function enteringCottage(x: number, z: number, iz: number): boolean {
  return iz < 0 && Math.abs(x - COTTAGE_DOOR_OUTSIDE.x) < COTTAGE_DOOR_OUTSIDE.halfWidth && z < COTTAGE_DOOR_OUTSIDE.z + 0.45
}

export function leavingCottage(x: number, z: number, iz: number): boolean {
  const lx = x - ORIGIN.x
  const lz = z - ORIGIN.z
  return iz > 0 && lx > DOORWAY.x0 && lx < DOORWAY.x1 && lz > ROOM.d - 0.3
}
