// On-screen controls for phones and tablets: an analog stick (left), an action button and a
// hold-to-run button (right). Each control tracks its own pointer, so multi-touch works.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { virtualPad, virtualPress } from '../game/input'
import { useSettings } from '../game/settings'
import { useGame } from '../game/state'
import { useBattle } from '../game/battle'
import { useStory } from '../game/story'

const STICK_RADIUS = 46

/** Keep receiving a pointer's events after it leaves the control (no-op if not capturable). */
function capture(e: ReactPointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    // Synthetic or already-released pointers can't be captured; the control still works.
  }
}

function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const update = (e: ReactPointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS
      dy = (dy / d) * STICK_RADIUS
    }
    setKnob({ x: dx, y: dy })
    virtualPad.x = dx / STICK_RADIUS
    virtualPad.y = dy / STICK_RADIUS
  }
  const release = () => {
    pointer.current = null
    setKnob({ x: 0, y: 0 })
    virtualPad.x = virtualPad.y = 0
  }
  // Unmounting mid-drag (a dialogue opened) must not leave the player walking.
  useEffect(
    () => () => {
      virtualPad.x = virtualPad.y = 0
    },
    [],
  )

  return (
    <div
      ref={base}
      className="stick"
      onPointerDown={(e) => {
        pointer.current = e.pointerId
        capture(e)
        update(e)
      }}
      onPointerMove={(e) => e.pointerId === pointer.current && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Movement stick"
      role="application"
    >
      <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

export function TouchControls() {
  const enabled = useSettings((s) => s.touchControls)
  const dialogue = useGame((s) => s.dialogue)
  const bagOpen = useGame((s) => s.inventoryOpen)
  const prompt = useGame((s) => s.prompt)
  const [running, setRunning] = useState(false)
  const battle = useBattle((s) => s.active)
  const card = useStory((s) => s.stage === 'intro' || s.showEnding)
  const hidden = !!dialogue || bagOpen || battle || card
  useEffect(() => {
    if (!hidden) return
    virtualPad.run = false
    setRunning(false)
  }, [hidden])
  if (!enabled || hidden) return null // during dialogue, tapping the box advances it

  const setRun = (v: boolean) => {
    virtualPad.run = v
    setRunning(v)
  }
  return (
    <div className="touch">
      <Stick />
      <div className="touch-buttons">
        <button
          className={running ? 'touch-btn run on' : 'touch-btn run'}
          onPointerDown={(e) => {
            capture(e)
            setRun(true)
          }}
          onPointerUp={() => setRun(false)}
          onPointerCancel={() => setRun(false)}
          aria-label="Run (hold)"
        >
          Run
        </button>
        <button
          className={prompt ? 'touch-btn act ready' : 'touch-btn act'}
          onPointerDown={() => virtualPress('interact')}
          aria-label="Interact"
        >
          {prompt?.kind === 'read' ? 'Read' : prompt?.kind === 'search' ? 'Search' : 'Talk'}
        </button>
      </div>
    </div>
  )
}
