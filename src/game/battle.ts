// One small tactical encounter: the traveller vs. the gloam moth.
//
// Readable rules, Octopath-style:
//  • The moth's next move is always shown (its "intent"). It loops:
//      Wing Buffet → Gathering Gloam (telegraph) → Gloam Burst (heavy) → Wing Buffet → Drink Light*
//    (*only when below half health, otherwise another Wing Buffet).
//  • It has 4 shield points. Attacks remove 1, Lantern Oil (its weakness) removes 2. At 0 it
//    BREAKS: it loses its next action, takes double damage on your next turn, and any charged
//    Gloam Burst fizzles. Then its guard recovers.
//  • Defend cuts incoming damage to 40% and readies a counter: your next Attack deals 1.5× and
//    removes 2 shields. Reading the telegraph and defending is how the fight is won.
//  • Items heal, or are thrown (oil: fire, flour: blinds).
//  • Losing offers Retry (from the start, items restored) or stepping back to choose again.
import { create } from 'zustand'
import { ITEMS, useInventory, type ItemId, type Saved } from './inventory'
import { sound } from './audio'

export type EnemyMove = 'buffet' | 'gather' | 'burst' | 'drink'

export const MOVES: Record<EnemyMove, { name: string; intent: string; danger: 'low' | 'high' | 'none' | 'heal' }> = {
  buffet: { name: 'Wing Buffet', intent: 'Wing Buffet — a light attack', danger: 'low' },
  gather: { name: 'Gathering Gloam', intent: 'Gathering gloam — a heavy attack comes next. Break it, or Defend!', danger: 'none' },
  burst: { name: 'Gloam Burst', intent: 'Gloam Burst — heavy attack! Defend!', danger: 'high' },
  drink: { name: 'Drink Light', intent: 'Drink Light — it will heal from the flame', danger: 'heal' },
}

const PATTERN: (EnemyMove | 'flex')[] = ['buffet', 'gather', 'burst', 'buffet', 'flex']

export interface BattleItemDef {
  heal?: number
  damage?: number
  shield?: number
  blind?: boolean
  effect: string
}

export const BATTLE_ITEMS: Partial<Record<ItemId, BattleItemDef>> = {
  herb: { heal: 24, effect: 'Heal 24 HP' },
  rations: { heal: 14, effect: 'Heal 14 HP' },
  bread: { heal: 20, effect: 'Heal 20 HP' },
  honey: { heal: 30, effect: 'Heal 30 HP' },
  oil: { damage: 16, shield: 2, effect: 'Throw — fire damage, weakness: −2 shield' },
  flour: { blind: true, effect: 'Throw — its next attack misses' },
}

export type Action = { type: 'attack' } | { type: 'defend' } | { type: 'item'; id: ItemId }

export interface Pop {
  key: number
  who: 'enemy' | 'player'
  text: string
  kind: 'dmg' | 'heal' | 'miss' | 'break' | 'guard'
}

interface Handlers {
  onWin: () => void
  /** Leaving after a defeat ("step back"). */
  onRetreat?: () => void
  onRetry?: () => void
}

export interface BattleState {
  active: boolean
  phase: 'command' | 'busy' | 'won' | 'lost'
  player: { hp: number; max: number; defending: boolean; counter: boolean }
  enemy: { hp: number; max: number; shield: number; maxShield: number; breakTurns: number; blinded: boolean; step: number }
  next: EnemyMove
  message: string
  pops: Pop[]
  /** Bumped to replay hit animations. */
  hitEnemy: number
  hitPlayer: number
  turn: number
  start: (h: Handlers) => void
  act: (a: Action) => void
  retry: () => void
  leave: () => void
}

const PLAYER_HP = 50
const ENEMY_HP = 90
const SHIELD = 4
const ENEMY_TURN_MS = 950
const PLAYER_TURN_MS = 750

let handlers: Handlers | null = null
let snapshot: Saved | null = null
let popKey = 0
let timer: ReturnType<typeof setTimeout> | null = null

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))

function moveAt(step: number, hp: number, max: number): EnemyMove {
  const m = PATTERN[step % PATTERN.length]
  if (m === 'flex') return hp / max < 0.5 ? 'drink' : 'buffet'
  return m
}

function fresh() {
  return {
    phase: 'command' as const,
    player: { hp: PLAYER_HP, max: PLAYER_HP, defending: false, counter: false },
    enemy: { hp: ENEMY_HP, max: ENEMY_HP, shield: SHIELD, maxShield: SHIELD, breakTurns: 0, blinded: false, step: 0 },
    next: 'buffet' as EnemyMove,
    message: 'The gloam moth rises from the Lantern, wings shedding cold light!',
    pops: [] as Pop[],
    turn: 1,
  }
}

