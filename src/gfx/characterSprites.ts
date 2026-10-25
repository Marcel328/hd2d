// Procedural 16×24 character sprite sheets in the style of 16-bit RPG field sprites.
// Parts are painted into an index buffer, then shaded per part (light from the upper left),
// and finally outlined. Layout: rows = down, left, right, up; columns = FRAMES below.
import * as THREE from 'three'
import { PixelBuffer, hex, ramp, type RGB } from './pixels'
import type { Dir } from '../game/world/layout'

export const FRAME_W = 16
export const FRAME_H = 24
export const FRAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3'] as const
export type FrameName = (typeof FRAMES)[number]
export const DIR_ROWS: Dir[] = ['down', 'left', 'right', 'up']

export interface CharacterLook {
  skin: string
  hair: string
  coat: string
  trim: string
  pants: string
  boots: string
  eyes?: string
  hairStyle: 'short' | 'ponytail' | 'bald'
  scarf?: string
  cape?: string
  robe?: boolean
  dress?: boolean
  apron?: string
  beard?: string
  staff?: boolean
}

export const LOOKS: Record<'player' | 'rowan' | 'mira' | 'brann', CharacterLook> = {
  player: {
    skin: '#f0c49a',
    hair: '#6b3d22',
    coat: '#e7dcc4',
    trim: '#8c5a2b',
    pants: '#41506e',
    boots: '#4a3020',
    hairStyle: 'short',
    scarf: '#c0392b',
    cape: '#2e4a7a',
  },
  rowan: {
    skin: '#e6b48c',
    hair: '#d8d4cc',
    coat: '#6f7d4a',
    trim: '#c9a14a',
    pants: '#5a4a34',
    boots: '#3e2a1c',
    hairStyle: 'bald',
    robe: true,
    beard: '#ebe7df',
    staff: true,
  },
  mira: {
    skin: '#f6cfa8',
    hair: '#d9772f',
    coat: '#4f8a5b',
    trim: '#f2e6c8',
    pants: '#4f8a5b',
    boots: '#7a4a2a',
    hairStyle: 'ponytail',
    dress: true,
    apron: '#f4ecd8',
  },
  // The miller: flour-dusted apron, ginger beard like his daughter's hair.
  brann: {
    skin: '#e9b98f',
    hair: '#b8642a',
    coat: '#7a5a3a',
    trim: '#3e2a1c',
    pants: '#4a3f36',
    boots: '#3a2618',
    hairStyle: 'short',
    beard: '#b8642a',
    apron: '#ece4d2',
  },
}

// Part ids — painting order decides overlap; shading is computed per part.
const enum P {
  None = 0,
  Skin,
  Hair,
  Coat,
  Trim,
  Pants,
  Boots,
  Eye,
  Scarf,
  Cape,
  Apron,
  Beard,
  Staff,
  Arm,
}

class PartBuffer {
  ids = new Uint8Array(FRAME_W * FRAME_H)
  set(x: number, y: number, p: P) {
    if (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H) return
    this.ids[y * FRAME_W + x] = p
  }
  get(x: number, y: number): P {
    if (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H) return P.None
    return this.ids[y * FRAME_W + x]
  }
  rect(x: number, y: number, w: number, h: number, p: P) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, p)
  }
  /** Fill a rect with rounded (clipped) corners. */
  round(x: number, y: number, w: number, h: number, p: P) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1)
        if (!corner) this.set(x + i, y + j, p)
      }
  }
}

type Facing = 'down' | 'up' | 'side'

interface Pose {
  facing: Facing
  bob: number // body offset in px (positive = down)
  legPhase: number // -1, 0, +1 walking stride
  armPhase: number
}

