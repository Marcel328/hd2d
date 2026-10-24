// Procedural billboard sprites (trees, bushes, foliage, signpost, icons) packed into one atlas.
import * as THREE from 'three'
import { PixelBuffer, hex, mix, ramp, type RGB } from './pixels'
import { bayer4, hash2, mulberry32, valueNoise } from './random'

const OUTLINE = hex('#17200f')

interface Blob {
  x: number
  y: number
  r: number
  z: number
}

/** Shade a cluster of foliage blobs as little lit spheres; returns a mask of covered pixels. */
function paintFoliage(b: PixelBuffer, blobs: Blob[], pal: RGB[], seed: number) {
  const owner = new Int16Array(b.w * b.h).fill(-1)
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      let best = -1
      let bestZ = -1e9
      blobs.forEach((bl, i) => {
        const dx = x + 0.5 - bl.x
        const dy = y + 0.5 - bl.y
        // Wobbly edge so clumps don't look like perfect circles.
        const wob = (valueNoise(x * 0.45, y * 0.45, seed + i) - 0.5) * 2.6
        if (dx * dx + dy * dy < (bl.r + wob) * (bl.r + wob) && bl.z > bestZ) {
          best = i
          bestZ = bl.z
        }
      })
      owner[y * b.w + x] = best
    }

  const L = [-0.55, -0.7, 0.45]
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const i = owner[y * b.w + x]
      if (i < 0) continue
      const bl = blobs[i]
      const nx = (x + 0.5 - bl.x) / bl.r
      const ny = (y + 0.5 - bl.y) / bl.r
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      let v = (nx * L[0] + ny * L[1] + nz * L[2]) * 0.55 + 0.45
      v += (1 - y / b.h) * 0.18
      v += (bayer4(x, y) - 0.5) * 0.22
      const leaf = hash2(x, y, seed)
      if (leaf > 0.86) v += 0.18
      else if (leaf < 0.08) v -= 0.2
      // Clump separation: a darker line where a nearer clump overlaps this one from below.
      const below = owner[Math.min(b.h - 1, y + 1) * b.w + x]
      const right = owner[y * b.w + Math.min(b.w - 1, x + 1)]
      if ((below >= 0 && below !== i && blobs[below].z > bl.z) || (right >= 0 && right !== i && blobs[right].z > bl.z))
        v -= 0.35
      const idx = Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))
      b.set(x, y, pal[idx])
    }
}

function paintTrunk(b: PixelBuffer, cx: number, top: number, bottom: number, w0: number, w1: number, bark: RGB, birch = false) {
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / Math.max(1, bottom - top)
    let w = w0 + (w1 - w0) * t
    if (y > bottom - 3) w += (y - (bottom - 3)) * 1.2 // root flare
    const x0 = Math.round(cx - w / 2)
    const x1 = Math.round(cx + w / 2)
    for (let x = x0; x < x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0 - 1)
      let c = u < 0.3 ? ramp(bark, 0.8) : u > 0.7 ? ramp(bark, -1.2) : bark
      if (birch) {
        if (hash2(x >> 1, y, 77) > 0.82) c = hex('#2a2626')
      } else if (hash2(x, y >> 1, 78) > 0.8) c = ramp(c, -1)
      b.set(x, y, c)
    }
  }
}

function oak(seed: number, pal: RGB[], bark = hex('#5c3b24')): PixelBuffer {
  const b = new PixelBuffer(48, 64)
  const rand = mulberry32(seed)
  paintTrunk(b, 24, 30, 62, 5, 7, bark)
  // The crown shades the upper trunk.
  for (let y = 30; y < 40; y++) for (let x = 14; x < 34; x++) if (b.alpha(x, y)) b.set(x, y, ramp(b.get(x, y), -1.2))
  // Two branches reaching into the crown.
  for (let i = 0; i < 6; i++) {
    b.set(21 - i, 34 - i, ramp(bark, -0.5))
    b.set(22 - i, 34 - i, ramp(bark, -0.5))
    b.set(27 + i, 36 - i, ramp(bark, -1))
  }
  const blobs: Blob[] = [{ x: 24, y: 24, r: 13, z: 0 }]
  for (let i = 0; i < 13; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand())
    blobs.push({
      x: 24 + Math.cos(a) * d * 13,
      y: 23 + Math.sin(a) * d * 11,
      r: 6 + rand() * 4.5,
      z: 23 + Math.sin(a) * d * 11 + rand() * 6, // lower clumps sit in front
    })
  }
  paintFoliage(b, blobs, pal, seed)
  b.outline(OUTLINE)
  return b
}

