import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { LOOKS, buildCharacterSheet, frameOffset } from '../gfx/characterSprites'
import { billboardGeometry } from '../gfx/materialPatches'
import { getBlobShadowTexture, getSpriteAtlas } from '../gfx/propSprites'
import { sharedUniforms } from '../gfx/materialPatches'
import { consumePress, isHeld, latestDirection, virtualPad } from '../game/input'
import { moveBody, registerBody, unregisterBody, type Body } from '../game/world/collision'
import { findFocus, interactables, npcLines, registerInteractable, unregisterInteractable, type Interactable } from '../game/interactions'
import { runtime, useGame } from '../game/state'
import type { Dir, NpcDef } from '../game/world/layout'
import { exitAt } from '../game/world/scenes'
import { groundHeight } from './Props'
import { sound } from '../game/audio'
import { BRIDGE } from '../game/world/layout'

export interface CharacterState {
  x: number
  z: number
  facing: Dir
  moving: boolean
  running: boolean
  anim: number
}

const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

function dirTowards(dx: number, dz: number): Dir {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'right' : 'left'
  return dz > 0 ? 'down' : 'up'
}

/** A 16×24 sprite billboard (1 × 1.5 units) with walk/idle animation and a soft contact shadow. */
function SpriteCharacter({ look, state }: { look: keyof typeof LOOKS; state: CharacterState }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const blob = useRef<THREE.Mesh>(null!)
  const { geometry, material } = useMemo(() => {
    const texture = buildCharacterSheet(LOOKS[look])
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      // A faint self-lit copy of the sprite keeps characters readable between lamps at night.
      emissiveMap: texture,
      emissive: new THREE.Color('#c4c2dc'),
      emissiveIntensity: 0,
      alphaTest: 0.5,
      roughness: 1,
      metalness: 0,
      shadowSide: THREE.DoubleSide,
    })
    return { geometry: billboardGeometry(1, 1.5), material }
  }, [look])
  const blobMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getBlobShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  )
  const prevMoving = useRef(false)

  useFrame(() => {
    if (state.moving !== prevMoving.current) {
      // Start a walk on a stepping frame; restart idle on its base frame.
      state.anim = state.moving ? 0.07 : 0
      prevMoving.current = state.moving
    }
    state.anim += runtime.dt
    let frame: number
    if (state.moving) frame = 2 + (Math.floor(state.anim * (state.running ? 12 : 8)) % 4)
    else frame = state.anim % 2.6 < 2.0 ? 0 : 1
    frameOffset(material.map!, state.facing, frame)
    material.emissiveIntensity = runtime.tod * 0.24
    const y = groundHeight(state.x, state.z)
    mesh.current.position.set(state.x, y, state.z)
    mesh.current.rotation.y = sharedUniforms.uYaw.value
    blob.current.position.set(state.x, y + 0.012, state.z + 0.02)
  })

  return (
    <group>
      <mesh ref={mesh} geometry={geometry} material={material} castShadow receiveShadow />
      <mesh ref={blob} rotation-x={-Math.PI / 2} material={blobMat} renderOrder={2}>
        <planeGeometry args={[0.85, 0.42]} />
      </mesh>
    </group>
  )
}

export function Player() {
  const state = useMemo<CharacterState>(
    () => ({ x: runtime.player.x, z: runtime.player.z, facing: runtime.player.facing, moving: false, running: false, anim: 0 }),
    [],
  )
  const body = useMemo<Body>(() => ({ id: 'player', x: state.x, z: state.z, r: 0.27 }), [state])
  // Registration is a side effect: it must live in an effect, not in useMemo (which React may
  // call twice in development and keep only the first result).
  useEffect(() => {
    registerBody(body)
    return () => unregisterBody(body)
  }, [body])
  const stride = useRef(0)

  useFrame(() => {
    const dt = runtime.dt
    if (dt === 0) return // frozen
    const game = useGame.getState()

    if (game.destination || !game.ready) {
      state.moving = false
      runtime.player.moving = false
      return
    }
    if (game.dialogue) {
      state.moving = false
      if (consumePress('interact')) game.pressDialogue()
      return
    }

    let ix = (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0)
    let iz = (isHeld('down') ? 1 : 0) - (isHeld('up') ? 1 : 0)
    // The touch stick is analog: its tilt scales walking speed.
    let throttle = 1
    const stick = Math.hypot(virtualPad.x, virtualPad.y)
    if (!ix && !iz && stick > 0.2) {
      ix = virtualPad.x
      iz = virtualPad.y
      throttle = Math.min(1, (stick - 0.2) / 0.6 + 0.35)
    }
    if (game.menuOpen) ix = iz = 0

    if (ix || iz) {
      // Four-way facing: the most recently pressed direction wins while it is held.
      const last = latestDirection()
      const lastActive =
        (last === 'left' && ix < 0) || (last === 'right' && ix > 0) || (last === 'up' && iz < 0) || (last === 'down' && iz > 0)
      state.facing = lastActive ? (last as Dir) : dirTowards(ix, iz)
      state.running = isHeld('run') || virtualPad.run
      const speed = (state.running ? 5.2 : 3.1) * throttle
      const len = Math.hypot(ix, iz)
      const travelled = moveBody(body, (ix / len) * speed * dt, (iz / len) * speed * dt)
      state.moving = true
      // A footstep every stride; strides lengthen when running.
      stride.current += travelled
      if (stride.current > (state.running ? 1.05 : 0.72)) {
        stride.current = 0
        const onBridge = body.x > BRIDGE.x0 - 0.35 && body.x < BRIDGE.x1 + 0.35 && body.z > BRIDGE.z0 - 0.1 && body.z < BRIDGE.z1 + 0.1
        sound.footstep(body.x, body.z, onBridge, state.running)
      }
    } else {
      state.moving = false
    }
    state.x = body.x
    state.z = body.z
    const rp = runtime.player
    rp.x = body.x
    rp.z = body.z
    rp.facing = state.facing
    rp.moving = state.moving

    const destination = exitAt(game.sceneId, body.x, body.z, ix)
    if (destination) {
      game.travel(destination)
      return
    }
    const [fx, fz] = DIR_VEC[state.facing]
    const focus = game.menuOpen ? null : findFocus(body.x, body.z, fx, fz)
    runtime.focusId = focus?.id ?? null
    game.setPrompt(focus ? { kind: focus.kind, name: focus.name } : null)
    if (focus && consumePress('interact')) {
      const lines = focus.lines({ night: game.night, visits: game.visits[focus.id] ?? 0 })
      game.openDialogue(focus.id, focus.name, lines)
      sound.chime()
    }
  }, -2)

  return <SpriteCharacter look="player" state={state} />
}

