// Small composable onBeforeCompile patches for built-in three.js materials.
//  - occlusion: dithered see-through hole wherever geometry sits between the camera and the player
//  - atlasSprite: per-instance atlas rect + wind sway for instanced billboards
import * as THREE from 'three'

type Shader = THREE.WebGLProgramParametersWithUniforms

export interface Patch {
  key: string
  apply: (shader: Shader) => void
}

/** Shared uniforms; updated once per frame by the scene. */
export const sharedUniforms = {
  uTime: { value: 0 },
  /** xy: player position in drawing-buffer pixels, z: player view-space depth */
  uOccScreen: { value: new THREE.Vector3(-9999, -9999, 0) },
  uOccRadius: { value: 120 },
  uOccStrength: { value: 1 },
  /** Billboard yaw (radians). 0 = facing the game camera; the developer free view may turn sprites. */
  uYaw: { value: 0 },
}

export function patchMaterial<T extends THREE.Material>(material: T, patches: Patch[]): T {
  const key = patches.map((p) => p.key).join('|')
  material.onBeforeCompile = (shader) => {
    for (const p of patches) p.apply(shader)
  }
  material.customProgramCacheKey = () => key
  return material
}

const BAYER = /* glsl */ `
float occBayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
`

export const occlusionPatch: Patch = {
  key: 'occ',
  apply(shader) {
    shader.uniforms.uOccScreen = sharedUniforms.uOccScreen
    shader.uniforms.uOccRadius = sharedUniforms.uOccRadius
    shader.uniforms.uOccStrength = sharedUniforms.uOccStrength
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uOccScreen;
uniform float uOccRadius;
uniform float uOccStrength;
${BAYER}
void main() {`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
{
  // Elliptical hole around the player, only for fragments nearer to the camera than the player.
  vec2 d = (gl_FragCoord.xy - uOccScreen.xy) / vec2(1.0, 1.35);
  float r = length(d) / uOccRadius;
  float inFront = step(vViewPosition.z, uOccScreen.z - 0.9);
  float fade = (1.0 - smoothstep(0.55, 1.0, r)) * inFront * uOccStrength;
  if (fade > 0.0 && occBayer4(gl_FragCoord.xy) < fade * 0.88) discard;
}`,
      )
  },
}

/**
 * Instanced billboard from a sprite atlas: instance attribute `aRect` = (u, v, su, sv),
 * `aSway` = wind sway amplitude in local units. Also used by the matching depth material
 * so cast shadows use the correct sprite.
 */
export const atlasSpritePatch: Patch = {
  key: 'atlas',
  apply(shader) {
    shader.uniforms.uTime = sharedUniforms.uTime
    shader.uniforms.uYaw = sharedUniforms.uYaw
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute vec4 aRect;
attribute float aSway;
uniform float uTime;
uniform float uYaw;
void main() {`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
objectNormal = vec3(objectNormal.z * sin(uYaw), objectNormal.y, objectNormal.z * cos(uYaw));`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = aRect.xy + uv * aRect.zw;
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float w = sin(uTime * 1.6 + ip.x * 0.7 + ip.z * 1.3) + 0.5 * sin(uTime * 2.7 + ip.x * 1.9);
  transformed.x += w * aSway * uv.y * uv.y;
  // Turn the card about its vertical axis (only non-zero in the developer free view).
  transformed = vec3(transformed.x * cos(uYaw), transformed.y, -transformed.x * sin(uYaw));
}`,
      )
  },
}

/**
 * Upright quad with its pivot at the bottom centre. Normals lean toward the sky and camera so
 * flat sprites pick up sun, sky and lamp light like the ground around them.
 */
export function billboardGeometry(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h)
  g.translate(0, h / 2, 0)
  const n = g.attributes.normal as THREE.BufferAttribute
  const v = new THREE.Vector3(0, 0.72, 0.69).normalize()
  for (let i = 0; i < n.count; i++) n.setXYZ(i, v.x, v.y, v.z)
  return g
}
