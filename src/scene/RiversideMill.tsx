import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { runtime } from '../game/state'
import { getSurfaces } from '../gfx/surfaceTextures'

/** Overshot waterwheel beside the mill's east wall; its axle runs east–west. */
export function RiversideMill() {
  const wheel = useRef<THREE.Group>(null!)
  const surfaces = useMemo(() => getSurfaces(), [])
  useFrame(() => { wheel.current.rotation.x -= runtime.dt * 0.45 })
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
