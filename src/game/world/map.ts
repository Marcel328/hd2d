// Terrain layout for Elmbrook. One character = one world unit (= one 16px tile).
// World coordinates equal map coordinates: x grows east, z grows south (toward the camera).
//
// T forest   . grass   , flowers   : tall grass   = dirt path   # cobblestone
// ~ water    b bridge  d garden soil

export type Terrain =
  | 'forest'
  | 'grass'
  | 'flowers'
  | 'tallgrass'
  | 'path'
  | 'cobble'
  | 'water'
  | 'bridge'
  | 'soil'

const LEGEND: Record<string, Terrain> = {
  T: 'forest',
  '.': 'grass',
  ',': 'flowers',
  ':': 'tallgrass',
  '=': 'path',
  '#': 'cobble',
  '~': 'water',
  b: 'bridge',
  d: 'soil',
}

const ROWS = [
  'TTTTTTTTTTTTTTTTTTT~~TTT', // 0
  'TTTTTTTTTTTTTTTTTTT~~TTT', // 1
  'TT.....:.........,.~~.TT', // 2
  'TT.................~~.TT', // 3
  'TT..,..............~~.TT', // 4
  'TT.................~~.TT', // 5
  'TT...=.........=...~~.TT', // 6
  'TT.================bb===', // 7
  'TT.================bb===', // 8
  'TT.......######....~~.TT', // 9
  'TT,,.....######....~~.TT', // 10
  'TT.......######....~~.TT', // 11
  'TT.......######...~~..TT', // 12
  'TT.......######...~~:.TT', // 13
  'TT.........==.ddd.~~..TT', // 14
  'TT.........==.ddd.~~..TT', // 15
  'TT...=.....==.ddd.~~..TT', // 16
  'TT...========.....~~..TT', // 17
  'TT.........==.....~~..TT', // 18
  'TT.:.......==.....~~.TTT', // 19
  'TTT,.......==....~~~TTTT', // 20
  'TTTTT......==....~~TTTTT', // 21
  'TTTTTTTTTTT==TTTT~~TTTTT', // 22
  'TTTTTTTTTTT==TTTT~~TTTTT', // 23
]

export const MAP_W = ROWS[0].length
export const MAP_H = ROWS.length

for (const [i, row] of ROWS.entries()) {
  if (row.length !== MAP_W) throw new Error(`map row ${i} has length ${row.length}, expected ${MAP_W}`)
}

const terrain: Terrain[] = ROWS.join('').split('').map((c) => {
  const t = LEGEND[c]
  if (!t) throw new Error(`unknown map glyph "${c}"`)
  return t
})

/** Terrain at integer tile coordinates. Outside the map is forest. */
export function terrainAt(tx: number, tz: number): Terrain {
  if (tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_H) return 'forest'
  return terrain[tz * MAP_W + tx]
}

/** Terrain under a world-space point. */
export function terrainAtWorld(x: number, z: number): Terrain {
  return terrainAt(Math.floor(x), Math.floor(z))
}

export function isBlockingTerrain(t: Terrain): boolean {
  return t === 'forest' || t === 'water'
}

export function forEachTile(fn: (tx: number, tz: number, t: Terrain) => void) {
  for (let tz = 0; tz < MAP_H; tz++) for (let tx = 0; tx < MAP_W; tx++) fn(tx, tz, terrain[tz * MAP_W + tx])
}
