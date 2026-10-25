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


function searchIcon(): PixelBuffer {
  const b = new PixelBuffer(14, 12)
  const white = hex('#fbf6e9')
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 14; x++) if (!((x === 0 || x === 13) && (y === 0 || y === 7))) b.set(x, y, white)
  b.set(4, 8, white)
  b.set(5, 8, white)
  b.set(4, 9, white)
  // Magnifying glass: brass ring, pale lens, handle.
  const ring = hex('#b07a2a')
  for (const [x, y] of [[5, 1], [6, 1], [7, 1], [4, 2], [8, 2], [4, 3], [8, 3], [4, 4], [8, 4], [5, 5], [6, 5], [7, 5]]) b.set(x, y, ring)
  for (const [x, y] of [[5, 2], [6, 2], [7, 2], [5, 3], [6, 3], [7, 3], [5, 4], [6, 4], [7, 4]]) b.set(x, y, hex('#bfe3f2'))
  b.set(5, 2, hex('#ffffff'))
  b.set(9, 6, hex('#5a3a22'))
  b.set(10, 6, hex('#5a3a22'))
  b.outline(hex('#2a1c24'))
  return b
}

function sparkle(): PixelBuffer {
  const b = new PixelBuffer(9, 9)
  const gold = hex('#ffe9a0')
  for (let i = 0; i < 9; i++) {
    const c = Math.abs(i - 4) <= 1 ? hex('#ffffff') : gold
    if (Math.abs(i - 4) <= 3) {
      b.set(4, i, c)
      b.set(i, 4, c)
    }
  }
  b.set(3, 3, gold)
  b.set(5, 3, gold)
  b.set(3, 5, gold)
  b.set(5, 5, gold)
  return b
}

function jars(): PixelBuffer {
  const b = new PixelBuffer(16, 10)
  const fills = ['#d9902a', '#6f8f3a', '#a8343a'].map(hex)
  fills.forEach((f, i) => {
    const x0 = i * 5 + 1
    const h = 6 + (i % 2)
    for (let y = 10 - h; y < 10; y++)
      for (let x = x0; x < x0 + 4; x++) b.set(x, y, x === x0 ? ramp(f, 0.8) : x === x0 + 3 ? ramp(f, -0.8) : f)
    b.rect(x0, 10 - h - 1, 4, 1, hex('#efe2c4')) // cloth lid
    b.set(x0 + 1, 10 - h + 1, hex('#ffffff'))
  })
  b.outline(hex('#2a1a12'))
  return b
}

function bread(): PixelBuffer {
  const b = new PixelBuffer(12, 7)
  const crust = hex('#c08a3e')
  for (let y = 1; y < 5; y++) for (let x = 1 + (y === 1 ? 1 : 0); x < 11 - (y === 1 ? 1 : 0); x++) b.set(x, y, y === 1 ? ramp(crust, 0.8) : y === 4 ? ramp(crust, -0.8) : crust)
  for (const x of [3, 6, 9]) b.set(x, 2, hex('#f0d39a'))
  b.rect(0, 5, 12, 2, hex('#7a5232')) // board
  b.outline(hex('#2a1a12'))
  return b
}

function pot(): PixelBuffer {
  const b = new PixelBuffer(10, 9)
  const iron = hex('#3d3a40')
  for (let y = 3; y < 9; y++) for (let x = 1; x < 9; x++) if (!(y === 8 && (x === 1 || x === 8))) b.set(x, y, x < 3 ? ramp(iron, 0.9) : x > 6 ? ramp(iron, -0.6) : iron)
  b.rect(0, 3, 10, 1, ramp(iron, 0.6))
  b.rect(2, 2, 6, 1, ramp(iron, 0.3))
  b.rect(4, 1, 2, 1, ramp(iron, 1))
  b.outline(hex('#16141a'))
  return b
}

