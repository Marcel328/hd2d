import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { runtime } from '../game/state'
import { getSurfaces, TEX_WORLD } from '../gfx/surfaceTextures'
import { MeshBuilder } from '../gfx/meshBuilder'
import { getFlameTexture, getGlowTexture } from '../gfx/propSprites'
import { billboardGeometry, sharedUniforms } from '../gfx/materialPatches'
import { getMothSprites, MOTH_H, MOTH_W } from '../gfx/mothSprite'
import { BEACON, BEACON_HEIGHT } from '../game/world/layout'
import { gutter, LANTERN_LOOK, lanternMode, useStory } from '../game/story'
import { useOwnedResources } from './useOwnedResources'
import { useBattle } from '../game/battle'

/** Overshot waterwheel beside the mill's east wall; its axle runs east–west. */
export function RiversideMill() {
  return (
    <>
      <Waterwheel />
      <LastLantern />
      <GloamMoth />
    </>
  )
}

function Waterwheel() {
  const wheel = useRef<THREE.Group>(null!)
  const surfaces = useMemo(() => getSurfaces(), [])
  // The moth's hunger has stalled the wheel; it turns again once the Lantern is saved.
  const ending = useStory((s) => s.ending)
  useFrame(() => {
    wheel.current.rotation.x -= runtime.dt * (ending ? 0.45 : 0.06)
  })
  return (
    <group position={[18.85, 1.3, 11.5]}>
      <mesh rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 2.3, 8]} />
        <meshStandardMaterial color="#443528" roughness={1} />
      </mesh>
      <group ref={wheel}>
        {[-0.4, 0.4].map((x) => (
          <group key={x} position-x={x}>
            <mesh rotation-y={Math.PI / 2} castShadow receiveShadow>
              <torusGeometry args={[1.05, 0.1, 4, 16]} />
              <meshStandardMaterial map={surfaces.timber} color="#977552" roughness={1} />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => (
              <mesh key={i} rotation-x={i * Math.PI / 4} castShadow>
                <boxGeometry args={[0.12, 2.1, 0.1]} />
                <meshStandardMaterial map={surfaces.timber} color="#977552" roughness={1} />
              </mesh>
            ))}
          </group>
        ))}
        {Array.from({ length: 16 }, (_, i) => {
          const angle = i * Math.PI / 8
          return (
            <mesh key={i} position={[0, Math.cos(angle) * 1.06, Math.sin(angle) * 1.06]} rotation-x={angle} castShadow receiveShadow>
              <boxGeometry args={[0.95, 0.12, 0.32]} />
              <meshStandardMaterial map={surfaces.planks} color="#ad895b" roughness={1} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

/**
 * The Last Lantern: the great lantern in the mill yard every other flame in the valley was lit
 * from. How it burns tells the story — guttering, green-gold, or blazing.
 */
export function LastLantern() {
  const beacon = BEACON
  const flame = useRef<THREE.Mesh>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const s = useMemo(() => getSurfaces(), [])
  const { iron, stone, glass, flameMat, glowMat, flameGeo, flameTexture } = useMemo(() => {
    const ironB = new MeshBuilder(TEX_WORLD.timber)
    const stoneB = new MeshBuilder(TEX_WORLD.stone)
    const glassB = new MeshBuilder(1)
    const H = BEACON_HEIGHT
    stoneB.box([-0.42, 0, -0.38], [0.42, 0.55, 0.38], ['ny'])
    stoneB.box([-0.34, 0.55, -0.3], [0.34, 0.68, 0.3])
    ironB.box([-0.1, 0.68, -0.1], [0.1, H - 0.42, 0.1])
    ironB.box([-0.36, H - 0.42, -0.36], [0.36, H - 0.34, 0.36])
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      ironB.box([dx * 0.31 - 0.03, H - 0.34, dz * 0.31 - 0.03], [dx * 0.31 + 0.03, H + 0.32, dz * 0.31 + 0.03])
    ironB.box([-0.42, H + 0.32, -0.42], [0.42, H + 0.42, 0.42])
    ironB.box([-0.26, H + 0.42, -0.26], [0.26, H + 0.52, 0.26])
    ironB.box([-0.05, H + 0.52, -0.05], [0.05, H + 0.72, 0.05])
    glassB.box([-0.28, H - 0.34, -0.28], [0.28, H + 0.32, 0.28])
    const tex = getFlameTexture().clone()
    tex.needsUpdate = true
    return {
      flameTexture: tex,
      iron: ironB.build(),
      stone: stoneB.build(),
      glass: glassB.build(),
      flameGeo: billboardGeometry(0.42, 0.56),
      flameMat: new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35, color: new THREE.Color(), fog: false }),
      glowMat: new THREE.SpriteMaterial({
        map: getGlowTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    }
  }, [])
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d8c49a', emissive: new THREE.Color(), transparent: true, opacity: 0.55, roughness: 0.2 }),
    [],
  )
  const ironMat = useMemo(() => new THREE.MeshStandardMaterial({ map: s.timber, color: '#5a5462', roughness: 0.6, metalness: 0.3 }), [s])
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ map: s.stone, roughness: 0.95 }), [s])
  const color = useMemo(() => new THREE.Color(), [])
  useOwnedResources(iron, stone, glass, flameMat, glowMat, flameGeo, flameTexture, glassMat, ironMat, stoneMat)

  useFrame(() => {
    // Nothing to animate when this scene has no Last Lantern (or before the meshes mount).
    if (!flame.current || !glow.current) return
    const t = runtime.time
    const look = LANTERN_LOOK[lanternMode()]
    const g = gutter(t, 7, look.sputter)
    color.set(look.color)
    // HDR colour so the flame blooms; size tracks how well it is fed.
    flameMat.color.copy(color).multiplyScalar(1.6 + look.level)
    const size = (0.55 + 0.45 * Math.min(1.4, look.level)) * (0.75 + 0.25 * g)
    flame.current.scale.set(size, size, 1)
    flameMat.map!.offset.x = (Math.floor(t * 9) % 3) / 3
    flame.current.rotation.y = sharedUniforms.uYaw.value
    glassMat.emissive.copy(color)
    glassMat.emissiveIntensity = 0.6 * look.level * g
    glowMat.color.copy(color)
    glowMat.opacity = Math.min(1, 0.35 + 0.4 * look.level) * g
    const gs = 1.6 + 1.4 * look.glow
    glow.current.scale.set(gs, gs, 1)
  })

  if (!beacon) return null
  return (
    <group position={[beacon.x, 0, beacon.z]}>
      <mesh geometry={stone} material={stoneMat} castShadow receiveShadow />
      <mesh geometry={iron} material={ironMat} castShadow receiveShadow />
      <mesh geometry={glass} material={glassMat} />
      <mesh ref={flame} geometry={flameGeo} material={flameMat} position={[0, BEACON_HEIGHT - 0.32, 0]} />
      <sprite ref={glow} material={glowMat} position={[0, BEACON_HEIGHT, 0.05]} />
    </group>
  )
}

