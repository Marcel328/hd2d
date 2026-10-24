// Tiny software canvas for authoring pixel art procedurally, plus colour helpers.
import * as THREE from 'three'

export type RGB = [number, number, number]

export function hex(c: string): RGB {
  const v = parseInt(c.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255]
}

/**
 * Pixel-art style ramp step: darker steps drift toward blue/purple, lighter steps toward yellow,
 * which reads far better than plain multiplication.
 */
export function ramp(c: RGB | string, step: number): RGB {
  const rgb = typeof c === 'string' ? hex(c) : c
  const [h, s, l] = rgbToHsl(rgb)
  const target = step < 0 ? 0.7 : 0.14 // hue to drift toward
  let dh = target - h
  if (dh > 0.5) dh -= 1
  if (dh < -0.5) dh += 1
  const nh = (h + dh * Math.min(Math.abs(step) * 0.12, 0.3) + 1) % 1
  const nl = Math.max(0, Math.min(1, l + step * 0.1))
  const ns = Math.max(0, Math.min(1, s + (step < 0 ? 0.04 : -0.03) * Math.abs(step)))
  return hslToRgb(nh, ns, nl)
}

export class PixelBuffer {
  readonly data: Uint8ClampedArray
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4)
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  set(x: number, y: number, c: RGB, a = 255) {
    x |= 0
    y |= 0
    if (!this.inside(x, y)) return
    const i = (y * this.w + x) * 4
    this.data[i] = c[0]
    this.data[i + 1] = c[1]
    this.data[i + 2] = c[2]
    this.data[i + 3] = a
  }

  get(x: number, y: number): RGB {
    const i = ((y | 0) * this.w + (x | 0)) * 4
    return [this.data[i], this.data[i + 1], this.data[i + 2]]
  }

  alpha(x: number, y: number): number {
    if (!this.inside(x | 0, y | 0)) return 0
    return this.data[((y | 0) * this.w + (x | 0)) * 4 + 3]
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a)
  }

  /** Copy another buffer in, skipping transparent pixels. */
  blit(src: PixelBuffer, dx: number, dy: number, flipX = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = flipX ? src.w - 1 - x : x
        const a = src.alpha(sx, y)
        if (a > 0) this.set(dx + x, dy + y, src.get(sx, y), a)
      }
  }

  /** Paint a 1px outline around every opaque region. */
  outline(c: RGB, diagonal = false) {
    const mark: number[] = []
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 0) continue
        let near =
          this.alpha(x - 1, y) > 0 || this.alpha(x + 1, y) > 0 || this.alpha(x, y - 1) > 0 || this.alpha(x, y + 1) > 0
        if (!near && diagonal)
          near =
            this.alpha(x - 1, y - 1) > 0 ||
            this.alpha(x + 1, y - 1) > 0 ||
            this.alpha(x - 1, y + 1) > 0 ||
            this.alpha(x + 1, y + 1) > 0
        if (near) mark.push(x, y)
      }
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], c)
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = this.w
    canvas.height = this.h
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.w, this.h), 0, 0)
    return canvas
  }
}

export interface PixelTextureOptions {
  repeat?: boolean
  /** Mipmaps keep distant ground from shimmering; sprites with alpha cut-outs must not use them. */
  mipmaps?: boolean
  anisotropy?: number
}

export function toTexture(buf: PixelBuffer, opts: PixelTextureOptions = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(buf.toCanvas())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  if (opts.mipmaps) {
    tex.minFilter = THREE.NearestMipmapLinearFilter
    tex.generateMipmaps = true
  } else {
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
  }
  if (opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = opts.anisotropy ?? 1
  tex.needsUpdate = true
  return tex
}
