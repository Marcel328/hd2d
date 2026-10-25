import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { buildGroundTexture, GROUND_PAD } from '../gfx/terrainTexture'
import { waterTexture } from '../gfx/surfaceTextures'
import { MAP_H, MAP_W, forEachTile } from '../game/world/map'
import { runtime } from '../game/state'
import { useOwnedResources } from './useOwnedResources'

export function Ground({ anisotropy }: { anisotropy: number }) {
  const texture = useMemo(() => buildGroundTexture(), [])
  useOwnedResources(texture)
  useMemo(() => {
    texture.anisotropy = anisotropy
    texture.needsUpdate = true
  }, [texture, anisotropy])

  const w = MAP_W + GROUND_PAD * 2
  const h = MAP_H + GROUND_PAD * 2
  return (
    <mesh rotation-x={-Math.PI / 2} position={[MAP_W / 2, 0, MAP_H / 2]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  )
}

let flow = 0

/** One merged quad per water tile, with a scrolling ripple texture. */
export function Water() {
  const { geometry, texture } = useMemo(() => {
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const y = 0.035
    forEachTile((tx, tz, t) => {
      if (t !== 'water' && t !== 'bridge') return
      const i = pos.length / 3
      // Extend a little past the tile so the jittered banks are covered.
      const e = 0.12
      const quad = [
        [tx - e, tz + 1 + e],
        [tx + 1 + e, tz + 1 + e],
        [tx + 1 + e, tz - e],
        [tx - e, tz - e],
      ]
      for (const [x, z] of quad) {
        pos.push(x, y, z)
        uv.push(x / 2, -z / 2)
      }
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return { geometry: g, texture: waterTexture() }
  }, [])
  useOwnedResources(geometry, texture)

  useFrame(() => {
    // Flow south; step in whole texels for a pixel-art feel.
    const step = 1 / 32
    flow += runtime.dt * 0.35
    texture.offset.y = Math.floor(flow / step) * step
    texture.offset.x = Math.round(Math.sin(flow * 1.3) * 0.6) * step
  })

  return (
    <mesh geometry={geometry} receiveShadow renderOrder={1}>
      <meshStandardMaterial
        map={texture}
        transparent
        depthWrite={false}
        roughness={0.12}
        metalness={0.1}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  )
}

