import { setMap, VILLAGE_MAP } from './map'
import { setLayout, VILLAGE_LAYOUT, buildTrees, type Dir } from './layout'
import { terrainAt } from './map'
import { buildAreaCollision, buildCollision, getBody, placeBody, setCollisionArea } from './collision'
import { rebuildWaterDistance } from '../audio'
import { buildInteractables, setInteractionArea } from '../interactions'
import { runtime } from '../state'
import {
  COTTAGE_BOUNDS,
  COTTAGE_ENTRY_SPOT,
  COTTAGE_EXIT_SPOT,
  cottageColliders,
  type AreaId,
} from './interiors'

export type SceneId = 'elmbrook' | 'riversidemill'

export const SCENES = {
  elmbrook: { name: 'Elmbrook', subtitle: 'A village at the edge of the Whisperwood' },
  riversidemill: { name: 'Riverside Mill', subtitle: 'Where the river turns the wheel' },
}

const MILL_MAP = Array.from({ length: 24 }, (_, z) =>
  Array.from({ length: 24 }, (_, x) => {
    if (x === 19 || x === 20) return z === 7 || z === 8 ? 'b' : '~'
    if ((z === 7 || z === 8) && x < 19) return '='
    if (x < 2 || x > 22 || z < 2 || z > 21) return 'T'
    if (x >= 12 && x <= 17 && z >= 14 && z <= 17) return '#'
    if (x >= 11 && x <= 12 && z >= 9 && z <= 17) return '='
    if (x >= 5 && x <= 8 && z >= 13 && z <= 17) return ','
    return '.'
  }).join(''),
)

const MILL_LAYOUT: typeof VILLAGE_LAYOUT = {
  houses: [
    { id: 'mill', x0: 13, x1: 18, z0: 9.5, z1: 13.5, wallHeight: 3.3, roof: 'moss', walls: 'timber', doorX: 15.5,
      windows: [14, 17], upperWindows: [14, 15.5, 17], chimneyX: 14, lanternSide: -1 },
    { id: 'storehouse', x0: 4, x1: 8, z0: 3, z1: 6, wallHeight: 2.2, roof: 'slate', walls: 'planks', doorX: 6,
      windows: [4.8, 7.2], lanternSide: 1 },
  ],
  lamps: [{ x: 3.5, z: 6.3 }, { x: 10.3, z: 9.5 }, { x: 13, z: 17.5 }, { x: 21.8, z: 6.3 }],
  well: { x: -100, z: -100, radius: 0 },
  signpost: { x: 4.5, z: 9.5 },
  bushes: [{ x: 8.8, z: 4, scale: 1 }, { x: 3, z: 15, scale: 1.1 }, { x: 17, z: 19, scale: 1 }],
  props: [
    { kind: 'barrel', x: 13, z: 14.5, rot: 0 }, { kind: 'crate', x: 17.4, z: 14.5, rot: 0.1 },
    { kind: 'crate', x: 17.4, z: 15.3, rot: -0.1 }, { kind: 'barrel', x: 8.5, z: 5.5, rot: 0 },
  ],
  fences: [[4, 12, 9, 12], [9, 12, 9, 18], [9, 18, 4, 18]],
  bridge: { x0: 19, x1: 21, z0: 7, z1: 9 },
  npcs: [],
  beacon: { x: 14.6, z: 15.55 },
  trees: [
    { x: 6, z: 10.5, kind: 'oak', scale: 1.1, tint: 1 },
    { x: 11, z: 4, kind: 'birch', scale: 1, tint: 1 },
    { x: 21.8, z: 17, kind: 'pine', scale: 1.1, tint: 0.95 },
  ],
}

// Interiors are static: build their collision once, up front.
buildAreaCollision('cottage', COTTAGE_BOUNDS, cottageColliders())

export function activateScene(id: SceneId) {
  setCollisionArea('outdoor')
  setInteractionArea('outdoor')
  setMap(id === 'elmbrook' ? VILLAGE_MAP : MILL_MAP)
  setLayout(id === 'elmbrook' ? VILLAGE_LAYOUT : MILL_LAYOUT)
  buildCollision(buildTrees().filter((t) => terrainAt(Math.floor(t.x), Math.floor(t.z)) !== 'forest'))
  buildInteractables(id === 'riversidemill')
  rebuildWaterDistance()
}

export function arrivalFor(id: SceneId): { x: number; z: number; facing: Dir } {
  return id === 'riversidemill' ? { x: 2.8, z: 8, facing: 'right' } : { x: 22.1, z: 8, facing: 'left' }
}

/** Triggers lie inside the collision boundary, with arrivals safely beyond the return trigger. */
export function exitAt(id: SceneId, x: number, z: number, dx: number): SceneId | null {
  if (z < 7.3 || z > 8.7) return null
  if (id === 'elmbrook' && x > 23.1 && dx > 0) return 'riversidemill'
  if (id === 'riversidemill' && x < 0.9 && dx < 0) return 'elmbrook'
  return null
}

/**
 * Move the player between the village and an interior of the loaded scene. Nothing is loaded or
 * rebuilt: the active collision world and interaction set are swapped and the player is placed
 * at the other side of the door. Rendering swaps by visibility (see AreaGroup).
 */
export function switchArea(to: AreaId) {
  setCollisionArea(to)
  setInteractionArea(to)
  const spot = to === 'cottage' ? COTTAGE_ENTRY_SPOT : COTTAGE_EXIT_SPOT
  const body = getBody('player')
  if (body) placeBody(body, spot.x, spot.z)
  Object.assign(runtime.player, { x: body?.x ?? spot.x, z: body?.z ?? spot.z, facing: spot.facing, moving: false })
  runtime.forceFacing = spot.facing
  runtime.focusId = null
  runtime.cameraCut = true
}
