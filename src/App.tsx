import { useEffect } from 'react'
import { GameCanvas } from './scene/GameCanvas'
import { Hud } from './ui/Hud'
import { attachInput } from './game/input'
import { activateScene, arrivalFor, SCENES, switchArea } from './game/world/scenes'
import { COTTAGE_INFO } from './game/world/interiors'
import { useStory } from './game/story'
import { runtime, useGame } from './game/state'
import { sound } from './game/audio'

activateScene('elmbrook')

/** Matches the .area-fade CSS transition. */
const AREA_FADE_MS = 230

export default function App() {
  const destination = useGame((s) => s.destination)
  useEffect(() => {
    if (!destination) return
    // Leaving the mill after the Lantern is saved: Brann follows the player home.
    if (useGame.getState().sceneId === 'riversidemill' && useStory.getState().ending) useStory.getState().sendBrannHome()
    const timer = setTimeout(() => {
      activateScene(destination)
      Object.assign(runtime.player, arrivalFor(destination), { moving: false })
      runtime.focusId = null
      runtime.dt = 0
      runtime.stepFrames = 0
      useGame.getState().enterScene(destination)
      useGame.getState().showBanner(SCENES[destination].name, SCENES[destination].subtitle)
    }, 320)
    return () => clearTimeout(timer)
  }, [destination])

  // Doors between the village and an interior: fade out, swap areas behind the fade (no loading —
  // both areas stay resident), fade back in.
  const areaTarget = useGame((s) => s.areaTarget)
  useEffect(() => {
    if (!areaTarget) return
    sound.door()
    const timer = setTimeout(() => {
      const t0 = performance.now()
      switchArea(areaTarget)
      useGame.getState().arriveArea(areaTarget)
      sound.setIndoor(areaTarget !== 'outdoor')
      if (areaTarget === 'cottage') useGame.getState().showBanner(COTTAGE_INFO.name, COTTAGE_INFO.subtitle)
      if (import.meta.env.DEV) console.info(`[hd2d] area → ${areaTarget} swapped in ${(performance.now() - t0).toFixed(2)} ms`)
    }, AREA_FADE_MS)
    return () => clearTimeout(timer)
  }, [areaTarget])
  useEffect(attachInput, [])
  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    window.addEventListener('keydown', sound.unlock)
    window.addEventListener('pointerdown', sound.unlock)
    return () => {
      window.removeEventListener('keydown', sound.unlock)
      window.removeEventListener('pointerdown', sound.unlock)
    }
  }, [])
  return (
    <>
      <GameCanvas />
      <Hud />
    </>
  )
}
