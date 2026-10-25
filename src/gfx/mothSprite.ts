// The gloam moth: two 48×36 wing-beat frames, painted procedurally like every other sprite.
// Used as a billboard at the Last Lantern and, scaled up, on the battle screen.
import * as THREE from 'three'
import { PixelBuffer, hex, mix, ramp, type RGB } from './pixels'
import { hash2 } from './random'

export const MOTH_W = 48
export const MOTH_H = 36

const WING = hex('#6a5a8a')
const WING_EDGE = hex('#b8a8d8')
const BODY = hex('#5a4250')
const EYE_RING = hex('#2a2040')
const EYE = hex('#f0e6a8')
const DUST = hex('#e8f7b0')

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rot: number) {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const dx = x - cx
  const dy = y - cy
  const u = (dx * c + dy * s) / rx
  const v = (-dx * s + dy * c) / ry
  return u * u + v * v
}

function frame(open: boolean): { color: PixelBuffer; glow: PixelBuffer } {
  const b = new PixelBuffer(MOTH_W, MOTH_H)
  const glow = new PixelBuffer(MOTH_W, MOTH_H)
  const fore = open ? { cx: 12, cy: 11, rx: 11.5, ry: 8, rot: -0.45 } : { cx: 12.5, cy: 15, rx: 11, ry: 6.2, rot: -0.15 }
  const hind = open ? { cx: 15, cy: 24, rx: 8, ry: 6.8, rot: 0.35 } : { cx: 15, cy: 25, rx: 7.5, ry: 5.8, rot: 0.2 }
  for (let y = 0; y < MOTH_H; y++)
    for (let x = 0; x < MOTH_W; x++) {
      // Wings are mirrored about the body.
      const lx = x < MOTH_W / 2 ? x : MOTH_W - 1 - x
      const f = inEllipse(lx + 0.5, y + 0.5, fore.cx, fore.cy, fore.rx, fore.ry, fore.rot)
      const h = inEllipse(lx + 0.5, y + 0.5, hind.cx, hind.cy, hind.rx, hind.ry, hind.rot)
      let c: RGB | null = null
      if (f <= 1) {
        // Fore-wing: light rim, darker veins, an eye spot.
        c = f > 0.72 ? WING_EDGE : mix(ramp(WING, 0.4), ramp(WING, -0.6), (y / MOTH_H) * 0.8)
        const ex = fore.cx - 1
        const ey = fore.cy + (open ? 0 : 0.5)
        const e = Math.hypot(lx - ex, (y - ey) * 1.2)
        if (e < 1.6) {
          c = EYE
          glow.set(x, y, [255, 240, 170])
        } else if (e < 3) c = EYE_RING
        else if ((lx + y * 2) % 7 === 0) c = ramp(c, -0.8) // veins
      } else if (h <= 1) {
        c = h > 0.7 ? WING_EDGE : mix(ramp(WING, -0.2), hex('#8a5a7a'), 0.4)
        if ((lx * 3 + y) % 9 === 0) c = ramp(c, -0.9)
      }
      if (c) {
        // Glimmering dust caught in the wings.
        if (hash2(x, y, open ? 91 : 92) > 0.965) {
          c = DUST
          glow.set(x, y, [220, 255, 170])
        }
        b.set(x, y, c)
      }
    }
  // Fuzzy body and head.
  const bodyTop = open ? 9 : 10
  for (let y = bodyTop; y < 31; y++)
    for (let x = 21; x <= 26; x++) {
      const d = inEllipse(x + 0.5, y + 0.5, 24, 20, 3.1, 11, 0)
      if (d > 1) continue
      let c = (y % 3 === 0 ? ramp(BODY, -0.9) : BODY) as RGB
      if (x === 22) c = ramp(c, 0.8)
      if (x === 26) c = ramp(c, -1)
      b.set(x, y, c)
    }
  for (let y = 4; y < 11; y++)
    for (let x = 20; x < 28; x++) if (Math.hypot(x + 0.5 - 24, y + 0.5 - 7.5) < 3.4) b.set(x, y, ramp(BODY, 0.4))
  for (const ex of [22, 25]) {
    b.set(ex, 7, EYE)
    b.set(ex, 6, EYE)
    glow.set(ex, 7, [255, 245, 190])
    glow.set(ex, 6, [255, 245, 190])
  }
  // Feathery antennae.
  for (let i = 0; i < 7; i++) {
    const y = 4 - Math.round(i * 0.6)
    b.set(22 - i, y, ramp(BODY, 0.8))
    b.set(25 + i, y, ramp(BODY, 0.8))
    if (i % 2) {
      b.set(22 - i, y - 1, WING_EDGE)
      b.set(25 + i, y - 1, WING_EDGE)
    }
  }
  b.outline(hex('#1a1424'))
  return { color: b, glow }
}

let sheet: { color: THREE.CanvasTexture; glow: THREE.CanvasTexture; urls: string[] } | null = null

/** Both frames side by side (color + matching glow mask) and per-frame data URLs for the UI. */
export function getMothSprites() {
  if (sheet) return sheet
  const frames = [frame(true), frame(false)]
  const color = new PixelBuffer(MOTH_W * 2, MOTH_H)
  const glow = new PixelBuffer(MOTH_W * 2, MOTH_H)
  frames.forEach((f, i) => {
    color.blit(f.color, i * MOTH_W, 0)
    glow.blit(f.glow, i * MOTH_W, 0)
  })
  const tex = (b: PixelBuffer) => {
    const t = new THREE.CanvasTexture(b.toCanvas())
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
    t.repeat.set(0.5, 1)
    return t
  }
  sheet = { color: tex(color), glow: tex(glow), urls: frames.map((f) => f.color.toCanvas().toDataURL()) }
  return sheet
}