function paint(look: CharacterLook, pose: Pose): PartBuffer {
  const b = new PartBuffer()
  const { facing, bob, legPhase, armPhase } = pose
  const y0 = bob // upper body vertical offset

  // ---- legs & boots (rows 18..23) ----
  if (!look.robe && !look.dress) {
    if (facing === 'side') {
      // Stride: front leg forward (+x), back leg backward.
      const s = legPhase
      b.rect(6 - s, 18, 2, 4, P.Pants)
      b.rect(8 + s, 18, 2, 4, P.Pants)
      b.rect(5 - s, 22, 3, 2, P.Boots)
      b.rect(8 + s, 22, 3, 2, P.Boots)
      if (s !== 0) {
        b.set(6 - s, 21, P.Boots)
      }
    } else {
      const lift = (k: number) => (legPhase === k ? 1 : 0)
      b.rect(5, 18, 3, 4 - lift(-1), P.Pants)
      b.rect(8, 18, 3, 4 - lift(1), P.Pants)
      b.rect(5, 22 - lift(-1), 3, 2, P.Boots)
      b.rect(8, 22 - lift(1), 3, 2, P.Boots)
    }
  } else {
    // Robe / dress hem with feet peeking out.
    if (facing === 'side') {
      b.rect(5 - legPhase, 22, 3, 2, P.Boots)
      b.rect(8 + legPhase, 22, 3, 2, P.Boots)
    } else {
      b.rect(5, 22 - (legPhase === -1 ? 1 : 0), 3, 2, P.Boots)
      b.rect(8, 22 - (legPhase === 1 ? 1 : 0), 3, 2, P.Boots)
    }
  }

  // ---- cape behind the body (seen from the back it is painted last, over the torso) ----
  if (look.cape && facing !== 'up') {
    if (facing === 'side') b.rect(3, 11 + y0, 4, 8 + (legPhase !== 0 ? 0 : 1), P.Cape)
    else {
      b.rect(3, 12 + y0, 1, 7, P.Cape)
      b.rect(12, 12 + y0, 1, 7, P.Cape)
    }
  }

  // ---- torso ----
  if (look.robe || look.dress) {
    // Trapezoid down to the hem.
    for (let y = 11; y <= 21; y++) {
      const flare = Math.floor((y - 11) / 4)
      const x0 = (facing === 'side' ? 5 : 4) - flare
      const w = (facing === 'side' ? 6 : 8) + flare * 2
      b.rect(x0, y + (y < 18 ? y0 : 0), w, 1, P.Coat)
    }
    if (look.robe) {
      // Belt sash and trim at the hem.
      b.rect(facing === 'side' ? 5 : 4, 15 + y0, facing === 'side' ? 6 : 8, 1, P.Trim)
      if (facing === 'down') b.rect(7, 16 + y0, 2, 5, P.Trim)
    }
    if (look.apron && facing !== 'up') {
      if (facing === 'down') b.rect(5, 15 + y0, 6, 6, P.Apron)
      else b.rect(8, 15 + y0, 3, 6, P.Apron)
    }
  } else {
    const x0 = facing === 'side' ? 5 : 4
    const w = facing === 'side' ? 6 : 8
    b.rect(x0, 11 + y0, w, 7, P.Coat)
    b.rect(x0, 16 + y0, w, 1, P.Trim) // belt
    if (facing === 'down') b.set(7, 16 + y0, P.Boots) // buckle
    // A work apron over the tunic, down to the knees.
    if (look.apron && facing === 'down') b.rect(5, 13 + y0, 6, 7, P.Apron)
    else if (look.apron && facing === 'side') b.rect(8, 13 + y0, 3, 7, P.Apron)
  }

  // ---- arms ----
  if (facing === 'side') {
    const swing = armPhase
    b.rect(7 + swing, 12 + y0, 2, 4, P.Arm)
    b.rect(7 + swing, 16 + y0, 2, 1, P.Skin)
  } else {
    const l = armPhase === 1 ? 1 : 0
    const r = armPhase === -1 ? 1 : 0
    b.rect(3, 12 + y0 - l, 1, 4, P.Arm)
    b.rect(12, 12 + y0 - r, 1, 4, P.Arm)
    b.set(3, 16 + y0 - l, P.Skin)
    b.set(12, 16 + y0 - r, P.Skin)
  }

  if (look.cape && facing === 'up') {
    b.rect(4, 11 + y0, 8, 8, P.Cape)
    b.rect(3, 12 + y0, 10, 7, P.Cape)
    b.rect(5, 19 + y0, 6, 1, P.Cape)
  }

  // ---- staff (held in the right hand, viewer's left when facing down) ----
  if (look.staff) {
    const sx = facing === 'up' ? 13 : facing === 'side' ? 11 : 2
    for (let y = 5; y <= 23; y++) b.set(sx, y + (y < 18 ? y0 : 0), P.Staff)
    b.set(sx - 1, 5 + y0, P.Staff)
    b.set(sx + 1, 5 + y0, P.Staff)
    b.set(sx, 4 + y0, P.Staff)
  }

  // ---- head ----
  const hy = 2 + y0
  b.round(4, hy, 8, 9, P.Skin)

  if (facing === 'down') {
    // eyes
    b.set(6, hy + 5, P.Eye)
    b.set(9, hy + 5, P.Eye)
    b.set(6, hy + 6, P.Eye)
    b.set(9, hy + 6, P.Eye)
  } else if (facing === 'side') {
    b.set(10, hy + 5, P.Eye)
    b.set(10, hy + 6, P.Eye)
    b.set(12, hy + 6, P.Skin) // nose
  }

  // ---- hair ----
  switch (look.hairStyle) {
    case 'short':
      if (facing === 'up') {
        b.round(4, hy - 1, 8, 9, P.Hair)
      } else if (facing === 'down') {
        b.round(4, hy - 1, 8, 4, P.Hair)
        b.rect(4, hy + 2, 1, 4, P.Hair)
        b.rect(11, hy + 2, 1, 4, P.Hair)
        b.rect(5, hy + 3, 2, 1, P.Hair) // fringe
        b.set(9, hy + 3, P.Hair)
      } else {
        b.round(4, hy - 1, 8, 4, P.Hair)
        b.rect(4, hy + 2, 4, 5, P.Hair)
        b.set(11, hy + 3, P.Hair)
      }
      break
    case 'ponytail':
      if (facing === 'up') {
        b.round(4, hy - 1, 8, 9, P.Hair)
        b.rect(7, hy + 7, 2, 5, P.Hair)
      } else if (facing === 'down') {
        b.round(4, hy - 1, 8, 4, P.Hair)
        b.rect(4, hy + 2, 1, 6, P.Hair)
        b.rect(11, hy + 2, 1, 6, P.Hair)
        b.rect(5, hy + 3, 3, 1, P.Hair)
      } else {
        b.round(4, hy - 1, 8, 4, P.Hair)
        b.rect(4, hy + 2, 3, 5, P.Hair)
        b.rect(2, hy + 3, 2, 6, P.Hair) // tail
        b.set(11, hy + 3, P.Hair)
      }
      break
    case 'bald':
      if (facing === 'up') {
        b.rect(4, hy + 4, 8, 3, P.Hair)
      } else if (facing === 'down') {
        b.rect(4, hy + 3, 1, 3, P.Hair)
        b.rect(11, hy + 3, 1, 3, P.Hair)
        // bushy brows
        b.rect(5, hy + 4, 2, 1, P.Hair)
        b.rect(9, hy + 4, 2, 1, P.Hair)
      } else {
        b.rect(4, hy + 3, 3, 4, P.Hair)
        b.rect(9, hy + 4, 2, 1, P.Hair)
      }
      break
  }

  // ---- beard ----
  if (look.beard && facing !== 'up') {
    if (facing === 'down') {
      b.rect(5, hy + 7, 6, 2, P.Beard)
      b.rect(6, hy + 9, 4, 2, P.Beard)
      b.rect(7, hy + 11, 2, 1, P.Beard)
    } else {
      b.rect(8, hy + 7, 4, 2, P.Beard)
      b.rect(9, hy + 9, 2, 2, P.Beard)
    }
  }

  // ---- scarf ----
  if (look.scarf) {
    if (facing === 'side') {
      b.rect(5, 11 + y0, 6, 2, P.Scarf)
      b.rect(3 - (legPhase !== 0 ? 1 : 0), 12 + y0, 2, 2, P.Scarf) // trailing tail
    } else {
      b.rect(4, 11 + y0, 8, 2, P.Scarf)
      if (facing === 'down') b.rect(9, 13 + y0, 2, 2, P.Scarf)
    }
  }

  return b
}