function bowl(): PixelBuffer {
  const b = new PixelBuffer(10, 7)
  for (const [x, y, c] of [[2, 1, '#d23a3a'], [3, 1, '#d23a3a'], [5, 1, '#e0b040'], [6, 0, '#e0b040'], [6, 1, '#d6a030'], [4, 2, '#c43030'], [7, 2, '#d23a3a']] as [number, number, string][])
    b.set(x, y, hex(c))
  const wood = hex('#8a5a34')
  for (let y = 2; y < 6; y++) for (let x = 1 + (y - 2); x < 9 - (y - 2); x++) if (y > 2 || x < 4 || x > 7) b.set(x, y, y === 2 ? ramp(wood, 0.8) : wood)
  b.outline(hex('#2a1a12'))
  return b
}

function candle(): PixelBuffer {
  const b = new PixelBuffer(5, 11)
  b.set(2, 0, hex('#fff6c0'))
  b.set(2, 1, hex('#ffb040'))
  b.rect(1, 3, 3, 6, hex('#efe6d0'))
  b.rect(3, 3, 1, 6, hex('#cbbf9f'))
  b.rect(0, 9, 5, 2, hex('#a07a3a'))
  b.set(2, 2, hex('#3a2a20'))
  return b
}

function logs(): PixelBuffer {
  const b = new PixelBuffer(16, 9)
  const ends: [number, number][] = [[3, 6], [8, 6], [13, 6], [5, 2], [10, 2]]
  for (const [cx, cy] of ends)
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        if (x * x + y * y > 5) continue
        const r = Math.hypot(x, y)
        b.set(cx + x, cy + y, r < 1 ? hex('#d9b07a') : r < 2 ? hex('#b8874a') : hex('#6a4426'))
      }
  b.outline(hex('#22150c'))
  return b
}

function sacks(): PixelBuffer {
  const b = new PixelBuffer(22, 16)
  const cloth = hex('#e3d6b6')
  const sack = (x0: number, w: number, h: number) => {
    for (let y = 16 - h; y < 16; y++) {
      const k = (y - (16 - h)) / h
      const half = Math.round((w / 2) * Math.min(1, 0.55 + k * 1.2))
      for (let x = x0 + Math.floor(w / 2) - half; x < x0 + Math.floor(w / 2) + half; x++) {
        const u = (x - x0) / w
        b.set(x, y, u < 0.3 ? ramp(cloth, 0.6) : u > 0.75 ? ramp(cloth, -1) : cloth)
      }
    }
    b.rect(x0 + Math.floor(w / 2) - 2, 16 - h + 2, 4, 1, hex('#8a6a3a')) // tie
  }
  sack(0, 12, 15)
  sack(10, 12, 12)
  b.rect(4, 9, 3, 2, hex('#8a6a3a')) // mill mark
  b.outline(hex('#3a2c1c'))
  return b
}

function keg(): PixelBuffer {
  const b = new PixelBuffer(12, 12)
  const wood = hex('#7d5030')
  for (let y = 0; y < 12; y++) {
    const bulge = y > 2 && y < 9 ? 0 : 1
    for (let x = bulge; x < 12 - bulge; x++) {
      let c = x < 3 ? ramp(wood, 0.7) : x > 8 ? ramp(wood, -1) : wood
      if (y === 2 || y === 9) c = hex('#3c3a3c')
      if (x % 3 === 0 && y !== 2 && y !== 9) c = ramp(c, -0.8)
      b.set(x, y, c)
    }
  }
  b.set(6, 6, hex('#b8874a')) // tap
  b.outline(hex('#22150c'))
  return b
}

function pottedPlant(): PixelBuffer {
  const b = new PixelBuffer(14, 20)
  const blobs: Blob[] = [
    { x: 7, y: 7, r: 5, z: 0 },
    { x: 4, y: 6, r: 3.2, z: 1 },
    { x: 10, y: 6.5, r: 3.2, z: 1 },
    { x: 7, y: 3, r: 3, z: 2 },
  ]
  paintFoliage(b, blobs, ['#1f4a26', '#2e6a33', '#46883e', '#6fae52'].map(hex), 19)
  const clay = hex('#b0603a')
  for (let y = 12; y < 20; y++) {
    const inset = y < 14 ? 0 : Math.floor((y - 14) / 3) + 1
    for (let x = 2 + inset; x < 12 - inset; x++) b.set(x, y, y < 14 ? ramp(clay, 0.6) : x < 5 ? ramp(clay, 0.4) : x > 9 ? ramp(clay, -0.8) : clay)
  }
  b.outline(OUTLINE)
  return b
}

