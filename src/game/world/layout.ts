// Hand-placed objects for Elmbrook. All coordinates are world units (see map.ts).
import { MAP_H, MAP_W, terrainAt } from './map'
import { mulberry32 } from '../../gfx/random'

export type Dir = 'down' | 'up' | 'left' | 'right'
export type RoofStyle = 'red' | 'slate' | 'moss'
export type WallStyle = 'timber' | 'planks'

export interface HouseDef {
  id: string
  x0: number
  x1: number
  z0: number
  z1: number
  wallHeight: number
  roof: RoofStyle
  walls: WallStyle
  doorX: number
  windows: number[]
  upperWindows?: number[]
  chimneyX?: number
  /** Side of the door (−1 west, +1 east) that carries a wall lantern. */
  lanternSide: -1 | 1
}

export let HOUSES: HouseDef[] = [
  {
    id: 'inn',
    x0: 3,
    x1: 8,
    z0: 2.5,
    z1: 6,
    wallHeight: 3.1,
    roof: 'red',
    walls: 'timber',
    doorX: 5.5,
    windows: [3.95, 7.05],
    upperWindows: [3.95, 5.5, 7.05],
    chimneyX: 7.1,
    lanternSide: 1,
  },
  {
    id: 'cottage',
    x0: 13,
    x1: 18,
    z0: 2.6,
    z1: 5.5,
    wallHeight: 2.4,
    roof: 'slate',
    walls: 'timber',
    doorX: 15.5,
    windows: [14.05, 16.95],
    chimneyX: 13.9,
    lanternSide: -1,
  },
  {
    id: 'workshop',
    x0: 3,
    x1: 8,
    z0: 13,
    z1: 16,
    wallHeight: 2.4,
    roof: 'moss',
    walls: 'planks',
    doorX: 5.5,
    windows: [4.0, 7.0],
    lanternSide: 1,
  },
]

export interface LightSource {
  x: number
  y: number
  z: number
  /** 0..1 strength relative to a street lamp. */
  power: number
}

export let LAMP_POSTS: { x: number; z: number }[] = [
  { x: 8.5, z: 6.5 },
  { x: 15.6, z: 9.4 },
  { x: 10.4, z: 14.6 },
  { x: 10.4, z: 20.4 },
  { x: 21.6, z: 6.3 },
]

export const LAMP_HEIGHT = 2.05

export let DOOR_LANTERNS = HOUSES.map((h) => ({
  x: h.doorX + h.lanternSide * 0.82,
  y: 1.75,
  z: h.z1 + 0.14,
}))

/** The Last Lantern: the great lantern every other flame was lit from (Riverside Mill only). */
export let BEACON: { x: number; z: number } | null = null
export const BEACON_HEIGHT = 2.75

export let LIGHT_SOURCES: LightSource[] = [
  ...LAMP_POSTS.map((l) => ({ x: l.x, y: LAMP_HEIGHT, z: l.z, power: 1 })),
  ...DOOR_LANTERNS.map((l) => ({ ...l, power: 0.7 })),
]

export let WELL = { x: 12, z: 11.5, radius: 0.72 }

export let SIGNPOST = { x: 13.8, z: 20.3 }

export type TreeKind = 'oak' | 'oak2' | 'pine' | 'birch' | 'bush'

export interface TreeDef {
  x: number
  z: number
  kind: TreeKind
  scale: number
  tint: number
}

let VILLAGE_TREES: TreeDef[] = [
  { x: 10.6, z: 3.9, kind: 'oak', scale: 1.1, tint: 1 },
  { x: 2.7, z: 10.6, kind: 'birch', scale: 1, tint: 1 },
  { x: 20.8, z: 13.6, kind: 'oak2', scale: 1.05, tint: 0.95 },
  { x: 8.4, z: 19.4, kind: 'oak', scale: 0.95, tint: 1.02 },
  { x: 16.4, z: 20.0, kind: 'birch', scale: 0.9, tint: 1 },
  { x: 21.1, z: 3.6, kind: 'pine', scale: 1, tint: 1 },
  { x: 2.6, z: 17.8, kind: 'pine', scale: 0.85, tint: 1 },
]

/** Village trees plus a dense forest generated over forest tiles and a ring outside the map. */
export function buildTrees(): TreeDef[] {
  const rand = mulberry32(1337)
  const trees: TreeDef[] = [...VILLAGE_TREES]
  const pad = 7
  for (let tz = -pad; tz < MAP_H + pad; tz++) {
    for (let tx = -pad; tx < MAP_W + pad; tx++) {
      if (terrainAt(tx, tz) !== 'forest') continue
      const inside = tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H
      // Nothing between the camera and the village: the south edge is a low hedge of bushes
      // with the odd small tree, and there is no forest beyond it.
      if (tz >= MAP_H) continue
      const south = tz >= MAP_H - 4
      // Thin the forest further out; the map border stays dense.
      if (!inside && rand() < 0.35) continue
      if (inside && rand() < 0.12) continue
      const r = rand()
      let kind: TreeKind = r < 0.38 ? 'pine' : r < 0.7 ? 'oak' : r < 0.9 ? 'oak2' : 'birch'
      let scale = 0.85 + rand() * 0.4
      if (south) {
        const small = rand() < 0.22
        kind = small ? 'pine' : 'bush'
        scale = small ? 0.55 + rand() * 0.15 : 1.1 + rand() * 0.5
      }
      trees.push({
        x: tx + 0.2 + rand() * 0.6,
        z: tz + 0.2 + rand() * 0.6,
        kind,
        scale,
        tint: 0.82 + rand() * 0.22,
      })
    }
  }
  return trees
}

