// Developer mode scene tools: free orbit camera, collision/light/shadow overlays and wireframe.
// Mounted only while the developer panel is open.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useDev } from '../game/dev'
import { runtime } from '../game/state'
import { getBody, getColliders, placeBody } from '../game/world/collision'
import { interactables } from '../game/interactions'
import { LIGHT_SOURCES } from '../game/world/layout'
import { sharedUniforms } from '../gfx/materialPatches'
import { lightPool } from './Lamps'
import { sunLight } from './Lighting'
import { groundHeight } from './Props'

function FreeCamera() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl])

  useEffect(() => {
    controls.target.set(runtime.player.x, 0.8, runtime.player.z)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.screenSpacePanning = false // right-drag pans across the ground
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minDistance = 1.5
    controls.maxDistance = 70
    controls.update()

    // Double-click the ground to teleport the player there.
    const ray = new THREE.Raycaster()
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    const onDoubleClick = (e: MouseEvent) => {
      const r = gl.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const body = getBody('player')
      if (body && ray.ray.intersectPlane(ground, hit)) placeBody(body, hit.x, hit.z)
    }
    gl.domElement.addEventListener('dblclick', onDoubleClick)
    return () => {
      gl.domElement.removeEventListener('dblclick', onDoubleClick)
      controls.dispose()
      sharedUniforms.uYaw.value = 0
    }
  }, [controls, camera, gl])

  const fwd = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    controls.update()
    runtime.focus.x = controls.target.x
    runtime.focus.y = controls.target.y
    runtime.focus.z = controls.target.z
    if (useDev.getState().faceCamera) {
      camera.getWorldDirection(fwd)
      sharedUniforms.uYaw.value = Math.atan2(-fwd.x, -fwd.z)
    } else sharedUniforms.uYaw.value = 0
  }, -1)

  return null
}

const COLLIDER_COLOR = '#ff4fd8'
const MAX_RINGS = 24
const RING_SEGMENTS = 32

/** Static collision boxes, character bodies and interaction reach. */
function Colliders() {
  const boxes = useMemo(() => {
    const pos: number[] = []
    const y0 = 0.03
    const y1 = 0.45
    for (const b of getColliders().boxes) {
      const c = [
        [b.x0, b.z0],
        [b.x1, b.z0],
        [b.x1, b.z1],
        [b.x0, b.z1],
      ]
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i]
        const [bx, bz] = c[(i + 1) % 4]
        pos.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz, ax, y0, az, ax, y1, az)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLLIDER_COLOR, depthTest: false, transparent: true, opacity: 0.75, fog: false }))
  }, [])

  const rings = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_RINGS * RING_SEGMENTS * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_RINGS * RING_SEGMENTS * 6), 3))
    const m = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9, fog: false })
    const l = new THREE.LineSegments(g, m)
    l.frustumCulled = false
    return l
  }, [])

  useFrame(() => {
    const pos = rings.geometry.attributes.position as THREE.BufferAttribute
    const col = rings.geometry.attributes.color as THREE.BufferAttribute
    let n = 0
    const ring = (x: number, z: number, r: number, color: THREE.Color) => {
      if (n >= MAX_RINGS) return
      const y = groundHeight(x, z) + 0.05
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a0 = (i / RING_SEGMENTS) * Math.PI * 2
        const a1 = ((i + 1) / RING_SEGMENTS) * Math.PI * 2
        const k = (n * RING_SEGMENTS + i) * 2
        pos.setXYZ(k, x + Math.cos(a0) * r, y, z + Math.sin(a0) * r)
        pos.setXYZ(k + 1, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r)
        col.setXYZ(k, color.r, color.g, color.b)
        col.setXYZ(k + 1, color.r, color.g, color.b)
      }
      n++
    }
    for (const b of getColliders().bodies) ring(b.x, b.z, b.r, BODY)
    for (const it of interactables.values()) ring(it.pos.x, it.pos.z, it.reach, it.id === runtime.focusId ? FOCUS : REACH)
    rings.geometry.setDrawRange(0, n * RING_SEGMENTS * 2)
    pos.needsUpdate = true
    col.needsUpdate = true
  })

  return (
    <>
      <primitive object={boxes} renderOrder={20} />
      <primitive object={rings} renderOrder={21} />
    </>
  )
}
const BODY = new THREE.Color('#40e0ff')
const REACH = new THREE.Color('#8a7a30')
const FOCUS = new THREE.Color('#ffd84a')

/** Every lantern (small cross) and the pooled point lights (octahedra sized by intensity). */
function LightOverlay() {
  const { markers, sources } = useMemo(() => {
    const geo = new THREE.OctahedronGeometry(1, 0)
    const markers = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd27a', wireframe: true, depthTest: false, fog: false }))
      m.renderOrder = 22
      return m
    })
    const pos: number[] = []
    for (const l of LIGHT_SOURCES) pos.push(l.x - 0.2, l.y, l.z, l.x + 0.2, l.y, l.z, l.x, l.y, l.z - 0.2, l.x, l.y, l.z + 0.2, l.x, l.y, l.z, l.x, 0, l.z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const sources = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a07a3a', depthTest: false, fog: false }))
    sources.renderOrder = 22
    return { markers, sources }
  }, [])

  useFrame(() => {
    markers.forEach((m, i) => {
      const light = lightPool[i]
      m.visible = !!light && light.intensity > 0.01
      if (!light || !m.visible) return
      m.position.copy(light.position)
      m.scale.setScalar(0.12 + 0.3 * Math.min(1, light.intensity / 9))
    })
  })

  return (
    <>
      <primitive object={sources} />
      {markers.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

function ShadowFrustum() {
  const helper = useMemo(() => (sunLight.current ? new THREE.CameraHelper(sunLight.current.shadow.camera) : null), [])
  useFrame(() => helper?.update())
  useEffect(() => () => helper?.dispose(), [helper])
  return helper ? <primitive object={helper} /> : null
}

function Wireframe() {
  const scene = useThree((s) => s.scene)
  const hidden = useMemo(() => new Set<THREE.Object3D>(), [])
  useEffect(() => {
    const mat = new THREE.MeshBasicMaterial({ color: '#7fd4ff', wireframe: true, fog: false })
    scene.overrideMaterial = mat
    return () => {
      scene.overrideMaterial = null
      hidden.forEach((o) => (o.visible = true))
      hidden.clear()
      mat.dispose()
    }
  }, [scene, hidden])
  // A mesh wireframe override on points and lines makes three.js build a triangle index for them,
  // which can run past their buffers (GL_INVALID_OPERATION) and draws nonsense anyway, so hide
  // them — including overlays switched on later — while the view is active.
  useFrame(() => {
    scene.traverse((o) => {
      if (((o as THREE.Points).isPoints || (o as THREE.Line).isLine) && o.visible) {
        o.visible = false
        hidden.add(o)
      }
    })
  }, -1)
  return null
}

export function DevTools() {
  const open = useDev((s) => s.open)
  const freeCam = useDev((s) => s.freeCam)
  const colliders = useDev((s) => s.colliders)
  const lights = useDev((s) => s.lights)
  const shadowFrustum = useDev((s) => s.shadowFrustum)
  const wireframe = useDev((s) => s.wireframe)
  if (!open) return null
  return (
    <>
      {freeCam && <FreeCamera />}
      {colliders && <Colliders />}
      {lights && <LightOverlay />}
      {shadowFrustum && <ShadowFrustum />}
      {wireframe && <Wireframe />}
    </>
  )
}
