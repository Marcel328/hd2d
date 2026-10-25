// Narrow-FOV follow camera with a fixed downward pitch — the classic HD-2D "diorama" framing.
// Also feeds the occlusion cut-out with the player's screen position each frame.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { runtime, useGame } from '../game/state'
import { ORIGIN, ROOM } from '../game/world/interiors'
import { useDev } from '../game/dev'
import { sharedUniforms } from '../gfx/materialPatches'
import { MAP_H, MAP_W } from '../game/world/map'
import { groundHeight } from './Props'

const PITCH = THREE.MathUtils.degToRad(34)
/** Interiors are framed closer and a little steeper, like a dollhouse with the front wall off. */
const ROOM_PITCH = THREE.MathUtils.degToRad(41)
const ROOM_DIST = 14.5
const MIN_DIST = 13
const MAX_DIST = 25

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const dist = useRef(19)
  const targetDist = useRef(19)
  const focus = useMemo(() => new THREE.Vector3(runtime.player.x, 0, runtime.player.z - 1), [])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), size: new THREE.Vector2() }), [])

  useEffect(() => {
    camera.fov = 30
    camera.near = 1
    camera.far = 140
    camera.updateProjectionMatrix()
    const onWheel = (e: WheelEvent) => {
      if (useDev.getState().freeCam) return
      targetDist.current = THREE.MathUtils.clamp(targetDist.current + Math.sign(e.deltaY) * 1.2, MIN_DIST, MAX_DIST)
    }
    gl.domElement.addEventListener('wheel', onWheel, { passive: true })
    return () => gl.domElement.removeEventListener('wheel', onWheel)
  }, [camera, gl])

  // Priority −1: after characters move (−2), before anything that reads the camera.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const p = runtime.player
    if (useDev.getState().freeCam) {
      // The developer camera owns the view; no see-through hole from arbitrary angles.
      sharedUniforms.uOccStrength.value = 0
      return
    }
    sharedUniforms.uOccStrength.value = 1

    // Follow with a little look-ahead in the facing direction, clamped to the village.
    const ahead = p.moving ? 0.9 : 0
    const ax = p.facing === 'left' ? -ahead : p.facing === 'right' ? ahead : 0
    const az = p.facing === 'up' ? -ahead : p.facing === 'down' ? ahead : 0
    const indoor = useGame.getState().area !== 'outdoor'
    const pitch = indoor ? ROOM_PITCH : PITCH
    // Portrait screens would show only a sliver of the scene; back the camera off instead.
    const zoom = indoor ? (ROOM_DIST / 19) * dist.current : dist.current
    const d = zoom * THREE.MathUtils.clamp(1.05 / camera.aspect, 1, 1.6)
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d * camera.aspect
    let tx: number
    let tz: number
    if (indoor) {
      // Keep the room's walls in frame; centre the room when it fits on screen.
      const x0 = ORIGIN.x - ROOM.wall
      const x1 = ORIGIN.x + ROOM.w + ROOM.wall
      const lo = x0 + halfW - 0.6
      const hi = x1 - halfW + 0.6
      tx = lo > hi ? (x0 + x1) / 2 : THREE.MathUtils.clamp(p.x + ax * 0.5, lo, hi)
      tz = THREE.MathUtils.clamp(p.z + az * 0.5 - 0.4, ORIGIN.z + 2.0, ORIGIN.z + 4.3)
    } else {
      // Let at most ~1.5 units of forest show past the map edge on either side.
      const minX = Math.min(halfW - 1.5, MAP_W / 2)
      tx = THREE.MathUtils.clamp(p.x + ax, minX, MAP_W - minX)
      tz = THREE.MathUtils.clamp(p.z + az - 0.6, 4.5, MAP_H - 4)
    }
    if (runtime.cameraCut) {
      // Teleported through a door: cut, don't glide across the map.
      focus.x = tx
      focus.z = tz
      runtime.cameraCut = false
    }
    const k = 1 - Math.exp(-dt * 3.2)
    focus.x += (tx - focus.x) * k
    focus.z += (tz - focus.z) * k
    focus.y = groundHeight(p.x, p.z) * 0.5 + 0.6
    dist.current += (targetDist.current - dist.current) * (1 - Math.exp(-dt * 6))

    camera.position.set(focus.x, focus.y + Math.sin(pitch) * d, focus.z + Math.cos(pitch) * d)
    camera.lookAt(focus)
    camera.updateMatrixWorld()
    runtime.focus.x = p.x
    runtime.focus.y = groundHeight(p.x, p.z) + 0.8
    runtime.focus.z = p.z

    // Player chest position → drawing-buffer pixels + view depth for the occlusion cut-out.
    const { v, size } = tmp
    gl.getDrawingBufferSize(size)
    v.set(p.x, groundHeight(p.x, p.z) + 0.75, p.z).applyMatrix4(camera.matrixWorldInverse)
    const depth = -v.z
    v.applyMatrix4(camera.projectionMatrix)
    const sx = (v.x * 0.5 + 0.5) * size.x
    const sy = (v.y * 0.5 + 0.5) * size.y
    // Pixels per world unit at the player's depth.
    const pxPerUnit = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth)
    sharedUniforms.uOccScreen.value.set(sx, sy, depth)
    sharedUniforms.uOccRadius.value = pxPerUnit * 1.15
  }, -1)

  return null
}