function cat(): PixelBuffer {
  const b = new PixelBuffer(16, 10)
  const fur = hex('#d9893a')
  // Curled body
  for (let y = 3; y < 10; y++)
    for (let x = 1; x < 13; x++) {
      const dx = (x - 7) / 6
      const dy = (y - 7) / 3.6
      if (dx * dx + dy * dy <= 1) b.set(x, y, (x + y) % 3 === 0 ? ramp(fur, -0.8) : y < 5 ? ramp(fur, 0.6) : fur)
    }
  // Head with ears, eyes closed
  for (let y = 2; y < 8; y++) for (let x = 10; x < 15; x++) if ((x - 12.5) ** 2 / 6 + (y - 5) ** 2 / 7 <= 1) b.set(x, y, fur)
  b.set(10, 2, fur)
  b.set(14, 2, fur)
  b.set(10, 1, ramp(fur, -0.6))
  b.set(14, 1, ramp(fur, -0.6))
  b.set(11, 5, hex('#3a2418'))
  b.set(13, 5, hex('#3a2418'))
  b.set(12, 6, hex('#e8a0a0'))
  // Tail wrapping round the front
  for (let x = 2; x < 9; x++) b.set(x, 9, ramp(fur, x % 2 ? -0.4 : 0.2))
  b.outline(hex('#2a1a12'))
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
  | 'search'
  | 'sparkle'
  | 'jars'
  | 'bread'
  | 'pot'
  | 'bowl'
  | 'candle'
  | 'logs'
  | 'sacks'
  | 'barrel'
  | 'plant'
  | 'cat'

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
    ['search', searchIcon()],
    ['sparkle', sparkle()],
    ['jars', jars()],
    ['bread', bread()],
    ['pot', pot()],
    ['bowl', bowl()],
    ['candle', candle()],
    ['logs', logs()],
    ['sacks', sacks()],
    ['barrel', keg()],
    ['plant', pottedPlant()],
    ['cat', cat()],
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

/** Hearth fire: three 12×16 flame frames side by side, flipped through like a sprite sheet. */
let flameTex: THREE.CanvasTexture | null = null
export function getFlameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex
  const W = 12
  const H = 16
  const sheet = new PixelBuffer(W * 3, H)
  const cols = ['#fff7c8', '#ffd25a', '#ff9a2a', '#e0502a', '#a8302a'].map(hex)
  for (let f = 0; f < 3; f++) {
    const rand = mulberry32(400 + f)
    const tongues = [
      { x: 6 + (rand() - 0.5) * 2, h: 14 - f, w: 4.2 },
      { x: 3 + rand(), h: 9 + rand() * 3, w: 2.6 },
      { x: 9 - rand(), h: 9 + rand() * 3, w: 2.6 },
    ]
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let heat = 0
        for (const t of tongues) {
          const top = H - t.h
          if (y < top) continue
          const k = (y - top) / t.h // 0 at the tip, 1 at the base
          const half = t.w * Math.sqrt(k)
          const d = Math.abs(x + 0.5 - t.x) / Math.max(0.01, half)
          if (d < 1) heat = Math.max(heat, (1 - d) * (0.45 + k * 0.7))
        }
        heat += (hash2(x, y, 410 + f) - 0.5) * 0.18
        if (heat <= 0.12) continue
        const idx = heat > 0.8 ? 0 : heat > 0.6 ? 1 : heat > 0.4 ? 2 : heat > 0.25 ? 3 : 4
        sheet.set(f * W + x, y, cols[idx])
      }
  }
  flameTex = new THREE.CanvasTexture(sheet.toCanvas())
  flameTex.colorSpace = THREE.SRGBColorSpace
  flameTex.magFilter = THREE.NearestFilter
  flameTex.minFilter = THREE.NearestFilter
  flameTex.generateMipmaps = false
  flameTex.repeat.set(1 / 3, 1)
  return flameTex
}
