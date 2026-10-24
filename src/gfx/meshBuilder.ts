// Accumulates boxes/quads/triangles into a single BufferGeometry with world-space UVs, so
// pixel textures keep a constant texel density (and adjacent pieces line up) without UV work.
import * as THREE from 'three'

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

export type FaceName = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'

export class MeshBuilder {
  private pos: number[] = []
  private nor: number[] = []
  private uv: number[] = []
  private idx: number[] = []

  constructor(
    /** World units per texture repeat. */
    readonly uvScale = 1,
  ) {}

  get empty() {
    return this.idx.length === 0
  }

  private vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number) {
    this.pos.push(p.x, p.y, p.z)
    this.nor.push(n.x, n.y, n.z)
    this.uv.push(u, v)
    return this.pos.length / 3 - 1
  }

  /** Tangent frame for UVs: vertical faces keep v pointing up, others keep u pointing along +X. */
  private frame(n: THREE.Vector3, axes: THREE.Vector3[]) {
    const t1 = new THREE.Vector3()
    const t2 = new THREE.Vector3()
    if (Math.abs(n.y) < 0.5) {
      let best = axes[0]
      for (const a of axes) if (Math.abs(a.y) > Math.abs(best.y)) best = a
      t2.copy(best).multiplyScalar(Math.sign(best.y) || 1)
      if (Math.abs(t2.dot(n)) > 0.99) t2.copy(Y)
      t1.crossVectors(t2, n).normalize()
      t2.crossVectors(n, t1).normalize()
    } else {
      let best = axes[0]
      for (const a of axes) if (Math.abs(a.x) > Math.abs(best.x)) best = a
      t1.copy(best).multiplyScalar(Math.sign(best.x) || 1)
      t1.addScaledVector(n, -t1.dot(n)).normalize()
      t2.crossVectors(n, t1).normalize()
    }
    return [t1, t2]
  }

  /** Planar polygon (convex, CCW seen from the normal side). */
  polygon(points: THREE.Vector3[], n: THREE.Vector3, uvOffset: [number, number] = [0, 0]) {
    const [t1, t2] = this.frame(n, [X, Y, Z])
    const base = points.map((p) =>
      this.vert(p, n, p.dot(t1) / this.uvScale + uvOffset[0], p.dot(t2) / this.uvScale + uvOffset[1]),
    )
    for (let i = 1; i < base.length - 1; i++) this.idx.push(base[0], base[i], base[i + 1])
  }

  /**
   * Oriented box. `axes` must be orthonormal and right-handed; `half` are half-extents along them.
   * Faces listed in `skip` (named by axes[0..2] = x/y/z) are omitted.
   */
  orientedBox(center: THREE.Vector3, axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3], half: [number, number, number], skip: FaceName[] = []) {
    const names: FaceName[][] = [
      ['nx', 'px'],
      ['ny', 'py'],
      ['nz', 'pz'],
    ]
    for (let k = 0; k < 3; k++) {
      for (const s of [-1, 1]) {
        if (skip.includes(names[k][s > 0 ? 1 : 0])) continue
        const n = axes[k].clone().multiplyScalar(s)
        const [t1, t2] = this.frame(n, axes)
        const h1 = half[axes.findIndex((a) => Math.abs(a.dot(t1)) > 0.99)] ?? 0
        const h2 = half[axes.findIndex((a) => Math.abs(a.dot(t2)) > 0.99)] ?? 0
        const c = center.clone().addScaledVector(n, half[k])
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([a, b]) => c.clone().addScaledVector(t1, a * h1).addScaledVector(t2, b * h2))
        this.polygon(corners, n)
      }
    }
  }

  box(min: THREE.Vector3 | [number, number, number], max: THREE.Vector3 | [number, number, number], skip: FaceName[] = []) {
    const a = Array.isArray(min) ? new THREE.Vector3(...min) : min
    const b = Array.isArray(max) ? new THREE.Vector3(...max) : max
    const center = a.clone().add(b).multiplyScalar(0.5)
    const half: [number, number, number] = [(b.x - a.x) / 2, (b.y - a.y) / 2, (b.z - a.z) / 2]
    this.orientedBox(center, [X, Y, Z], half, skip)
  }

  /** Axis-aligned rectangle facing +Z / −Z / ±X with explicit UVs (0..1 over the rect). */
  decal(center: THREE.Vector3, w: number, h: number, normal: THREE.Vector3) {
    const n = normal.clone().normalize()
    const right = new THREE.Vector3().crossVectors(Y, n).normalize()
    const corners = [
      [-1, -1, 0, 0],
      [1, -1, 1, 0],
      [1, 1, 1, 1],
      [-1, 1, 0, 1],
    ]
    const ids = corners.map(([a, b, u, v]) =>
      this.vert(center.clone().addScaledVector(right, (a * w) / 2).addScaledVector(Y, (b * h) / 2), n, u, v),
    )
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3])
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

export const AXES = { X, Y, Z }
