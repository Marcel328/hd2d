// Tileable pixel-art surface textures for 3D geometry (16 texels per world unit).
import * as THREE from 'three'
import { PixelBuffer, hex, mix, ramp, toTexture, type RGB } from './pixels'
import { hash2, valueNoise } from './random'
import type { RoofStyle } from '../game/world/layout'

/** World units covered by one repeat of each tiling texture (used when generating UVs). */
export const TEX_WORLD = {
  plaster: 2,
  stone: 2,
  planks: 2,
  timber: 1,
  roof: 2,
} as const

function pick(pal: RGB[], v: number): RGB {
  return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]
}

export function plaster(): PixelBuffer {
  const b = new PixelBuffer(32, 32)
  const pal = ['#cdbb98', '#d9c9a6', '#e3d5b4', '#ebdfc1'].map(hex)
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const v = valueNoise(x / 6, y / 6, 3) * 0.6 + hash2(x, y, 4) * 0.4
      b.set(x, y, pick(pal, v))
    }
  // A couple of hairline cracks and chipped spots.
  for (const [x, y] of [
    [5, 8],
    [6, 9],
    [6, 10],
    [7, 11],
    [22, 20],
    [23, 21],
    [23, 22],
  ])
    b.set(x, y, hex('#a8957a'))
  b.rect(14, 26, 3, 2, hex('#b8a585'))
  return b
}

export function stoneBricks(): PixelBuffer {
  const b = new PixelBuffer(32, 32)
  const pal = ['#5d5955', '#6f6a64', '#827b72', '#958d82'].map(hex)
  const mortar = hex('#3a3633')
  const rowH = 6
  for (let y = 0; y < 32; y++) {
    const row = Math.floor(y / rowH)
    const off = row % 2 ? 5 : 0
    for (let x = 0; x < 32; x++) {
      const bx = Math.floor((x + off) / 10)
      const lx = (x + off) % 10
      const ly = y % rowH
      if (ly === rowH - 1 || lx === 9) {
        b.set(x, y, mortar)
        continue
      }
      const cell = hash2(bx, row, 8)
      let c = pick(pal, cell * 0.7 + hash2(x, y, 9) * 0.3)
      if (ly === 0 || lx === 0) c = ramp(c, 0.8)
      else if (ly === rowH - 2 || lx === 8) c = ramp(c, -0.8)
      b.set(x, y, c)
    }
  }
  return b
}

export function planks(base = '#8a5a34'): PixelBuffer {
  const b = new PixelBuffer(32, 32)
  const c0 = hex(base)
  for (let x = 0; x < 32; x++) {
    const plank = Math.floor(x / 5)
    const tone = hash2(plank, 0, 12)
    for (let y = 0; y < 32; y++) {
      const lx = x % 5
      if (lx === 4) {
        b.set(x, y, ramp(c0, -2.2))
        continue
      }
      const grain = valueNoise(x * 0.8, y / 5, plank) * 0.5 + hash2(x, y, 13) * 0.2
      let c = mix(ramp(c0, -0.6), ramp(c0, 0.8), tone * 0.5 + grain)
      if (lx === 0) c = ramp(c, 0.6)
      // Plank ends staggered per plank.
      if ((y + plank * 11) % 32 === 0) c = ramp(c0, -2)
      b.set(x, y, c)
    }
    // Knot
    const ky = Math.floor(hash2(plank, 1, 14) * 28) + 2
    if (hash2(plank, 2, 15) > 0.5) {
      b.set(x, ky, ramp(c0, -1.6))
    }
  }
  return b
}

export function timber(): PixelBuffer {
  const b = new PixelBuffer(16, 16)
  const c0 = hex('#4a2f1f')
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const g = valueNoise(x / 6, y * 0.9, 21) * 0.6 + hash2(x, y, 22) * 0.4
      b.set(x, y, mix(ramp(c0, -0.6), ramp(c0, 0.9), g))
    }
  return b
}

const ROOF_COLORS: Record<RoofStyle, string> = {
  red: '#a4462f',
  slate: '#4d6178',
  moss: '#6a7a3c',
}