function pine(seed: number): PixelBuffer {
  const b = new PixelBuffer(40, 72)
  const pal = ['#16302a', '#1f4034', '#2b5440', '#3a6a4a', '#5a8a5a'].map(hex)
  paintTrunk(b, 20, 56, 70, 4, 5, hex('#4a2f22'))
  const tiers = 5
  for (let t = 0; t < tiers; t++) {
    const apex = 2 + t * 10
    const height = 16 + t * 1.5
    const half = 6 + t * 3.2
    for (let y = apex; y < apex + height; y++) {
      const k = (y - apex) / height
      const w = half * k
      for (let x = Math.round(20 - w); x <= Math.round(20 + w); x++) {
        // Jagged lower edge of each tier.
        if (y > apex + height - 3 && hash2(x, y, seed) > 0.55) continue
        const u = (x - (20 - w)) / Math.max(1, 2 * w)
        let v = 0.75 - u * 0.55 + (1 - k) * 0.2 + (bayer4(x, y) - 0.5) * 0.2
        if (y >= apex + height - 2) v -= 0.3
        if (hash2(x, y, seed + 3) > 0.9) v += 0.15
        b.set(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))])
      }
    }
  }
  b.outline(hex('#0f1d16'))
  return b
}

function birch(seed: number): PixelBuffer {
  const b = new PixelBuffer(40, 64)
  const rand = mulberry32(seed)
  paintTrunk(b, 20, 22, 62, 3, 4, hex('#e9e4d8'), true)
  const blobs: Blob[] = []
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand())
    blobs.push({ x: 20 + Math.cos(a) * d * 10, y: 21 + Math.sin(a) * d * 14, r: 5 + rand() * 3.5, z: rand() * 10 + Math.sin(a) * 5 })
  }
  paintFoliage(b, blobs, ['#3d5a22', '#55772a', '#6f9434', '#8fb243', '#b8d06a'].map(hex), seed)
  b.outline(OUTLINE)
  return b
}

function bush(seed: number): PixelBuffer {
  const b = new PixelBuffer(32, 22)
  const rand = mulberry32(seed)
  const blobs: Blob[] = [{ x: 16, y: 14, r: 8, z: 0 }]
  for (let i = 0; i < 7; i++)
    blobs.push({ x: 7 + rand() * 18, y: 9 + rand() * 8, r: 4 + rand() * 3, z: rand() * 4 + 2 })
  paintFoliage(b, blobs, ['#22401f', '#2f5626', '#3f6f2e', '#58893a', '#7aa84a'].map(hex), seed)
  // A few berries.
  for (let i = 0; i < 5; i++) {
    const x = 6 + Math.floor(rand() * 20)
    const y = 8 + Math.floor(rand() * 10)
    if (b.alpha(x, y)) b.set(x, y, hex('#d24a4a'))
  }
  b.outline(OUTLINE)
  return b
}

function grassTuft(seed: number): PixelBuffer {
  const b = new PixelBuffer(10, 8)
  const rand = mulberry32(seed)
  const pal = ['#355e24', '#4c7d30', '#64993a', '#86b84c'].map(hex)
  const blades = 4 + Math.floor(rand() * 3)
  for (let i = 0; i < blades; i++) {
    let x = 2 + rand() * 6
    const lean = (rand() - 0.5) * 0.9
    const h = 4 + Math.floor(rand() * 4)
    for (let j = 0; j < h; j++) {
      const y = 7 - j
      const c = pal[Math.min(pal.length - 1, Math.floor((j / h) * pal.length + rand() * 0.5))]
      b.set(Math.round(x), y, c)
      x += lean
    }
  }
  return b
}

