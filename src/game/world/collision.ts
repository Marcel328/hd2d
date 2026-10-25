// Circle-vs-box collision against a static, tile-bucketed list of boxes, plus circles for
// characters. Movement is sub-stepped so nothing tunnels through thin fences.
import { MAP_H, MAP_W, isBlockingTerrain, terrainAt } from './map'
import { BEACON, BUSHES, FENCE_SEGMENTS, HOUSES, LAMP_POSTS, PROPS, SIGNPOST, WELL, type TreeDef } from './layout'
import type { AreaId } from './interiors'

export interface Box {
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface Body {
  id: string
  x: number
  z: number
  r: number
}

/**
 * One collision space: static boxes bucketed into a unit grid over its bounds, plus live bodies.
 * The village and each interior get their own world, built once; switching areas only changes
 * which world is active, so nothing is rebuilt when the player walks through a door.
 */
class World {
  readonly boxes: Box[] = []
  readonly bodies = new Map<string, Body>()
  private readonly grid: number[][]
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly w: number,
    readonly h: number,
  ) {
    this.grid = Array.from({ length: w * h }, () => [])
  }

  clear() {
    this.boxes.length = 0
    for (const cell of this.grid) cell.length = 0
    this.bodies.clear()
  }

  add(b: Box) {
    const i = this.boxes.push(b) - 1
    const m = 0.5 // max body radius
    for (let z = Math.max(0, Math.floor(b.z0 - m - this.z0)); z <= Math.min(this.h - 1, Math.floor(b.z1 + m - this.z0)); z++)
      for (let x = Math.max(0, Math.floor(b.x0 - m - this.x0)); x <= Math.min(this.w - 1, Math.floor(b.x1 + m - this.x0)); x++)
        this.grid[z * this.w + x].push(i)
  }

  cell(x: number, z: number): number[] | undefined {
    const cx = Math.floor(x - this.x0)
    const cz = Math.floor(z - this.z0)
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return undefined
    return this.grid[cz * this.w + cx]
  }
}

const outdoor = new World(0, 0, MAP_W, MAP_H)
const worlds = new Map<AreaId, World>([['outdoor', outdoor]])
let world = outdoor

function addBox(b: Box) {
  outdoor.add(b)
}

function addSegment(x0: number, z0: number, x1: number, z1: number, t: number) {
  addBox({ x0: Math.min(x0, x1) - t, z0: Math.min(z0, z1) - t, x1: Math.max(x0, x1) + t, z1: Math.max(z0, z1) + t })
}

/** (Re)build the village collision world for the current map and layout. */
export function buildCollision(villageTrees: TreeDef[]) {
  outdoor.clear()
  // Terrain: merge horizontal runs of blocking tiles into single boxes.
  for (let tz = 0; tz < MAP_H; tz++) {
    let start = -1
    for (let tx = 0; tx <= MAP_W; tx++) {
      const blocked = tx < MAP_W && isBlockingTerrain(terrainAt(tx, tz))
      if (blocked && start < 0) start = tx
      if (!blocked && start >= 0) {
        // Water edges are a touch forgiving so you can stand on the bank.
        const water = terrainAt(start, tz) === 'water'
        const inset = water ? 0.15 : 0
        addBox({ x0: start + inset, z0: tz + inset, x1: tx - inset, z1: tz + 1 - inset })
        start = -1
      }
    }
  }
  for (const h of HOUSES) addBox({ x0: h.x0 - 0.05, z0: h.z0, x1: h.x1 + 0.05, z1: h.z1 + 0.05 })
  addBox({ x0: WELL.x - WELL.radius, z0: WELL.z - WELL.radius, x1: WELL.x + WELL.radius, z1: WELL.z + WELL.radius })
  for (const l of LAMP_POSTS) addBox({ x0: l.x - 0.14, z0: l.z - 0.12, x1: l.x + 0.14, z1: l.z + 0.12 })
  addBox({ x0: SIGNPOST.x - 0.3, z0: SIGNPOST.z - 0.1, x1: SIGNPOST.x + 0.3, z1: SIGNPOST.z + 0.1 })
  for (const t of villageTrees) addBox({ x0: t.x - 0.28, z0: t.z - 0.18, x1: t.x + 0.28, z1: t.z + 0.12 })
  for (const b of BUSHES) addBox({ x0: b.x - 0.5 * b.scale, z0: b.z - 0.22, x1: b.x + 0.5 * b.scale, z1: b.z + 0.12 })
  for (const p of PROPS) {
    const s = p.kind === 'crate' ? 0.34 : 0.3
    addBox({ x0: p.x - s, z0: p.z - s, x1: p.x + s, z1: p.z + s })
  }
  for (const [x0, z0, x1, z1] of FENCE_SEGMENTS) addSegment(x0, z0, x1, z1, 0.08)
  if (BEACON) addBox({ x0: BEACON.x - 0.42, z0: BEACON.z - 0.38, x1: BEACON.x + 0.42, z1: BEACON.z + 0.38 })
}

