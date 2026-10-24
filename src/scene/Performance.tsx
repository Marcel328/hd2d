// Frame/GPU timing and adaptive resolution. The render scale steps down when frames get too
// expensive and back up when there is headroom. GPU time (EXT_disjoint_timer_query_webgl2) is
// preferred because it ignores CPU stalls and background-tab throttling; frame rate is the
// fallback. Also clears unhandled key presses at the end of each frame.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { endFrame } from '../game/input'
import { runtime, useGame } from '../game/state'

const MIN_SCALE = 0.5
/** Seconds of measurements to ignore after anything that recompiles shaders or resizes targets. */
const GRACE_S = 3

interface TimerExt {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

/** Rolling GPU frame time via timer queries; returns false when the extension is unavailable. */
function useGpuTimer() {
  const gl = useThree((s) => s.gl)
  const timer = useMemo(() => {
    const ctx = gl.getContext() as WebGL2RenderingContext
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null
    if (!ext) return null
    return { ctx, ext, pending: [] as WebGLQuery[], active: null as WebGLQuery | null }
  }, [gl])

  // Begin before anything renders (shadow maps included)…
  useFrame(() => {
    if (!timer || timer.active || timer.pending.length > 4) return
    const q = timer.ctx.createQuery()
    if (!q) return
    timer.ctx.beginQuery(timer.ext.TIME_ELAPSED_EXT, q)
    timer.active = q
  }, -4)
  // …and end after the composer (priority 1) has drawn the final image.
  useFrame(() => {
    if (!timer) return
    const { ctx, ext } = timer
    if (timer.active) {
      ctx.endQuery(ext.TIME_ELAPSED_EXT)
      timer.pending.push(timer.active)
      timer.active = null
    }
    const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT)
    while (timer.pending.length) {
      const q = timer.pending[0]
      if (!ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) break
      const ms = (ctx.getQueryParameter(q, ctx.QUERY_RESULT) as number) / 1e6
      if (!disjoint) runtime.gpuMs = runtime.gpuMs ? runtime.gpuMs * 0.9 + ms * 0.1 : ms
      ctx.deleteQuery(q)
      timer.pending.shift()
    }
  }, 2)

  return timer !== null
}

interface Props {
  dprCap: number
  adaptive: boolean
  /** Changes whenever the quality change implies shader recompiles or new render targets. */
  structureKey: string
}

export function PerformanceController({ dprCap, adaptive, structureKey }: Props) {
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)
  const hasGpuTimer = useGpuTimer()
  const acc = useRef({ time: 0, frames: 0, low: 0, high: 0, grace: GRACE_S })

  // The composer renders several passes per frame; count them all by resetting manually.
  useEffect(() => {
    gl.info.autoReset = false
  }, [gl])
  useFrame(() => {
    runtime.drawCalls = gl.info.render.calls
    runtime.triangles = gl.info.render.triangles
    gl.info.reset()
  }, -3)

  const apply = (scale: number) => {
    runtime.dprScale = scale
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap) * scale
    setDpr(dpr)
    useGame.getState().setDprLabel(`${Math.round(scale * 100)}% · ${dpr.toFixed(2)}x`)
    acc.current.grace = GRACE_S
  }

  useEffect(() => {
    apply(adaptive ? runtime.dprScale : 1)
  }, [dprCap, adaptive])

  // A new preset recompiles shaders; that stall must not count as "too slow".
  useEffect(() => {
    const a = acc.current
    a.grace = GRACE_S
    a.low = a.high = 0
  }, [structureKey])

  useFrame((_, dt) => {
    const a = acc.current
    if (dt > 0.25) return // a stall (tab switch, shader compile) says nothing about steady load
    a.time += dt
    a.frames++
    if (a.time < 1) return
    runtime.fps = a.frames / a.time
    runtime.frameMs = (a.time / a.frames) * 1000
    a.time = 0
    a.frames = 0
    if (a.grace > 0) {
      a.grace -= 1
      return
    }
    if (!adaptive || document.hidden) return
    // Budget ≈ 60 fps with headroom. Require a sustained trend to avoid oscillation.
    const tooSlow = hasGpuTimer && runtime.gpuMs > 0 ? runtime.gpuMs > 13 : runtime.fps < 48
    const roomy = hasGpuTimer && runtime.gpuMs > 0 ? runtime.gpuMs < 7 : runtime.fps > 58
    a.low = tooSlow ? a.low + 1 : 0
    a.high = roomy ? a.high + 1 : 0
    if (a.low >= 2 && runtime.dprScale > MIN_SCALE) {
      apply(Math.max(MIN_SCALE, runtime.dprScale - 0.15))
      a.low = 0
    } else if (a.high >= 4 && runtime.dprScale < 1) {
      apply(Math.min(1, runtime.dprScale + 0.1))
      a.high = 0
    }
  })

  return null
}

/** Must be mounted last so it runs after every other frame callback. */
export function FrameEnd() {
  useFrame(() => endFrame())
  return null
}
