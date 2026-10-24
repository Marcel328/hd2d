// HD-2D post stack: depth of field focused on the player (the "tilt-shift diorama" look),
// bloom on lanterns/windows/fireflies, neutral tone mapping, a gentle grade and a vignette.
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Bloom, BrightnessContrast, DepthOfField, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect, type DepthOfFieldEffect } from 'postprocessing'
import { runtime } from '../game/state'
import type { QualityConfig } from '../game/settings'
import { sampleTimeOfDay } from './timeOfDay'
import { useDev } from '../game/dev'

export function Effects({ quality }: { quality: QualityConfig }) {
  // Developer mode can switch the whole stack off to inspect the raw render.
  const raw = useDev((s) => s.open && !s.postFx)
  const bloom = useRef<BloomEffect>(null)
  const dof = useRef<DepthOfFieldEffect>(null)

  // Give the circle of confusion a sharp plateau around the focus distance so the player's
  // surroundings stay crisp and blur only builds toward the top and bottom of the frame.
  useLayoutEffect(() => {
    const coc = dof.current?.cocMaterial
    if (!coc || coc.userData.plateau) return
    coc.fragmentShader = coc.fragmentShader.replace(
      'smoothstep(0.0,focusRange,abs(signedDistance))',
      'smoothstep(focusRange*0.3,focusRange,abs(signedDistance))*(signedDistance<0.0?0.85:1.0)',
    )
    coc.userData.plateau = true
    coc.needsUpdate = true
  }, [quality.dof, quality.bloom, quality.msaa, raw])

  useFrame(() => {
    const tod = sampleTimeOfDay(runtime.tod)
    if (bloom.current) bloom.current.intensity = tod.bloom
    const target = dof.current?.target
    if (target) target.set(runtime.focus.x, runtime.focus.y, runtime.focus.z)
  })

  // Rebuild the composer when its structure changes (passes can't be swapped in place cheaply).
  const key = `${quality.bloom}|${quality.dof}|${quality.msaa}|${raw}`
  if (raw)
    return (
      <EffectComposer key={key} multisampling={quality.msaa} enableNormalPass={false} frameBufferType={THREE.HalfFloatType}>
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    )
  return (
    <EffectComposer key={key} multisampling={quality.msaa} enableNormalPass={false} frameBufferType={THREE.HalfFloatType}>
      {quality.dof ? (
        <DepthOfField ref={dof} target={[0, 0, 0]} focusRange={12} bokehScale={3.6} resolutionScale={0.5} />
      ) : (
        <></>
      )}
      {quality.bloom ? (
        <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.2} intensity={0.5} radius={0.72} />
      ) : (
        <></>
      )}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={0.1} />
      <BrightnessContrast contrast={0.07} brightness={0.01} />
      <Vignette offset={0.3} darkness={0.6} />
    </EffectComposer>
  )
}
