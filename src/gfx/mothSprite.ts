// A celestial silk moth: two hand-shaped pixel-art wing-beat frames.
// Kept in the same procedural atlas pipeline as the village's other sprites.
import * as THREE from 'three'
import { PixelBuffer, hex, type RGB } from './pixels'

export const MOTH_W = 96
export const MOTH_H = 80

const P = {
  ink: hex('#292b46'),
  edge: hex('#474866'),
  violet: hex('#777492'),
  lavender: hex('#a6a0ba'),
  lilac: hex('#ccc6d6'),
  ivory: hex('#e7e2d8'),
  cream: hex('#faf1d9'),
  white: hex('#fff8e7'),
  vein: hex('#b8afbd'),
  goldShadow: hex('#99744d'),
  gold: hex('#d6a663'),
  amber: hex('#f7cc79'),
  light: hex('#fff0b1'),
  tealShadow: hex('#426878'),
  teal: hex('#72aaa9'),
  jade: hex('#b2d5c6'),
}

type Point = readonly [number, number]
type Layer = { color: PixelBuffer; glow: PixelBuffer }
const CENTER = (MOTH_W - 1) / 2

/** Cubic outlines keep broad silk panels distinct from their scalloped edges. */
function contour(start: Point, curves: readonly (readonly [Point, Point, Point])[]): Point[] {
  const points: Point[] = [start]
  let p = start
  for (const [a, b, end] of curves) {
    for (let i = 1; i <= 8; i++) {
      const t = i / 8
      const u = 1 - t
      points.push([
        u ** 3 * p[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t ** 3 * end[0],
        u ** 3 * p[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * end[1],
      ])
    }
    p = end
  }
  return points
}

const FORE = contour([46, 30], [
  [[40, 20], [20, 10], [7, 12]],
  [[3, 12], [1, 20], [4, 27]],
  [[4, 30], [5, 32], [8, 33]],
  [[5, 36], [7, 39], [12, 39]],
  [[10, 43], [13, 46], [18, 44]],
  [[18, 49], [23, 50], [27, 46]],
  [[30, 49], [35, 45], [36, 42]],
  [[40, 42], [44, 38], [46, 30]],
])

const HIND = contour([46, 35], [
  [[38, 32], [24, 34], [20, 42]],
  [[14, 49], [17, 55], [23, 57]],
  [[27, 60], [33, 57], [35, 53]],
  [[39, 57], [43, 50], [46, 35]],
])

const TAIL = contour([25, 48], [
  [[21, 52], [24, 58], [19, 63]],
  [[12, 68], [16, 77], [22, 75]],
  [[26, 74], [28, 70], [27, 67]],
  [[25, 72], [22, 74], [20, 71]],
  [[17, 66], [27, 62], [29, 56]],
  [[31, 51], [30, 48], [25, 48]],
])

function inside(x: number, y: number, points: readonly Point[]): boolean {
  let hit = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

function segmentDistance(x: number, y: number, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
}

function edgeDistance(x: number, y: number, points: readonly Point[], closed = true): number {
  let d = Infinity
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    d = Math.min(d, segmentDistance(x, y, points[i], points[(i + 1) % points.length]))
  }
  return d
}

function both(buffer: PixelBuffer, x: number, y: number, color: RGB) {
  buffer.set(x, y, color)
  buffer.set(MOTH_W - 1 - x, y, color)
}

function newLayer(): Layer {
  return { color: new PixelBuffer(MOTH_W, MOTH_H), glow: new PixelBuffer(MOTH_W, MOTH_H) }
}

const VEINS: Point[][] = [
  [[44, 31], [34, 24], [22, 19], [10, 16]],
  [[44, 33], [32, 31], [20, 28], [7, 26]],
  [[43, 35], [34, 38], [24, 42], [19, 45]],
]

function wings(kind: 'fore' | 'hind' | 'tail'): Layer {
  const layer = newLayer()
  const shape = kind === 'fore' ? FORE : kind === 'hind' ? HIND : TAIL
  for (let y = 0; y < MOTH_H; y++) {
    for (let x = 0; x < MOTH_W / 2; x++) {
      const px = x + 0.5
      const py = y + 0.5
      if (!inside(px, py, shape)) continue
      const edge = edgeDistance(px, py, shape)
      let c: RGB
      if (kind === 'tail') {
        c = edge < 1 ? P.edge : edge < 2 ? P.teal : P.jade
        if (y > 69 && edge >= 1) c = P.gold
      } else if (kind === 'hind') {
        c = edge < 1.6 ? P.edge : edge < 3.1 ? P.lavender : edge < 4 ? P.cream : y > 49 ? P.lilac : P.violet
        const eye = Math.hypot((px - 29) / 5.8, (py - 46) / 5)
        if (eye < 1) c = P.edge
        if (eye < 0.77) c = P.gold
        if (eye < 0.57) c = P.tealShadow
        if (eye < 0.36) {
          c = P.jade
          both(layer.glow, x, y, P.teal)
        }
        if (Math.abs(px - 28) + Math.abs(py - 45) < 1.5) c = P.white
      } else {
        // Broad quiet colour fields, a double scalloped hem, and three deliberate veins.
        c = edge < 2 ? P.edge : edge < 3.6 ? P.lavender : edge < 4.6 ? P.cream : py < 24 ? P.cream : py > 37 ? P.lilac : P.ivory
        if (edge > 5 && VEINS.some((v) => edgeDistance(px, py, v, false) < 0.6)) c = P.vein
        if (px > 35 && py > 29 && edge > 4) c = P.lavender
        // Lantern ocelli: a gold bezel, cool glass, and a glowing amber lozenge.
        const eye = Math.hypot((px - 23) / 8.2, (py - 30) / 7.2)
        if (eye < 1.06) c = P.violet
        if (eye < 0.93) c = P.edge
        if (eye < 0.76) c = py < 29 ? P.amber : P.gold
        if (eye < 0.59) c = P.tealShadow
        if (eye < 0.43) c = P.teal
        if (Math.abs((px - 23) / 2.7) + Math.abs((py - 30) / 4.4) < 1) {
          c = P.amber
          both(layer.glow, x, y, P.amber)
        }
        if (Math.abs(px - 23) < 0.9 && Math.abs(py - 29.5) < 2.2) {
          c = P.light
          both(layer.glow, x, y, P.light)
        }
        if (px >= 19 && px < 21 && py >= 26 && py < 28) c = P.white
        // Sparse inlaid markings follow the upper wing, rather than random speckle.
        if (Math.abs(px - 13) + Math.abs(py - 19) < 1.8 || Math.abs(px - 32) + Math.abs(py - 21) < 1.4) {
          c = P.gold
        }
        if (edge > 1.6 && edge < 3.2 && y > 29 && (x === 9 || x === 15 || x === 23 || x === 31)) c = P.ivory
      }
      both(layer.color, x, y, c)
    }
  }
  return layer
}

/** Fold each wing around the thorax; the body stays still and the markings travel with the silk. */
function composite(target: Layer, source: Layer, open: boolean, fore: boolean) {
  const width = open ? 1 : fore ? 0.78 : 0.86
  const height = open ? 1 : fore ? 0.9 : 0.98
  const tilt = open ? 0 : fore ? 0.17 : 0.035
  for (let y = 0; y < MOTH_H; y++) {
    for (let x = 0; x < MOTH_W / 2; x++) {
      const sx = Math.round(CENTER + (x - CENTER) / width)
      const sy = Math.round(32 + (y - 32 - (CENTER - sx) * tilt) / height)
      if (!source.color.alpha(sx, sy)) continue
      both(target.color, x, y, source.color.get(sx, sy))
      // A foreground wing can cover a luminous marking on a hindwing.
      both(target.glow, x, y, source.glow.alpha(sx, sy) ? source.glow.get(sx, sy) : [0, 0, 0])
    }
  }
}

function line(buffer: PixelBuffer, points: readonly Point[], color: RGB) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])))
    for (let n = 0; n <= steps; n++) {
      const t = steps ? n / steps : 0
      both(buffer, Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), color)
    }
  }
}

