// Procedural soundscape with the Web Audio API — no audio files. Ambience (wind, creek, birds by
// day, crickets and owls by night) follows the time of day and the player's position; footsteps
// depend on the surface underfoot; dialogue text "speaks" in short blips.
import { MAP_H, MAP_W, terrainAtWorld, forEachTile } from './world/map'

type Surface = 'grass' | 'dirt' | 'stone' | 'wood'

const MUTE_KEY = 'hd2d-village-muted'

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

/** Distance (in tiles) from each tile to the nearest water, for the creek's loudness. */
const waterDistance = (() => {
  const water: [number, number][] = []
  forEachTile((tx, tz, t) => {
    if (t === 'water' || t === 'bridge') water.push([tx, tz])
  })
  const d = new Float32Array(MAP_W * MAP_H)
  for (let tz = 0; tz < MAP_H; tz++)
    for (let tx = 0; tx < MAP_W; tx++) {
      let best = Infinity
      for (const [wx, wz] of water) best = Math.min(best, Math.hypot(wx - tx, wz - tz))
      d[tz * MAP_W + tx] = best
    }
  return d
})()

class SoundEngine {
  muted = loadMuted()
  private ctx: AudioContext | null = null
  private master!: GainNode
  private noise!: AudioBuffer
  private wind!: GainNode
  private creek!: GainNode
  private creekPan!: StereoPannerNode
  private crickets!: GainNode
  private nextBird = 0
  private nextOwl = 0
  private lastBlip = 0
  private listeners: (() => void)[] = []

