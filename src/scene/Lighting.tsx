// Sun/moon, sky light, fog and the day ↔ night transition.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { runtime, useGame } from '../game/state'
import { useDev } from '../game/dev'
import { sampleTimeOfDay } from './timeOfDay'
import type { QualityConfig } from '../game/settings'

const SHADOW_EXTENT = 15

/** The sun, for debug views (shadow frustum helper). */
export const sunLight: { current: THREE.DirectionalLight | null } = { current: null }

/**
 * Interior lighting: the "sun" becomes a soft key light falling in through the open front of the
 * cutaway room, the sky term turns warm, and the world beyond the walls is a dark backdrop.
 * Only colours and intensities change, so no shader is recompiled when walking indoors.
 */
const INTERIOR_DAY = {
  sunColor: new THREE.Color('#ffe2bd'),
  sunIntensity: 1.3,
  sunDir: new THREE.Vector3(0.3, 1, 0.7).normalize(),
  skyColor: new THREE.Color('#f2dcc0'),
  groundColor: new THREE.Color('#4a3424'),
  hemiIntensity: 0.62,
}
const INTERIOR_NIGHT = {
  // Faint, only slightly cool moonlight: the fire and candles should dominate.
  sunColor: new THREE.Color('#9d9cc4'),
  sunIntensity: 0.22,
  skyColor: new THREE.Color('#3e3442'),
  groundColor: new THREE.Color('#140e0c'),
  hemiIntensity: 0.2,
}
const interior = {
  sunColor: new THREE.Color(),
  sunIntensity: 0,
  sunDir: INTERIOR_DAY.sunDir,
  skyColor: new THREE.Color(),
  groundColor: new THREE.Color(),
  hemiIntensity: 0,
  fogColor: new THREE.Color('#0e0b0a'),
  fogNear: 45,
  fogFar: 95,
}

function sampleInterior(t: number) {
  const s = t * t * (3 - 2 * t)
  interior.sunColor.copy(INTERIOR_DAY.sunColor).lerp(INTERIOR_NIGHT.sunColor, s)
  interior.skyColor.copy(INTERIOR_DAY.skyColor).lerp(INTERIOR_NIGHT.skyColor, s)
  interior.groundColor.copy(INTERIOR_DAY.groundColor).lerp(INTERIOR_NIGHT.groundColor, s)
  interior.sunIntensity = INTERIOR_DAY.sunIntensity + (INTERIOR_NIGHT.sunIntensity - INTERIOR_DAY.sunIntensity) * s
  interior.hemiIntensity = INTERIOR_DAY.hemiIntensity + (INTERIOR_NIGHT.hemiIntensity - INTERIOR_DAY.hemiIntensity) * s
  return interior
}

export function Lighting({ quality }: { quality: QualityConfig }) {
  const sun = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const scene = useThree((s) => s.scene)
  const fog = useMemo(() => new THREE.Fog('#c9d8d2', 26, 70), [])
  const background = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    scene.fog = fog
    scene.background = background
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene, fog, background])

  // Shadow map size changes need a fresh map.
  useEffect(() => {
    const s = sun.current.shadow
    s.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
    s.radius = quality.shadowRadius
    s.map?.dispose()
    s.map = null
  }, [quality.shadowMapSize, quality.shadowRadius])

  const lightSpace = useMemo(
    () => ({ right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), c: new THREE.Vector3() }),
    [],
  )

  useFrame(() => {
    const game = useGame.getState()
    const dev = useDev.getState()

    // Animate time of day toward its target (≈2.5 s for a full transition), unless the
    // developer slider is driving it.
    if (dev.open && dev.manualTime) runtime.tod = dev.time
    else {
      const target = game.night ? 1 : 0
      const step = runtime.dt / 2.5
      runtime.tod += THREE.MathUtils.clamp(target - runtime.tod, -step, step)
    }

    const tod = game.area === 'outdoor' ? sampleTimeOfDay(runtime.tod) : sampleInterior(runtime.tod)
    const light = sun.current
    light.color.copy(tod.sunColor)
    light.intensity = tod.sunIntensity
    hemi.current.color.copy(tod.skyColor)
    hemi.current.groundColor.copy(tod.groundColor)
    hemi.current.intensity = tod.hemiIntensity
    fog.color.copy(tod.fogColor)
    fog.near = tod.fogNear
    fog.far = tod.fogFar
    background.copy(tod.fogColor)

    // Keep a tight shadow frustum centred on the player, snapped to whole shadow texels so
    // shadow edges don't crawl while walking.
    const { x, z } = runtime.player
    const { right, up, fwd, c } = lightSpace
    fwd.copy(tod.sunDir).negate()
    right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize()
    up.crossVectors(right, fwd).normalize()
    const texel = (SHADOW_EXTENT * 2) / light.shadow.mapSize.x
    c.set(x, 0, z - 2)
    const r = Math.round(c.dot(right) / texel) * texel
    const u = Math.round(c.dot(up) / texel) * texel
    const f = c.dot(fwd)
    c.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, u).addScaledVector(fwd, f)
    light.target.position.copy(c)
    light.position.copy(c).addScaledVector(tod.sunDir, 30)
    light.target.updateMatrixWorld()
  })

  useEffect(() => {
    sunLight.current = sun.current
  }, [])

  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe2ff', '#6d5a3c', 1]} />
      <directionalLight
        ref={sun}
        castShadow={quality.shadows}
        intensity={2.6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
    </>
  )
}
