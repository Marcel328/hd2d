import { create } from 'zustand'
import type { Dir } from './world/layout'
import type { SceneId } from './world/scenes'
import type { AreaId } from './world/interiors'
import { PLAYER_SPAWN } from './world/layout'
import { useBattle } from './battle'
import { useStory } from './story'

/** Per-frame mutable state that must not trigger React renders. */
export const runtime = {
  /** Simulation step for this frame (0 while frozen) and accumulated simulation time. */
  dt: 0,
  time: 0,
  /** Frames to advance while frozen (developer mode "step"). */
  stepFrames: 0,
  /** Animated time of day: 0 = noon, 1 = deep night. */
  tod: 0,
  player: { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, facing: PLAYER_SPAWN.facing as Dir, moving: false },
  /** Interactable currently in reach, if any. */
  focusId: null as string | null,
  /** Where depth of field focuses: the player, or the orbit target in free view. */
  focus: { x: PLAYER_SPAWN.x, y: 0.8, z: PLAYER_SPAWN.z },
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  /** Smoothed GPU time per frame (ms), when timer queries are available. */
  gpuMs: 0,
  /** Set when the player is teleported (doors); the camera snaps instead of gliding. */
  cameraCut: false,
  /** Facing to apply to the player on the next frame (after a door). */
  forceFacing: null as Dir | null,
  /** Resolution multiplier chosen by the adaptive-resolution controller. */
  dprScale: 1,
}

/** A line of dialogue; an object form can change who is speaking ('' = narration). */
export type Line = string | { speaker: string; text: string }

export const lineText = (l: Line) => (typeof l === 'string' ? l : l.text)

export interface Choice {
  id: string
  label: string
  disabled?: boolean
}

/** What an interaction says, and optionally a choice at the end plus what happens after. */
export interface Conversation {
  lines: Line[]
  choices?: Choice[]
  onDone?: (choice: string | null) => void
}

export interface DialogueState {
  sourceId: string
  speaker: string
  lines: Line[]
  index: number
  revealed: number
  choices?: Choice[]
  /** Highlighted choice. */
  choice: number
  onDone?: (choice: string | null) => void
}

export interface Prompt {
  kind: 'talk' | 'read' | 'search'
  name: string
  verb?: string
}

export interface Banner {
  title: string
  subtitle: string
  /** Bumped to replay the banner animation. */
  seq: number
}

interface GameState {
  sceneId: SceneId
  destination: SceneId | null
  travel: (id: SceneId) => void
  enterScene: (id: SceneId) => void
  /** Which part of the loaded scene the player is in (the village itself, or an interior). */
  area: AreaId
  /** Set while fading out toward another area; the swap happens behind the fade. */
  areaTarget: AreaId | null
  goToArea: (area: AreaId) => void
  arriveArea: (area: AreaId) => void
  banner: Banner
  showBanner: (title: string, subtitle: string) => void
  inventoryOpen: boolean
  setInventoryOpen: (v: boolean) => void
  night: boolean
  toggleNight: () => void
  dialogue: DialogueState | null
  visits: Record<string, number>
  openDialogue: (sourceId: string, speaker: string, lines: Line[], extra?: Omit<Conversation, 'lines'>) => void
  /** Reveal the whole line if it is still typing, otherwise go to the next line or close. */
  pressDialogue: () => void
  moveChoice: (delta: number) => void
  pickChoice: (index: number) => void
  revealMore: (chars: number) => void
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  prompt: Prompt | null
  setPrompt: (p: Prompt | null) => void
  /** Shaders compiled and first frame ready. */
  ready: boolean
  setReady: () => void
  dprLabel: string
  setDprLabel: (s: string) => void
}

/** Pointer buttons and keyboard shortcuts share the same screen-ownership rules. */
function menusBlocked(s: Pick<GameState, 'dialogue' | 'ready' | 'destination' | 'areaTarget'>): boolean {
  const story = useStory.getState()
  return !!s.dialogue || !s.ready || !!s.destination || !!s.areaTarget || useBattle.getState().active || story.stage === 'intro' || story.showEnding
}

