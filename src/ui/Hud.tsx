import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useGame, runtime } from '../game/state'
import { PRESETS, useSettings, useQuality, type QualityLevel, type Toggle } from '../game/settings'
import { useDev } from '../game/dev'
import { DevPanel } from './DevPanel'
import { TouchControls } from './TouchControls'
import { BagButton, InventoryPanel, Toasts } from './Inventory'
import { SCENES } from '../game/world/scenes'
import { sound, VOICES } from '../game/audio'

const CHARS_PER_SECOND = 48

export function DialogueBox() {
  const dialogue = useGame((s) => s.dialogue)
  const revealMore = useGame((s) => s.revealMore)
  const pressDialogue = useGame((s) => s.pressDialogue)
  const line = dialogue ? dialogue.lines[dialogue.index] : ''
  const done = !!dialogue && dialogue.revealed >= line.length
  const lineKey = dialogue ? `${dialogue.sourceId}:${dialogue.index}` : ''

  // Typewriter: reveal characters at a fixed rate while the current line is incomplete.
  useEffect(() => {
    if (!lineKey || done) return
    let raf = 0
    let last = performance.now()
    let carry = 0
    const tick = (now: number) => {
      carry += ((now - last) / 1000) * CHARS_PER_SECOND
      last = now
      const n = Math.floor(carry)
      if (n > 0) {
        carry -= n
        revealMore(n)
        const d = useGame.getState().dialogue
        if (d && d.lines[d.index][d.revealed - 1] !== ' ') sound.blip(VOICES[d.sourceId] ?? 300)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lineKey, done, revealMore])

  if (!dialogue) return null
  const isLast = dialogue.index === dialogue.lines.length - 1
  return (
    <div className="dialogue" role="dialog" aria-live="polite" onPointerDown={() => pressDialogue()}>
      <div className="dialogue-name">{dialogue.speaker}</div>
      <p className="dialogue-text">
        {line.slice(0, dialogue.revealed)}
        <span className="dialogue-ghost">{line.slice(dialogue.revealed)}</span>
      </p>
      {done && <div className={isLast ? 'dialogue-next end' : 'dialogue-next'} aria-hidden />}
    </div>
  )
}

export function InteractionPrompt() {
  const prompt = useGame((s) => s.prompt)
  const dialogue = useGame((s) => s.dialogue)
  if (!prompt || dialogue) return null
  return (
    <div className="prompt">
      <kbd>E</kbd>
      <span>
        {prompt.kind === 'talk' ? 'Talk to' : prompt.kind === 'search' ? 'Search' : 'Read'} {prompt.name}
      </span>
    </div>
  )
}

export function LoadingScreen() {
  const ready = useGame((s) => s.ready)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(t)
  }, [ready])
  if (gone) return null
  return (
    <div className={ready ? 'loading done' : 'loading'} aria-live="polite">
      <div className="loading-mark" aria-hidden />
      <p>{ready ? 'Ready' : 'Preparing the village…'}</p>
    </div>
  )
}

export function LocationBanner() {
  const banner = useGame((s) => s.banner)
  const ready = useGame((s) => s.ready)
  const [show, setShow] = useState(true)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setShow(false), 5800)
    return () => clearTimeout(t)
  }, [ready])
  if (!show || !ready) return null
  return (
    <div className="banner" aria-hidden>
      <div className="banner-rule" />
      <h1>{banner.title}</h1>
      <p>{banner.subtitle}</p>
      <div className="banner-rule" />
    </div>
  )
}

