import { useEffect } from 'react'
import { GameCanvas } from './scene/GameCanvas'
import { Hud } from './ui/Hud'
import { attachInput } from './game/input'
import { activateScene, arrivalFor } from './game/world/scenes'
import { runtime, useGame } from './game/state'
import { sound } from './game/audio'

activateScene('elmbrook')

export default function App() {
  const destination = useGame((s) => s.destination)
  useEffect(() => {
    if (!destination) return
    const timer = setTimeout(() => {
      activateScene(destination)
      Object.assign(runtime.player, arrivalFor(destination), { moving: false })
      runtime.focusId = null
      runtime.dt = 0
      runtime.stepFrames = 0
      useGame.getState().enterScene(destination)
    }, 320)
    return () => clearTimeout(timer)
  }, [destination])
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
