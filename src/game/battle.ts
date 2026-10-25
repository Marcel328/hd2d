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

export type BattleEventKind =
  | 'attack' | 'counter' | 'defend' | 'heal' | 'fire' | 'blind'
  | 'buffet' | 'gather' | 'burst' | 'drink' | 'break' | 'miss' | 'recoil'

/** One presentation beat. IDs restart with each session; use both when keying animations. */
export interface BattleEvent {
  id: number
  kind: BattleEventKind
  target: 'enemy' | 'player'
  guarded?: boolean
  outcome?: 'hit' | 'miss' | 'guarded'
  breaks?: boolean
}

export const BATTLE_ENTER_MS = 900
export const BATTLE_EXIT_MS = 650
/** Shared by the turn scheduler and presentation so an animation finishes before the next beat. */
export const BATTLE_EFFECT_MS: Record<BattleEventKind, number> = {
  attack: 640, counter: 720, defend: 640, heal: 760, fire: 820, blind: 760,
  buffet: 800, gather: 1000, burst: 1250, drink: 1000, break: 720, miss: 640, recoil: 720,
}
const BEAT_REST_MS = 140

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
  session: number
  transition: 'entering' | 'ready' | 'leaving'
  event: BattleEvent | null
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

let handlers: Handlers | null = null
let snapshot: Saved | null = null
let popKey = 0
let eventKey = 0
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
    event: null,
    hitEnemy: 0,
    hitPlayer: 0,
    turn: 1,
  }
}