/** Overlapping shingles with rounded lower corners; 8×4 texel shingles tile exactly in 32×32. */
export function roof(style: RoofStyle): PixelBuffer {
  const b = new PixelBuffer(32, 32)
  const c0 = hex(ROOF_COLORS[style])
  const W = 8
  const H = 4
  for (let y = 0; y < 32; y++) {
    const row = Math.floor(y / H)
    const off = row % 2 ? W / 2 : 0
    const ly = y % H
    for (let x = 0; x < 32; x++) {
      const sx = (x + off) % 32
      const tile = Math.floor(sx / W)
      const lx = sx % W
      const tone = hash2(tile, row, 31) * 0.8 + hash2(x, y, 32) * 0.2
      const base = mix(ramp(c0, -0.4), ramp(c0, 0.45), tone)
      let c: RGB
      if (ly === 0) c = ramp(c0, -1.9) // shadow cast by the row above
      else if (lx === 0) c = ramp(c0, -1.5) // gap between shingles
      else if (ly === H - 1 && (lx === 1 || lx === W - 1)) c = ramp(c0, -1.2) // rounded corners
      else if (ly === H - 1) c = ramp(base, 0.9) // sunlit lower lip
      else if (ly === 1) c = ramp(base, -0.5)
      else c = base
      if (style === 'moss' && valueNoise(x / 5, y / 4, 33) > 0.66 && ly !== 0) c = mix(c, hex('#8aa63e'), 0.5)
      b.set(x, y, c)
    }
  }
  return b
}

/** Door: 16×28 texels (1 × 1.75 units). */
export function door(): PixelBuffer {
  const b = new PixelBuffer(16, 28)
  const wood = hex('#6b4226')
  const frame = hex('#3d2616')
  const iron = hex('#2b2b30')
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || x === 15 || y === 0 || (y < 4 && (x < 2 || x > 13))
      if (edge) {
        b.set(x, y, frame)
        continue
      }
      const plank = Math.floor((x - 1) / 3.5)
      const g = valueNoise(x, y / 4, plank + 40) * 0.6 + hash2(x, y, 41) * 0.3
      let c = mix(ramp(wood, -0.6), ramp(wood, 0.7), g)
      if ((x - 1) % 4 === 3) c = ramp(wood, -1.8)
      b.set(x, y, c)
    }
  // Arched top: transparent corners filled with frame colour.
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [1, 2],
    [14, 1],
    [13, 1],
    [14, 2],
  ])
    b.set(x, y, frame)
  // Hinges and handle
  b.rect(2, 7, 6, 1, iron)
  b.rect(2, 20, 6, 1, iron)
  b.set(12, 14, hex('#c9a14a'))
  b.set(12, 15, hex('#8c6d2c'))
  return b
}

/** Window with shutters: 24×16 texels (1.5 × 1 units) plus a matching emissive mask. */
export function windowTex(): { color: PixelBuffer; emissive: PixelBuffer } {
  const color = new PixelBuffer(24, 16)
  const emissive = new PixelBuffer(24, 16)
  const frame = hex('#3d2616')
  const shutter = hex('#5b6e4a')
  const glass = hex('#24324a')
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 24; x++) {
      emissive.set(x, y, [0, 0, 0])
      if (x < 4 || x > 19) {
        // shutters with slats
        let c = y % 3 === 2 ? ramp(shutter, -1.4) : shutter
        if (x === 0 || x === 23) c = ramp(shutter, -2)
        color.set(x, y, c)
        continue
      }
      const inFrame = x === 4 || x === 19 || y === 0 || y === 15 || x === 11 || x === 12 || y === 7
      if (inFrame) {
        color.set(x, y, frame)
        continue
      }
      // Glass with a diagonal sheen.
      const sheen = (x + y) % 9 === 0 || (x + y) % 9 === 1
      color.set(x, y, sheen ? mix(glass, hex('#8aa4c8'), 0.5) : glass)
      const glow = 0.75 + 0.25 * hash2(x >> 1, y >> 1, 50)
      emissive.set(x, y, [255 * glow, 200 * glow, 120 * glow])
    }
  // Sill
  return { color, emissive }
}

export function crate(): PixelBuffer {
  const b = new PixelBuffer(16, 16)
  const wood = hex('#9a6b3c')
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const border = x < 2 || x > 13 || y < 2 || y > 13
      const diag = Math.abs(x - y) < 1.5
      const g = hash2(x, y >> 2, 60) * 0.5
      let c = mix(ramp(wood, -0.4), ramp(wood, 0.6), g)
      if (border || diag) c = ramp(wood, -1.2)
      if (x === 0 || y === 0) c = ramp(wood, 0.8)
      if (x === 15 || y === 15) c = ramp(wood, -2.4)
      b.set(x, y, c)
    }
  return b
}

