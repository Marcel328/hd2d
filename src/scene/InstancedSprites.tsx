// One draw call for many billboards from the shared sprite atlas, with optional wind sway,
// shadows that use the correct sprite silhouette, and the occlusion cut-out.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSpriteAtlas, type SpriteName } from '../gfx/propSprites'
import { atlasSpritePatch, billboardGeometry, occlusionPatch, patchMaterial } from '../gfx/materialPatches'
import { PPU } from '../gfx/terrainTexture'
import { useOwnedResources } from './useOwnedResources'

export interface SpriteInstance {
  sprite: SpriteName
  x: number
  z: number
  y?: number
  scale?: number
  /** Brightness multiplier (instance colour). */
  tint?: number
  /** Horizontal sway amplitude at the top of the sprite, in sprite-local units. */
  sway?: number
  flip?: boolean
}

interface Props {
  instances: SpriteInstance[]
  castShadow?: boolean
  receiveShadow?: boolean
  occlude?: boolean
}

export function InstancedSprites({ instances, castShadow = false, receiveShadow = true, occlude = false }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const atlas = getSpriteAtlas()

  const { geometry, material, depthMaterial } = useMemo(() => {
    const geometry = billboardGeometry(1, 1)
    const n = instances.length
    const rect = new Float32Array(n * 4)
    const sway = new Float32Array(n)
    instances.forEach((it, i) => {
      const r = atlas.rects[it.sprite]
      // Flipped sprites sample the rect right-to-left.
      rect.set(it.flip ? [r.u + r.su, r.v, -r.su, r.sv] : [r.u, r.v, r.su, r.sv], i * 4)
      sway[i] = it.sway ?? 0
    })
    geometry.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4))
    geometry.setAttribute('aSway', new THREE.InstancedBufferAttribute(sway, 1))

    const material = patchMaterial(
      new THREE.MeshStandardMaterial({
        map: atlas.texture,
        alphaTest: 0.5,
        roughness: 1,
        metalness: 0,
        shadowSide: THREE.DoubleSide,
      }),
      occlude ? [atlasSpritePatch, occlusionPatch] : [atlasSpritePatch],
    )
    const depthMaterial = patchMaterial(
      new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.texture, alphaTest: 0.5 }),
      [atlasSpritePatch],
    )
    return { geometry, material, depthMaterial }
  }, [instances, atlas, occlude])
  useOwnedResources(geometry, material, depthMaterial)

  useLayoutEffect(() => {
    const mesh = ref.current
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const c = new THREE.Color()
    instances.forEach((it, i) => {
      const r = atlas.rects[it.sprite]
      const k = it.scale ?? 1
      s.set((r.w / PPU) * k, (r.h / PPU) * k, 1)
      p.set(it.x, it.y ?? 0, it.z)
      m.compose(p, q, s)
      mesh.setMatrixAt(i, m)
      const t = it.tint ?? 1
      mesh.setColorAt(i, c.setRGB(t, t, t))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances, atlas])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      customDepthMaterial={depthMaterial}
    />
  )
}
