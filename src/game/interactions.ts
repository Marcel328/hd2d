// Things the player can talk to or read, and what they say.
import { SIGNPOST, WELL } from './world/layout'
import type { AreaId } from './world/interiors'
import type { Conversation } from './state'
import { BEACON } from './world/layout'
import { brannTalk, lanternTalk, millDoorTalk, miraTalk, rowanTalk, storehouseTalk, type TalkContext } from './script'
import { useStory } from './story'

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
  /** Simple flavour text… */
  lines?: (ctx: TalkContext) => string[]
  /** …or a full conversation (speakers, choices, story effects). */
  talk?: (ctx: TalkContext) => Conversation
  /** Prompt verb override, e.g. "Knock on". */
  verb?: string
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

const DIALOGUE: Record<string, NonNullable<Interactable['lines']>> = {
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
  if (mill) {
    registerInteractable({
      id: 'mill', kind: 'read', name: 'Mill Door', pos: { x: 15.5, z: 13.85 }, reach: 1.4, iconHeight: 2.3, talk: millDoorTalk,
    })
    registerInteractable({
      id: 'storehouse', kind: 'talk', verb: 'Knock on', name: 'Storehouse Door', pos: { x: 6, z: 6.25 }, reach: 1.3,
      iconHeight: 2.0, talk: storehouseTalk,
    })
    if (BEACON)
      registerInteractable({
        id: 'lantern',
        kind: 'talk',
        // The moth sits on the Lantern until the story resolves it.
        get verb() {
          return useStory.getState().ending ? 'Look at' : 'Approach'
        },
        get name() {
          return useStory.getState().ending ? 'The Last Lantern' : 'Gloam Moth'
        },
        pos: { x: BEACON.x, z: BEACON.z },
        reach: 1.75,
        iconHeight: 3.4,
        talk: lanternTalk,
      })
  }
}

/** Story conversations for NPCs by id. */
export const NPC_TALK: Record<string, (ctx: TalkContext) => Conversation> = {
  rowan: rowanTalk,
  mira: miraTalk,
  brann: brannTalk,
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
