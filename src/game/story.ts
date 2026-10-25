// "The Last Lantern" — quest progress, endings and the current objective.
//
//   intro → arrive (deliver the letter) → warned (find Mira) → helping (cottage, then the mill)
//         → confront (Brann has explained) → resolved (moth fed or driven off) → ended
//
// Progress is saved to localStorage alongside the bag.
import { create } from 'zustand'
import { useInventory } from './inventory'

export type Stage = 'intro' | 'arrive' | 'warned' | 'helping' | 'confront' | 'resolved' | 'ended'
export type Ending = 'fireflies' | 'bright'

const ORDER: Stage[] = ['intro', 'arrive', 'warned', 'helping', 'confront', 'resolved', 'ended']

export const ENDINGS: Record<Ending, { title: string; summary: string }> = {
  fireflies: {
    title: 'A Night of Fireflies',
    summary:
      'You fed the starving gloam moth instead of fighting it. It settled on the Last Lantern as its guardian, and Elmbrook’s lanterns now burn a soft green-gold — with fireflies drifting through every street.',
  },
  bright: {
    title: 'The Bright Lanterns',
    summary:
      'You drove the gloam moth back into the Whisperwood. Brann rekindled the Last Lantern, and Elmbrook’s lanterns blaze brighter than anyone remembers — though the fireflies have not returned.',
  },
}

interface StoryState {
  stage: Stage
  ending: Ending | null
  metBrann: boolean
  /** Brann stays at the mill until the player leaves it after saving the Lantern, then is home. */
  brannHome: boolean
  /** How many times the moth battle was started (shown in the ending summary). */
  battles: number
  /** The ending card is up (not saved: reloading after the ending just lets you roam). */
  showEnding: boolean
  begin: () => void
  setStage: (s: Stage) => void
  meetBrann: () => void
  countBattle: () => void
  sendBrannHome: () => void
  resolve: (e: Ending) => void
  finish: () => void
  dismissEnding: () => void
  reset: () => void
}

const SAVE_KEY = 'hd2d-village-story-v1'

function load(): Partial<StoryState> {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return {}
    const s = JSON.parse(raw) as Partial<StoryState>
    return ORDER.includes(s.stage as Stage) ? s : {}
  } catch {
    return {}
  }
}

const saved = load()

export const useStory = create<StoryState>((set, get) => ({
  stage: saved.stage ?? 'intro',
  ending: saved.ending ?? null,
  metBrann: saved.metBrann ?? false,
  battles: saved.battles ?? 0,
  brannHome: saved.brannHome ?? false,
  showEnding: false,
  begin: () => get().stage === 'intro' && set({ stage: 'arrive' }),
  setStage: (stage) => set({ stage }),
  meetBrann: () => set((s) => ({ metBrann: true, stage: atLeast(s.stage, 'confront') ? s.stage : 'confront' })),
  countBattle: () => set((s) => ({ battles: s.battles + 1 })),
  sendBrannHome: () => set({ brannHome: true }),
  resolve: (ending) => set({ ending, stage: 'resolved', metBrann: true }),
  finish: () => set({ stage: 'ended', showEnding: true, brannHome: true }),
  dismissEnding: () => set({ showEnding: false }),
  reset: () => set({ stage: 'intro', ending: null, metBrann: false, brannHome: false, battles: 0, showEnding: false }),
}))

useStory.subscribe((s) => {
  try {
    const { stage, ending, metBrann, brannHome, battles } = s
    localStorage.setItem(SAVE_KEY, JSON.stringify({ stage, ending, metBrann, brannHome, battles }))
  } catch {
    // Saving is best-effort.
  }
})

export function atLeast(stage: Stage, min: Stage): boolean {
  return ORDER.indexOf(stage) >= ORDER.indexOf(min)
}

/** How the village lanterns burn: the visible state of the story. */
export type LanternMode = 'guttering' | 'fireflies' | 'bright'

export function lanternMode(): LanternMode {
  return useStory.getState().ending ?? 'guttering'
}

