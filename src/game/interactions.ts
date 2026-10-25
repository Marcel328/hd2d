// Things the player can talk to or read, and what they say.
import { SIGNPOST, WELL } from './world/layout'
import type { AreaId } from './world/interiors'

export interface Interactable {
  id: string
  kind: 'talk' | 'read' | 'search'
  /** Which area it belongs to; only the active area's interactables can be focused. */
  area?: AreaId
  name: string
  /** Live position — NPCs update theirs every frame. */
  pos: { x: number; z: number }
  /** How close the player must be (centre to centre). */
  reach: number
  /** Height of the prompt icon above the ground. */
  iconHeight: number
  lines: (ctx: { night: boolean; visits: number }) => string[]
}

export const interactables = new Map<string, Interactable>()

let activeArea: AreaId = 'outdoor'

export function setInteractionArea(area: AreaId) {
  activeArea = area
}

/** Interactables of the area the player is in. */
export function* areaInteractables(): Generator<Interactable> {
  for (const it of interactables.values()) if ((it.area ?? 'outdoor') === activeArea) yield it
}

export function registerInteractable(i: Interactable) {
  interactables.set(i.id, i)
}

export function unregisterInteractable(i: Interactable) {
  if (interactables.get(i.id) === i) interactables.delete(i.id)
}

const DIALOGUE: Record<string, Interactable['lines']> = {
  rowan: ({ night, visits }) => {
    if (night)
      return [
        'The lanterns are lit. See how they hold back the dark?',
        'My grandmother swore they kept the forest spirits at bay. Superstition, perhaps…',
        '…but in seventy winters I have never once let them go out.',
      ]
    if (visits === 0)
      return [
        'Well now — a traveller! It has been many seasons since the Highroad brought us a new face.',
        'Welcome to Elmbrook. We are a small village, but the well water is sweet and the inn keeps a warm hearth.',
        'Wander as you please. And should the sun begin to set, mind the lanterns.',
      ]
    return [
      'The creek runs down from the Whisperwood hills, clear as glass.',
      'Mira swears she once saw a heron in it the size of a hay cart. Ha! Children.',
    ]
  },
  mira: ({ night, visits }) => {
    if (night)
      return [
        'Shh… look! The fireflies are out.',
        'They only come down to the creek on warm nights. Elder Rowan says they are the souls of old lantern-keepers.',
        'I think they just like the water.',
      ]
    if (visits === 0)
      return [
        'Oh! Hello! Are you here for the harvest festival? You are a little early — the cabbages are not even ready yet.',
        'I am Mira. I look after the garden while Father works the mill across the river.',
      ]
    return [
      'Follow the road east over the bridge and you will reach the old mill. Tell Father I said hello!',
      'Oh, and if you are short on supplies, our cottage is the one with the slate roof. Father leaves a chest out for travellers — help yourself!',
    ]
  },
  signpost: () => [
    '↑  North — Whisperwood\n      (the trail is overgrown)\n→  East — Riverside Mill\n↓  South — The Highroad to Port Calder',
  ],
  well: ({ night }) =>
    night
      ? ['Stars shimmer on the water far below. Somewhere down there, a frog is singing.']
      : ['The water far below glimmers in the sun. A wooden bucket hangs from a fraying rope.'],
}

export function buildInteractables(mill: boolean) {
  interactables.clear()
  registerInteractable({
    id: 'signpost', kind: 'read', name: 'Signpost', pos: { ...SIGNPOST }, reach: 1.25, iconHeight: 2.35,
    lines: mill ? () => ['← West — Elmbrook\nRiverside Mill — grain, flour and a little river magic.'] : DIALOGUE.signpost,
  })
  if (!mill) registerInteractable({
    id: 'well', kind: 'read', name: 'Old Well', pos: { ...WELL }, reach: 1.45, iconHeight: 2.6, lines: DIALOGUE.well,
  })
  if (mill) registerInteractable({
    id: 'mill', kind: 'read', name: 'Riverside Mill', pos: { x: 15.5, z: 14.3 }, reach: 1.6, iconHeight: 2.3,
    lines: ({ night }) => night
      ? ['The mill is closed for the night. The waterwheel keeps turning in the moonlight.']
      : ['Fresh flour — milled by the river since 1842.', 'A note on the door: “Delivering flour to Elmbrook. Back soon. — Mira’s father”'],
  })
}

export function npcLines(id: string): Interactable['lines'] {
  return DIALOGUE[id]
}

/**
 * Best interactable for the player: in reach and roughly in front of them.
 * Returns null if nothing qualifies.
 */
export function findFocus(px: number, pz: number, fx: number, fz: number): Interactable | null {
  let best: Interactable | null = null
  let bestScore = Infinity
  for (const it of areaInteractables()) {
    const dx = it.pos.x - px
    const dz = it.pos.z - pz
    const d = Math.hypot(dx, dz)
    if (d > it.reach) continue
    const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1
    if (facing < 0.2) continue
    const score = d - facing * 0.5
    if (score < bestScore) {
      bestScore = score
      best = it
    }
  }
  return best
}
