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
import { runtime } from '../game/state'
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

export function Lamps({ poolSize }: { poolSize: number }) {
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

  const lights = useRef<(THREE.PointLight | null)[]>(lightPool)
  const order = useMemo(() => LIGHT_SOURCES.map((_, i) => i), [])
  const dist = useMemo(() => new Float32Array(LIGHT_SOURCES.length), [])

  useFrame(() => {
    const tod = sampleTimeOfDay(runtime.tod)
    const t = runtime.time
    const flicker = (i: number) => 0.9 + 0.06 * Math.sin(t * 11 + i * 1.7) + 0.04 * Math.sin(t * 23.3 + i * 4.1)
    glassMat.emissiveIntensity = tod.lampIntensity * 4 * flicker(0) + 0.05
    glow.m.opacity = Math.min(1, tod.lampIntensity * 1.1) * flicker(3)

    // Hand the pool to the nearest lanterns; fade by distance to the first one left out.
    const { x: px, z: pz } = runtime.player
    LIGHT_SOURCES.forEach((l, i) => (dist[i] = Math.hypot(l.x - px, l.z - pz)))
    order.sort((a, b) => dist[a] - dist[b])
    const cutoff = order.length > poolSize ? dist[order[poolSize]] : Infinity
    for (let k = 0; k < poolSize; k++) {
      const light = lights.current[k]
      if (!light) continue
      const si = order[k]
      if (si === undefined) {
        light.intensity = 0
        continue
      }
      const src = LIGHT_SOURCES[si]
      const fade = cutoff === Infinity ? 1 : THREE.MathUtils.smoothstep(cutoff - dist[si], 0, 2.5)
      light.position.set(src.x, src.y - 0.05, src.z + 0.05)
      light.intensity = 9 * src.power * tod.lampIntensity * fade * flicker(si)
    }
  })

  return (
    <group>
      <mesh geometry={geo.iron} material={ironMat} castShadow receiveShadow />
      <mesh geometry={geo.stone} material={stoneMat} castShadow receiveShadow />
      <mesh geometry={geo.glass} material={glassMat} />
      <points geometry={glow.g} material={glow.m} renderOrder={5} />
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
    </group>
  )
}