export const useGame = create<GameState>((set, get) => ({
  sceneId: 'elmbrook',
  destination: null,
  travel: (destination) => {
    if (get().destination || !get().ready || destination === get().sceneId) return
    set({ destination, dialogue: null, prompt: null, menuOpen: false, inventoryOpen: false })
  },
  enterScene: (sceneId) => set({ sceneId, destination: null, ready: false, area: 'outdoor', areaTarget: null }),
  area: 'outdoor',
  areaTarget: null,
  goToArea: (areaTarget) => {
    const s = get()
    if (s.areaTarget || s.destination || !s.ready || areaTarget === s.area) return
    set({ areaTarget, dialogue: null, prompt: null, menuOpen: false, inventoryOpen: false })
  },
  arriveArea: (area) => set({ area, areaTarget: null }),
  banner: { title: 'Elmbrook', subtitle: 'A village at the edge of the Whisperwood', seq: 0 },
  showBanner: (title, subtitle) => set((s) => ({ banner: { title, subtitle, seq: s.banner.seq + 1 } })),
  inventoryOpen: false,
  setInventoryOpen: (inventoryOpen) => {
    const s = get()
    if (inventoryOpen && menusBlocked(s)) return
    set({ inventoryOpen, menuOpen: inventoryOpen ? false : s.menuOpen, prompt: null })
  },
  night: false,
  toggleNight: () => {
    if (!menusBlocked(get())) set((s) => ({ night: !s.night }))
  },
  dialogue: null,
  visits: {},
  openDialogue: (sourceId, speaker, lines, extra = {}) => {
    const firstOpen = extra.choices?.findIndex((c) => !c.disabled) ?? 0
    set({ dialogue: { sourceId, speaker, lines, index: 0, revealed: 0, ...extra, choice: Math.max(0, firstOpen) }, prompt: null, inventoryOpen: false, menuOpen: false })
  },
  pressDialogue: () => {
    const d = get().dialogue
    if (!d) return
    const len = lineText(d.lines[d.index]).length
    if (d.revealed < len) {
      set({ dialogue: { ...d, revealed: len } })
    } else if (d.index + 1 < d.lines.length) {
      set({ dialogue: { ...d, index: d.index + 1, revealed: 0 } })
    } else if (d.choices?.length) {
      get().pickChoice(d.choice)
    } else {
      set((s) => ({ dialogue: null, visits: { ...s.visits, [d.sourceId]: (s.visits[d.sourceId] ?? 0) + 1 } }))
      d.onDone?.(null)
    }
  },
  moveChoice: (delta) => {
    const d = get().dialogue
    if (!d?.choices?.length) return
    const n = d.choices.length
    let i = d.choice
    // Skip disabled options.
    for (let k = 0; k < n; k++) {
      i = (i + delta + n) % n
      if (!d.choices[i].disabled) break
    }
    set({ dialogue: { ...d, choice: i } })
  },
  pickChoice: (index) => {
    const d = get().dialogue
    const c = d?.choices?.[index]
    if (!d || !c || c.disabled) return
    set((s) => ({ dialogue: null, visits: { ...s.visits, [d.sourceId]: (s.visits[d.sourceId] ?? 0) + 1 } }))
    d.onDone?.(c.id)
  },
  revealMore: (chars) => {
    const d = get().dialogue
    if (!d) return
    const len = lineText(d.lines[d.index]).length
    if (d.revealed >= len) return
    set({ dialogue: { ...d, revealed: Math.min(len, d.revealed + chars) } })
  },
  menuOpen: false,
  setMenuOpen: (menuOpen) => {
    const s = get()
    if (menuOpen && menusBlocked(s)) return
    set({ menuOpen, inventoryOpen: menuOpen ? false : s.inventoryOpen, prompt: null })
  },
  prompt: null,
  setPrompt: (prompt) => {
    const cur = get().prompt
    if (cur?.kind === prompt?.kind && cur?.name === prompt?.name && cur?.verb === prompt?.verb) return
    set({ prompt })
  },
  ready: false,
  setReady: () => set({ ready: true }),
  dprLabel: '',
  setDprLabel: (dprLabel) => set({ dprLabel }),
}))
