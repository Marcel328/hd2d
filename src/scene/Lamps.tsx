// Street lamps and door lanterns. Every lantern glows (emissive + bloom), but only a small pool
// of real point lights exists; each frame they are handed to the lanterns nearest the player and
// faded out before being reassigned, so shader cost stays constant however many lamps there are.
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { DOOR_LANTERNS, LAMP_HEIGHT, LAMP_POSTS, LIGHT_SOURCES } from '../game/world/layout'
import { MeshBuilder } from '../gfx/meshBuilder'
import { getSurfaces, TEX_WORLD } from '../gfx/surfaceTextures'
import { getGlowTexture } from '../gfx/propSprites'
import { occlusionPatch, patchMaterial } from '../gfx/materialPatches'
import { runtime, useGame } from '../game/state'
import { COTTAGE_LIGHTS } from '../game/world/interiors'
import { gutter, LANTERN_LOOK, lanternMode } from '../game/story'
import { sampleTimeOfDay } from './timeOfDay'

const LAMP_COLOR = new THREE.Color('#ffb25e')

/** The pooled point lights, for the developer light overlay. */
export const lightPool: (THREE.PointLight | null)[] = []

function buildLampGeometry() {
  const iron = new MeshBuilder(TEX_WORLD.timber)
  const stone = new MeshBuilder(TEX_WORLD.stone)
  const glass = new MeshBuilder(1)
  const top = LAMP_HEIGHT
  for (const { x, z } of LAMP_POSTS) {
    stone.box([x - 0.17, 0, z - 0.17], [x + 0.17, 0.24, z + 0.17], ['ny'])
    iron.box([x - 0.055, 0.24, z - 0.055], [x + 0.055, top - 0.2, z + 0.055])
    iron.box([x - 0.15, top - 0.22, z - 0.15], [x + 0.15, top - 0.16, z + 0.15]) // lantern floor
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      iron.box([x + dx * 0.13 - 0.02, top - 0.16, z + dz * 0.13 - 0.02], [x + dx * 0.13 + 0.02, top + 0.16, z + dz * 0.13 + 0.02])
    iron.box([x - 0.19, top + 0.16, z - 0.19], [x + 0.19, top + 0.23, z + 0.19]) // cap
    iron.box([x - 0.1, top + 0.23, z - 0.1], [x + 0.1, top + 0.3, z + 0.1])
    iron.box([x - 0.03, top + 0.3, z - 0.03], [x + 0.03, top + 0.4, z + 0.03]) // finial
    glass.box([x - 0.12, top - 0.16, z - 0.12], [x + 0.12, top + 0.16, z + 0.12])
  }
  for (const { x, y, z } of DOOR_LANTERNS) {
    const wallZ = z - 0.14
    iron.box([x - 0.03, y + 0.18, wallZ], [x + 0.03, y + 0.24, z + 0.02]) // bracket
    iron.box([x - 0.11, y - 0.15, z - 0.09], [x + 0.11, y - 0.11, z + 0.09])
    iron.box([x - 0.12, y + 0.12, z - 0.1], [x + 0.12, y + 0.18, z + 0.1])
    glass.box([x - 0.08, y - 0.11, z - 0.07], [x + 0.08, y + 0.12, z + 0.07])
  }
  return { iron: iron.build(), stone: stone.build(), glass: glass.build() }
}

/** Street lamps and door lanterns (village only). Their light comes from LightPool. */
export function Lamps() {
  const geo = useMemo(buildLampGeometry, [])
  const s = getSurfaces()
  const ironMat = useMemo(
    () =>
      patchMaterial(new THREE.MeshStandardMaterial({ map: s.timber, color: '#6a6470', roughness: 0.6, metalness: 0.3 }), [
        occlusionPatch,
      ]),
    [s],
  )
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ map: s.stone, roughness: 0.95 }), [s])
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d8c49a', emissive: LAMP_COLOR, emissiveIntensity: 0, roughness: 0.3 }),
    [],
  )

  const glow = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(LIGHT_SOURCES.flatMap((l) => [l.x, l.y, l.z]), 3))
    const m = new THREE.PointsMaterial({
      map: getGlowTexture(),
      color: LAMP_COLOR,
      size: 2.2,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    })
    return { g, m }
  }, [])

  const lampColor = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const tod = sampleTimeOfDay(runtime.tod)
    const t = runtime.time
    // The story decides how the lanterns burn: guttering, green-gold or blazing.
    const look = LANTERN_LOOK[lanternMode()]
    const flicker = (0.9 + 0.06 * Math.sin(t * 11) + 0.04 * Math.sin(t * 23.3)) * gutter(t, 0, look.sputter)
    lampColor.set(look.color)
    glassMat.emissive.copy(lampColor)
    glassMat.emissiveIntensity = tod.lampIntensity * 4 * look.level * flicker + 0.05
    glow.m.color.copy(lampColor)
    glow.m.size = 2.2 * look.glow
    glow.m.opacity = Math.min(1, tod.lampIntensity * 1.1 * Math.min(1, look.level + 0.2)) * flicker
  })

  return (
    <group>
      <mesh geometry={geo.iron} material={ironMat} castShadow receiveShadow />
      <mesh geometry={geo.stone} material={stoneMat} castShadow receiveShadow />
      <mesh geometry={geo.glass} material={glassMat} />
      <points geometry={glow.g} material={glow.m} renderOrder={5} />
    </group>
  )
}

