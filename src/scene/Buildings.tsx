// Timber-framed houses built from pixel-textured boxes. All houses are merged per material,
// so the whole village is ~10 draw calls regardless of how many houses there are.
import { useMemo } from 'react'
import { useOwnedResources } from './useOwnedResources'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { HOUSES, type HouseDef, type RoofStyle } from '../game/world/layout'
import { MeshBuilder, AXES } from '../gfx/meshBuilder'
import { getSurfaces, TEX_WORLD } from '../gfx/surfaceTextures'
import { occlusionPatch, patchMaterial } from '../gfx/materialPatches'
import { runtime } from '../game/state'
import { sampleTimeOfDay } from './timeOfDay'

const { X, Z } = AXES
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type Part = 'plaster' | 'planks' | 'stone' | 'timber' | `roof_${RoofStyle}` | 'door' | 'window'

class Parts {
  readonly b: Record<Part, MeshBuilder> = {
    plaster: new MeshBuilder(TEX_WORLD.plaster),
    planks: new MeshBuilder(TEX_WORLD.planks),
    stone: new MeshBuilder(TEX_WORLD.stone),
    timber: new MeshBuilder(TEX_WORLD.timber),
    roof_red: new MeshBuilder(TEX_WORLD.roof),
    roof_slate: new MeshBuilder(TEX_WORLD.roof),
    roof_moss: new MeshBuilder(TEX_WORLD.roof),
    door: new MeshBuilder(1),
    window: new MeshBuilder(1),
  }
}

export function roofGeometry(h: HouseDef) {
  const depth = h.z1 - h.z0
  const zMid = (h.z0 + h.z1) / 2
  const rise = (depth / 2) * Math.tan(THREE.MathUtils.degToRad(40))
  return { zMid, rise, ridgeY: h.wallHeight + rise }
}

