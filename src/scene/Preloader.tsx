// Compiles every scene shader with KHR_parallel_shader_compile (where available) while the
// render loop is paused, so the first frame doesn't stall the page for seconds.
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useGame } from '../game/state'

export function Preloader() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let cancelled = false
    const t0 = performance.now()
    // Never wait forever: if polling stalls, fall back to compiling on the first frame.
    const timeout = new Promise((resolve) => setTimeout(resolve, 6000))
    Promise.race([gl.compileAsync(scene, camera), timeout])
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        if (import.meta.env.DEV) console.info(`[hd2d] shaders compiled in ${Math.round(performance.now() - t0)} ms`)
        useGame.getState().setReady()
        invalidate()
      })
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera, invalidate])

  return null
}
