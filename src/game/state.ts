import { create } from 'zustand'
import type { Dir } from './world/layout'
import { PLAYER_SPAWN } from './world/layout'

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
  /** Resolution multiplier chosen by the adaptive-resolution controller. */
  dprScale: 1,
}

export interface DialogueState {
  sourceId: string
  speaker: string
  lines: string[]
  index: number
  revealed: number
}

export interface Prompt {
  kind: 'talk' | 'read'
  name: string
}

interface GameState {
  night: boolean
  toggleNight: () => void
  dialogue: DialogueState | null
  visits: Record<string, number>
  openDialogue: (sourceId: string, speaker: string, lines: string[]) => void
  /** Reveal the whole line if it is still typing, otherwise go to the next line or close. */
  pressDialogue: () => void
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

export const useGame = create<GameState>((set, get) => ({
  night: false,
  toggleNight: () => set((s) => ({ night: !s.night })),
  dialogue: null,
  visits: {},
  openDialogue: (sourceId, speaker, lines) =>
    set({ dialogue: { sourceId, speaker, lines, index: 0, revealed: 0 }, prompt: null }),
  pressDialogue: () => {
    const d = get().dialogue
    if (!d) return
    const line = d.lines[d.index]
    if (d.revealed < line.length) {
      set({ dialogue: { ...d, revealed: line.length } })
    } else if (d.index + 1 < d.lines.length) {
      set({ dialogue: { ...d, index: d.index + 1, revealed: 0 } })
    } else {
      set((s) => ({ dialogue: null, visits: { ...s.visits, [d.sourceId]: (s.visits[d.sourceId] ?? 0) + 1 } }))
    }
  },
  revealMore: (chars) => {
    const d = get().dialogue
    if (!d) return
    const len = d.lines[d.index].length
    if (d.revealed >= len) return
    set({ dialogue: { ...d, revealed: Math.min(len, d.revealed + chars) } })
  },
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  prompt: null,
  setPrompt: (prompt) => {
    const cur = get().prompt
    if (cur?.kind === prompt?.kind && cur?.name === prompt?.name) return
    set({ prompt })
  },
  ready: false,
  setReady: () => set({ ready: true }),
  dprLabel: '',
  setDprLabel: (dprLabel) => set({ dprLabel }),
}))