export function barrel(): PixelBuffer {
  const b = new PixelBuffer(32, 16)
  const wood = hex('#7d5030')
  const band = hex('#3c3a3c')
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) {
      const stave = x % 4 === 3
      let c = mix(ramp(wood, -0.4), ramp(wood, 0.6), hash2(x >> 2, y >> 3, 61) * 0.7 + hash2(x, y, 62) * 0.3)
      if (stave) c = ramp(wood, -1.6)
      if (y === 2 || y === 3 || y === 12 || y === 13) c = y % 2 ? ramp(band, -1) : ramp(band, 1)
      b.set(x, y, c)
    }
  return b
}

export interface SurfaceSet {
  plaster: THREE.Texture
  stone: THREE.Texture
  planks: THREE.Texture
  darkPlanks: THREE.Texture
  timber: THREE.Texture
  roof: Record<RoofStyle, THREE.Texture>
  door: THREE.Texture
  window: THREE.Texture
  windowEmissive: THREE.Texture
  crate: THREE.Texture
  barrel: THREE.Texture
}

let cached: SurfaceSet | null = null

export function getSurfaces(anisotropy = 4): SurfaceSet {
  if (cached) return cached
  const tile = (b: PixelBuffer) => toTexture(b, { repeat: true, mipmaps: true, anisotropy })
  const win = windowTex()
  cached = {
    plaster: tile(plaster()),
    stone: tile(stoneBricks()),
    planks: tile(planks()),
    darkPlanks: tile(planks('#5e3d26')),
    timber: tile(timber()),
    roof: { red: tile(roof('red')), slate: tile(roof('slate')), moss: tile(roof('moss')) },
    door: toTexture(door(), { mipmaps: true, anisotropy }),
    window: toTexture(win.color, { mipmaps: true, anisotropy }),
    windowEmissive: toTexture(win.emissive, { mipmaps: true, anisotropy }),
    crate: tile(crate()),
    barrel: tile(barrel()),
  }
  return cached
}

/** Semi-transparent water ripples (RGBA), 32×32 texels tiling over 2 world units. */
export function waterTexture(): THREE.CanvasTexture {
  const b = new PixelBuffer(32, 32)
  const deep = hex('#2f6f95')
  const mid = hex('#3f86ad')
  const light = hex('#8fd0e6')
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      // Wavy horizontal highlight bands.
      const wave = Math.sin((x / 32) * Math.PI * 4 + Math.sin((y / 32) * Math.PI * 2) * 1.5) * 1.6
      const band = (y + wave + 32) % 8
      const n = hash2(x, y, 70)
      if (band < 1 && n > 0.25) b.set(x, y, light, 230)
      else if (band < 2 && n > 0.55) b.set(x, y, mix(mid, light, 0.5), 200)
      else b.set(x, y, n > 0.5 ? mid : deep, 150)
      if (hash2(x, y, 71) > 0.985) b.set(x, y, hex('#ffffff'), 255) // glints
    }
  return toTexture(b, { repeat: true })
}

// ---------- interior surfaces ----------

/** Floorboards running east–west with staggered butt joints; 32×32 texels over 2 units. */
export function floorboards(): PixelBuffer {
  const b = new PixelBuffer(32, 32)
  const c0 = hex('#9a6a3f')
  const boardH = 4
  for (let y = 0; y < 32; y++) {
    const board = Math.floor(y / boardH)
    const ly = y % boardH
    const joint = (board * 13) % 32
    const tone = hash2(board, 0, 81)
    for (let x = 0; x < 32; x++) {
      const segment = x < joint ? 0 : 1
      const g = valueNoise(x / 7, y * 0.6, board * 3 + segment) * 0.55 + hash2(x, y, 82) * 0.25
      let c = mix(ramp(c0, -0.7), ramp(c0, 0.55), tone * 0.45 + g)
      if (ly === boardH - 1) c = ramp(c0, -2.1) // gap between boards
      else if (ly === 0) c = ramp(c, 0.5)
      if (x === joint) c = ramp(c0, -1.8)
      if (hash2(x, board, 83) > 0.985 && ly === 1) c = ramp(c0, -1.4) // nail
      b.set(x, y, c)
    }
  }
  return b
}

