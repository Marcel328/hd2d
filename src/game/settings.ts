import { useMemo } from 'react'
import { create } from 'zustand'

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'

export interface QualityConfig {
  /** Upper bound for devicePixelRatio. */
  dprCap: number
  shadows: boolean
  shadowMapSize: number
  shadowRadius: number
  bloom: boolean
  dof: boolean
  msaa: number
  /** 0..1 multiplier for ambient particles. */
  particles: number
  /** Number of real point lights shared among all lamps (nearest to the player win). */
  lightPool: number
  /** 0..1 multiplier for grass tufts and flowers. */
  foliage: number
  anisotropy: number
  lightShafts: boolean
}

export const PRESETS: Record<QualityLevel, QualityConfig> = {
  low: {
    dprCap: 1,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 1,
    bloom: false,
    dof: false,
    msaa: 0,
    particles: 0.3,
    lightPool: 2,
    foliage: 0.4,
    anisotropy: 1,
    lightShafts: false,
  },
  medium: {
    dprCap: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 2,
    bloom: true,
    dof: true,
    msaa: 0,
    particles: 0.6,
    lightPool: 4,
    foliage: 0.7,
    anisotropy: 4,
    lightShafts: true,
  },
  high: {
    dprCap: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 3,
    bloom: true,
    dof: true,
    msaa: 4,
    particles: 1,
    lightPool: 6,
    foliage: 1,
    anisotropy: 8,
    lightShafts: true,
  },
  ultra: {
    dprCap: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowRadius: 4,
    bloom: true,
    dof: true,
    msaa: 8,
    particles: 1,
    lightPool: 8,
    foliage: 1,
    anisotropy: 16,
    lightShafts: true,
  },
}

export type Toggle = 'bloom' | 'dof' | 'shadows' | 'lightShafts'

interface SettingsState {
  quality: QualityLevel
  overrides: Partial<Pick<QualityConfig, Toggle>>
  adaptive: boolean
  showFps: boolean
  touchControls: boolean
  setQuality: (q: QualityLevel) => void
  setToggle: (k: Toggle, v: boolean) => void
  setAdaptive: (v: boolean) => void
  setShowFps: (v: boolean) => void
  setTouchControls: (v: boolean) => void
}

const STORAGE_KEY = 'hd2d-village-settings'

const hasTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

function guessQuality(): QualityLevel {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  if (mobile) return 'low'
  return (navigator.hardwareConcurrency ?? 4) >= 8 ? 'high' : 'medium'
}

function load(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<SettingsState>) : {}
  } catch {
    return {}
  }
}

function save(s: SettingsState) {
  try {
    const { quality, overrides, adaptive, showFps, touchControls } = s
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ quality, overrides, adaptive, showFps, touchControls }))
  } catch {
    // Storage may be unavailable (private mode); settings then last for the session only.
  }
}

const saved = load()

export const useSettings = create<SettingsState>((set) => ({
  quality: saved.quality && saved.quality in PRESETS ? saved.quality : guessQuality(),
  overrides: saved.overrides ?? {},
  adaptive: saved.adaptive ?? true,
  showFps: saved.showFps ?? false,
  touchControls: saved.touchControls ?? hasTouch(),
  setQuality: (quality) => set({ quality, overrides: {} }),
  setToggle: (k, v) => set((s) => ({ overrides: { ...s.overrides, [k]: v } })),
  setAdaptive: (adaptive) => set({ adaptive }),
  setShowFps: (showFps) => set({ showFps }),
  setTouchControls: (touchControls) => set({ touchControls }),
}))

useSettings.subscribe(save)

export function resolveQuality(s: Pick<SettingsState, 'quality' | 'overrides'>): QualityConfig {
  return { ...PRESETS[s.quality], ...s.overrides }
}

export function useQuality(): QualityConfig {
  const quality = useSettings((s) => s.quality)
  const overrides = useSettings((s) => s.overrides)
  return useMemo(() => resolveQuality({ quality, overrides }), [quality, overrides])
}
