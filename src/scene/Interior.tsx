// Ashdown Cottage interior: a cutaway HD-2D room (back and side walls, low front wall) with
// merged pixel-textured furniture, instanced prop sprites, an animated hearth and scavenging
// spots. It stays mounted next to the village and is shown/hidden by AreaGroup, so entering
// the house never loads anything.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshBuilder } from '../gfx/meshBuilder'
import { getInteriorSurfaces, getSurfaces, TEX_WORLD } from '../gfx/surfaceTextures'
import { getFlameTexture, getGlowTexture, getShaftTexture, getSpriteAtlas, type SpriteName } from '../gfx/propSprites'
import { billboardGeometry, occlusionPatch, patchMaterial, sharedUniforms } from '../gfx/materialPatches'
import { InstancedSprites, type SpriteInstance } from './InstancedSprites'
import {
  COTTAGE_CAT,
  COTTAGE_SPOTS,
  COTTAGE_SPRITES,
  DOORWAY,
  FURNITURE,
  ORIGIN,
  ROOM,
  type FurnitureMaterial,
} from '../game/world/interiors'
import { registerInteractable, unregisterInteractable, type Interactable } from '../game/interactions'
import { searchSpot } from '../game/scavenge'
import { useInventory } from '../game/inventory'
import { runtime, useGame } from '../game/state'
import { sampleTimeOfDay } from './timeOfDay'
import { useOwnedResources } from './useOwnedResources'

type ShellPart = 'plaster' | 'wainscot' | 'timber' | 'cap' | 'stone' | 'floor'

/** Walls, floor and trim in local room space. */
function buildShell() {
  const b: Record<ShellPart, MeshBuilder> = {
    plaster: new MeshBuilder(TEX_WORLD.plaster),
    wainscot: new MeshBuilder(TEX_WORLD.planks),
    timber: new MeshBuilder(TEX_WORLD.timber),
    cap: new MeshBuilder(TEX_WORLD.timber),
    stone: new MeshBuilder(TEX_WORLD.stone),
    floor: new MeshBuilder(2),
  }
  const { w: W, d: D, wallH: H, wall: T } = ROOM
  const low = 0.8 // the cutaway height of the front wall and the front part of the side walls
  const sideCut = 4.4 // side walls step down from full height here

  b.floor.box([-T, -0.05, -T], [W + T, 0, D + T], ['ny'])

  // Back wall and the full-height part of the side walls.
  b.plaster.box([-T, 0, -T], [W + T, H, 0], ['nz', 'ny'])
  b.plaster.box([-T, 0, 0], [0, H, sideCut], ['nx', 'ny'])
  b.plaster.box([W, 0, 0], [W + T, H, sideCut], ['px', 'ny'])
  // Lower, cut-away front part of the side walls and the front wall either side of the door.
  b.plaster.box([-T, 0, sideCut], [0, low, D + T], ['nx', 'ny'])
  b.plaster.box([W, 0, sideCut], [W + T, low, D + T], ['px', 'ny'])
  b.plaster.box([-T, 0, D], [DOORWAY.x0, low, D + T], ['pz', 'ny'])
  b.plaster.box([DOORWAY.x1, 0, D], [W + T, low, D + T], ['pz', 'ny'])

  // Dark caps on every cut edge: the classic diorama cross-section look.
  const c = 0.06
  b.cap.box([-T - c, H, -T - c], [W + T + c, H + 0.08, 0])
  b.cap.box([-T - c, H, 0], [0, H + 0.08, sideCut])
  b.cap.box([W, H, 0], [W + T + c, H + 0.08, sideCut])
  b.cap.box([-T - c, low, sideCut], [0, low + 0.08, D + T + c])
  b.cap.box([W, low, sideCut], [W + T + c, low + 0.08, D + T + c])
  b.cap.box([-T - c, low, D], [DOORWAY.x0, low + 0.08, D + T + c])
  b.cap.box([DOORWAY.x1, low, D], [W + T + c, low + 0.08, D + T + c])
  // The step down in the side walls.
  b.cap.box([-T - c, low, sideCut - 0.04], [0, H, sideCut + 0.04])
  b.cap.box([W, low, sideCut - 0.04], [W + T + c, H, sideCut + 0.04])

  // Wainscot panelling and a dado rail around the inside.
  const wh = 0.95
  b.wainscot.box([0, 0, 0], [W, wh, 0.04], ['nz'])
  b.wainscot.box([0, 0, 0], [0.04, wh, D], ['nx'])
  b.wainscot.box([W - 0.04, 0, 0], [W, wh, D], ['px'])
  b.timber.box([0, wh, 0], [W, wh + 0.09, 0.08])
  b.timber.box([0, wh, 0], [0.08, wh + 0.09, D])
  b.timber.box([W - 0.08, wh, 0], [W, wh + 0.09, D])

  // Timber framing: wall plate and posts between the furniture.
  b.timber.box([0, H - 0.22, 0], [W, H, 0.12])
  for (const x of [3.0, 6.05, 7.95]) b.timber.box([x - 0.08, wh, 0], [x + 0.08, H - 0.22, 0.1])
  b.timber.box([0, H - 0.22, 0], [0.12, H, sideCut])
  b.timber.box([W - 0.12, H - 0.22, 0], [W, H, sideCut])
  for (const z of [2.3]) {
    b.timber.box([0, wh, z - 0.08], [0.1, H - 0.22, z + 0.08])
    b.timber.box([W - 0.1, wh, z - 0.08], [W, H - 0.22, z + 0.08])
  }
  // Door frame and threshold.
  b.timber.box([DOORWAY.x0 - 0.12, 0, D], [DOORWAY.x0, low + 0.3, D + T + 0.04])
  b.timber.box([DOORWAY.x1, 0, D], [DOORWAY.x1 + 0.12, low + 0.3, D + T + 0.04])
  b.stone.box([DOORWAY.x0, 0, D - 0.05], [DOORWAY.x1, 0.05, D + T + 0.1], ['ny'])
  return b
}

