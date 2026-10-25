import { create } from 'zustand'
import type { Dir } from './world/layout'
import type { SceneId } from './world/scenes'
import type { AreaId } from './world/interiors'
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
  /** Set when the player is teleported (doors); the camera snaps instead of gliding. */
  cameraCut: false,
  /** Facing to apply to the player on the next frame (after a door). */
  forceFacing: null as Dir | null,
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
  kind: 'talk' | 'read' | 'search'
  name: string
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
  sceneId: 'elmbrook',
  destination: null,
  travel: (destination) => {
    if (get().destination || !get().ready || destination === get().sceneId) return
    set({ destination, dialogue: null, prompt: null, menuOpen: false })
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
  setInventoryOpen: (inventoryOpen) => set({ inventoryOpen, menuOpen: inventoryOpen ? false : get().menuOpen }),
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