export const useBattle = create<BattleState>((set, get) => {
  const pop = (who: Pop['who'], text: string, kind: Pop['kind']) =>
    set((s) => ({ pops: [...s.pops.slice(-5), { key: ++popKey, who, text, kind }] }))

  const later = (ms: number, fn: () => void) => {
    timer = setTimeout(fn, ms)
  }

  const enemyPhase = () => {
    const s = get()
    const e = { ...s.enemy }
    const p = { ...s.player }
    let message: string

    if (e.breakTurns > 0) e.breakTurns--
    if (e.breakTurns === 1) {
      message = 'The gloam moth is reeling — it cannot act!'
      set({ enemy: e, message })
    } else {
      if (e.breakTurns === 0 && e.shield === 0) {
        e.shield = e.maxShield
        pop('enemy', 'Guard restored', 'guard')
      }
      const move = s.next
      if (move === 'gather') {
        message = 'The moth draws the gloam into its wings…'
      } else if (move === 'drink') {
        const heal = Math.min(14, e.max - e.hp)
        e.hp += heal
        message = `It drinks from the Lantern’s flame and recovers ${heal} HP.`
        pop('enemy', `+${heal}`, 'heal')
        sound.chime(false)
      } else {
        const base = move === 'burst' ? rand(22, 26) : rand(8, 10)
        if (e.blinded) {
          e.blinded = false
          message = `${MOVES[move].name}! Lost in the flour cloud, it misses completely.`
          pop('player', 'Miss', 'miss')
          sound.guard()
        } else {
          const dmg = p.defending ? Math.max(1, Math.round(base * 0.4)) : base
          p.hp = Math.max(0, p.hp - dmg)
          message = `${MOVES[move].name}! ${p.defending ? `You brace and take only ${dmg}` : `You take ${dmg}`} damage.`
          pop('player', `−${dmg}`, 'dmg')
          set((st) => ({ hitPlayer: st.hitPlayer + 1 }))
          if (p.defending) sound.guard()
          else sound.hit(move === 'burst')
        }
      }
      e.step++
    }
    p.defending = false
    const next = moveAt(e.step, e.hp, e.max)
    set({ enemy: e, player: p, message, next })

    later(ENEMY_TURN_MS, () => {
      if (get().player.hp <= 0) {
        set({ phase: 'lost', message: 'The gloam overwhelms you…' })
        sound.defeat()
        return
      }
      set((st) => ({ phase: 'command', turn: st.turn + 1 }))
    })
  }

  return {
    active: false,
    ...fresh(),
    hitEnemy: 0,
    hitPlayer: 0,
    start: (h) => {
      handlers = h
      snapshot = useInventory.getState().snapshot()
      if (timer) clearTimeout(timer)
      set({ active: true, ...fresh() })
      sound.encounter()
    },
    act: (a) => {
      const s = get()
      if (s.phase !== 'command') return
      const e = { ...s.enemy }
      const p = { ...s.player }
      let message = ''
      const broken = e.breakTurns > 0
      const damage = (amount: number, shieldLoss: number) => {
        const dmg = broken ? amount * 2 : amount
        e.hp = Math.max(0, e.hp - dmg)
        pop('enemy', `−${dmg}`, 'dmg')
        set((st) => ({ hitEnemy: st.hitEnemy + 1 }))
        if (!broken && e.shield > 0) {
          e.shield = Math.max(0, e.shield - shieldLoss)
          if (e.shield === 0) {
            e.breakTurns = 2
            pop('enemy', 'BREAK!', 'break')
            sound.breakShield()
            // A broken moth loses whatever it was charging.
            if (s.next === 'burst') {
              e.step++
              return `${dmg} damage — BREAK! The gathered gloam scatters harmlessly.`
            }
            return `${dmg} damage — BREAK! The moth is reeling.`
          }
        }
        sound.hit(false)
        return `${dmg} damage${broken ? ' (broken: double damage!)' : ''}.`
      }

      if (a.type === 'attack') {
        if (p.counter) {
          p.counter = false
          message = `Counter-strike! ${damage(Math.round(rand(10, 13) * 1.5), 2)}`
        } else message = `You strike the moth for ${damage(rand(10, 13), 1)}`
      } else if (a.type === 'defend') {
        p.defending = true
        p.counter = true
        message = 'You raise your guard and wait for an opening.'
        pop('player', 'Guard', 'guard')
        sound.guard()
      } else {
        const def = BATTLE_ITEMS[a.id]
        if (!def || useInventory.getState().remove(a.id, 1) === 0) return
        const name = ITEMS[a.id].name
        if (def.heal) {
          const heal = Math.min(def.heal, p.max - p.hp)
          p.hp += heal
          message = `You use ${name} and recover ${heal} HP.`
          pop('player', `+${heal}`, 'heal')
          sound.chime()
        } else if (def.damage) {
          message = `You hurl the ${name}! It bursts into flame — a weakness! ${damage(def.damage, def.shield ?? 1)}`
        } else if (def.blind) {
          e.blinded = true
          message = `You throw the ${name}. A white cloud engulfs the moth — it can’t see!`
          pop('enemy', 'Blinded', 'miss')
          sound.guard()
        }
      }
      // Recompute the telegraph if a break cancelled a charge.
      const next = moveAt(e.step, e.hp, e.max)
      set({ enemy: e, player: p, message, phase: 'busy', next: e.breakTurns > 0 ? next : s.next })

      later(PLAYER_TURN_MS, () => {
        if (get().enemy.hp <= 0) {
          set({ phase: 'won', message: 'The gloam moth reels away over the river and vanishes into the Whisperwood!' })
          sound.victory()
          return
        }
        enemyPhase()
      })
    },
    retry: () => {
      handlers?.onRetry?.()
      if (snapshot) useInventory.getState().restore(snapshot)
      if (timer) clearTimeout(timer)
      set({ ...fresh(), message: 'You steady yourself and face the moth again.' })
      sound.encounter()
    },
    leave: () => {
      const s = get()
      if (timer) clearTimeout(timer)
      const h = handlers
      handlers = null
      set({ active: false, pops: [] })
      if (s.phase === 'won') h?.onWin()
      else {
        // Stepping back after a defeat: nothing was spent.
        if (snapshot) useInventory.getState().restore(snapshot)
        h?.onRetreat?.()
      }
      snapshot = null
    },
  }
})

/** Items from the bag that can be used in battle, with counts. */
export function battleItems(): { id: ItemId; qty: number; def: BattleItemDef }[] {
  return useInventory
    .getState()
    .slots.filter((s) => BATTLE_ITEMS[s.id])
    .map((s) => ({ id: s.id, qty: s.qty, def: BATTLE_ITEMS[s.id]! }))
}
