// Runs first every frame: global hotkeys, then the simulation clock. Everything that animates
// reads runtime.dt / runtime.time, so freezing here freezes the whole world while rendering
// (and the developer free camera) keeps going.
import { useFrame } from '@react-three/fiber'
import { consumePress } from '../game/input'
import { runtime, useGame } from '../game/state'
import { useDev } from '../game/dev'
import { sharedUniforms } from '../gfx/materialPatches'
import { sound } from '../game/audio'
import { useBattle } from '../game/battle'
import { useStory } from '../game/story'

const MAX_DT = 1 / 20

export function GameClock() {
  useFrame((_, rawDt) => {
    const game = useGame.getState()
    const story = useStory.getState()
    // Full-screen content, dialogue and transitions own input until they finish. Consume even
    // blocked shortcuts so no key can spill into the next screen when it closes this frame.
    const screenOwnsInput = useBattle.getState().active || story.stage === 'intro' || story.showEnding ||
      !!game.dialogue || !!game.destination || !!game.areaTarget || !game.ready
    const menu = consumePress('menu')
    const inventory = consumePress('inventory')
    const time = consumePress('toggleTime')
    const developer = consumePress('dev')
    const pause = consumePress('devPause')
    const step = consumePress('devStep')
    const freeCam = consumePress('devFreeCam')

    if (!screenOwnsInput) {
      if (menu) {
        if (game.inventoryOpen) game.setInventoryOpen(false)
        else game.setMenuOpen(!game.menuOpen)
      }
      if (inventory) game.setInventoryOpen(!useGame.getState().inventoryOpen)
      if (time) game.toggleNight()
      const current = useGame.getState()
      if (!current.inventoryOpen && !current.menuOpen) {
        if (developer) useDev.getState().toggle('open')
        const dev = useDev.getState()
        if (dev.open) {
          if (pause) dev.toggle('paused')
          if (step) dev.step()
          if (freeCam) dev.toggle('freeCam')
        }
      }
    }
    if (consumePress('mute')) sound.setMuted(!sound.muted)

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
