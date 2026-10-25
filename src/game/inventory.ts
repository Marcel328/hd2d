// Items, the player's bag, scavenging loot and pickup notifications. The bag and which spots
// have been searched are saved to localStorage, so progress survives a reload.
import { create } from 'zustand'

export type ItemId =
  | 'herb'
  | 'rations'
  | 'waterskin'
  | 'compass'
  | 'letter'
  | 'bread'
  | 'honey'
  | 'oil'
  | 'flour'
  | 'journal'
  | 'scale'
  | 'wingdust'

export type Category = 'supplies' | 'materials' | 'key'

export interface ItemDef {
  id: ItemId
  name: string
  category: Category
  description: string
  /** Present for items that can be used up from the bag. */
  useText?: string
}

export const CATEGORY_LABEL: Record<Category, string> = {
  supplies: 'Supplies',
  materials: 'Materials',
  key: 'Key items',
}

export const ITEMS: Record<ItemId, ItemDef> = {
  herb: {
    id: 'herb',
    name: 'Healing Herb',
    category: 'supplies',
    description: 'A bitter green leaf from the roadside. Chewing one soothes cuts and bruises.',
    useText: 'You chew a Healing Herb. The scrapes from the road stop stinging.',
  },
  rations: {
    id: 'rations',
    name: 'Trail Rations',
    category: 'supplies',
    description: 'Hard bread and smoked meat, wrapped in waxed cloth for the long road.',
    useText: 'You eat some Trail Rations. Filling, if not exactly delicious.',
  },
  waterskin: {
    id: 'waterskin',
    name: 'Waterskin',
    category: 'key',
    description: 'A battered leather waterskin. You refill it at every well and stream you pass.',
  },
  compass: {
    id: 'compass',
    name: 'Brass Compass',
    category: 'key',
    description: "Your father's compass. It points true north — most days.",
  },
  letter: {
    id: 'letter',
    name: 'Sealed Letter',
    category: 'key',
    description: 'Addressed to “Elder Rowan of Elmbrook”. The wax seal bears the mark of a heron.',
  },
  bread: {
    id: 'bread',
    name: 'Fresh Bread',
    category: 'supplies',
    description: 'Still faintly warm. Baked by the Ashdowns with flour from their own mill.',
    useText: 'You eat the Fresh Bread. Soft, warm and wonderful.',
  },
  honey: {
    id: 'honey',
    name: 'Wildflower Honey',
    category: 'supplies',
    description: 'A small jar of golden honey from the hives in the meadow above Elmbrook.',
    useText: 'You take a spoonful of Wildflower Honey. Sweet as summer.',
  },
  oil: {
    id: 'oil',
    name: 'Lantern Oil',
    category: 'materials',
    description: 'A stoppered flask of lamp oil. Burns clean and bright through the longest night.',
  },
  flour: {
    id: 'flour',
    name: 'Riverside Flour',
    category: 'materials',
    description: 'A pouch of fine flour, stone-ground at the Riverside Mill. Makes a fine cloud if thrown.',
  },
  journal: {
    id: 'journal',
    name: "Keeper's Journal Page",
    category: 'key',
    description:
      '“A starving gloam will take oil freely given, and guard the flame that fed it. Drive one off by force and it takes the night’s small lights with it.” — from Brann’s journal',
  },
  scale: {
    id: 'scale',
    name: 'Gloam Scale',
    category: 'materials',
    description: 'A dusty, violet wing-scale shed by the gloam moth as it fled. It is cold to the touch.',
  },
  wingdust: {
    id: 'wingdust',
    name: 'Glimmering Wing-dust',
    category: 'materials',
    description: 'A pinch of dust from the gloam moth’s wings, given freely. It glows like a firefly in the dark.',
  },
}

/** What the traveller carries on arrival in Elmbrook. */
export const STARTING_ITEMS: [ItemId, number][] = [
  ['herb', 3],
  ['rations', 2],
  ['waterskin', 1],
  ['compass', 1],
  ['letter', 1],
]
export const STARTING_GOLD = 85

export interface Loot {
  items: [ItemId, number][]
  gold?: number
}

/** What each scavenging spot holds the first time it is searched. */
export const LOOT: Record<string, Loot> = {
  'cottage-cupboard': { items: [['bread', 2], ['honey', 1]] },
  'cottage-chest': { items: [['oil', 1], ['herb', 2]], gold: 30 },
  'cottage-sacks': { items: [['flour', 1]] },
  'cottage-bookshelf': { items: [['journal', 1]] },
}

const MAX_STACK = 99

export interface Slot {
  id: ItemId
  qty: number
}

interface InventoryState {
  slots: Slot[]
  gold: number
  /** Items obtained since the bag was last opened on them. */
  fresh: ItemId[]
  looted: Record<string, true>
  add: (id: ItemId, qty?: number) => void
  addGold: (n: number) => void
  /** Use one of a consumable; returns the flavour text, or null if it can't be used. */
  use: (id: ItemId) => string | null
  markSeen: (id: ItemId) => void
  /** Take a spot's loot once; returns what was found, or null if it was already emptied. */
  loot: (spotId: string) => Loot | null
  /** Remove up to `qty`; returns how many were removed. */
  remove: (id: ItemId, qty?: number) => number
  has: (id: ItemId) => boolean
  count: (id: ItemId) => number
  /** Battles restore the bag on retry. */
  snapshot: () => Saved
  restore: (s: Saved) => void
  reset: () => void
}