function buildFurniture() {
  const scale: Record<FurnitureMaterial, number> = {
    planks: TEX_WORLD.planks,
    darkPlanks: TEX_WORLD.planks,
    counter: TEX_WORLD.planks,
    timber: TEX_WORLD.timber,
    stone: TEX_WORLD.stone,
    soot: TEX_WORLD.stone,
    quilt: 1,
    linen: 1,
    books: 2,
  }
  const b = {} as Record<FurnitureMaterial, MeshBuilder>
  for (const [mat, x0, y0, z0, x1, y1, z1] of FURNITURE) {
    b[mat] ??= new MeshBuilder(scale[mat])
    b[mat].box([x0, y0, z0], [x1, y1, z1], ['ny'])
  }
  return b
}

function useInteriorMaterials() {
  const materials = useMemo(() => {
    const s = getSurfaces()
    const i = getInteriorSurfaces()
    const std = (map: THREE.Texture | null, extra: THREE.MeshStandardMaterialParameters = {}) =>
      patchMaterial(new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...extra }), [occlusionPatch])
    const soot = std(s.stone, { color: '#3a2a22', emissive: new THREE.Color('#ff6a20'), emissiveIntensity: 0.4 })
    const window = std(s.window, { emissive: new THREE.Color('#d8ecff'), emissiveMap: s.windowEmissive, emissiveIntensity: 1, roughness: 0.4 })
    return {
      shell: {
        plaster: std(s.plaster, { color: '#efe2c8' }),
        wainscot: std(s.darkPlanks),
        timber: std(s.timber),
        cap: std(null, { color: '#1b120e', roughness: 1 }),
        stone: std(s.stone),
        floor: new THREE.MeshStandardMaterial({ map: i.floor, roughness: 0.85 }),
      } as Record<ShellPart, THREE.Material>,
      furniture: {
        planks: std(s.planks),
        darkPlanks: std(s.darkPlanks),
        counter: std(s.planks, { color: '#d8c2a4' }),
        timber: std(s.timber),
        stone: std(s.stone, { color: '#cfc4b4' }),
        soot,
        quilt: std(i.quilt, { roughness: 1 }),
        linen: std(i.linen, { roughness: 1 }),
        books: std(i.books),
      } as Record<FurnitureMaterial, THREE.Material>,
      soot,
      window,
      rug: new THREE.MeshStandardMaterial({ map: i.rug, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
      doormat: new THREE.MeshStandardMaterial({ map: i.doormat, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
    }
  }, [])
  useOwnedResources(
    ...Object.values(materials.shell), ...Object.values(materials.furniture),
    materials.window, materials.rug, materials.doormat,
  )
  return materials
}

function Hearth({ soot }: { soot: THREE.MeshStandardMaterial }) {
  const flame = useRef<THREE.Mesh>(null!)
  const { material, glow, texture } = useMemo(() => {
    const tex = getFlameTexture().clone()
    tex.needsUpdate = true
    // Colour above 1.0 keeps the fire bright enough to bloom.
    const material = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35, color: new THREE.Color(2.4, 1.7, 1.1), fog: false })
    const glow = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: '#ff9a4a',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55,
      fog: false,
    })
    return { material, glow, texture: tex }
  }, [])
  const geometry = useMemo(() => billboardGeometry(0.75, 1.0), [])
  useOwnedResources(material, glow, texture, geometry)

  useFrame(() => {
    const t = runtime.time
    const frame = Math.floor(t * 9 + Math.sin(t * 3.1) * 0.6) % 3
    material.map!.offset.x = ((frame + 3) % 3) / 3
    const f = 0.85 + 0.1 * Math.sin(t * 13) + 0.05 * Math.sin(t * 27.7)
    soot.emissiveIntensity = 0.35 * f
    glow.opacity = 0.5 * f
    flame.current.rotation.y = sharedUniforms.uYaw.value
  })

  return (
    <group position={[1.5, 0.12, 0.56]}>
      <mesh ref={flame} geometry={geometry} material={material} />
      <sprite material={glow} position={[0, 0.45, 0.1]} scale={[2.2, 2.2, 1]} />
    </group>
  )
}

