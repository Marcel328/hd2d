// Runs first every frame: global hotkeys, then the simulation clock. Everything that animates
// reads runtime.dt / runtime.time, so freezing here freezes the whole world while rendering
// (and the developer free camera) keeps going.
import { useFrame } from '@react-three/fiber'
import { consumePress } from '../game/input'
import { runtime, useGame } from '../game/state'
import { useDev } from '../game/dev'
import { sharedUniforms } from '../gfx/materialPatches'
import { sound } from '../game/audio'

const MAX_DT = 1 / 20

export function GameClock() {
  useFrame((_, rawDt) => {
    const game = useGame.getState()
    if (consumePress('dev')) useDev.getState().toggle('open')
    if (consumePress('menu')) {
      if (game.inventoryOpen) game.setInventoryOpen(false)
      else game.setMenuOpen(!game.menuOpen)
    }
    if (consumePress('inventory') && !game.dialogue && !game.areaTarget) game.setInventoryOpen(!game.inventoryOpen)
    if (consumePress('toggleTime') && !game.dialogue) game.toggleNight()
    if (consumePress('mute')) sound.setMuted(!sound.muted)

    const dev = useDev.getState()
    if (dev.open) {
      if (consumePress('devPause')) dev.toggle('paused')
      if (consumePress('devStep')) dev.step()
      if (consumePress('devFreeCam')) dev.toggle('freeCam')
    }

    let dt = Math.min(rawDt, MAX_DT)
    if (useDev.getState().paused) {
      if (runtime.stepFrames > 0) {
        runtime.stepFrames--
        dt = 1 / 60
      } else dt = 0
    }
    runtime.dt = dt
    runtime.time += dt
    sharedUniforms.uTime.value = runtime.time
  }, -5)
  return null
}