const SAVE_KEY = 'hd2d-village-save-v1'

export interface Saved {
  slots: Slot[]
  gold: number
  fresh: ItemId[]
  looted: Record<string, true>
}

function fresh(): Saved {
  return { slots: STARTING_ITEMS.map(([id, qty]) => ({ id, qty })), gold: STARTING_GOLD, fresh: [], looted: {} }
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return fresh()
    const s = JSON.parse(raw) as Saved
    // Drop anything this build doesn't know about.
    s.slots = (s.slots ?? []).filter((sl) => sl.id in ITEMS && sl.qty > 0)
    s.fresh = (s.fresh ?? []).filter((id) => id in ITEMS)
    return { slots: s.slots, gold: Number(s.gold) || 0, fresh: s.fresh, looted: s.looted ?? {} }
  } catch {
    return fresh()
  }
}

export const useInventory = create<InventoryState>((set, get) => ({
  ...load(),
  add: (id, qty = 1) =>
    set((s) => {
      const slots = s.slots.map((sl) => ({ ...sl }))
      const slot = slots.find((sl) => sl.id === id)
      if (slot) slot.qty = Math.min(MAX_STACK, slot.qty + qty)
      else slots.push({ id, qty: Math.min(MAX_STACK, qty) })
      return { slots, fresh: s.fresh.includes(id) ? s.fresh : [...s.fresh, id] }
    }),
  addGold: (n) => set((s) => ({ gold: s.gold + n })),
  use: (id) => {
    const def = ITEMS[id]
    const slot = get().slots.find((sl) => sl.id === id)
    if (!def.useText || !slot) return null
    set((s) => ({
      slots: s.slots.map((sl) => (sl.id === id ? { ...sl, qty: sl.qty - 1 } : sl)).filter((sl) => sl.qty > 0),
    }))
    return def.useText
  },
  markSeen: (id) => set((s) => (s.fresh.includes(id) ? { fresh: s.fresh.filter((f) => f !== id) } : s)),
  loot: (spotId) => {
    const table = LOOT[spotId]
    if (!table || get().looted[spotId]) return null
    for (const [id, qty] of table.items) get().add(id, qty)
    if (table.gold) get().addGold(table.gold)
    set((s) => ({ looted: { ...s.looted, [spotId]: true } }))
    return table
  },
  remove: (id, qty = 1) => {
    const slot = get().slots.find((sl) => sl.id === id)
    if (!slot) return 0
    const n = Math.min(qty, slot.qty)
    set((s) => ({ slots: s.slots.map((sl) => (sl.id === id ? { ...sl, qty: sl.qty - n } : sl)).filter((sl) => sl.qty > 0) }))
    return n
  },
  has: (id) => get().slots.some((sl) => sl.id === id && sl.qty > 0),
  count: (id) => get().slots.find((sl) => sl.id === id)?.qty ?? 0,
  snapshot: () => {
    const { slots, gold, fresh: f, looted } = get()
    return { slots: slots.map((sl) => ({ ...sl })), gold, fresh: [...f], looted: { ...looted } }
  },
  restore: (s) => set({ slots: s.slots.map((sl) => ({ ...sl })), gold: s.gold, fresh: [...s.fresh], looted: { ...s.looted } }),
  reset: () => set(fresh()),
}))

useInventory.subscribe((s) => {
  try {
    const { slots, gold, fresh: f, looted } = s
    localStorage.setItem(SAVE_KEY, JSON.stringify({ slots, gold, fresh: f, looted }))
  } catch {
    // Saving is best-effort (private browsing may block storage).
  }
})

export function describeLoot(loot: Loot): string {
  const parts = loot.items.map(([id, qty]) => (qty > 1 ? `${ITEMS[id].name} ×${qty}` : ITEMS[id].name))
  if (loot.gold) parts.push(`${loot.gold} gold`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// ---- pickup notifications ----

export interface Toast {
  key: number
  icon: ItemId | 'gold' | null
  text: string
  label: string
}

interface ToastState {
  toasts: Toast[]
  push: (icon: Toast['icon'], text: string, label?: string) => void
  dismiss: (key: number) => void
}

let toastKey = 0
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (icon, text, label = 'Obtained') =>
    set((s) => ({ toasts: [...s.toasts.slice(-3), { key: ++toastKey, icon, text, label }] })),
  dismiss: (key) => set((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) })),
}))

export function announceLoot(loot: Loot) {
  const { push } = useToasts.getState()
  for (const [id, qty] of loot.items) push(id, qty > 1 ? `${ITEMS[id].name} ×${qty}` : ITEMS[id].name)
  if (loot.gold) push('gold', `${loot.gold} gold`)
}