interface PartColors {
  base: RGB
  light: RGB
  shade: RGB
}

function colorsFor(look: CharacterLook): Record<number, PartColors> {
  const c = (h: string): PartColors => ({ base: hex(h), light: ramp(h, 1), shade: ramp(h, -1.4) })
  return {
    [P.Skin]: c(look.skin),
    [P.Hair]: c(look.hair),
    [P.Coat]: c(look.coat),
    [P.Arm]: c(look.coat),
    [P.Trim]: c(look.trim),
    [P.Pants]: c(look.pants),
    [P.Boots]: c(look.boots),
    [P.Eye]: { base: hex(look.eyes ?? '#2a1c24'), light: hex(look.eyes ?? '#2a1c24'), shade: hex('#1a1018') },
    [P.Scarf]: c(look.scarf ?? '#000000'),
    [P.Cape]: c(look.cape ?? '#000000'),
    [P.Apron]: c(look.apron ?? '#ffffff'),
    [P.Beard]: c(look.beard ?? '#ffffff'),
    [P.Staff]: c('#7a5230'),
  }
}

function render(parts: PartBuffer, look: CharacterLook): PixelBuffer {
  const out = new PixelBuffer(FRAME_W, FRAME_H)
  const pal = colorsFor(look)
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const p = parts.get(x, y)
      if (p === P.None) continue
      const cols = pal[p]
      // Light comes from the upper left: edges facing right/down are shaded.
      const edgeR = parts.get(x + 1, y) !== p
      const edgeB = parts.get(x, y + 1) !== p
      const edgeL = parts.get(x - 1, y) !== p
      const edgeT = parts.get(x, y - 1) !== p
      let col = cols.base
      if (p === P.Arm && parts.get(x - 1, y) === P.Coat) col = cols.shade // separate arm from torso
      else if (edgeR || (edgeB && p !== P.Skin)) col = cols.shade
      else if ((edgeL || edgeT) && p !== P.Eye) col = cols.light
      out.set(x, y, col)
    }
  out.outline(hex('#21161c'))
  return out
}