export function Npc({ def }: { def: NpcDef }) {
  const state = useMemo<CharacterState>(
    () => ({ x: def.x, z: def.z, facing: def.facing, moving: false, running: false, anim: Math.random() * 2 }),
    [def],
  )
  const body = useMemo<Body>(() => ({ id: def.id, x: def.x, z: def.z, r: 0.27 }), [def])
  useEffect(() => {
    // The interactable shares the body object, so its position follows the NPC.
    const it: Interactable = {
      id: def.id,
      kind: 'talk',
      name: def.name,
      pos: body,
      reach: 1.3,
      iconHeight: 1.95,
      lines: npcLines(def.id),
    }
    registerBody(body)
    registerInteractable(it)
    return () => {
      unregisterBody(body)
      unregisterInteractable(it)
    }
  }, [body, def])
  const ai = useRef({ waypoint: 1, wait: 1.5, lookTimer: 3 })

  useFrame(() => {
    const dt = runtime.dt
    if (dt === 0) return // frozen
    const game = useGame.getState()
    const p = runtime.player
    const dx = p.x - body.x
    const dz = p.z - body.z
    const near = Math.hypot(dx, dz)
    const a = ai.current

    if (game.dialogue?.sourceId === def.id) {
      state.facing = dirTowards(dx, dz)
      state.moving = false
    } else if (def.route) {
      if (a.wait > 0) {
        a.wait -= dt
        state.moving = false
        if (near < 1.8) state.facing = dirTowards(dx, dz)
      } else {
        const [tx, tz] = def.route[a.waypoint]
        const wx = tx - body.x
        const wz = tz - body.z
        const d = Math.hypot(wx, wz)
        if (d < 0.05) {
          a.waypoint = (a.waypoint + 1) % def.route.length
          a.wait = 1.5 + Math.random() * 2.5
          state.moving = false
        } else {
          const step = Math.min(d, 1.35 * dt)
          const moved = moveBody(body, (wx / d) * step, (wz / d) * step)
          state.moving = moved > step * 0.3
          state.facing = dirTowards(wx, wz)
          // Blocked (usually by the player): stop and look at them.
          if (!state.moving) {
            a.wait = 0.6
            if (near < 1.8) state.facing = dirTowards(dx, dz)
          }
        }
      }
    } else {
      state.moving = false
      a.lookTimer -= dt
      if (near < 2.2) state.facing = dirTowards(dx, dz)
      else if (a.lookTimer <= 0) {
        a.lookTimer = 3 + Math.random() * 4
        const looks: Dir[] = ['down', 'down', 'left', 'right']
        state.facing = looks[Math.floor(Math.random() * looks.length)]
      }
    }
    state.x = body.x
    state.z = body.z
  }, -2)

  return <SpriteCharacter look={def.id} state={state} />
}

/** Bobbing speech/read balloon above whatever the player can interact with. */
export function InteractionMarker() {
  const mesh = useRef<THREE.Mesh>(null!)
  const { material, geometry, textures } = useMemo(() => {
    const atlas = getSpriteAtlas()
    const make = (name: 'talk' | 'read') => {
      const t = atlas.texture.clone()
      const r = atlas.rects[name]
      t.offset.set(r.u, r.v)
      t.repeat.set(r.su, r.sv)
      t.needsUpdate = true
      return t
    }
    const textures = { talk: make('talk'), read: make('read') }
    const material = new THREE.MeshBasicMaterial({ map: textures.talk, alphaTest: 0.5, depthTest: false })
    return { material, geometry: billboardGeometry(14 / 16, 12 / 16), textures }
  }, [])

  useFrame(() => {
    const id = runtime.focusId
    const it = id ? interactables.get(id) : undefined
    const show = !!it && !useGame.getState().dialogue
    mesh.current.visible = show
    if (!show || !it) return
    material.map = textures[it.kind]
    const bob = Math.round(Math.sin(runtime.time * 4) * 1.5) / 16
    mesh.current.position.set(it.pos.x + 0.25, it.iconHeight + bob, it.pos.z + 0.05)
    mesh.current.rotation.y = sharedUniforms.uYaw.value
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={10} visible={false} />
}
