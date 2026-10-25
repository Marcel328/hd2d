// The bag: a grid of item slots with category tabs and a detail pane, plus pickup toasts.
// Keyboard: arrows select · Tab switches category · E / Enter / Space uses · I, B or Esc closes.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_LABEL, ITEMS, useInventory, useToasts, type Category, type ItemId, type Slot, type Toast } from '../game/inventory'
import { itemIconUrl } from '../gfx/itemIcons'
import { useGame } from '../game/state'
import { sound } from '../game/audio'
import { consumePress } from '../game/input'

const COLS = 5
const MIN_CELLS = 20
type Tab = 'all' | Category
const TABS: Tab[] = ['all', 'supplies', 'materials', 'key']

function Icon({ id, size = 48 }: { id: Parameters<typeof itemIconUrl>[0]; size?: number }) {
  return <img className="pixel-icon" src={itemIconUrl(id)} width={size} height={size} alt="" draggable={false} />
}

export function InventoryPanel() {
  const open = useGame((s) => s.inventoryOpen)
  const setOpen = useGame((s) => s.setInventoryOpen)
  const slots = useInventory((s) => s.slots)
  const gold = useInventory((s) => s.gold)
  const freshIds = useInventory((s) => s.fresh)
  const [tab, setTab] = useState<Tab>('all')
  const [index, setIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const list = useMemo<Slot[]>(() => slots.filter((s) => tab === 'all' || ITEMS[s.id].category === tab), [slots, tab])
  const selected: Slot | undefined = list[Math.min(index, list.length - 1)]
  const def = selected ? ITEMS[selected.id] : null

  // Viewing an item clears its NEW badge.
  useEffect(() => {
    if (open && selected) useInventory.getState().markSeen(selected.id)
  }, [open, selected])

  useEffect(() => {
    if (!open) setMessage(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    return () => {
      // A new modal may already have taken focus; do not steal it back from that screen.
      if (document.activeElement === document.body || panel.current?.contains(document.activeElement)) previous?.focus()
    }
  }, [open])

  const applyItem = (id: ItemId) => {
    const game = useGame.getState()
    if (!game.inventoryOpen || game.dialogue || game.menuOpen) return
    const text = useInventory.getState().use(id)
    if (text) {
      setMessage(text)
      sound.chime()
    }
  }

  const applySelected = () => {
    if (selected) applyItem(selected.id)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!useGame.getState().inventoryOpen) return
      const confirm = e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space'
      if (confirm && e.repeat) {
        e.preventDefault()
        consumePress('interact')
        return
      }
      const target = e.target instanceof Element ? e.target : null
      if ((e.code === 'Enter' || e.code === 'Space') && target?.closest('button, input, select, textarea, a[href]')) {
        consumePress('interact')
        return // The focused native control owns activation.
      }
      const n = list.length
      if (e.code === 'Tab') {
        e.preventDefault()
        const i = TABS.indexOf(tab)
        setTab(TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length])
        setIndex(0)
        setMessage(null)
        return
      }
      if (n === 0) return
      const move = (d: number) => {
        e.preventDefault()
        setIndex((i) => Math.max(0, Math.min(n - 1, Math.min(i, n - 1) + d)))
        setMessage(null)
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') move(1)
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') move(-1)
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') move(COLS)
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') move(-COLS)
      else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        consumePress('interact')
        applySelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null
  const cells = Math.max(MIN_CELLS, Math.ceil(list.length / COLS) * COLS)
  return (
    <div ref={panel} className="inventory" role="dialog" aria-label="Inventory" tabIndex={-1}>
      <header>
        <h2>
          <Icon id="bag" size={32} /> Bag
        </h2>
        <div className="gold">
          <Icon id="gold" size={32} />
          <b>{gold}</b> gold
        </div>
        <button className="close" onClick={() => setOpen(false)} aria-label="Close bag">
          ×
        </button>
      </header>
      <nav className="inv-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'on' : ''}
            onClick={() => {
              setTab(t)
              setIndex(0)
              setMessage(null)
            }}
          >
            {t === 'all' ? 'All' : CATEGORY_LABEL[t]}
          </button>
        ))}
      </nav>
      <div className="inv-body">
        <div className="inv-grid" role="listbox" aria-label="Items">
          {Array.from({ length: cells }, (_, i) => {
            const slot = list[i]
            if (!slot) return <div key={`empty-${i}`} className="inv-cell empty" aria-hidden />
            const isSel = selected?.id === slot.id
            return (
              <button
                key={slot.id}
                role="option"
                aria-selected={isSel}
                className={isSel ? 'inv-cell sel' : 'inv-cell'}
                onClick={() => {
                  setIndex(i)
                  setMessage(null)
                }}
                onDoubleClick={() => applyItem(slot.id)}
                title={ITEMS[slot.id].name}
              >
                <Icon id={slot.id} />
                {slot.qty > 1 && <span className="qty">{slot.qty}</span>}
                {freshIds.includes(slot.id) && <span className="new">NEW</span>}
              </button>
            )
          })}
        </div>
        <section className="inv-detail" aria-live="polite">
          {def && selected ? (
            <>
              <div className="inv-detail-head">
                <Icon id={def.id} size={64} />
                <div>
                  <h3>{def.name}</h3>
                  <p className="inv-meta">
                    {CATEGORY_LABEL[def.category]} · ×{selected.qty}
                  </p>
                </div>
              </div>
              <p className="inv-desc">{message ?? def.description}</p>
              {def.useText && (
                <button className="inv-use" onClick={applySelected}>
                  Use <kbd>E</kbd>
                </button>
              )}
            </>
          ) : (
            <p className="inv-desc dim">Nothing here yet.</p>
          )}
        </section>
      </div>
      <footer>Arrows select · Tab category · E use · I / Esc close</footer>
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.key), 2800)
    return () => clearTimeout(t)
  }, [toast.key, dismiss])
  return (
    <div className="toast">
      {toast.icon && <Icon id={toast.icon} size={32} />}
      <span>
        <small>{toast.label}</small>
        {toast.text}
      </span>
    </div>
  )
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.key} toast={t} />
      ))}
    </div>
  )
}

/** HUD button that opens the bag; shows a dot while there are unseen items. */
export function BagButton() {
  const open = useGame((s) => s.inventoryOpen)
  const setOpen = useGame((s) => s.setInventoryOpen)
  const hasNew = useInventory((s) => s.fresh.length > 0)
  return (
    <button className="hud-btn bag-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Bag (I)">
      <Icon id="bag" size={24} />
      Bag
      {hasNew && <span className="dot" aria-label="new items" />}
    </button>
  )
}
