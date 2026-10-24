// Static 3D props: the well, garden fence, crates & barrels and the arched bridge.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BRIDGE, FENCE_SEGMENTS, PROPS, WELL } from '../game/world/layout'
import { MeshBuilder, AXES } from '../gfx/meshBuilder'
import { getSurfaces, TEX_WORLD } from '../gfx/surfaceTextures'
import { occlusionPatch, patchMaterial } from '../gfx/materialPatches'

const std = (map: THREE.Texture, extra: THREE.MeshStandardMaterialParameters = {}) =>
  patchMaterial(new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, ...extra }), [occlusionPatch])

/** Height of the walkable surface (the bridge arches over the creek). */
export function groundHeight(x: number, z: number): number {
  if (z < BRIDGE.z0 - 0.1 || z > BRIDGE.z1 + 0.1) return 0
  const a = BRIDGE.x0 - 0.35
  const b = BRIDGE.x1 + 0.35
  if (x < a || x > b) return 0
  return 0.06 + 0.26 * Math.sin((Math.PI * (x - a)) / (b - a))
}

export function Well() {
  const { stoneTex, parts } = useMemo(() => {
    const s = getSurfaces()
    const stoneTex = s.stone.clone()
    stoneTex.repeat.set(2.25, 0.4)
    stoneTex.needsUpdate = true
    const wood = new MeshBuilder(TEX_WORLD.timber)
    const { x, z } = WELL
    for (const sx of [-0.62, 0.62]) wood.box([x + sx - 0.07, 0.6, z - 0.07], [x + sx + 0.07, 2.3, z + 0.07])
    wood.box([x - 0.75, 1.78, z - 0.05], [x + 0.75, 1.88, z + 0.05]) // crossbar
    // Little gable roof
    for (const side of [1, -1]) {
      const n = new THREE.Vector3(0, 0.75, 0.66 * side).normalize()
      const up = new THREE.Vector3(0, 0.66, -0.75 * side).normalize()
      const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] =
        side > 0 ? [AXES.X.clone(), up, n] : [AXES.X.clone().negate(), up, n]
      wood.orientedBox(new THREE.Vector3(x, 2.08, z + 0.26 * side), axes, [0.85, 0.36, 0.04])
    }
    // Rope and bucket
    wood.box([x - 0.015, 1.42, z - 0.015], [x + 0.015, 1.78, z + 0.015])
    wood.box([x - 0.13, 1.2, z - 0.13], [x + 0.13, 1.42, z + 0.13])
    return { stoneTex, parts: wood.build() }
  }, [])
  const surf = getSurfaces()
  const woodMat = useMemo(() => std(surf.darkPlanks), [surf])
  const stoneMat = useMemo(() => std(stoneTex), [stoneTex])

  return (
    <group>
      <mesh position={[WELL.x, 0.3, WELL.z]} castShadow receiveShadow material={stoneMat}>
        <cylinderGeometry args={[WELL.radius, WELL.radius + 0.04, 0.6, 18, 1, false]} />
      </mesh>
      <mesh position={[WELL.x, 0.61, WELL.z]} rotation-x={-Math.PI / 2} receiveShadow material={stoneMat}>
        <ringGeometry args={[WELL.radius - 0.16, WELL.radius + 0.02, 18]} />
      </mesh>
      <mesh position={[WELL.x, 0.45, WELL.z]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[WELL.radius - 0.15, 18]} />
        <meshStandardMaterial color="#0d1a24" roughness={0.1} />
      </mesh>
      <mesh geometry={parts} material={woodMat} castShadow receiveShadow />
    </group>
  )
}

export function Fence() {
  const geometry = useMemo(() => {
    const b = new MeshBuilder(TEX_WORLD.timber)
    for (const [x0, z0, x1, z1] of FENCE_SEGMENTS) {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const n = Math.max(1, Math.round(len / 0.9))
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n
        const z = z0 + ((z1 - z0) * i) / n
        b.box([x - 0.06, 0, z - 0.06], [x + 0.06, 0.72, z + 0.06])
      }
      for (const y of [0.3, 0.56]) {
        const t = 0.035
        b.box([Math.min(x0, x1) - t, y, Math.min(z0, z1) - t], [Math.max(x0, x1) + t, y + 0.08, Math.max(z0, z1) + t])
      }
    }
    return b.build()
  }, [])
  const mat = useMemo(() => std(getSurfaces().planks), [])
  return <mesh geometry={geometry} material={mat} castShadow receiveShadow />
}