export function ControlsHint() {
  const touch = useSettings((s) => s.touchControls)
  const devOpen = useDev((s) => s.open)
  if (touch || devOpen) return null
  return (
    <div className="controls">
      <span>
        <kbd>WASD</kbd> Move
      </span>
      <span>
        <kbd>Shift</kbd> Run
      </span>
      <span>
        <kbd>E</kbd> Interact
      </span>
      <span>
        <kbd>N</kbd> Day / Night
      </span>
      <span>
        <kbd>Wheel</kbd> Zoom
      </span>
      <span>
        <kbd>Esc</kbd> Settings
      </span>
      <span>
        <kbd>I</kbd> Bag
      </span>
      <span>
        <kbd>M</kbd> Sound
      </span>
      <span>
        <kbd>`</kbd> Dev
      </span>
    </div>
  )
}

export function TopBar() {
  const night = useGame((s) => s.night)
  const toggleNight = useGame((s) => s.toggleNight)
  const menuOpen = useGame((s) => s.menuOpen)
  const setMenuOpen = useGame((s) => s.setMenuOpen)
  return (
    <div className="topbar">
      <button className="hud-btn" onClick={toggleNight} aria-pressed={night} title="Toggle day / night (N)">
        <span className={night ? 'icon moon' : 'icon sun'} aria-hidden />
        {night ? 'Night' : 'Day'}
      </button>
      <BagButton />
      <MuteButton />
      <button className="hud-btn" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} title="Settings (Esc)">
        <span className="icon gear" aria-hidden />
        Settings
      </button>
    </div>
  )
}

function MuteButton() {
  const muted = useSyncExternalStore(
    (fn) => sound.subscribe(fn),
    () => sound.muted,
  )
  return (
    <button
      className="hud-btn icon-only"
      onClick={() => {
        sound.unlock()
        sound.setMuted(!muted)
      }}
      aria-pressed={!muted}
      aria-label={muted ? 'Unmute sound (M)' : 'Mute sound (M)'}
      title={muted ? 'Unmute (M)' : 'Mute (M)'}
    >
      <span className={muted ? 'icon speaker off' : 'icon speaker'} aria-hidden />
    </button>
  )
}

export function FpsCounter() {
  const devOpen = useDev((s) => s.open)
  const show = useSettings((s) => s.showFps) && !devOpen
  const dprLabel = useGame((s) => s.dprLabel)
  const [, force] = useState(0)
  useEffect(() => {
    if (!show) return
    const t = setInterval(() => force((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [show])
  if (!show) return null
  return (
    <div className="fps">
      <b>{runtime.fps.toFixed(0)}</b> fps · {runtime.frameMs.toFixed(1)} ms
      {runtime.gpuMs > 0 && <> · GPU {runtime.gpuMs.toFixed(1)} ms</>}
      <br />
      {runtime.drawCalls} draws · {(runtime.triangles / 1000).toFixed(1)}k tris
      <br />
      res {dprLabel}
    </div>
  )
}

const LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra']
const TOGGLES: [Toggle, string][] = [
  ['shadows', 'Shadows'],
  ['bloom', 'Bloom'],
  ['dof', 'Depth of field'],
  ['lightShafts', 'Light shafts'],
]

export function SettingsPanel() {
  const open = useGame((s) => s.menuOpen)
  const setOpen = useGame((s) => s.setMenuOpen)
  const settings = useSettings()
  const q = useQuality()
  const dprLabel = useGame((s) => s.dprLabel)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  if (!open) return null
  const p = PRESETS[settings.quality]
  return (
    <div className="settings" ref={panel} role="dialog" aria-label="Graphics settings">
      <header>
        <h2>Graphics</h2>
        <button className="close" onClick={() => setOpen(false)} aria-label="Close settings">
          ×
        </button>
      </header>
      <section>
        <h3>Quality preset</h3>
        <div className="segmented">
          {LEVELS.map((l) => (
            <button key={l} className={settings.quality === l ? 'on' : ''} onClick={() => settings.setQuality(l)}>
              {l}
            </button>
          ))}
        </div>
        <p className="hint">
          Shadow map {p.shadowMapSize}px · {p.lightPool} dynamic lights · MSAA {p.msaa ? `${p.msaa}×` : 'off'} · max{' '}
          {p.dprCap}× pixel ratio
        </p>
      </section>
      <section>
        <h3>Effects</h3>
        {TOGGLES.map(([k, label]) => (
          <label key={k} className="toggle">
            <input type="checkbox" checked={q[k]} onChange={(e) => settings.setToggle(k, e.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
      </section>
      <section>
        <h3>Performance</h3>
        <label className="toggle">
          <input type="checkbox" checked={settings.adaptive} onChange={(e) => settings.setAdaptive(e.target.checked)} />
          <span>Adaptive resolution</span>
          <small>{dprLabel}</small>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.showFps} onChange={(e) => settings.setShowFps(e.target.checked)} />
          <span>Show frame stats</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.touchControls}
            onChange={(e) => settings.setTouchControls(e.target.checked)}
          />
          <span>On-screen touch controls</span>
        </label>
      </section>
      <section>
        <button
          className="dev-btn wide"
          onClick={() => {
            setOpen(false)
            if (!useDev.getState().open) useDev.getState().toggle('open')
          }}
        >
          Developer tools <kbd>`</kbd>
        </button>
      </section>
      <footer>WebGL 2 · Three.js · React Three Fiber</footer>
    </div>
  )
}

function SceneTransition() {
  const destination = useGame((s) => s.destination)
  const ready = useGame((s) => s.ready)
  const sceneId = useGame((s) => s.sceneId)
  return (
    <div className={`scene-transition${destination || !ready ? ' active' : ''}`} aria-live="polite" aria-busy={!!destination || !ready}>
      <p>{SCENES[destination ?? sceneId].name}</p>
    </div>
  )
}

/** Quick black dip while walking through a door (the swap itself takes well under a frame). */
function AreaFade() {
  const active = useGame((s) => s.areaTarget !== null)
  return <div className={active ? 'area-fade active' : 'area-fade'} aria-hidden />
}

export function Hud() {
  const touch = useSettings((s) => s.touchControls)
  const bannerSeq = useGame((s) => s.banner.seq)
  return (
    <div className={touch ? 'hud touch-on' : 'hud'}>
      <LoadingScreen />
      <TopBar />
      <FpsCounter />
      <LocationBanner key={bannerSeq} />
      <AreaFade />
      <SceneTransition />
      <InteractionPrompt />
      <DialogueBox />
      <Toasts />
      <ControlsHint />
      <TouchControls />
      <InventoryPanel />
      <SettingsPanel />
      <DevPanel />
    </div>
  )
}