/** Day light through the back window: an emissive pane and a soft beam across the floor. */
function WindowLight({ material }: { material: THREE.MeshStandardMaterial }) {
  const beam = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getShaftTexture(),
        color: '#ffe6b8',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
        opacity: 0,
      }),
    [],
  )
  const day = new THREE.Color('#d8ecff')
  const night = new THREE.Color('#5a6aa8')
  useOwnedResources(beam)
  useFrame(() => {
    const tod = sampleTimeOfDay(runtime.tod)
    const d = 1 - runtime.tod
    material.emissive.copy(night).lerp(day, d)
    material.emissiveIntensity = 0.35 + 0.9 * d
    beam.opacity = 0.22 * tod.shafts
  })
  return (
    <group>
      <mesh position={[7, 1.75, 0.035]} material={material}>
        <planeGeometry args={[1.35, 0.9]} />
      </mesh>
      {/* Sill */}
      <mesh position={[7, 1.27, 0.08]} castShadow>
        <boxGeometry args={[1.0, 0.06, 0.16]} />
        <meshStandardMaterial color="#5a3a24" roughness={1} />
      </mesh>
      <mesh position={[7.2, 0.95, 1.05]} rotation={[-0.95, 0, 0.08]} material={beam}>
        <planeGeometry args={[1.1, 2.6]} />
      </mesh>
    </group>
  )
}

/** Twinkles over spots that still hold something; gone once searched. */
function SearchGlints() {
  const looted = useInventory((s) => s.looted)
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const { geometry, material, texture } = useMemo(() => {
    const atlas = getSpriteAtlas()
    const r = atlas.rects.sparkle
    const tex = atlas.texture.clone()
    tex.offset.set(r.u, r.v)
    tex.repeat.set(r.su, r.sv)
    tex.needsUpdate = true
    return {
      texture: tex,
      geometry: billboardGeometry(9 / 16, 9 / 16),
      material: new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, color: new THREE.Color(2.2, 2.0, 1.4), fog: false }),
    }
  }, [])
  useOwnedResources(geometry, material, texture)
  useFrame(() => {
    COTTAGE_SPOTS.forEach((_, i) => {
      const m = refs.current[i]
      if (!m) return
      // Each glint pulses on its own phase, mostly small with a brief flash.
      const p = (runtime.time * 0.8 + i * 0.37) % 1
      const s = p < 0.2 ? Math.sin((p / 0.2) * Math.PI) : 0
      m.scale.setScalar(0.25 + s * 0.85)
      m.rotation.y = sharedUniforms.uYaw.value
    })
  })
  return (
    <>
      {COTTAGE_SPOTS.map((spot, i) =>
        looted[spot.id] ? null : (
          <mesh
            key={spot.id}
            ref={(m) => {
              refs.current[i] = m
            }}
            geometry={geometry}
            material={material}
            position={[spot.glint.x - ORIGIN.x, spot.glint.y, spot.glint.z - ORIGIN.z]}
            renderOrder={6}
          />
        ),
      )}
    </>
  )
}

