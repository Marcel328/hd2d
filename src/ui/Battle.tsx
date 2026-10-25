// The battle screen for the one tactical encounter (logic in game/battle.ts).
// Keyboard: ↑/↓ choose · E / Enter / Space confirm · Esc back.
import { useEffect, useMemo, useState } from 'react'
import { battleItems, MOVES, useBattle, type Action } from '../game/battle'
import { ITEMS } from '../game/inventory'
import { itemIconUrl } from '../gfx/itemIcons'
import { getMothSprites } from '../gfx/mothSprite'
import { LOOKS, buildCharacterSheet } from '../gfx/characterSprites'
import { consumePress } from '../game/input'

let portrait: string | null = null
/** The traveller's front-facing idle frame, cropped from the sprite sheet. */
function playerPortrait() {
  if (portrait) return portrait
  const sheet = buildCharacterSheet(LOOKS.player).image as HTMLCanvasElement
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 24
  c.getContext('2d')!.drawImage(sheet, 0, 0, 16, 24, 0, 0, 16, 24)
  portrait = c.toDataURL()
  return portrait
}

function Bar({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'enemy' }) {
  return (
    <div className={`bar ${kind}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div style={{ width: `${(100 * value) / max}%` }} />
    </div>
  )
}

type MenuEntry = { key: string; label: string; detail: string; action?: Action; submenu?: true; disabled?: boolean; icon?: string }

export function BattleScreen() {
  const b = useBattle()
  const [menu, setMenu] = useState<'main' | 'items'>('main')
  const [sel, setSel] = useState(0)
  const [frame, setFrame] = useState(0)
  const moth = useMemo(() => getMothSprites().urls, [])

  // Wing-beats on the battle sprite.
  useEffect(() => {
    if (!b.active) return
    const t = setInterval(() => setFrame((f) => 1 - f), 170)
    return () => clearInterval(t)
  }, [b.active])

  useEffect(() => {
    if (b.phase === 'command') {
      setMenu('main')
      setSel(0)
    }
  }, [b.phase, b.turn])

  const entries: MenuEntry[] =
    b.phase === 'won'
      ? [{ key: 'continue', label: 'Continue', detail: '' }]
      : b.phase === 'lost'
        ? [
            { key: 'retry', label: 'Retry', detail: 'Start the fight again — items are restored.' },
            { key: 'back', label: 'Step back', detail: 'Leave the fight and choose again.' },
          ]
        : menu === 'main'
          ? [
              b.player.counter
                ? { key: 'attack', label: 'Counter-strike', detail: '15–20 damage · removes 2 shields', action: { type: 'attack' } }
                : { key: 'attack', label: 'Attack', detail: '10–13 damage · removes 1 shield', action: { type: 'attack' } },
              { key: 'defend', label: 'Defend', detail: 'Take 40% damage · then counter-strike', action: { type: 'defend' } },
              { key: 'items', label: 'Items', detail: 'Heal, or throw something', submenu: true },
            ]
          : (() => {
              const list = battleItems()
              return list.length
                ? list.map<MenuEntry>((it) => ({
                    key: it.id,
                    label: `${ITEMS[it.id].name} ×${it.qty}`,
                    detail: it.def.effect,
                    action: { type: 'item', id: it.id },
                    icon: itemIconUrl(it.id),
                  }))
                : [{ key: 'none', label: 'No usable items', detail: '', disabled: true }]
            })()

  const choose = (i: number) => {
    const e = entries[i]
    if (!e || e.disabled) return
    if (b.phase === 'won') return b.leave()
    if (b.phase === 'lost') return e.key === 'retry' ? b.retry() : b.leave()
    if (b.phase !== 'command') return
    if (e.submenu) {
      setMenu('items')
      setSel(0)
      return
    }
    if (e.action) b.act(e.action)
  }

  useEffect(() => {
    if (!b.active) return
    const onKey = (ev: KeyboardEvent) => {
      const n = entries.length
      if (ev.code === 'ArrowDown' || ev.code === 'KeyS') {
        ev.preventDefault()
        setSel((s) => (s + 1) % n)
      } else if (ev.code === 'ArrowUp' || ev.code === 'KeyW') {
        ev.preventDefault()
        setSel((s) => (s - 1 + n) % n)
      } else if (ev.code === 'KeyE' || ev.code === 'Enter' || ev.code === 'Space') {
        ev.preventDefault()
        // Don't let the same press also skip the next line of dialogue.
        consumePress('interact')
        choose(Math.min(sel, n - 1))
      } else if ((ev.code === 'Escape' || ev.code === 'Backspace') && menu === 'items') {
        ev.preventDefault()
        setMenu('main')
        setSel(2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!b.active) return null
  const e = b.enemy
  const broken = e.breakTurns > 0
  const intent = MOVES[b.next]
  const showIntent = b.phase === 'command' && !broken
  const busy = b.phase === 'busy'
  return (
    <div className="battle" role="dialog" aria-label="Battle with the gloam moth">
      <div className="battle-flash" aria-hidden />
      <div className="battle-stage">
        <div className={`intent ${intent.danger}${showIntent ? '' : ' hidden'}`} aria-live="polite">
          <small>Next move</small>
          {intent.intent}
        </div>
        <div key={b.hitEnemy} className={`moth${b.hitEnemy ? ' hit' : ''}${broken ? ' broken' : ''}${b.phase === 'won' ? ' fled' : ''}`}>
          <img src={moth[frame]} alt="The gloam moth" draggable={false} />
          {b.pops
            .filter((p) => p.who === 'enemy')
            .map((p) => (
              <span key={p.key} className={`pop ${p.kind}`}>
                {p.text}
              </span>
            ))}
        </div>
        <div className="enemy-info">
          <div className="enemy-name">
            Gloam Moth {broken && <span className="break-tag">BREAK</span>}
          </div>
          <Bar value={e.hp} max={e.max} kind="enemy" />
          <div className="shields" aria-label={`${e.shield} shield points`}>
            {Array.from({ length: e.maxShield }, (_, i) => (
              <span key={i} className={i < e.shield ? 'pip on' : 'pip'} />
            ))}
            <span className="weak" title="Weakness">
              Weak: <img src={itemIconUrl('oil')} width={20} height={20} alt="fire" /> fire
            </span>
          </div>
        </div>
      </div>

      <div className="battle-hud">
        <div key={b.hitPlayer} className={`hero${b.hitPlayer ? ' hit' : ''}`}>
          <img className="portrait" src={playerPortrait()} alt="" />
          <div className="hero-info">
            <div className="hero-name">
              Traveller {b.player.defending && <span className="guard-tag">GUARD</span>}
              {!b.player.defending && b.player.counter && <span className="guard-tag">COUNTER</span>}
            </div>
            <Bar value={b.player.hp} max={b.player.max} kind="hp" />
            <div className="hp-num">
              {b.player.hp} / {b.player.max} HP
            </div>
          </div>
          {b.pops
            .filter((p) => p.who === 'player')
            .map((p) => (
              <span key={p.key} className={`pop ${p.kind}`}>
                {p.text}
              </span>
            ))}
        </div>
        <ul className={busy ? 'commands busy' : 'commands'} role="menu">
          {menu === 'items' && b.phase === 'command' && (
            <li className="menu-title">
              Items <small>Esc to go back</small>
            </li>
          )}
          {entries.map((en, i) => (
            <li key={en.key} role="none">
              <button
                role="menuitem"
                className={(i === sel ? 'on' : '') + (en.disabled ? ' off' : '')}
                disabled={busy || en.disabled}
                onPointerEnter={() => setSel(i)}
                onClick={() => choose(i)}
              >
                {en.icon && <img src={en.icon} width={28} height={28} alt="" />}
                <span>
                  {en.label}
                  {en.detail && <small>{en.detail}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="battle-msg" aria-live="polite">
        {b.message}
      </p>
    </div>
  )
}
