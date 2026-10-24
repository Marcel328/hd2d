// Bakes the whole ground into one texture (one draw call): terrain colours, organic borders
// between terrain types, pebbles, cobblestones and baked contact AO around buildings.
import * as THREE from 'three'
import { PixelBuffer, hex, mix, type RGB } from './pixels'
import { fbm, hash2, valueNoise } from './random'
import { MAP_H, MAP_W, terrainAt, type Terrain } from '../game/world/map'
import { HOUSES, WELL } from '../game/world/layout'

export const PPU = 16
export const GROUND_PAD = 10

const GRASS = ['#3f6b2a', '#4c7d30', '#5a8f36', '#6aa03d', '#7db347'].map(hex)
const FOREST = ['#25401f', '#2e4f24', '#3a5f2a', '#4a6b2e'].map(hex)
const DIRT = ['#6e5236', '#7f6040', '#91704a', '#a68457', '#b99a68'].map(hex)
const STONE = ['#5f5a57', '#77716b', '#8c857c', '#a39b8f', '#bbb2a3'].map(hex)
const MORTAR = hex('#3d3936')
const SOIL = ['#3e2a1c', '#4d3523', '#5e432c', '#6f5236'].map(hex)
const RIVERBED = ['#1d3a3a', '#24494a', '#2d5a57', '#3a6c64'].map(hex)
const SAND = ['#8d7a58', '#a38f68', '#b8a67d'].map(hex)

function pick(pal: RGB[], v: number): RGB {
  return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]
}

/** Terrain sampled with a wobble so borders between materials look hand-drawn. */
function jitteredTerrain(wx: number, wz: number): Terrain {
  const jx = (valueNoise(wx * 2.3, wz * 2.3, 11) - 0.5) * 0.55
  const jz = (valueNoise(wx * 2.3 + 40, wz * 2.3 + 40, 12) - 0.5) * 0.55
  const t = terrainAt(Math.floor(wx + jx), Math.floor(wz + jz))
  return t === 'bridge' ? 'water' : t
}

function baseKind(t: Terrain): 'grass' | 'forest' | 'dirt' | 'stone' | 'soil' | 'water' {
  switch (t) {
    case 'path':
      return 'dirt'
    case 'cobble':
      return 'stone'
    case 'soil':
      return 'soil'
    case 'water':
    case 'bridge':
      return 'water'
    case 'forest':
      return 'forest'
    default:
      return 'grass'
  }
}

/** Worley-style cobbles: distance to the nearest and second nearest jittered cell centre. */
function cobble(px: number, py: number): { edge: number; cell: number; dx: number; dy: number } {
  const size = 6
  const cx = Math.floor(px / size)
  const cy = Math.floor(py / size)
  let d1 = 1e9
  let d2 = 1e9
  let cell = 0
  let dx = 0
  let dy = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i
      const gy = cy + j
      const ox = (gx + 0.2 + hash2(gx, gy, 5) * 0.6) * size
      const oy = (gy + 0.2 + hash2(gx, gy, 6) * 0.6) * size
      const ddx = px - ox
      const ddy = py - oy
      const d = Math.sqrt(ddx * ddx * 0.8 + ddy * ddy)
      if (d < d1) {
        d2 = d1
        d1 = d
        cell = hash2(gx, gy, 7)
        dx = ddx
        dy = ddy
      } else if (d < d2) d2 = d
    }
  return { edge: d2 - d1, cell, dx, dy }
}

function houseAO(wx: number, wz: number): number {
  let ao = 0
  for (const h of HOUSES) {
    const dx = Math.max(h.x0 - wx, 0, wx - h.x1)
    const dz = Math.max(h.z0 - wz, 0, wz - h.z1)
    const d = Math.hypot(dx, dz)
    ao = Math.max(ao, Math.max(0, 1 - d / 0.7))
  }
  const dw = Math.hypot(wx - WELL.x, wz - WELL.z) - WELL.radius
  ao = Math.max(ao, Math.max(0, 1 - dw / 0.45) * 0.8)
  return ao
}

const KINDS = ['grass', 'forest', 'dirt', 'stone', 'soil', 'water'] as const
type Kind = (typeof KINDS)[number]

