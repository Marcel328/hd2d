import { Suspense } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { useQuality, useSettings } from '../game/settings'
import { runtime, useGame } from '../game/state'
import { useDev } from '../game/dev'
import { NPCS } from '../game/world/layout'
import { interactables } from '../game/interactions'
import { sound } from '../game/audio'
import { Lighting } from './Lighting'
import { CameraRig } from './CameraRig'
import { Ground, Water } from './Terrain'
import { Buildings } from './Buildings'
import { Bridge, Crates, Fence, Well } from './Props'
import { Lamps } from './Lamps'
import { Foliage, Trees } from './Vegetation'
import { InteractionMarker, Npc, Player } from './Characters'
import { Atmosphere } from './Atmosphere'
import { Effects } from './Effects'
import { FrameEnd, PerformanceController } from './Performance'
import { Preloader } from './Preloader'
import { GameClock } from './GameClock'
import { DevTools } from './DevTools'
import { AudioDirector } from './AudioDirector'

export function GameCanvas() {
  const quality = useQuality()
  const adaptive = useSettings((s) => s.adaptive)
  const ready = useGame((s) => s.ready)

  return (
    <Canvas
      className="game-canvas"
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={Math.min(window.devicePixelRatio || 1, quality.dprCap)}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 30, near: 1, far: 140, position: [12, 10, 34] }}
      frameloop={ready ? 'always' : 'never'}
      onCreated={({ gl, scene, camera }) => {
        if (import.meta.env.DEV) Object.assign(window, { __hd2d: { gl, scene, camera, runtime, useGame, useSettings, useDev, interactables, sound } })
      }}
    >
      <GameClock />
      <Suspense fallback={null}>
        <Lighting quality={quality} />
        <CameraRig />
        <Ground anisotropy={quality.anisotropy} />
        <Water />
        <Buildings />
        <Well />
        <Fence />
        <Bridge />
        <Crates />
        <Lamps poolSize={quality.lightPool} />
        <Trees />
        <Foliage density={quality.foliage} />
        <Player />
        {NPCS.map((n) => (
          <Npc key={n.id} def={n} />
        ))}
        <InteractionMarker />
        <Atmosphere amount={quality.particles} shafts={quality.lightShafts} />
        <Effects quality={quality} />
        <DevTools />
        <AudioDirector />
        <Preloader />
      </Suspense>
      <PerformanceController
        dprCap={quality.dprCap}
        adaptive={adaptive}
        structureKey={`${quality.lightPool}|${quality.shadows}|${quality.shadowMapSize}|${quality.bloom}|${quality.dof}|${quality.msaa}`}
      />
      <FrameEnd />
    </Canvas>
  )
}
