// Colour/intensity keyframes for day → dusk → night. `runtime.tod` (0..1) drives everything.
import * as THREE from 'three'

interface Key {
  sunColor: string
  sunIntensity: number
  sunDir: [number, number, number]
  skyColor: string
  groundColor: string
  hemiIntensity: number
  fogColor: string
  fogNear: number
  fogFar: number
  exposure: number
  lampIntensity: number
  windowGlow: number
  bloom: number
  shafts: number
  fireflies: number
  dust: number
}

const DAY: Key = {
  sunColor: '#fff0d2',
  sunIntensity: 2.6,
  sunDir: [-0.55, 1, 0.55],
  skyColor: '#cfe2ff',
  groundColor: '#6d5a3c',
  hemiIntensity: 1.05,
  fogColor: '#c9d8d2',
  fogNear: 26,
  fogFar: 70,
  exposure: 1,
  lampIntensity: 0,
  windowGlow: 0,
  bloom: 0.45,
  shafts: 1,
  fireflies: 0,
  dust: 1,
}

const DUSK: Key = {
  sunColor: '#ff9a5c',
  sunIntensity: 1.5,
  sunDir: [-0.9, 0.45, 0.35],
  skyColor: '#e7a98a',
  groundColor: '#4a3348',
  hemiIntensity: 0.65,
  fogColor: '#c98c7a',
  fogNear: 22,
  fogFar: 60,
  exposure: 1,
  lampIntensity: 0.6,
  windowGlow: 0.6,
  bloom: 0.7,
  shafts: 0.6,
  fireflies: 0.3,
  dust: 0.6,
}

const NIGHT: Key = {
  sunColor: '#8fa6ff',
  sunIntensity: 0.75,
  sunDir: [0.5, 1, 0.45],
  skyColor: '#3a4f8c',
  groundColor: '#141526',
  hemiIntensity: 0.4,
  fogColor: '#121a33',
  fogNear: 18,
  fogFar: 48,
  exposure: 1.1,
  lampIntensity: 1,
  windowGlow: 1,
  bloom: 1.1,
  shafts: 0,
  fireflies: 1,
  dust: 0,
}

const tmpA = new THREE.Color()
const tmpB = new THREE.Color()

export interface Sampled {
  sunColor: THREE.Color
  sunIntensity: number
  sunDir: THREE.Vector3
  skyColor: THREE.Color
  groundColor: THREE.Color
  hemiIntensity: number
  fogColor: THREE.Color
  fogNear: number
  fogFar: number
  exposure: number
  lampIntensity: number
  windowGlow: number
  bloom: number
  shafts: number
  fireflies: number
  dust: number
}

const out: Sampled = {
  sunColor: new THREE.Color(),
  sunIntensity: 0,
  sunDir: new THREE.Vector3(),
  skyColor: new THREE.Color(),
  groundColor: new THREE.Color(),
  hemiIntensity: 0,
  fogColor: new THREE.Color(),
  fogNear: 0,
  fogFar: 0,
  exposure: 1,
  lampIntensity: 0,
  windowGlow: 0,
  bloom: 0,
  shafts: 0,
  fireflies: 0,
  dust: 0,
}

function lerpColor(target: THREE.Color, a: string, b: string, t: number) {
  // Interpolate in linear space (colours are authored as sRGB hex).
  tmpA.set(a)
  tmpB.set(b)
  target.copy(tmpA).lerp(tmpB, t)
}

let lastTod = NaN

/** Sample the keyframes. Returns a shared object — copy what you need. Cached per value. */
export function sampleTimeOfDay(tod: number): Sampled {
  if (tod === lastTod) return out
  lastTod = tod
  const t = Math.max(0, Math.min(1, tod))
  const [a, b, k] = t < 0.5 ? [DAY, DUSK, t / 0.5] : [DUSK, NIGHT, (t - 0.5) / 0.5]
  const s = k * k * (3 - 2 * k)
  const n = (x: number, y: number) => x + (y - x) * s
  lerpColor(out.sunColor, a.sunColor, b.sunColor, s)
  lerpColor(out.skyColor, a.skyColor, b.skyColor, s)
  lerpColor(out.groundColor, a.groundColor, b.groundColor, s)
  lerpColor(out.fogColor, a.fogColor, b.fogColor, s)
  out.sunDir.set(n(a.sunDir[0], b.sunDir[0]), n(a.sunDir[1], b.sunDir[1]), n(a.sunDir[2], b.sunDir[2])).normalize()
  out.sunIntensity = n(a.sunIntensity, b.sunIntensity)
  out.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity)
  out.fogNear = n(a.fogNear, b.fogNear)
  out.fogFar = n(a.fogFar, b.fogFar)
  out.exposure = n(a.exposure, b.exposure)
  out.lampIntensity = n(a.lampIntensity, b.lampIntensity)
  out.windowGlow = n(a.windowGlow, b.windowGlow)
  out.bloom = n(a.bloom, b.bloom)
  out.shafts = n(a.shafts, b.shafts)
  out.fireflies = n(a.fireflies, b.fireflies)
  out.dust = n(a.dust, b.dust)
  return out
}
