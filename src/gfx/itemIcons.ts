// 16×16 pixel-art item icons, painted procedurally like every other asset and handed to the HTML
// inventory as data URLs (shown with image-rendering: pixelated).
import { PixelBuffer, hex, ramp, type RGB } from './pixels'
import type { ItemId } from '../game/inventory'

const INK = hex('#21161c')

function disc(b: PixelBuffer, cx: number, cy: number, r: number, c: RGB, light = true) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > r * r) continue
      const shade = light ? (dx + dy < -r * 0.5 ? 0.7 : dx + dy > r * 0.6 ? -0.9 : 0) : 0
      b.set(x, y, shade ? ramp(c, shade) : c)
    }
}

function herb(b: PixelBuffer) {
  const g = hex('#4f9a3a')
  const leaf = (cx: number, cy: number, dx: number, dy: number) => {
    for (let t = 0; t < 6; t++) {
      const x = Math.round(cx + dx * t)
      const y = Math.round(cy + dy * t)
      const w = t < 1 || t > 4 ? 0 : 1
      for (let o = -w; o <= w; o++) b.set(x + (dy !== 0 ? o : 0), y + (dx !== 0 && dy === 0 ? o : 0), o === 0 ? ramp(g, 0.8) : g)
      b.set(x + 1, y + 1, ramp(g, -0.8))
    }
  }
  leaf(7, 13, -0.9, -1.5)
  leaf(8, 13, 0.9, -1.5)
  leaf(8, 13, 0, -1.8)
  for (let y = 11; y < 15; y++) b.set(8, y, hex('#3a6a2a'))
}

function rations(b: PixelBuffer) {
  const cloth = hex('#b8955e')
  for (let y = 5; y < 13; y++) for (let x = 2; x < 14; x++) b.set(x, y, y === 5 ? ramp(cloth, 0.8) : y === 12 ? ramp(cloth, -1) : x < 4 ? ramp(cloth, 0.4) : cloth)
  b.rect(1, 6, 1, 6, ramp(cloth, -0.6))
  b.rect(14, 6, 1, 6, ramp(cloth, -0.6))
  b.rect(7, 4, 2, 10, hex('#7a3a2a')) // string
  b.rect(5, 8, 6, 2, hex('#7a3a2a'))
  b.set(6, 3, hex('#7a3a2a'))
  b.set(9, 3, hex('#7a3a2a'))
}

function waterskin(b: PixelBuffer) {
  const leather = hex('#8a5a34')
  for (let y = 5; y < 15; y++)
    for (let x = 3; x < 13; x++) {
      const dx = (x - 7.5) / 5
      const dy = (y - 10) / 5
      if (dx * dx + dy * dy * 1.1 <= 1) b.set(x, y, x < 6 ? ramp(leather, 0.7) : x > 10 ? ramp(leather, -0.9) : leather)
    }
  b.rect(6, 2, 3, 4, hex('#c9a46a')) // neck
  b.rect(6, 1, 3, 1, hex('#5a3a22')) // cork
  for (let i = 0; i < 6; i++) b.set(2 + i, 6 - i, hex('#3e2a1a')) // strap
}

function compass(b: PixelBuffer) {
  disc(b, 8, 8.5, 6, hex('#c9952a'))
  disc(b, 8, 8.5, 4.4, hex('#f1e6c8'), false)
  b.set(8, 1, hex('#c9952a'))
  b.set(7, 2, hex('#c9952a'))
  b.set(9, 2, hex('#c9952a'))
  // Needle
  b.set(8, 5, hex('#c0392b'))
  b.set(8, 6, hex('#c0392b'))
  b.set(8, 7, hex('#c0392b'))
  b.set(8, 9, hex('#3a3a4a'))
  b.set(8, 10, hex('#3a3a4a'))
  b.set(8, 11, hex('#3a3a4a'))
  b.set(8, 8, hex('#2a2a2a'))
}

function letter(b: PixelBuffer) {
  const paper = hex('#efe4c8')
  b.rect(1, 4, 14, 9, paper)
  for (let i = 0; i < 7; i++) {
    b.set(1 + i, 4 + Math.floor(i * 0.7), ramp(paper, -1.2))
    b.set(14 - i, 4 + Math.floor(i * 0.7), ramp(paper, -1.2))
  }
  b.rect(1, 12, 14, 1, ramp(paper, -0.8))
  disc(b, 8, 9, 2.2, hex('#b0302a'))
}

