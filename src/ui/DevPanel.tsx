import { useEffect, useState } from 'react'
import { useDev, type DevState } from '../game/dev'
import { useInventory } from '../game/inventory'
import { runtime, useGame } from '../game/state'
import { getBody, placeBody } from '../game/world/collision'
import { PLAYER_SPAWN } from '../game/world/layout'

type ToggleKey = Parameters<DevState['toggle']>[0]

const VIEWS: [ToggleKey, string][] = [
  ['colliders', 'Colliders & reach'],
  ['lights', 'Light pool'],
  ['shadowFrustum', 'Shadow frustum'],
  ['wireframe', 'Wireframe'],
  ['postFx', 'Post-processing'],
]

const TELEPORTS: [string, number, number][] = [
  ['Spawn', PLAYER_SPAWN.x, PLAYER_SPAWN.z],
  ['Well', 12, 12.6],
  ['Inn', 5.5, 6.7],
  ['Garden', 13.2, 15.5],
  ['Bridge', 20, 8],
  ['Workshop', 5.5, 12.4],
]

function timeLabel(t: number) {
  if (t < 0.2) return 'Day'
  if (t < 0.4) return 'Afternoon'
  if (t < 0.65) return 'Dusk'
  if (t < 0.85) return 'Evening'
  return 'Night'
}

function Check({ k, label, hint }: { k: ToggleKey; label: string; hint?: string }) {
  const on = useDev((s) => s[k])
  const toggle = useDev((s) => s.toggle)
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={() => toggle(k)} />
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </label>
  )
}

export function DevPanel() {
  const dev = useDev()
  const sceneId = useGame((s) => s.sceneId)
  const area = useGame((s) => s.area)
  const teleports: [string, number, number][] =
    area === 'cottage'
      ? [
          ['Doorway', 105, 106.2],
          ['Hearth', 102.3, 101.9],
          ['Cupboard', 104.5, 101.3],
          ['Chest', 101.7, 106.3],
          ['Sacks', 108.6, 104.7],
          ['Table', 105.2, 105.0],
        ]
      : sceneId === 'elmbrook'
        ? [...TELEPORTS, ['East exit', 22.7, 8], ['Cottage door', 15.5, 6.3]]
        : [['West exit', 2.8, 8], ['Mill', 15.5, 14.4], ['Storehouse', 6, 6.7], ['Bridge', 20, 8]]
  const [, tick] = useState(0)
  useEffect(() => {
    if (!dev.open) return
    const t = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(t)
  }, [dev.open])
  if (!dev.open) return null

  const p = runtime.player
  const teleport = (x: number, z: number) => {
    const body = getBody('player')
    if (body) placeBody(body, x, z)
  }
  return (
    <aside className="dev" aria-label="Developer tools">
      <header>
        <h2>Developer</h2>
        <button className="close" onClick={() => dev.toggle('open')} aria-label="Close developer tools">
          ×
        </button>
      </header>

      <section>
        <h3>Simulation · {dev.paused ? 'frozen' : 'running'}</h3>
        <div className="dev-row">
          <button className={dev.paused ? 'dev-btn on' : 'dev-btn'} onClick={() => dev.toggle('paused')}>
            {dev.paused ? 'Resume' : 'Freeze'} <kbd>P</kbd>
          </button>
          <button className="dev-btn" onClick={() => dev.step()}>
            Step frame <kbd>.</kbd>
          </button>
        </div>
      </section>

      <section>
        <h3>Camera</h3>
        <Check k="freeCam" label="Free camera" hint="F" />
        {dev.freeCam && (
          <p className="hint">Drag to orbit · right-drag to pan · wheel to zoom · double-click the ground to teleport</p>
        )}
        <Check k="faceCamera" label="Sprites face camera" />
      </section>

      <section>
        <h3>Views</h3>
        {VIEWS.map(([k, label]) => (
          <Check key={k} k={k} label={label} />
        ))}
      </section>

      <section>
        <h3>
          Time of day · {timeLabel(dev.manualTime ? dev.time : runtime.tod)} ({(dev.manualTime ? dev.time : runtime.tod).toFixed(2)})
        </h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={dev.manualTime}
            onChange={(e) => dev.set({ manualTime: e.target.checked, time: runtime.tod })}
          />
          <span>Manual</span>
        </label>
        <input
          className="dev-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={dev.manualTime ? dev.time : runtime.tod}
          onChange={(e) => dev.set({ manualTime: true, time: Number(e.target.value) })}
          onPointerUp={(e) => e.currentTarget.blur()}
          aria-label="Time of day"
        />
      </section>

      <section>
        <h3>Teleport</h3>
        <div className="dev-grid">
          {teleports.map(([name, x, z]) => (
            <button key={name} className="dev-btn" onClick={() => teleport(x, z)}>
              {name}
            </button>
          ))}
        </div>
        {sceneId === 'elmbrook' && (
          <button
            className="dev-btn wide"
            onClick={() => useGame.getState().goToArea(area === 'outdoor' ? 'cottage' : 'outdoor')}
          >
            {area === 'outdoor' ? 'Enter Ashdown Cottage' : 'Leave the cottage'}
          </button>
        )}
        <button className="dev-btn wide" onClick={() => useGame.setState({ visits: {} })}>
          Reset dialogue memory
        </button>
        <button
          className="dev-btn wide"
          onClick={() => {
            useInventory.getState().reset()
            useGame.setState({ visits: {} })
          }}
        >
          Reset save (bag &amp; searched spots)
        </button>
      </section>

      <section className="dev-live">
        <h3>Live</h3>
        <div>
          player {p.x.toFixed(2)}, {p.z.toFixed(2)} · {p.facing}
          {p.moving ? ' · moving' : ''}
        </div>
        <div>focus {runtime.focusId ?? '—'}</div>
        <div>
          {runtime.fps.toFixed(0)} fps · GPU {runtime.gpuMs.toFixed(1)} ms · {runtime.drawCalls} draws
        </div>
        <div>sim time {runtime.time.toFixed(2)} s</div>
      </section>
    </aside>
  )
}