export const useBattle = create<BattleState>((set, get) => {
  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  // Every callback belongs to one attempt. A stale timeout must never finish a new fight or
  // restore its bag after the player has already returned to the story.
  const later = (ms: number, fn: () => void) => {
    cancelTimer()
    const session = get().session
    timer = setTimeout(() => {
      timer = null
      if (!get().active || get().session !== session) return
      fn()
    }, ms)
  }

  const event = (kind: BattleEventKind, target: BattleEvent['target'], detail: Partial<BattleEvent> = {}): BattleEvent =>
    ({ ...detail, id: ++eventKey, kind, target })
  const pop = (who: Pop['who'], text: string, kind: Pop['kind']): Pop => ({ key: ++popKey, who, text, kind })
  const withPops = (old: Pop[], added: Pop[]) => [...old, ...added].slice(-6)

  const enter = (message?: string) => {
    cancelTimer()
    popKey = eventKey = 0
    set((s) => ({ active: true, ...fresh(), session: s.session + 1, transition: 'entering', ...(message ? { message } : {}) }))
    sound.encounter()
    later(BATTLE_ENTER_MS, () => set({ transition: 'ready' }))
  }

  const enemyPhase = () => {
    const s = get()
    if (!s.active || s.transition !== 'ready' || s.phase !== 'busy') return
    const e = { ...s.enemy }
    const p = { ...s.player }
    const pops: Pop[] = []
    let message: string
    let beat: BattleEvent
    let hitPlayer = s.hitPlayer

    if (e.breakTurns > 0) e.breakTurns--
    if (e.breakTurns === 1) {
      message = 'The gloam moth is reeling — it cannot act!'
      beat = event('break', 'enemy')
    } else {
      if (e.breakTurns === 0 && e.shield === 0) {
        e.shield = e.maxShield
        pops.push(pop('enemy', 'Guard restored', 'guard'))
      }
      const move = s.next
      if (move === 'gather') {
        message = 'The moth draws the gloam into its wings…'
        beat = event('gather', 'enemy')
      } else if (move === 'drink') {
        const heal = Math.min(14, e.max - e.hp)
        e.hp += heal
        message = `It drinks from the Lantern’s flame and recovers ${heal} HP.`
        pops.push(pop('enemy', `+${heal}`, 'heal'))
        beat = event('drink', 'enemy')
        sound.chime(false)
      } else {
        const base = move === 'burst' ? rand(22, 26) : rand(8, 10)
        if (e.blinded) {
          e.blinded = false
          message = `${MOVES[move].name}! Lost in the flour cloud, it misses completely.`
          pops.push(pop('player', 'Miss', 'miss'))
          beat = event(move, 'player', { outcome: 'miss' })
          sound.guard()
        } else {
          const dmg = p.defending ? Math.max(1, Math.round(base * 0.4)) : base
          p.hp = Math.max(0, p.hp - dmg)
          message = `${MOVES[move].name}! ${p.defending ? `You brace and take only ${dmg}` : `You take ${dmg}`} damage.`
          pops.push(pop('player', `−${dmg}`, 'dmg'))
          hitPlayer++
          beat = event(move, 'player', { guarded: p.defending, outcome: p.defending ? 'guarded' : 'hit' })
          if (p.defending) sound.guard()
          else sound.hit(move === 'burst')
        }
      }
      e.step++
    }
    p.defending = false
    const next = e.step === s.enemy.step ? s.next : moveAt(e.step, e.hp, e.max)
    set({ enemy: e, player: p, message, next, event: beat, pops: withPops(s.pops, pops), hitPlayer })

    later(BATTLE_EFFECT_MS[beat.kind] + BEAT_REST_MS, () => {
      if (get().player.hp <= 0) {
        set({ phase: 'lost', message: 'The gloam overwhelms you…', event: event('recoil', 'player') })
        sound.defeat()
        return
      }
      set((st) => ({ phase: 'command', turn: st.turn + 1, event: null }))
    })
  }

  return {
    active: false,
    session: 0,
    transition: 'ready',
    ...fresh(),
    start: (h) => {
      // Re-entering from a duplicated dialogue callback must not overwrite the pre-fight bag.
      if (get().active) return
      handlers = h
      snapshot = useInventory.getState().snapshot()
      enter()
    },
    act: (a) => {
      const s = get()
      if (!s.active || s.transition !== 'ready' || s.phase !== 'command') return
      const e = { ...s.enemy }
      const p = { ...s.player }
      const pops: Pop[] = []
      let message = ''
      let beat: BattleEvent
      let hitEnemy = s.hitEnemy
      let broke = false
      const broken = e.breakTurns > 0
      const damage = (amount: number, shieldLoss: number) => {
        const dmg = broken ? amount * 2 : amount
        e.hp = Math.max(0, e.hp - dmg)
        pops.push(pop('enemy', `−${dmg}`, 'dmg'))
        hitEnemy++
        if (!broken && e.shield > 0) {
          e.shield = Math.max(0, e.shield - shieldLoss)
          if (e.shield === 0) {
            e.breakTurns = 2
            broke = true
            pops.push(pop('enemy', 'BREAK!', 'break'))
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
          beat = event('counter', 'enemy', { breaks: broke })
        } else {
          message = `You strike the moth for ${damage(rand(10, 13), 1)}`
          beat = event('attack', 'enemy', { breaks: broke })
        }
      } else if (a.type === 'defend') {
        p.defending = true
        p.counter = true
        message = 'You raise your guard and wait for an opening.'
        pops.push(pop('player', 'Guard', 'guard'))
        beat = event('defend', 'player')
        sound.guard()
      } else {
        const def = BATTLE_ITEMS[a.id]
        if (!def || useInventory.getState().remove(a.id, 1) !== 1) return
        const name = ITEMS[a.id].name
        if (def.heal) {
          const heal = Math.min(def.heal, p.max - p.hp)
          p.hp += heal
          message = `You use ${name} and recover ${heal} HP.`
          pops.push(pop('player', `+${heal}`, 'heal'))
          beat = event('heal', 'player')
          sound.chime()
        } else if (def.damage) {
          message = `You hurl the ${name}! It bursts into flame — a weakness! ${damage(def.damage, def.shield ?? 1)}`
          beat = event('fire', 'enemy', { breaks: broke })
        } else {
          e.blinded = true
          message = `You throw the ${name}. A white cloud engulfs the moth — it can’t see!`
          pops.push(pop('enemy', 'Blinded', 'miss'))
          beat = event('blind', 'enemy')
          sound.guard()
        }
      }
      // Keep the announced move stable throughout this player turn. Only breaking a charged
      // burst cancels it; the flex move is chosen when the next command turn begins.
      const next = e.step !== s.enemy.step ? moveAt(e.step, e.hp, e.max) : s.next
      set({ enemy: e, player: p, message, phase: 'busy', next, event: beat, pops: withPops(s.pops, pops), hitEnemy })

      later(BATTLE_EFFECT_MS[beat.kind] + BEAT_REST_MS, () => {
        if (get().enemy.hp <= 0) {
          set({ phase: 'won', message: 'The gloam moth reels away over the river and vanishes into the Whisperwood!', event: event('recoil', 'enemy') })
          sound.victory()
          return
        }
        enemyPhase()
      })
    },
    retry: () => {
      const s = get()
      if (!s.active || s.transition !== 'ready' || s.phase !== 'lost') return
      if (snapshot) useInventory.getState().restore(snapshot)
      enter('You steady yourself and face the moth again.')
      handlers?.onRetry?.()
    },
    leave: () => {
      const s = get()
      if (!s.active || s.transition !== 'ready' || (s.phase !== 'won' && s.phase !== 'lost')) return
      const won = s.phase === 'won'
      const h = handlers
      set({ transition: 'leaving', event: null })
      later(BATTLE_EXIT_MS, () => {
        // Clear the old encounter before calling story code, which may start another encounter.
        const bag = snapshot
        handlers = null
        snapshot = null
        if (!won && bag) useInventory.getState().restore(bag)
        set({ active: false, transition: 'ready', pops: [], event: null })
        if (won) h?.onWin()
        else h?.onRetreat?.()
      })
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