function breadIcon(b: PixelBuffer) {
  const crust = hex('#c08a3e')
  for (let y = 5; y < 13; y++)
    for (let x = 1; x < 15; x++) {
      const dx = (x - 7.5) / 7
      const dy = (y - 9) / 4
      if (dx * dx + dy * dy <= 1) b.set(x, y, y < 7 ? ramp(crust, 0.8) : y > 11 ? ramp(crust, -0.9) : crust)
    }
  for (const x of [4, 7, 10]) {
    b.set(x, 7, hex('#f3d9a2'))
    b.set(x + 1, 6, hex('#f3d9a2'))
  }
}

function honey(b: PixelBuffer) {
  const amber = hex('#e09a2a')
  for (let y = 5; y < 15; y++) for (let x = 3; x < 13; x++) if (!((x === 3 || x === 12) && (y === 5 || y === 14))) b.set(x, y, x < 5 ? ramp(amber, 0.8) : x > 10 ? ramp(amber, -0.9) : amber)
  b.set(5, 7, hex('#fff2c0'))
  b.set(5, 8, hex('#fff2c0'))
  b.rect(2, 3, 12, 2, hex('#e9dcc0')) // cloth lid
  b.rect(2, 5, 12, 1, hex('#7a3a2a')) // twine
}

function oil(b: PixelBuffer) {
  const glass = hex('#9fc0c8')
  for (let y = 6; y < 15; y++)
    for (let x = 3; x < 13; x++) {
      const dx = (x - 7.5) / 5
      const dy = (y - 10.5) / 4.5
      if (dx * dx + dy * dy <= 1) b.set(x, y, y > 8 ? (x < 6 ? hex('#f2b440') : hex('#d48a20')) : glass)
    }
  b.rect(6, 2, 4, 4, glass)
  b.rect(6, 1, 4, 2, hex('#7a5232'))
  b.set(5, 10, hex('#fff2c0'))
}

function flour(b: PixelBuffer) {
  const cloth = hex('#ece2c8')
  for (let y = 4; y < 15; y++) {
    const half = y < 6 ? 2 : Math.min(6, 2 + (y - 5))
    for (let x = 8 - half; x < 8 + half; x++) b.set(x, y, x < 6 ? ramp(cloth, 0.5) : x > 10 ? ramp(cloth, -1) : cloth)
  }
  b.rect(5, 5, 6, 1, hex('#8a6a3a'))
  b.set(7, 2, cloth)
  b.set(8, 2, cloth)
  b.set(6, 3, cloth)
  b.set(9, 3, cloth)
  b.rect(6, 9, 4, 3, hex('#c9b48a'))
}

function gold(b: PixelBuffer) {
  const g = hex('#e8b23a')
  for (const [cx, cy] of [
    [6, 11],
    [10, 11],
    [8, 8],
    [5, 7.5],
  ] as [number, number][])
    disc(b, cx, cy, 3.2, g)
  for (const [x, y] of [
    [7, 7],
    [5, 10],
    [9, 10],
  ])
    b.set(x, y, hex('#fff2b0'))
}

function bag(b: PixelBuffer) {
  const leather = hex('#9a6234')
  for (let y = 5; y < 15; y++) for (let x = 2; x < 14; x++) if (!((x === 2 || x === 13) && y === 14)) b.set(x, y, x < 4 ? ramp(leather, 0.7) : x > 11 ? ramp(leather, -0.9) : leather)
  for (let y = 4; y < 10; y++) for (let x = 3; x < 13; x++) b.set(x, y, y === 9 ? ramp(leather, -1.4) : ramp(leather, 0.35)) // flap
  b.rect(7, 8, 2, 3, hex('#d9b05c')) // buckle
  for (let x = 4; x < 12; x++) b.set(x, 2 + Math.round(Math.abs(x - 7.5) / 3), hex('#5a3a22')) // strap
}

const PAINTERS: Record<ItemId | 'gold' | 'bag', (b: PixelBuffer) => void> = {
  bag,
  herb,
  rations,
  waterskin,
  compass,
  letter,
  bread: breadIcon,
  honey,
  oil,
  flour,
  gold,
}

const cache = new Map<string, string>()

export function itemIconUrl(id: ItemId | 'gold' | 'bag'): string {
  let url = cache.get(id)
  if (!url) {
    const b = new PixelBuffer(16, 16)
    PAINTERS[id](b)
    b.outline(INK)
    url = b.toCanvas().toDataURL()
    cache.set(id, url)
  }
  return url
}