function frame(open: boolean, layers: readonly Layer[]): Layer {
  const layer = newLayer()
  composite(layer, layers[0], open, false)
  composite(layer, layers[1], open, false)
  composite(layer, layers[2], open, true)
  const b = new PixelBuffer(MOTH_W, MOTH_H)
  const bodyGlow = new PixelBuffer(MOTH_W, MOTH_H)

  // A tapered silk abdomen under a generous, irregular cream ruff.
  for (let y = 32; y < 61; y++) {
    const width = y < 42 ? 4.8 : 4.8 - (y - 42) * 0.2
    for (let x = 42; x < 48; x++) {
      const dx = CENTER - x
      if (dx > width) continue
      let c = dx > width - 1 ? P.edge : dx > width - 2 ? P.lavender : P.ivory
      if ([43, 48, 53, 57].includes(y)) c = dx < width - 1 ? P.goldShadow : P.edge
      both(b, x, y, c)
    }
  }
  for (let y = 23; y < 40; y++) {
    for (let x = 37; x < 48; x++) {
      const dx = (x + 0.5 - 48) / 8.8
      const dy = (y + 0.5 - 30.5) / 8.5
      const r = dx * dx + dy * dy
      const tuft = ((x + y * 2) % 5 === 0 ? 0.16 : 0)
      if (r > 1 + tuft) continue
      const c = r > 0.85 ? P.lavender : y > 33 ? P.ivory : P.cream
      both(b, x, y, c)
    }
  }
  // Small serene face; no mandibles or oversized insect eyes.
  for (let y = 17; y < 27; y++) {
    for (let x = 42; x < 48; x++) {
      const d = ((x + 0.5 - 48) / 5.4) ** 2 + ((y + 0.5 - 22) / 5.2) ** 2
      if (d > 1) continue
      both(b, x, y, d > 0.65 ? P.lavender : P.ivory)
    }
  }
  both(b, 43, 22, P.tealShadow)
  both(b, 44, 22, P.teal)
  both(b, 44, 21, P.jade)
  both(b, 46, 19, P.cream)
  both(b, 47, 20, P.white)

  // Crown-like pectinate antennae, with paired individual feather vanes.
  line(b, [[44, 18], [41, 12], [35, 7], [29, 5]], P.goldShadow)
  line(b, [[44, 17], [40, 11], [34, 6], [29, 5]], P.cream)
  const feathers: [Point, Point][] = [
    [[41, 12], [42, 6]], [[38, 10], [38, 3]], [[35, 8], [34, 2]], [[32, 6], [29, 2]],
    [[40, 12], [35, 14]], [[37, 9], [31, 11]], [[34, 7], [28, 9]],
  ]
  for (const [a, end] of feathers) line(b, [a, end], P.cream)
  line(b, [[42, 7], [42, 10]], P.gold)
  line(b, [[38, 4], [38, 7]], P.gold)

  // A tiny amber throat light ties the creature to the lantern it feeds upon.
  for (let y = 30; y < 35; y++) {
    for (let x = 45; x < 48; x++) {
      if (Math.abs(x - CENTER) + Math.abs(y - 32) > 2.5) continue
      both(b, x, y, y === 31 ? P.light : P.amber)
      both(bodyGlow, x, y, P.amber)
    }
  }
  // Emission is a true matching mask: covered markings never shine through the body.
  for (let y = 0; y < MOTH_H; y++) {
    for (let x = 0; x < MOTH_W; x++) {
      if (!b.alpha(x, y)) continue
      layer.glow.set(x, y, bodyGlow.alpha(x, y) ? bodyGlow.get(x, y) : [0, 0, 0])
    }
  }
  layer.color.blit(b, 0, 0)
  layer.color.outline(P.ink)
  return layer
}

let sheet: { color: THREE.CanvasTexture; glow: THREE.CanvasTexture; urls: string[] } | null = null

/** Both frames side by side (color + matching glow mask) and per-frame data URLs for the UI. */
export function getMothSprites() {
  if (sheet) return sheet
  const layers = [wings('tail'), wings('hind'), wings('fore')]
  const frames = [frame(true, layers), frame(false, layers)]
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