export let BUSHES: { x: number; z: number; scale: number }[] = [
  { x: 2.6, z: 6.4, scale: 1 },
  { x: 8.55, z: 2.9, scale: 0.9 },
  { x: 12.45, z: 4.9, scale: 1 },
  { x: 18.55, z: 4.6, scale: 0.85 },
  { x: 2.7, z: 14.5, scale: 1.05 },
  { x: 8.6, z: 15.5, scale: 0.9 },
  { x: 15.9, z: 12.6, scale: 1 },
  { x: 21.2, z: 10.4, scale: 1.1 },
  { x: 14.4, z: 6.5, scale: 0.75 },
  { x: 9.4, z: 18.55, scale: 0.8 },
]

export type PropKind = 'crate' | 'barrel'

export let PROPS: { kind: PropKind; x: number; z: number; rot: number }[] = [
  { kind: 'crate', x: 8.45, z: 5.45, rot: 0.1 },
  { kind: 'barrel', x: 8.5, z: 4.55, rot: 0 },
  { kind: 'barrel', x: 8.45, z: 13.6, rot: 0 },
  { kind: 'barrel', x: 8.55, z: 14.35, rot: 0.6 },
  { kind: 'crate', x: 17.35, z: 9.55, rot: -0.15 },
  { kind: 'crate', x: 17.35, z: 10.35, rot: 0.05 },
  { kind: 'barrel', x: 12.55, z: 5.95, rot: 0 },
]

/** Garden fence: closed polyline segments (a gap on the west side serves as the gate). */
export let FENCE_SEGMENTS: [number, number, number, number][] = [
  [13.7, 13.7, 17.3, 13.7],
  [17.3, 13.7, 17.3, 17.3],
  [17.3, 17.3, 13.7, 17.3],
  [13.7, 17.3, 13.7, 16.1],
  [13.7, 14.9, 13.7, 13.7],
]

export let BRIDGE = { x0: 19, x1: 21, z0: 7, z1: 9 }

export interface NpcDef {
  id: 'rowan' | 'mira' | 'brann'
  name: string
  x: number
  z: number
  facing: Dir
  route?: [number, number][]
}

export let NPCS: NpcDef[] = [
  { id: 'rowan', name: 'Elder Rowan', x: 10.35, z: 11.6, facing: 'down' },
  {
    id: 'mira',
    name: 'Mira',
    x: 13.25,
    z: 13.4,
    facing: 'down',
    route: [
      [13.25, 13.4],
      [13.25, 18.05],
      [16.8, 18.05],
      [13.25, 18.05],
    ],
  },
]

export const PLAYER_SPAWN = { x: 12, z: 19.4, facing: 'up' as Dir }

export const VILLAGE_LAYOUT = {
  houses: HOUSES, lamps: LAMP_POSTS, well: WELL, signpost: SIGNPOST,
  bushes: BUSHES, props: PROPS, fences: FENCE_SEGMENTS, bridge: BRIDGE, npcs: NPCS, trees: VILLAGE_TREES,
  beacon: null as { x: number; z: number } | null,
}

/** Brann, once the moth has been dealt with: home in Elmbrook, or in the mill yard. */
export const BRANN_AT_HOME: NpcDef = { id: 'brann', name: 'Brann', x: 16.6, z: 6.55, facing: 'down' }
export const BRANN_AT_MILL: NpcDef = { id: 'brann', name: 'Brann', x: 13.1, z: 16.1, facing: 'right' }

export function setLayout(layout: typeof VILLAGE_LAYOUT) {
  HOUSES = layout.houses
  LAMP_POSTS = layout.lamps
  WELL = layout.well
  SIGNPOST = layout.signpost
  BUSHES = layout.bushes
  PROPS = layout.props
  FENCE_SEGMENTS = layout.fences
  BRIDGE = layout.bridge
  NPCS = layout.npcs
  VILLAGE_TREES = layout.trees
  BEACON = layout.beacon
  DOOR_LANTERNS = HOUSES.map((h) => ({ x: h.doorX + h.lanternSide * 0.82, y: 1.75, z: h.z1 + 0.14 }))
  LIGHT_SOURCES = [
    ...LAMP_POSTS.map((l) => ({ x: l.x, y: LAMP_HEIGHT, z: l.z, power: 1 })),
    ...DOOR_LANTERNS.map((l) => ({ ...l, power: 0.7 })),
    ...(BEACON ? [{ x: BEACON.x, y: BEACON_HEIGHT, z: BEACON.z, power: 1.5 }] : []),
  ]
}