interface PoolSource {
  x: number
  y: number
  z: number
  power: number
  color: THREE.Color
  /** 0..1 how strongly it flickers (fire flickers more than a lantern). */
  flicker: number
}

const MAX_SOURCES = 32

/**
 * A fixed pool of point lights shared by every light source in the active area. Each frame the
 * pool goes to the sources nearest the player, fading out before being reassigned. Because the
 * number of lights never changes — not even when walking indoors, where the hearth and candles
 * borrow the same pool — no material ever has to be recompiled.
 */
export function LightPool({ poolSize }: { poolSize: number }) {
  const lights = useRef<(THREE.PointLight | null)[]>(lightPool)
  const sets = useMemo(
    () => ({
      outdoor: LIGHT_SOURCES.map<PoolSource>((l) => ({ ...l, color: LAMP_COLOR.clone(), flicker: 1 })),
      cottage: COTTAGE_LIGHTS.map<PoolSource>((l) => ({ ...l, color: new THREE.Color(l.color) })),
    }),
    [],
  )
  const order = useMemo(() => Array.from({ length: MAX_SOURCES }, (_, i) => i), [])
  const dist = useMemo(() => new Float32Array(MAX_SOURCES), [])

  useFrame(() => {
    const area = useGame.getState().area
    const sources = area === 'cottage' ? sets.cottage : sets.outdoor
    const tod = sampleTimeOfDay(runtime.tod)
    // Village lanterns follow the time of day and the story; an indoor fire is always lit.
    const look = LANTERN_LOOK[lanternMode()]
    const outdoor = area === 'outdoor'
    const level = outdoor ? tod.lampIntensity * look.level : 0.75 + 0.35 * runtime.tod
    const t = runtime.time
    const { x: px, z: pz } = runtime.player
    const n = Math.min(sources.length, MAX_SOURCES)
    // Insertion sort by distance into `order` (tiny n, no per-frame allocation).
    for (let i = 0; i < n; i++) {
      dist[i] = Math.hypot(sources[i].x - px, sources[i].z - pz)
      let j = i
      while (j > 0 && dist[order[j - 1]] > dist[i]) {
        order[j] = order[j - 1]
        j--
      }
      order[j] = i
    }
    const cutoff = n > poolSize ? dist[order[poolSize]] : Infinity
    for (let k = 0; k < poolSize; k++) {
      const light = lights.current[k]
      if (!light) continue
      const si = k < n ? order[k] : undefined
      if (si === undefined) {
        light.intensity = 0
        continue
      }
      const src = sources[si]
      const wobble = 0.06 * Math.sin(t * 11 + si * 1.7) + 0.04 * Math.sin(t * 23.3 + si * 4.1)
      const fade = cutoff === Infinity ? 1 : THREE.MathUtils.smoothstep(cutoff - dist[si], 0, 2.5)
      light.position.set(src.x, src.y - 0.05, src.z + 0.05)
      if (outdoor) light.color.set(look.color)
      else light.color.copy(src.color)
      const sputter = outdoor ? gutter(t, si, look.sputter) : 1
      light.intensity = 9 * src.power * level * fade * sputter * (0.92 + wobble * src.flicker * 1.6)
    }
  })

  return (
    <>
      {Array.from({ length: poolSize }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lights.current[i] = l
          }}
          color={LAMP_COLOR}
          intensity={0}
          distance={9}
          decay={1.7}
        />
      ))}
    </>
  )
}
