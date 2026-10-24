// Developer mode: freeze/step the simulation, fly a free camera and toggle debug views.
import { create } from 'zustand'
import { runtime } from './state'

export interface DevState {
  open: boolean
  paused: boolean
  freeCam: boolean
  /** In free view, turn sprites toward the camera instead of keeping them flat to the game camera. */
  faceCamera: boolean
  colliders: boolean
  lights: boolean
  shadowFrustum: boolean
  wireframe: boolean
  postFx: boolean
  /** Drive the time of day from the slider instead of the day/night toggle. */
  manualTime: boolean
  time: number
  set: (patch: Partial<Omit<DevState, 'set' | 'toggle' | 'step'>>) => void
  toggle: (key: 'open' | 'paused' | 'freeCam' | 'faceCamera' | 'colliders' | 'lights' | 'shadowFrustum' | 'wireframe' | 'postFx') => void
  /** Advance a paused simulation by one 60 Hz frame. */
  step: () => void
}

export const useDev = create<DevState>((set, get) => ({
  open: false,
  paused: false,
  freeCam: false,
  faceCamera: false,
  colliders: false,
  lights: false,
  shadowFrustum: false,
  wireframe: false,
  postFx: true,
  manualTime: false,
  time: 0,
  set: (patch) => set(patch),
  toggle: (key) => {
    const next = !get()[key]
    // Closing the panel restores normal play.
    if (key === 'open' && !next) {
      set({ open: false, paused: false, freeCam: false, faceCamera: false, wireframe: false, postFx: true, manualTime: false })
      return
    }
    if (key === 'faceCamera' && next) set({ freeCam: true })
    set({ [key]: next } as Partial<DevState>)
  },
  step: () => {
    if (!get().paused) set({ paused: true })
    runtime.stepFrames++
  },
}))
