// Ambient life: drifting dust motes and god rays by day, fireflies by night, chimney smoke always.
import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { HOUSES } from '../game/world/layout'
import { MAP_H, MAP_W, forEachTile } from '../game/world/map'
import { mulberry32 } from '../gfx/random'
import { getShaftTexture } from '../gfx/propSprites'
import { sharedUniforms } from '../gfx/materialPatches'
import { runtime } from '../game/state'
import { sampleTimeOfDay } from './timeOfDay'
import { roofGeometry } from './Buildings'

type Mode = 0 | 1 | 2 // dust, firefly, smoke

const vertexShader = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uScale;
uniform float uSize;
uniform float uMode;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime;
  float size = uSize * (0.6 + aSeed.z * 0.8);
  if (uMode < 0.5) {
    p.x += sin(t * 0.3 + aSeed.x * 6.283) * 0.7;
    p.y += mod(t * 0.07 + aSeed.y * 3.0, 3.0);
    p.z += cos(t * 0.23 + aSeed.z * 6.283) * 0.7;
    vAlpha = 0.45 + 0.55 * sin(t * 1.3 + aSeed.x * 20.0);
  } else if (uMode < 1.5) {
    p.x += sin(t * 0.45 * (0.6 + aSeed.x) + aSeed.y * 6.283) * 1.1;
    p.y += sin(t * 0.7 * (0.5 + aSeed.z) + aSeed.x * 6.283) * 0.35;
    p.z += cos(t * 0.38 * (0.6 + aSeed.y) + aSeed.z * 6.283) * 1.1;
    vAlpha = smoothstep(0.1, 1.0, sin(t * (1.2 + aSeed.y * 1.8) + aSeed.z * 30.0));
  } else {
    float life = fract(t * 0.11 + aSeed.x);
    p.y += life * 2.8;
    p.x += life * 1.1 + sin(t * 0.9 + aSeed.y * 6.0) * 0.12 * life;
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - life);
    size *= 0.5 + life * 2.4;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / -mv.z;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uMode;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = uMode > 1.5 ? smoothstep(0.5, 0.1, d) * 0.55 : smoothstep(0.5, 0.0, d);
  float core = uMode > 0.5 && uMode < 1.5 ? smoothstep(0.18, 0.0, d) * 2.5 : 0.0;
  gl_FragColor = vec4(uColor * (1.0 + core), a * vAlpha * uIntensity);
}
`

function useParticles(mode: Mode, positions: number[], color: string, size: number) {
  const size2 = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const dpr = useThree((s) => s.viewport.dpr)
  const obj = useMemo(() => {
    const rand = mulberry32(mode * 101 + 7)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute(
      'aSeed',
      new THREE.Float32BufferAttribute(
        Array.from({ length: positions.length }, () => rand()),
        3,
      ),
    )
    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uScale: { value: 1 },
        uSize: { value: size },
        uMode: { value: mode },
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: mode === 2 ? THREE.NormalBlending : THREE.AdditiveBlending,
    })
    return new THREE.Points(g, m)
  }, [mode, positions, color, size])
  // Points are sized in world units: pixels per unit at depth 1.
  obj.material.uniforms.uScale.value = (size2.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
  obj.frustumCulled = false
  return obj
}

export function Atmosphere({ amount, shafts }: { amount: number; shafts: boolean }) {
  const dustPos = useMemo(() => {
    const rand = mulberry32(5)
    const out: number[] = []
    const n = Math.round(260 * amount)
    for (let i = 0; i < n; i++) out.push(1 + rand() * (MAP_W - 2), 0.2 + rand() * 2.2, 1 + rand() * (MAP_H - 2))
    return out
  }, [amount])

  const firePos = useMemo(() => {
    const rand = mulberry32(6)
    const spots: [number, number][] = []
    forEachTile((tx, tz, t) => {
      if (t === 'water' || t === 'tallgrass' || t === 'flowers' || t === 'soil') spots.push([tx + 0.5, tz + 0.5])
      if (t === 'forest' && rand() < 0.08) spots.push([tx + 0.5, tz + 0.5])
    })
    const out: number[] = []
    const n = Math.round(110 * amount)
    for (let i = 0; i < n; i++) {
      const [x, z] = spots[Math.floor(rand() * spots.length)]
      out.push(x + (rand() - 0.5) * 2, 0.35 + rand() * 1.4, z + (rand() - 0.5) * 2)
    }
    return out
  }, [amount])

  const smokePos = useMemo(() => {
    const out: number[] = []
    for (const h of HOUSES) {
      if (h.chimneyX === undefined) continue
      const { zMid, ridgeY } = roofGeometry(h)
      for (let i = 0; i < 16; i++) out.push(h.chimneyX, ridgeY + 0.9, zMid - 0.7)
    }
    return out
  }, [])

  const dust = useParticles(0, dustPos, '#ffe9b8', 0.09)
  const fireflies = useParticles(1, firePos, '#d8ff7a', 0.16)
  const smoke = useParticles(2, smokePos, '#c9c3bb', 0.55)

  const shaftMeshes = useMemo(() => {
    const tex = getShaftTexture()
    const rand = mulberry32(17)
    const spots = [
      [6, 9],
      [10.5, 6],
      [16, 12],
      [3.5, 19],
      [13, 16.5],
      [19.5, 4],
    ]
    return spots.map(([x, z]) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2 + rand() * 1.4, 14),
        new THREE.MeshBasicMaterial({
          map: tex,
          color: '#ffe2a8',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          fog: false,
        }),
      )
      m.position.set(x, 5.5, z)
      m.userData.phase = rand() * 10
      return m
    })
  }, [])

  const basis = useMemo(
    () => ({ x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(), view: new THREE.Vector3(0, 0.3, 1) }),
    [],
  )

  useFrame(() => {
    const tod = sampleTimeOfDay(runtime.tod)
    dust.material.uniforms.uIntensity.value = tod.dust * 0.7
    fireflies.material.uniforms.uIntensity.value = tod.fireflies
    smoke.material.uniforms.uIntensity.value = 0.8
    smoke.material.uniforms.uColor.value.set(runtime.tod > 0.5 ? '#4a4e66' : '#c9c3bb')
    // Rays point along the sun direction and face the camera as much as possible.
    const { x, y, z, m, view } = basis
    y.copy(tod.sunDir)
    x.crossVectors(y, view).normalize()
    z.crossVectors(x, y).normalize()
    m.makeBasis(x, y, z)
    for (const s of shaftMeshes) {
      s.quaternion.setFromRotationMatrix(m)
      const mat = s.material as THREE.MeshBasicMaterial
      const pulse = 0.8 + 0.2 * Math.sin(runtime.time * 0.35 + s.userData.phase)
      mat.opacity = shafts ? tod.shafts * 0.34 * pulse : 0
      s.visible = mat.opacity > 0.002
    }
  })

  return (
    <group>
      {amount > 0 && <primitive object={dust} />}
      {amount > 0 && <primitive object={fireflies} />}
      <primitive object={smoke} />
      {shaftMeshes.map((m, i) => (
        <primitive key={i} object={m} renderOrder={4} />
      ))}
    </group>
  )
}