export interface Objective {
  text: string
  detail: string
}

/**
 * The current goal, always with directions — it never depends on time of day or on having
 * talked to someone twice.
 */
export function objectiveFor(stage: Stage, sceneId: string, has: (id: 'oil' | 'journal') => boolean): Objective | null {
  const atMill = sceneId === 'riversidemill'
  switch (stage) {
    case 'intro':
      return null
    case 'arrive':
      return atMill
        ? { text: 'Deliver the sealed letter to Elder Rowan', detail: 'He is in Elmbrook — take the road west.' }
        : { text: 'Deliver the sealed letter to Elder Rowan', detail: 'He keeps watch by the well in the village plaza.' }
    case 'warned':
      return atMill
        ? { text: 'Tell Mira about her father', detail: 'She is in Elmbrook, by the garden — take the road west.' }
        : { text: 'Tell Mira about her father', detail: 'She tends the fenced garden, south-east of the well.' }
    case 'helping': {
      if (atMill) return { text: 'Find Brann at Riverside Mill', detail: 'Mira thinks he never left. Try the storehouse by the road.' }
      const missing = [
        !has('oil') && 'lantern oil from the chest',
        !has('journal') && 'Brann’s journal from the bookshelf',
      ].filter(Boolean) as string[]
      if (missing.length)
        return {
          text: 'Gather supplies at Ashdown Cottage',
          detail: `Take the ${missing.join(' and ')} — the slate-roofed cottage north of the plaza.`,
        }
      return { text: 'Go to Riverside Mill', detail: 'East along the village road, over the bridge.' }
    }
    case 'confront':
      return atMill
        ? { text: 'Save the Last Lantern from the gloam moth', detail: 'It clings to the great lantern in the mill yard.' }
        : { text: 'Save the Last Lantern from the gloam moth', detail: 'Riverside Mill — east along the road, over the bridge.' }
    case 'resolved':
      return atMill
        ? { text: 'Return to Elder Rowan', detail: 'Take the road west to Elmbrook.' }
        : { text: 'Tell Elder Rowan what happened', detail: 'He waits by the well in the plaza.' }
    case 'ended':
      return { text: 'The Last Lantern — complete', detail: 'Explore freely, or play again from Settings.' }
  }
}

export function hasItem(id: 'oil' | 'journal') {
  return useInventory.getState().has(id)
}

/**
 * What each lantern state looks like. Before the story resolves, every lantern lit from the
 * starving Last Lantern gutters; each ending relights them differently.
 */
export const LANTERN_LOOK: Record<LanternMode, { level: number; color: string; sputter: number; glow: number; fireflies: number }> = {
  guttering: { level: 0.42, color: '#ff9446', sputter: 1, glow: 0.55, fireflies: 0.45 },
  fireflies: { level: 0.95, color: '#cdf27e', sputter: 0, glow: 1.05, fireflies: 1 },
  bright: { level: 1.65, color: '#ffc46a', sputter: 0, glow: 1.6, fireflies: 0 },
}

/** Irregular guttering for lantern `i` at time `t`: mostly dim, sometimes almost out. */
export function gutter(t: number, i: number, sputter: number): number {
  if (sputter === 0) return 1
  const wobble = 0.68 + 0.32 * Math.sin(t * 2.3 + i * 1.9) * Math.sin(t * 7.1 + i * 3.7)
  const dropout = Math.sin(t * 0.9 + i * 5.1) > 0.9 ? 0.12 : 1
  return 1 - sputter + sputter * wobble * dropout
}

/**
 * Where Brann is: trapped in the storehouse (null — he speaks through the door), in the mill
 * yard right after the Lantern is saved, then home in Elmbrook once the player has left the
 * mill. Never in two places at once.
 */
export function brannLocation(s: { ending: Ending | null; brannHome: boolean }): 'mill' | 'home' | null {
  if (!s.ending) return null
  return s.brannHome ? 'home' : 'mill'
}
