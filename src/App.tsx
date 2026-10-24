import { useEffect } from 'react'
import { GameCanvas } from './scene/GameCanvas'
import { Hud } from './ui/Hud'
import { attachInput } from './game/input'
import { buildCollision } from './game/world/collision'
import { buildTrees } from './game/world/layout'
import { terrainAt } from './game/world/map'
import { sound } from './game/audio'

// Static collision is built once, before the first frame.
buildCollision(buildTrees().filter((t) => terrainAt(Math.floor(t.x), Math.floor(t.z)) !== 'forest'))

export default function App() {
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