  /** Audio may only start after a user gesture; call from any input handler. */
  unlock = () => {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.build()
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  setMuted(m: boolean) {
    this.muted = m
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0')
    } catch {
      // Persisting is optional.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.08)
    this.listeners.forEach((l) => l())
  }

  private build() {
    const ctx = this.ctx!
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.7
    this.master.connect(ctx.destination)

    // Two seconds of white noise, reused by every noisy source.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    // Wind through leaves: low-passed noise with a slow swell.
    this.wind = ctx.createGain()
    this.wind.gain.value = 0
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 480
    this.loopNoise().connect(windFilter).connect(this.wind).connect(this.master)
    const swell = ctx.createOscillator()
    const swellDepth = ctx.createGain()
    swell.frequency.value = 0.09
    swellDepth.gain.value = 260
    swell.connect(swellDepth).connect(windFilter.frequency)
    swell.start()

    // Creek: band-passed noise, louder and panned toward the nearest water.
    this.creek = ctx.createGain()
    this.creek.gain.value = 0
    this.creekPan = ctx.createStereoPanner()
    const creekBand = ctx.createBiquadFilter()
    creekBand.type = 'bandpass'
    creekBand.frequency.value = 1300
    creekBand.Q.value = 0.5
    const creekHigh = ctx.createBiquadFilter()
    creekHigh.type = 'peaking'
    creekHigh.frequency.value = 3200
    creekHigh.gain.value = 6
    this.loopNoise().connect(creekBand).connect(creekHigh).connect(this.creekPan).connect(this.creek).connect(this.master)

    // Crickets: a high tone chopped by a fast pulse and gated into bursts, two voices.
    this.crickets = ctx.createGain()
    this.crickets.gain.value = 0
    this.crickets.connect(this.master)
    for (const [freq, rate, burst, pan] of [
      [4400, 29, 1.7, -0.6],
      [4750, 33, 1.3, 0.55],
    ]) {
      const tone = ctx.createOscillator()
      tone.frequency.value = freq
      // Gains swing 0..1: a 0.5 base plus a ±0.5 square wave.
      const chop = ctx.createGain()
      chop.gain.value = 0.5
      const pulse = ctx.createOscillator()
      pulse.type = 'square'
      pulse.frequency.value = rate
      const pulseDepth = ctx.createGain()
      pulseDepth.gain.value = 0.5
      pulse.connect(pulseDepth).connect(chop.gain)
      const gate = ctx.createGain()
      gate.gain.value = 0.5
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = burst
      const lfoDepth = ctx.createGain()
      lfoDepth.gain.value = 0.5
      lfo.connect(lfoDepth).connect(gate.gain)
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      const level = ctx.createGain()
      level.gain.value = 0.05
      tone.connect(chop).connect(gate).connect(level).connect(p).connect(this.crickets)
      tone.start()
      pulse.start()
      lfo.start()
    }
  }

  private loopNoise() {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.loopStart = Math.random()
    src.start(0, Math.random() * 2)
    return src
  }

  /** Called every frame with the world state. */
  update(tod: number, px: number, pz: number) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    const day = 1 - tod
    this.wind.gain.setTargetAtTime(0.05 + 0.05 * day, now, 0.5)
    this.crickets.gain.setTargetAtTime(Math.max(0, tod - 0.35) * 1.5, now, 0.6)

    const tx = Math.min(MAP_W - 1, Math.max(0, Math.floor(px)))
    const tz = Math.min(MAP_H - 1, Math.max(0, Math.floor(pz)))
    const dist = waterDistance[tz * MAP_W + tx]
    this.creek.gain.setTargetAtTime(0.11 * Math.max(0, 1 - dist / 9) ** 1.6, now, 0.3)
    // The creek runs down the east side (x ≈ 19).
    this.creekPan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, (19 - px) / 8)), now, 0.3)

    if (now > this.nextBird) {
      this.nextBird = now + 0.7 + Math.random() * 2.8
      if (Math.random() < day * 0.95) this.bird()
    }
    if (now > this.nextOwl) {
      this.nextOwl = now + 7 + Math.random() * 10
      if (tod > 0.8 && Math.random() < 0.6) this.owl()
    }
  }

  private bird() {
    const ctx = this.ctx!
    const t0 = ctx.currentTime + 0.02
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    const out = ctx.createGain()
    out.gain.value = 0.035 + Math.random() * 0.03
    pan.connect(out).connect(this.master)
    const base = 2400 + Math.random() * 1800
    const notes = 2 + Math.floor(Math.random() * 4)
    let t = t0
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const len = 0.05 + Math.random() * 0.08
      const f = base * (0.85 + Math.random() * 0.35)
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.35 : 0.75), t + len)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + len)
      o.connect(g).connect(pan)
      o.start(t)
      o.stop(t + len + 0.02)
      t += len + 0.03 + Math.random() * 0.06
    }
  }

  private owl() {
    const ctx = this.ctx!
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() < 0.5 ? -0.7 : 0.7
    pan.connect(this.master)
    let t = ctx.currentTime + 0.05
    for (const [f, len] of [
      [392, 0.32],
      [370, 0.55],
    ]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.setValueAtTime(f, t)
      o.frequency.linearRampToValueAtTime(f * 0.93, t + len)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.045, t + 0.08)
      g.gain.linearRampToValueAtTime(0, t + len)
      o.connect(g).connect(pan)
      o.start(t)
      o.stop(t + len + 0.05)
      t += len + 0.12
    }
  }

  /** Short filtered-noise footstep; the filter and a little body tone depend on the surface. */
  footstep(x: number, z: number, onBridge: boolean, running: boolean) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = terrainAtWorld(x, z)
    const surface: Surface = onBridge ? 'wood' : t === 'cobble' ? 'stone' : t === 'path' || t === 'soil' ? 'dirt' : 'grass'
    const now = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    const len = surface === 'stone' ? 0.045 : surface === 'wood' ? 0.07 : 0.09
    const vol = (running ? 0.16 : 0.11) * (surface === 'grass' ? 0.7 : 1)
    filter.type = surface === 'stone' ? 'highpass' : 'bandpass'
    filter.frequency.value = { grass: 900, dirt: 520, stone: 1800, wood: 700 }[surface] * (0.9 + Math.random() * 0.2)
    filter.Q.value = surface === 'dirt' ? 1.2 : 0.7
    g.gain.setValueAtTime(vol, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + len)
    src.connect(filter).connect(g).connect(this.master)
    src.start(now, Math.random() * 1.8, len + 0.02)
    if (surface === 'wood' || surface === 'stone') {
      const o = ctx.createOscillator()
      const og = ctx.createGain()
      o.frequency.setValueAtTime(surface === 'wood' ? 190 : 120, now)
      o.frequency.exponentialRampToValueAtTime(70, now + 0.06)
      og.gain.setValueAtTime(surface === 'wood' ? 0.12 : 0.06, now)
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
      o.connect(og).connect(this.master)
      o.start(now)
      o.stop(now + 0.08)
    }
  }

  /** Typewriter voice: a soft square blip, pitched per speaker. */
  blip(voice: number) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    if (now - this.lastBlip < 0.045) return
    this.lastBlip = now
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()
    o.type = 'square'
    o.frequency.value = voice * (0.94 + Math.random() * 0.12)
    f.type = 'lowpass'
    f.frequency.value = 2200
    g.gain.setValueAtTime(0.04, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
    o.connect(f).connect(g).connect(this.master)
    o.start(now)
    o.stop(now + 0.06)
  }

  /** Two-note chime for opening dialogue and changing the time of day. */
  chime(up = true) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    let t = ctx.currentTime
    for (const f of up ? [660, 990] : [990, 660]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.06, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + 0.4)
      t += 0.09
    }
  }
}

export const sound = new SoundEngine()

/** Voice pitch per dialogue source. */
export const VOICES: Record<string, number> = { rowan: 165, mira: 520, signpost: 300, well: 300 }