/** Patchwork quilt; 16×16 texels per 1 unit. */
export function quilt(): PixelBuffer {
  const b = new PixelBuffer(16, 16)
  const patches = ['#a8443a', '#d9b05c', '#4f7a8c', '#7d9a4a'].map(hex)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const p = patches[((x >> 3) + (y >> 3) * 3) % patches.length]
      let c = (x + y) % 4 === 0 ? ramp(p, 0.6) : p
      if (x % 8 === 0 || y % 8 === 0) c = hex('#efe2c4') // stitching
      b.set(x, y, c)
    }
  return b
}

export function linen(): PixelBuffer {
  const b = new PixelBuffer(16, 16)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) b.set(x, y, mix(hex('#e4dccb'), hex('#f5f0e4'), hash2(x, y >> 1, 84) * 0.8))
  return b
}

/** Shelves of book spines; 32×32 texels over 2 units (four shelves). */
export function books(): PixelBuffer {
  const b = new PixelBuffer(32, 32)
  const spines = ['#7a2f2a', '#2f4f6e', '#3f6a3a', '#8a6a2a', '#5a3a6a', '#a8743a', '#2e2a2a'].map(hex)
  const shelf = hex('#3e2618')
  for (let row = 0; row < 4; row++) {
    const y0 = row * 8
    let x = 0
    let i = row * 5
    while (x < 32) {
      const wdt = 2 + Math.floor(hash2(i, row, 85) * 3)
      const h = 5 + Math.floor(hash2(i, row, 86) * 3)
      const c = spines[Math.floor(hash2(i, row, 87) * spines.length)]
      for (let dx = 0; dx < wdt && x + dx < 32; dx++)
        for (let dy = 0; dy < 7; dy++) {
          const yy = y0 + dy
          if (dy < 7 - h) b.set(x + dx, yy, hex('#1e130c')) // gap above the book
          else {
            let cc = dx === 0 ? ramp(c, 0.7) : dx === wdt - 1 ? ramp(c, -1) : c
            if (dy === 7 - h + 1) cc = hex('#d9b05c') // gilt band
            b.set(x + dx, yy, cc)
          }
        }
      x += wdt
      i++
    }
    for (let x2 = 0; x2 < 32; x2++) b.set(x2, y0 + 7, shelf)
  }
  return b
}

/** Woven rug with a border; drawn once over its whole rectangle (not tiled). */
export function rug(w: number, h: number, field: string, border: string): PixelBuffer {
  const b = new PixelBuffer(w, h)
  const f = hex(field)
  const br = hex(border)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y)
      let c: RGB
      if (edge === 0) c = ramp(br, -1.2)
      else if (edge < 3) c = (x + y) % 2 ? br : ramp(br, 0.6)
      else {
        // Diamond medallions on the field.
        const cx = Math.abs(x - w / 2) / (w / 2)
        const cy = Math.abs(y - h / 2) / (h / 2)
        const d = cx + cy
        c = d < 0.35 ? ramp(br, 0.5) : d < 0.45 ? ramp(f, -1) : (x * 3 + y * 5) % 11 === 0 ? ramp(f, 0.7) : f
      }
      b.set(x, y, mix(c, ramp(c, -0.5), hash2(x, y, 88) * 0.35))
    }
  return b
}

export interface InteriorSurfaceSet {
  floor: THREE.Texture
  quilt: THREE.Texture
  linen: THREE.Texture
  books: THREE.Texture
  rug: THREE.Texture
  doormat: THREE.Texture
}

let interiorCache: InteriorSurfaceSet | null = null

export function getInteriorSurfaces(): InteriorSurfaceSet {
  if (interiorCache) return interiorCache
  const tile = (b: PixelBuffer) => toTexture(b, { repeat: true, mipmaps: true, anisotropy: 4 })
  interiorCache = {
    floor: tile(floorboards()),
    quilt: tile(quilt()),
    linen: tile(linen()),
    books: tile(books()),
    rug: toTexture(rug(60, 38, '#8c2f2a', '#d9a94f'), { mipmaps: true, anisotropy: 4 }),
    doormat: toTexture(rug(16, 10, '#6a5a3a', '#3e3424'), { mipmaps: true, anisotropy: 4 }),
  }
  return interiorCache
}
