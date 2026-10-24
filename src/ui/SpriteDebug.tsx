// Developer view (?sprites): every procedurally generated texture, scaled up with crisp pixels.
import { useMemo } from 'react'
import { LOOKS, buildCharacterSheet } from '../gfx/characterSprites'
import { getSpriteAtlas } from '../gfx/propSprites'
import { getSurfaces } from '../gfx/surfaceTextures'
import { buildGroundTexture } from '../gfx/terrainTexture'
import type * as THREE from 'three'

function Img({ tex, label, scale = 4 }: { tex: THREE.Texture; label: string; scale?: number }) {
  const src = useMemo(() => (tex.image as HTMLCanvasElement).toDataURL(), [tex])
  const img = tex.image as HTMLCanvasElement
  return (
    <figure style={{ margin: 0 }}>
      <img src={src} width={img.width * scale} height={img.height * scale} style={{ imageRendering: 'pixelated', background: '#3a4a3a' }} alt={label} />
      <figcaption style={{ fontSize: 12, opacity: 0.7 }}>{label}</figcaption>
    </figure>
  )
}

const SCALE = Number(new URLSearchParams(location.search).get('scale')) || 4

export default function SpriteDebug() {
  const sheets = useMemo(() => Object.entries(LOOKS).map(([k, l]) => [k, buildCharacterSheet(l)] as const), [])
  const atlas = getSpriteAtlas()
  const s = getSurfaces()
  const ground = useMemo(() => buildGroundTexture(), [])
  return (
    <div style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', overflow: 'auto', height: '100%' }}>
      {sheets.map(([k, t]) => (
        <Img key={k} tex={t} label={k} scale={SCALE} />
      ))}
      <Img tex={atlas.texture} label="sprite atlas" scale={Math.max(2, SCALE - 1)} />
      {(['plaster', 'stone', 'planks', 'timber', 'door', 'window', 'crate', 'barrel'] as const).map((k) => (
        <Img key={k} tex={s[k]} label={k} />
      ))}
      <Img tex={s.roof.red} label="roof red" />
      <Img tex={s.roof.slate} label="roof slate" />
      <Img tex={s.roof.moss} label="roof moss" />
      <Img tex={ground} label="ground" scale={1} />
    </div>
  )
}