function flower(petal: string): PixelBuffer {
  const b = new PixelBuffer(7, 8)
  const stem = hex('#3f6f2e')
  b.set(3, 7, stem)
  b.set(3, 6, stem)
  b.set(3, 5, stem)
  b.set(2, 6, hex('#5a8f36'))
  const p = hex(petal)
  b.set(3, 1, p)
  b.set(2, 2, p)
  b.set(4, 2, p)
  b.set(3, 3, ramp(p, -1))
  b.set(3, 2, hex('#f6d860'))
  return b
}

function cabbage(): PixelBuffer {
  const b = new PixelBuffer(12, 10)
  const blobs: Blob[] = [
    { x: 6, y: 6, r: 4.5, z: 0 },
    { x: 3.5, y: 6.5, r: 3, z: 1 },
    { x: 8.5, y: 6.5, r: 3, z: 1 },
    { x: 6, y: 4.5, r: 2.6, z: 2 },
  ]
  paintFoliage(b, blobs, ['#3e6b3a', '#558a4c', '#74a862', '#a3cc86'].map(hex), 7)
  b.outline(OUTLINE)
  return b
}

function sprout(): PixelBuffer {
  const b = new PixelBuffer(8, 8)
  const g = ['#3f7a2e', '#5f9a3a', '#86bb4f'].map(hex)
  for (const [x, y, c] of [
    [3, 7, 0],
    [3, 6, 1],
    [2, 5, 1],
    [4, 5, 1],
    [1, 4, 2],
    [5, 4, 2],
    [3, 4, 2],
    [2, 3, 2],
    [4, 3, 1],
  ] as [number, number, number][])
    b.set(x, y, g[c])
  b.set(3, 7, hex('#d9772f'))
  return b
}

function signpost(): PixelBuffer {
  const b = new PixelBuffer(28, 32)
  const wood = hex('#8a5a34')
  // Post
  for (let y = 4; y < 32; y++)
    for (let x = 12; x < 16; x++) b.set(x, y, x === 12 ? ramp(wood, 0.6) : x === 15 ? ramp(wood, -1.4) : wood)
  b.rect(12, 3, 4, 1, ramp(wood, 0.6))
  // Boards (arrow-shaped)
  const board = (y: number, dir: 1 | -1, len: number) => {
    const x0 = dir === 1 ? 7 : 21 - len
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < len; i++) {
        const tip = dir === 1 ? i >= len - 3 && Math.abs(j - 2.5) > len - 1 - i + 0.2 : i < 3 && Math.abs(j - 2.5) > i + 0.2
        if (tip) continue
        let c = mix(ramp(wood, 0.3), ramp(wood, -0.3), hash2(i, j >> 1, y))
        if (j === 0) c = ramp(wood, 1.1)
        if (j === 5) c = ramp(wood, -1.6)
        b.set(x0 + i, y + j, c)
      }
    // Painted lettering squiggles
    for (let i = 3; i < len - 4; i++) if (hash2(i, y, 3) > 0.35) b.set(x0 + i + (dir === 1 ? 0 : 2), y + 2 + (i % 2), hex('#3a2416'))
  }
  board(6, 1, 19)
  board(14, -1, 17)
  b.outline(hex('#21160f'))
  return b
}

function talkIcon(): PixelBuffer {
  const b = new PixelBuffer(14, 12)
  const white = hex('#fbf6e9')
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 14; x++) {
      const corner = (x === 0 || x === 13) && (y === 0 || y === 7)
      if (!corner) b.set(x, y, white)
    }
  b.set(4, 8, white)
  b.set(5, 8, white)
  b.set(4, 9, white)
  for (const x of [3, 6, 9]) b.rect(x, 3, 2, 2, hex('#3a2a35'))
  b.outline(hex('#2a1c24'))
  return b
}

function readIcon(): PixelBuffer {
  const b = new PixelBuffer(14, 12)
  const white = hex('#fbf6e9')
  b.rect(0, 0, 14, 8, white)
  b.set(4, 8, white)
  b.set(5, 8, white)
  b.set(4, 9, white)
  b.rect(6, 1, 2, 4, hex('#c9762b'))
  b.rect(6, 6, 2, 1, hex('#c9762b'))
  b.outline(hex('#2a1c24'))
  return b
}

export interface AtlasRect {
  /** uv offset and scale for the sprite inside the atlas */
  u: number
  v: number
  su: number
  sv: number
  w: number
  h: number
}

