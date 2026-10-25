import { useMemo } from 'react'
import { InstancedSprites, type SpriteInstance } from './InstancedSprites'
import { BUSHES, HOUSES, SIGNPOST, buildTrees } from '../game/world/layout'
import { forEachTile, terrainAtWorld } from '../game/world/map'
import { hash2, mulberry32 } from '../gfx/random'
import type { SpriteName } from '../gfx/propSprites'

/** Trees and bushes cast shadows and get the see-through cut-out when they hide the player. */
export function Trees() {
  const instances = useMemo<SpriteInstance[]>(
    () => [
      ...buildTrees().map((t) => ({
        sprite: t.kind,
        x: t.x,
        z: t.z,
        scale: t.scale,
        tint: t.tint,
        sway: 0.012,
        flip: hash2(Math.floor(t.x * 10), Math.floor(t.z * 10)) > 0.5,
      })),
      ...BUSHES.map((b, i) => ({ sprite: 'bush' as const, x: b.x, z: b.z, scale: b.scale, sway: 0.01, flip: i % 2 === 1 })),
      { sprite: 'signpost' as const, x: SIGNPOST.x, z: SIGNPOST.z },
    ],
    [],
  )
  return <InstancedSprites instances={instances} castShadow occlude />
}

function insideHouse(x: number, z: number) {
  return HOUSES.some((h) => x > h.x0 - 0.3 && x < h.x1 + 0.3 && z > h.z0 - 0.3 && z < h.z1 + 0.6)
}

/** Grass tufts, flowers and garden crops: small swaying decals, density scaled by quality. */
export function Foliage({ density }: { density: number }) {
  const instances = useMemo<SpriteInstance[]>(() => {
    const rand = mulberry32(99)
    const out: SpriteInstance[] = []
    const flowers: SpriteName[] = ['flowerRed', 'flowerYellow', 'flowerWhite', 'flowerViolet']
    const tufts: SpriteName[] = ['tuft0', 'tuft1', 'tuft2']
    forEachTile((tx, tz, t) => {
      let count = 0
      if (t === 'grass') count = 2
      else if (t === 'tallgrass') count = 7
      else if (t === 'flowers') count = 5
      else if (t === 'forest') count = 1
      for (let i = 0; i < count; i++) {
        const x = tx + rand()
        const z = tz + rand()
        if (rand() > density) continue
        // Stay on grass (borders are jittered) and away from walls.
        const under = terrainAtWorld(x, z)
        if (under === 'path' || under === 'cobble' || under === 'water' || under === 'bridge' || under === 'soil') continue
        if (insideHouse(x, z)) continue
        const isFlower = t === 'flowers' ? rand() < 0.7 : rand() < 0.12
        out.push({
          sprite: isFlower ? flowers[Math.floor(rand() * flowers.length)] : tufts[Math.floor(rand() * tufts.length)],
          x,
          z,
          scale: 0.9 + rand() * 0.4,
          tint: 0.85 + rand() * 0.25,
          sway: isFlower ? 0.05 : 0.09,
          flip: rand() < 0.5,
        })
      }
    })
    // Garden rows: cabbages and sprouts on the soil plot.
    for (let gz = 0; gz < 3; gz++)
      for (let gx = 0; gx < 3; gx++)
        if (terrainAtWorld(14.5 + gx, 14.55 + gz) === 'soil') out.push({
          sprite: gz === 1 ? 'sprout' : 'cabbage',
          x: 14.5 + gx,
          z: 14.55 + gz,
          scale: 1,
          sway: gz === 1 ? 0.04 : 0.01,
          flip: (gx + gz) % 2 === 0,
        })
    return out
  }, [density])
  return <InstancedSprites instances={instances} />
}
