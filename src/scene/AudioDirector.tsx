// Feeds the soundscape with the time of day and the player's position, and chimes when the
// day/night toggle flips.
import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { sound } from '../game/audio'
import { runtime, useGame } from '../game/state'

export function AudioDirector() {
  useEffect(() => useGame.subscribe((s, prev) => s.night !== prev.night && sound.chime(!s.night)), [])
  useFrame(() => sound.update(runtime.tod, runtime.player.x, runtime.player.z))
  return null
}