export function buildGroundTexture(anisotropy = 4): THREE.CanvasTexture {
  const tilesW = MAP_W + GROUND_PAD * 2
  const tilesH = MAP_H + GROUND_PAD * 2
  const buf = new PixelBuffer(tilesW * PPU, tilesH * PPU)
  const W = buf.w
  const H = buf.h

  // Pass 1: classify every pixel once so border tests are cheap lookups.
  const kinds = new Uint8Array(W * H)
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const k = baseKind(jitteredTerrain(px / PPU - GROUND_PAD, py / PPU - GROUND_PAD))
      kinds[py * W + px] = KINDS.indexOf(k)
    }
  const kindAt = (x: number, y: number): Kind =>
    KINDS[kinds[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]]
  const near = (x: number, y: number, r: number, k: Kind) =>
    kindAt(x + r, y) === k || kindAt(x - r, y) === k || kindAt(x, y + r) === k || kindAt(x, y - r) === k

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const wx = px / PPU - GROUND_PAD
      const wz = py / PPU - GROUND_PAD
      const kind = kindAt(px, py)
      const n = hash2(px, py, 1)
      const big = fbm(wx * 0.35, wz * 0.35, 3, 3)
      const mid = valueNoise(wx * 1.7, wz * 1.7, 4)
      let c: RGB

      switch (kind) {
        case 'grass': {
          let v = big * 0.55 + mid * 0.3 + n * 0.25
          // Short vertical blade strokes.
          if (hash2(px, py >> 1, 9) > 0.93) v += 0.25
          if (hash2(px, (py + 1) >> 1, 9) > 0.95) v -= 0.22
          c = pick(GRASS, v)
          break
        }
        case 'forest': {
          const v = big * 0.5 + mid * 0.3 + n * 0.25
          c = pick(FOREST, v)
          if (hash2(px >> 1, py >> 1, 21) > 0.94) c = mix(c, hex('#6b4a2a'), 0.6) // leaf litter
          break
        }
        case 'dirt': {
          const v = big * 0.4 + mid * 0.35 + n * 0.3
          c = pick(DIRT, v)
          if (hash2(px, py, 2) > 0.975) c = hex('#c9b38a') // pebble highlight
          else if (hash2(px, py, 3) > 0.975) c = hex('#5a412b')
          break
        }
        case 'stone': {
          const cb = cobble(px, py)
          if (cb.edge < 1.1) c = MORTAR
          else {
            const shade = cb.cell * 0.6 + n * 0.15 + 0.15
            c = pick(STONE, shade)
            // Bevel: light from the upper left.
            if (cb.dx < -1.2 && cb.dy < -1.0) c = mix(c, hex('#d8cfbf'), 0.35)
            else if (cb.dx > 1.4 || cb.dy > 1.4) c = mix(c, MORTAR, 0.3)
          }
          break
        }
        case 'soil': {
          const furrow = (py % 8) / 8
          const v = furrow < 0.25 ? 0.05 : furrow < 0.5 ? 0.35 : 0.7 + n * 0.3
          c = pick(SOIL, v * 0.8 + n * 0.2)
          break
        }
        case 'water': {
          const v = big * 0.5 + n * 0.35
          c = pick(RIVERBED, v)
          if (hash2(px >> 1, py >> 1, 31) > 0.9) c = mix(c, hex('#6f8a7a'), 0.5) // pebbles
          // Lighter toward the shore.
          if (kindAt(px + 5, py) !== 'water' || kindAt(px - 5, py) !== 'water' || kindAt(px, py + 5) !== 'water' || kindAt(px, py - 5) !== 'water')
            c = mix(c, hex('#5a7a62'), 0.45)
          break
        }
      }

      // Borders: sandy bank next to water, darker rim where dirt meets grass.
      if (kind !== 'water' && near(px, py, 3, 'water')) c = pick(SAND, n * 0.6 + big * 0.4)
      else if (kind === 'dirt' && near(px, py, 2, 'grass')) c = mix(c, hex('#4f3a26'), 0.45)
      else if (kind === 'grass' && near(px, py, 1, 'dirt')) c = mix(c, hex('#4a6a2a'), 0.35)

      // Baked ambient occlusion around buildings, plus a fade into the dark forest.
      const ao = houseAO(wx, wz)
      if (ao > 0) c = mix(c, hex('#1a1a14'), ao * 0.45)
      const outside = Math.max(-wx, wx - MAP_W, -wz, wz - MAP_H, 0)
      if (outside > 0) c = mix(c, hex('#0f1a10'), Math.min(0.7, outside * 0.12))

      buf.set(px, py, c)
    }
  }

  const tex = new THREE.CanvasTexture(buf.toCanvas())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = anisotropy
  return tex
}