/** Build an interior's collision world from its wall and furniture boxes. */
export function buildAreaCollision(area: AreaId, bounds: { x0: number; z0: number; x1: number; z1: number }, list: Box[]) {
  const w = new World(Math.floor(bounds.x0), Math.floor(bounds.z0), Math.ceil(bounds.x1 - bounds.x0) + 1, Math.ceil(bounds.z1 - bounds.z0) + 1)
  for (const b of list) w.add(b)
  worlds.set(area, w)
}

/** Make another area's world active, carrying the player's body across. */
export function setCollisionArea(area: AreaId) {
  const next = worlds.get(area)
  if (!next || next === world) return
  const player = world.bodies.get('player')
  if (player) {
    world.bodies.delete('player')
    next.bodies.set('player', player)
  }
  world = next
}

export function registerBody(b: Body) {
  world.bodies.set(b.id, b)
}

export function unregisterBody(b: Body) {
  for (const w of worlds.values()) if (w.bodies.get(b.id) === b) w.bodies.delete(b.id)
}

export function getBody(id: string): Body | undefined {
  return world.bodies.get(id)
}

/** Debug views: static boxes and live bodies of the active area. */
export function getColliders(): { boxes: readonly Box[]; bodies: Iterable<Body> } {
  return { boxes: world.boxes, bodies: world.bodies.values() }
}

/** Put a body somewhere (e.g. a debug teleport), then push it out of anything it overlaps. */
export function placeBody(body: Body, x: number, z: number) {
  const p = { x, z }
  for (let i = 0; i < 4; i++) resolve(p, body.r, body.id)
  body.x = p.x
  body.z = p.z
}

function pushOutOfBox(p: { x: number; z: number }, r: number, b: Box) {
  const cx = Math.max(b.x0, Math.min(p.x, b.x1))
  const cz = Math.max(b.z0, Math.min(p.z, b.z1))
  const dx = p.x - cx
  const dz = p.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= r * r) return
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2)
    p.x += (dx / d) * (r - d)
    p.z += (dz / d) * (r - d)
  } else {
    // Centre inside the box: leave along the shallowest axis.
    const l = p.x - b.x0
    const rr = b.x1 - p.x
    const t = p.z - b.z0
    const bb = b.z1 - p.z
    const m = Math.min(l, rr, t, bb)
    if (m === l) p.x = b.x0 - r
    else if (m === rr) p.x = b.x1 + r
    else if (m === t) p.z = b.z0 - r
    else p.z = b.z1 + r
  }
}

function resolve(p: { x: number; z: number }, r: number, selfId: string) {
  const w = world
  p.x = Math.max(w.x0 + r, Math.min(w.x0 + w.w - r, p.x))
  p.z = Math.max(w.z0 + r, Math.min(w.z0 + w.h - r, p.z))
  const cell = w.cell(p.x, p.z)
  if (cell) for (const i of cell) pushOutOfBox(p, r, w.boxes[i])
  for (const b of w.bodies.values()) {
    if (b.id === selfId) continue
    const dx = p.x - b.x
    const dz = p.z - b.z
    const min = r + b.r
    const d2 = dx * dx + dz * dz
    if (d2 < min * min && d2 > 1e-10) {
      const d = Math.sqrt(d2)
      p.x += (dx / d) * (min - d)
      p.z += (dz / d) * (min - d)
    }
  }
}

/** Move a body by (dx, dz) with sliding collision. Returns the distance actually travelled. */
export function moveBody(body: Body, dx: number, dz: number): number {
  const len = Math.hypot(dx, dz)
  if (len === 0) return 0
  const steps = Math.ceil(len / 0.08)
  const sx = body.x
  const sz = body.z
  const p = { x: body.x, z: body.z }
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps
    p.z += dz / steps
    resolve(p, body.r, body.id)
    resolve(p, body.r, body.id)
  }
  body.x = p.x
  body.z = p.z
  return Math.hypot(p.x - sx, p.z - sz)
}