function buildHouse(p: Parts, h: HouseDef) {
  const { x0, x1, z0, z1, wallHeight: H } = h
  const { zMid, ridgeY } = roofGeometry(h)
  const wall = h.walls === 'timber' ? p.b.plaster : p.b.planks

  // Walls (no bottom; top hidden under the roof).
  wall.box([x0, 0, z0], [x1, H, z1], ['ny', 'py'])
  // Gable triangles on the east and west ends.
  wall.polygon([v3(x1, H, z1), v3(x1, H, z0), v3(x1, ridgeY, zMid)], X)
  wall.polygon([v3(x0, H, z0), v3(x0, H, z1), v3(x0, ridgeY, zMid)], X.clone().negate())

  // Stone plinth.
  p.b.stone.box([x0 - 0.06, 0, z0 - 0.06], [x1 + 0.06, 0.42, z1 + 0.06], ['ny'])

  // Timber frame: corner posts, wall plate and (for two storeys) a floor beam.
  const t = p.b.timber
  const post = 0.17
  for (const [px, pz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ])
    t.box([px - post / 2 - 0.02, 0.42, pz - post / 2], [px + post / 2 + 0.02, H, pz + post / 2 + 0.02])
  const beam = (y: number, th: number) => {
    t.box([x0 - 0.04, y, z1], [x1 + 0.04, y + th, z1 + 0.06]) // front
    t.box([x1, y, z0], [x1 + 0.06, y + th, z1]) // east
    t.box([x0 - 0.06, y, z0], [x0, y + th, z1]) // west
  }
  beam(H - 0.16, 0.16)
  if (h.upperWindows) beam(1.86, 0.14)
  // Studs flanking the door give the facade rhythm.
  if (h.walls === 'timber')
    for (const sx of [h.doorX - 0.68, h.doorX + 0.68]) t.box([sx - 0.06, 0.42, z1], [sx + 0.06, h.upperWindows ? 1.86 : H - 0.16, z1 + 0.05])

  // Roof: two thick slabs with eave and gable overhang, plus a ridge beam.
  const roof = p.b[`roof_${h.roof}`]
  const over = 0.38
  const thick = 0.14
  for (const side of [1, -1]) {
    const eaveZ = side > 0 ? z1 : z0
    const ridge = v3(0, ridgeY, zMid)
    const eave = v3(0, H, eaveZ)
    const down = eave.clone().sub(ridge).normalize()
    const eaveOut = eave.clone().addScaledVector(down, over)
    const len = eaveOut.distanceTo(ridge) + 0.06
    const up = down.clone().negate() // along the slope toward the ridge
    const normal = new THREE.Vector3().crossVectors(X, up)
    if (normal.y < 0) normal.negate()
    const e1 = up
    const e2 = new THREE.Vector3().crossVectors(X, e1)
    const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [X.clone(), e1, e2]
    if (e2.dot(normal) < 0) {
      axes[0] = X.clone().negate()
      axes[2] = new THREE.Vector3().crossVectors(axes[0], e1)
    }
    const mid = ridge.clone().add(eaveOut).multiplyScalar(0.5).addScaledVector(normal, thick / 2)
    mid.x = (x0 + x1) / 2
    roof.orientedBox(mid, axes, [(x1 - x0) / 2 + over * 0.8, len / 2, thick / 2])
  }
  t.box([x0 - over * 0.8 - 0.02, ridgeY + 0.02, zMid - 0.1], [x1 + over * 0.8 + 0.02, ridgeY + 0.2, zMid + 0.1])

  // Chimney on the back slope.
  if (h.chimneyX !== undefined) {
    const cz = zMid - 0.7
    p.b.stone.box([h.chimneyX - 0.28, H, cz - 0.28], [h.chimneyX + 0.28, ridgeY + 0.75, cz + 0.28], ['ny'])
    t.box([h.chimneyX - 0.33, ridgeY + 0.75, cz - 0.33], [h.chimneyX + 0.33, ridgeY + 0.85, cz + 0.33])
  }

  // Door with a stone step.
  const fz = z1 + 0.075
  p.b.door.decal(v3(h.doorX, 0.875, fz), 1, 1.75, Z)
  t.box([h.doorX - 0.6, 0, fz - 0.02], [h.doorX - 0.5, 1.85, fz + 0.04])
  t.box([h.doorX + 0.5, 0, fz - 0.02], [h.doorX + 0.6, 1.85, fz + 0.04])
  t.box([h.doorX - 0.62, 1.78, fz - 0.02], [h.doorX + 0.62, 1.9, fz + 0.06])
  p.b.stone.box([h.doorX - 0.62, 0, z1 + 0.06], [h.doorX + 0.62, 0.07, z1 + 0.4], ['ny'])

  // Windows (shuttered) with sills; front, upper floor and one on each gable end.
  const win = (x: number, y: number, z: number, n: THREE.Vector3) => {
    p.b.window.decal(v3(x, y, z), 1.35, 0.9, n)
  }
  const groundY = h.upperWindows ? 1.2 : 1.3
  for (const wx of h.windows) {
    win(wx, groundY, z1 + 0.03, Z)
    t.box([wx - 0.42, groundY - 0.52, z1], [wx + 0.42, groundY - 0.45, z1 + 0.12])
  }
  for (const wx of h.upperWindows ?? []) {
    win(wx, 2.5, z1 + 0.03, Z)
    t.box([wx - 0.42, 2.0, z1], [wx + 0.42, 2.07, z1 + 0.12])
  }
  win(x1 + 0.03, groundY, zMid, X)
  win(x0 - 0.03, groundY, zMid, X.clone().negate())
}

export function Buildings() {
  const { meshes, windowMat, materials } = useMemo(() => {
    const parts = new Parts()
    HOUSES.forEach((h) => buildHouse(parts, h))
    const s = getSurfaces()
    const mat = (map: THREE.Texture, extra: THREE.MeshStandardMaterialParameters = {}) =>
      patchMaterial(new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...extra }), [occlusionPatch])
    const windowMat = mat(s.window, {
      emissive: new THREE.Color('#ffb661'),
      emissiveMap: s.windowEmissive,
      emissiveIntensity: 0,
      roughness: 0.4,
    })
    const materials: Record<Part, THREE.Material> = {
      plaster: mat(s.plaster),
      planks: mat(s.planks),
      stone: mat(s.stone),
      timber: mat(s.timber),
      roof_red: mat(s.roof.red, { roughness: 0.8 }),
      roof_slate: mat(s.roof.slate, { roughness: 0.75 }),
      roof_moss: mat(s.roof.moss),
      door: mat(s.door),
      window: windowMat,
    }
    const meshes = (Object.keys(parts.b) as Part[])
      .filter((k) => !parts.b[k].empty)
      .map((k) => ({ key: k, geometry: parts.b[k].build(), material: materials[k] }))
    return { meshes, windowMat, materials }
  }, [])
  useOwnedResources(...meshes.map((mesh) => mesh.geometry), ...Object.values(materials))

  useFrame(() => {
    const tod = sampleTimeOfDay(runtime.tod)
    windowMat.emissiveIntensity = tod.windowGlow * 2.4
  })

  return (
    <group>
      {meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} castShadow receiveShadow />
      ))}
    </group>
  )
}