export type SpriteName =
  | 'oak'
  | 'oak2'
  | 'pine'
  | 'birch'
  | 'bush'
  | 'tuft0'
  | 'tuft1'
  | 'tuft2'
  | 'flowerRed'
  | 'flowerYellow'
  | 'flowerWhite'
  | 'flowerViolet'
  | 'cabbage'
  | 'sprout'
  | 'signpost'
  | 'talk'
  | 'read'

export interface SpriteAtlas {
  texture: THREE.CanvasTexture
  rects: Record<SpriteName, AtlasRect>
}

let atlas: SpriteAtlas | null = null

export function getSpriteAtlas(): SpriteAtlas {
  if (atlas) return atlas
  const oakPal = ['#1d3a1c', '#2b5326', '#3d6f2e', '#5a8f3a', '#86b44c'].map(hex)
  const oak2Pal = ['#1b3326', '#274a30', '#36633a', '#4f7f45', '#78a25a'].map(hex)
  const sprites: [SpriteName, PixelBuffer][] = [
    ['oak', oak(11, oakPal)],
    ['oak2', oak(29, oak2Pal, hex('#4e3628'))],
    ['pine', pine(5)],
    ['birch', birch(41)],
    ['bush', bush(3)],
    ['tuft0', grassTuft(1)],
    ['tuft1', grassTuft(2)],
    ['tuft2', grassTuft(9)],
    ['flowerRed', flower('#e0504a')],
    ['flowerYellow', flower('#f2c94c')],
    ['flowerWhite', flower('#f4f1e8')],
    ['flowerViolet', flower('#9b6bd6')],
    ['cabbage', cabbage()],
    ['sprout', sprout()],
    ['signpost', signpost()],
    ['talk', talkIcon()],
    ['read', readIcon()],
  ]

  // Simple shelf packer with a 1px gutter (2px around big sprites to avoid bleeding).
  const W = 256
  let x = 0
  let y = 0
  let shelf = 0
  const placed: [SpriteName, PixelBuffer, number, number][] = []
  for (const [name, buf] of sprites) {
    if (x + buf.w + 2 > W) {
      x = 0
      y += shelf + 2
      shelf = 0
    }
    placed.push([name, buf, x + 1, y + 1])
    x += buf.w + 2
    shelf = Math.max(shelf, buf.h)
  }
  const H = 1 << Math.ceil(Math.log2(y + shelf + 2))
  const sheet = new PixelBuffer(W, H)
  const rects = {} as Record<SpriteName, AtlasRect>
  for (const [name, buf, px, py] of placed) {
    sheet.blit(buf, px, py)
    rects[name] = {
      u: px / W,
      v: 1 - (py + buf.h) / H,
      su: buf.w / W,
      sv: buf.h / H,
      w: buf.w,
      h: buf.h,
    }
  }
  const texture = new THREE.CanvasTexture(sheet.toCanvas())
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  atlas = { texture, rects }
  return atlas
}

// ---------- soft (non-pixel) helper textures for light & atmosphere ----------

function softCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let glowTex: THREE.Texture | null = null
export function getGlowTexture() {
  glowTex ??= softCanvas(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  })
  return glowTex
}

let shaftTex: THREE.Texture | null = null
export function getShaftTexture() {
  shaftTex ??= softCanvas(64, 256, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 256)
    v.addColorStop(0, 'rgba(255,255,255,0)')
    v.addColorStop(0.25, 'rgba(255,255,255,0.8)')
    v.addColorStop(0.75, 'rgba(255,255,255,0.5)')
    v.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, 64, 256)
    // Soft horizontal falloff
    ctx.globalCompositeOperation = 'destination-in'
    const hgr = ctx.createLinearGradient(0, 0, 64, 0)
    hgr.addColorStop(0, 'rgba(0,0,0,0)')
    hgr.addColorStop(0.5, 'rgba(0,0,0,1)')
    hgr.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = hgr
    ctx.fillRect(0, 0, 64, 256)
  })
  return shaftTex
}

let blobShadowTex: THREE.Texture | null = null
export function getBlobShadowTexture() {
  blobShadowTex ??= softCanvas(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(0,0,0,0.75)')
    g.addColorStop(0.6, 'rgba(0,0,0,0.4)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
  })
  return blobShadowTex
}