const CAT_LINES: Interactable['lines'] = ({ visits }) =>
  visits === 0
    ? ['The cat opens one eye, decides you are not food, and goes back to sleep.']
    : ['The cat is purring in its sleep. Best not to disturb it.']

export function Interior() {
  const gl = useThree((s) => s.gl)
  const mats = useInteriorMaterials()
  const shell = useMemo(() => {
    const b = buildShell()
    return (Object.keys(b) as ShellPart[]).map((k) => ({ key: k, geometry: b[k].build(), material: mats.shell[k] }))
  }, [mats])
  const furniture = useMemo(() => {
    const b = buildFurniture()
    return (Object.keys(b) as FurnitureMaterial[]).map((k) => ({ key: k, geometry: b[k].build(), material: mats.furniture[k] }))
  }, [mats])
  useOwnedResources(...shell.map((mesh) => mesh.geometry), ...furniture.map((mesh) => mesh.geometry))
  const sprites = useMemo<SpriteInstance[]>(
    () => COTTAGE_SPRITES.map((p) => ({ sprite: p.sprite as SpriteName, x: p.x, y: p.y, z: p.z, scale: p.scale, flip: p.flip })),
    [],
  )

  // Searchable spots and the cat belong to the cottage area.
  useEffect(() => {
    const list: Interactable[] = [
      ...COTTAGE_SPOTS.map<Interactable>((spot) => ({
        id: spot.id,
        kind: 'search',
        area: 'cottage',
        name: spot.name,
        pos: { x: spot.x, z: spot.z },
        reach: spot.reach,
        iconHeight: spot.iconHeight,
        lines: () => searchSpot(spot),
      })),
      {
        id: 'cottage-cat',
        kind: 'read',
        area: 'cottage',
        name: COTTAGE_CAT.name,
        pos: { x: COTTAGE_CAT.x, z: COTTAGE_CAT.z },
        reach: 1.2,
        iconHeight: 1.1,
        lines: CAT_LINES,
      },
    ]
    list.forEach(registerInteractable)
    return () => list.forEach(unregisterInteractable)
  }, [])

  // Upload the interior's textures now, so the first time through the door doesn't hitch.
  useEffect(() => {
    const i = getInteriorSurfaces()
    for (const t of [i.floor, i.quilt, i.linen, i.books, i.rug, i.doormat, getFlameTexture()]) gl.initTexture(t)
  }, [gl])

  return (
    <group position={[ORIGIN.x, 0, ORIGIN.z]}>
      {shell.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} receiveShadow castShadow={m.key !== 'floor'} />
      ))}
      {furniture.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} receiveShadow castShadow />
      ))}
      <mesh position={[5.2, 0.006, 3.8]} rotation-x={-Math.PI / 2} material={mats.rug} receiveShadow>
        <planeGeometry args={[3.8, 2.4]} />
      </mesh>
      <mesh position={[5, 0.006, 6.6]} rotation-x={-Math.PI / 2} material={mats.doormat} receiveShadow>
        <planeGeometry args={[1.0, 0.62]} />
      </mesh>
      <InstancedSprites instances={sprites} castShadow />
      <Hearth soot={mats.soot} />
      <WindowLight material={mats.window} />
      <SearchGlints />
    </group>
  )
}

/** Shows its children only while the player is in `area` — toggled imperatively, no re-render. */
export function AreaGroup({ area, children }: { area: string; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!)
  useLayoutEffect(() => {
    const apply = (a: string) => {
      ref.current.visible = a === area
    }
    apply(useGame.getState().area)
    return useGame.subscribe((s, prev) => s.area !== prev.area && apply(s.area))
  }, [area])
  return <group ref={ref}>{children}</group>
}