/** The gloam moth: feeding on the Lantern, asleep on it (firefly ending), or gone (bright ending). */
export function GloamMoth() {
  const mesh = useRef<THREE.Mesh>(null!)
  const ending = useStory((s) => s.ending)
  const { material, geometry, map, emissiveMap } = useMemo(() => {
    const sprites = getMothSprites()
    const map = sprites.color.clone()
    const emissiveMap = sprites.glow.clone()
    map.needsUpdate = emissiveMap.needsUpdate = true
    return {
      map,
      emissiveMap,
      material: new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        emissive: new THREE.Color('#e8f7b0'),
        alphaTest: 0.5,
        roughness: 1,
        shadowSide: THREE.DoubleSide,
      }),
      geometry: billboardGeometry(4.2, 4.2 * MOTH_H / MOTH_W),
    }
  }, [])
  useOwnedResources(material, geometry, map, emissiveMap)

  useFrame(() => {
    const beacon = BEACON
    if (!beacon || !mesh.current) return
    mesh.current.visible = !useBattle.getState().active
    const t = runtime.time
    const sleeping = ending === 'fireflies'
    // Slow, heavy wing-beats while feeding; a lazy flex now and then while asleep.
    const beat = sleeping ? Math.sin(t * 0.8) > 0.85 : Math.sin(t * 7) > 0
    const f = beat ? 1 : 0
    material.map!.offset.x = f * 0.5
    material.emissiveMap!.offset.x = f * 0.5
    const scale = sleeping ? 0.55 : 1
    mesh.current.scale.set(scale, scale, 1)
    const bob = sleeping ? 0 : Math.sin(t * 2.1) * 0.12
    // Billboard geometry is anchored at its bottom. Seat the thorax on the lantern crown,
    // rather than lifting the whole enlarged sprite above it (which clips the antennae).
    const spriteHeight = 4.2 * MOTH_H / MOTH_W
    mesh.current.position.set(beacon.x, BEACON_HEIGHT + 0.35 - spriteHeight * scale * 0.55 + bob, beacon.z + (sleeping ? 0.05 : 0.3))
    mesh.current.rotation.y = sharedUniforms.uYaw.value
    material.emissive.set(sleeping ? '#c8f07a' : '#e8f7b0')
    material.emissiveIntensity = (sleeping ? 1.6 : 0.6) + runtime.tod * 0.8
  })

  if (ending === 'bright') return null
  return <mesh ref={mesh} geometry={geometry} material={material} castShadow />
}