export function Bridge() {
  const { deck, rails } = useMemo(() => {
    const deck = new MeshBuilder(TEX_WORLD.planks)
    const rails = new MeshBuilder(TEX_WORLD.timber)
    const a = BRIDGE.x0 - 0.35
    const b = BRIDGE.x1 + 0.35
    const planks = 14
    const w = (b - a) / planks
    for (let i = 0; i < planks; i++) {
      const x = a + w * (i + 0.5)
      const h = groundHeight(x, (BRIDGE.z0 + BRIDGE.z1) / 2)
      deck.box([x - w / 2 + 0.01, h - 0.12, BRIDGE.z0 - 0.12], [x + w / 2 - 0.01, h, BRIDGE.z1 + 0.12])
    }
    // Beams under the deck
    rails.box([a, -0.1, BRIDGE.z0 + 0.1], [b, 0.1, BRIDGE.z0 + 0.3])
    rails.box([a, -0.1, BRIDGE.z1 - 0.3], [b, 0.1, BRIDGE.z1 - 0.1])
    // Railings following the arch
    for (const z of [BRIDGE.z0 - 0.05, BRIDGE.z1 + 0.05]) {
      const posts = [a + 0.1, (a + b) / 2, b - 0.1]
      const tops: THREE.Vector3[] = []
      for (const x of posts) {
        const h = groundHeight(x, (BRIDGE.z0 + BRIDGE.z1) / 2)
        rails.box([x - 0.07, h - 0.1, z - 0.07], [x + 0.07, h + 0.62, z + 0.07])
        tops.push(new THREE.Vector3(x, h + 0.56, z))
      }
      for (let i = 0; i < tops.length - 1; i++) {
        const p = tops[i]
        const q = tops[i + 1]
        const along = q.clone().sub(p)
        const len = along.length()
        along.normalize()
        const side = AXES.Z.clone()
        const up = new THREE.Vector3().crossVectors(side, along)
        rails.orientedBox(p.clone().add(q).multiplyScalar(0.5), [along, up, side], [len / 2 + 0.04, 0.04, 0.05])
      }
    }
    return { deck: deck.build(), rails: rails.build() }
  }, [])
  const s = getSurfaces()
  const deckMat = useMemo(() => std(s.planks), [s])
  const railMat = useMemo(() => std(s.timber), [s])
  return (
    <group>
      <mesh geometry={deck} material={deckMat} castShadow receiveShadow />
      <mesh geometry={rails} material={railMat} castShadow receiveShadow />
    </group>
  )
}

const crates = PROPS.filter((p) => p.kind === 'crate')
const barrels = PROPS.filter((p) => p.kind === 'barrel')

export function Crates() {
  const crateRef = useRef<THREE.InstancedMesh>(null!)
  const barrelRef = useRef<THREE.InstancedMesh>(null!)
  const s = getSurfaces()
  const { crateMat, barrelMat, crateGeo, barrelGeo } = useMemo(() => {
    const barrelTex = s.barrel.clone()
    barrelTex.repeat.set(1, 1)
    barrelTex.needsUpdate = true
    return {
      crateMat: std(s.crate),
      barrelMat: std(barrelTex),
      crateGeo: new THREE.BoxGeometry(0.66, 0.66, 0.66).translate(0, 0.33, 0),
      barrelGeo: new THREE.CylinderGeometry(0.29, 0.29, 0.78, 12).translate(0, 0.39, 0),
    }
  }, [s])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    crates.forEach((c, i) => crateRef.current.setMatrixAt(i, m.makeRotationY(c.rot).setPosition(c.x, 0, c.z)))
    barrels.forEach((c, i) => barrelRef.current.setMatrixAt(i, m.makeRotationY(c.rot).setPosition(c.x, 0, c.z)))
    crateRef.current.instanceMatrix.needsUpdate = true
    barrelRef.current.instanceMatrix.needsUpdate = true
    crateRef.current.computeBoundingSphere()
    barrelRef.current.computeBoundingSphere()
  }, [])

  return (
    <group>
      <instancedMesh ref={crateRef} args={[crateGeo, crateMat, crates.length]} castShadow receiveShadow />
      <instancedMesh ref={barrelRef} args={[barrelGeo, barrelMat, barrels.length]} castShadow receiveShadow />
    </group>
  )
}