function poseFor(dir: Dir, frame: FrameName): Pose {
  const facing: Facing = dir === 'left' || dir === 'right' ? 'side' : dir
  switch (frame) {
    case 'idle0':
      return { facing, bob: 0, legPhase: 0, armPhase: 0 }
    case 'idle1':
      return { facing, bob: 1, legPhase: 0, armPhase: 0 }
    case 'walk0':
      return { facing, bob: 1, legPhase: -1, armPhase: 1 }
    case 'walk1':
      return { facing, bob: 0, legPhase: 0, armPhase: 0 }
    case 'walk2':
      return { facing, bob: 1, legPhase: 1, armPhase: -1 }
    case 'walk3':
      return { facing, bob: 0, legPhase: 0, armPhase: 0 }
  }
}

/** Build a sheet with 6 columns (FRAMES) × 4 rows (DIR_ROWS). Side views face right; left is mirrored. */
export function buildCharacterSheet(look: CharacterLook): THREE.CanvasTexture {
  const sheet = new PixelBuffer(FRAME_W * FRAMES.length, FRAME_H * DIR_ROWS.length)
  DIR_ROWS.forEach((dir, row) => {
    FRAMES.forEach((frame, col) => {
      const pose = poseFor(dir, frame)
      const sprite = render(paint(look, pose), look)
      sheet.blit(sprite, col * FRAME_W, row * FRAME_H, dir === 'left')
    })
  })
  const tex = new THREE.CanvasTexture(sheet.toCanvas())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.repeat.set(1 / FRAMES.length, 1 / DIR_ROWS.length)
  return tex
}

export function frameOffset(tex: THREE.Texture, dir: Dir, frame: number) {
  const row = DIR_ROWS.indexOf(dir)
  tex.offset.set(frame / FRAMES.length, 1 - (row + 1) / DIR_ROWS.length)
}
