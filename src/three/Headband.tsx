import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js'
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js'
import { makeClothTextures, makePlateTextures, makeSteelTextures } from './textures'
import { useDragRotation } from './common'
import { frame, useStore } from '../store'

const R = 1 // radius of the cloth loop
const BAND_H = 0.6
const BAND_T = 0.024
const PLATE_W = 1.34
const PLATE_H = 0.5
const PLATE_D = 0.03
const BEV = 0.012
const RP = R + BAND_T / 2 + PLATE_D / 2 + BEV + 0.003 // radius the plate is bent around
const PLATE_HALF_ANGLE = PLATE_W / 2 / RP

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A bevelled steel slab, finely tessellated and then wrapped around the brow. */
function makePlateGeometry() {
  const w = PLATE_W / 2
  const h = PLATE_H / 2
  const cr = 0.07
  const shape = new THREE.Shape()
  shape.moveTo(-w + cr, -h)
  shape.lineTo(w - cr, -h)
  shape.quadraticCurveTo(w, -h, w, -h + cr)
  shape.lineTo(w, h - cr)
  shape.quadraticCurveTo(w, h, w - cr, h)
  shape.lineTo(-w + cr, h)
  shape.quadraticCurveTo(-w, h, -w, h - cr)
  shape.lineTo(-w, -h + cr)
  shape.quadraticCurveTo(-w, -h, -w + cr, -h)

  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE_D,
    bevelEnabled: true,
    bevelThickness: BEV,
    bevelSize: BEV,
    bevelSegments: 4,
    curveSegments: 10,
    steps: 1,
  })
  g.translate(0, 0, -PLATE_D / 2)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = new TessellateModifier(0.03, 10).modify(mergeVertices(g, 1e-4))
  g = mergeVertices(g, 1e-4)
  g.computeVertexNormals()

  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  const fullW = PLATE_W + BEV * 2
  const fullH = PLATE_H + BEV * 2
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    uv[i * 2] = (x + fullW / 2) / fullW
    uv[i * 2 + 1] = (y + fullH / 2) / fullH
    const a = x / RP
    const s = Math.sin(a)
    const c = Math.cos(a)
    pos.setXYZ(i, s * (RP + z), y, c * (RP + z))
    const nx = nor.getX(i)
    const nz = nor.getZ(i)
    nor.setX(i, nx * c + nz * s)
    nor.setZ(i, -nx * s + nz * c)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** The cloth loop: a thin band with gathered folds wherever the plate is not holding it flat. */
function makeBandGeometry() {
  const g = new ParametricGeometry(
    (u, v, target) => {
      const phi = u * Math.PI * 2 // 0 at the front
      const a = v * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const e = 0.3
      const dr = Math.sign(ca) * Math.pow(Math.abs(ca), e) * (BAND_T / 2)
      let dy = Math.sign(sa) * Math.pow(Math.abs(sa), e) * (BAND_H / 2)
      const front = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)))
      const free = sstep(PLATE_HALF_ANGLE * 0.9, PLATE_HALF_ANGLE * 1.6, front)
      const wrinkle =
        free *
        (0.014 * Math.sin(phi * 3 + 0.7) +
          0.008 * Math.sin(phi * 9 + dy * 14) +
          0.005 * Math.sin(phi * 21 + 1.3 + dy * 30))
      // The band gathers toward the knot at the back.
      const gather = sstep(Math.PI * 0.55, Math.PI, front)
      dy *= 1 - gather * 0.42 - free * 0.05 * (0.5 + 0.5 * Math.sin(phi * 5))
      const lift = free * (0.02 * Math.sin(phi * 2 + 0.4) + 0.008 * Math.sin(phi * 7))
      const rr = R + dr + wrinkle + gather * 0.012 * Math.sin(dy * 40)
      target.set(Math.sin(phi) * rr, dy + lift, Math.cos(phi) * rr)
    },
    260,
    28,
  )
  const uv = g.attributes.uv as THREE.BufferAttribute
  // Remap v so the weave runs evenly over the outer face instead of around the cross-section.
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i) / BAND_H + 0.5)
  return g
}

function makeKnotGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Lumpy, creased — a tied knot rather than a ball.
    const k = 1 + 0.16 * Math.sin(y * 7 + x * 3) * Math.cos(z * 5) + 0.1 * Math.sin(x * 11 + y * 2)
    pos.setXYZ(i, x * 0.17 * k, y * 0.2 * k, z * 0.12 * k)
  }
  g.computeVertexNormals()
  return g
}

const TAIL_L = 60
const TAIL_W = 6

interface TailSpec {
  root: THREE.Vector3
  dir: THREE.Vector3
  length: number
  width: number
  phase: number
  amp: number
}

function writeTail(geo: THREE.BufferGeometry, spec: TailSpec, t: number, scratch: { side: THREE.Vector3; up: THREE.Vector3 }) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const { root, dir, length, width, phase, amp } = spec
  const up = scratch.up.set(0, 1, 0)
  const side = scratch.side.crossVectors(dir, up).normalize()
  for (let iy = 0; iy <= TAIL_W; iy++) {
    const w = iy / TAIL_W - 0.5
    for (let ix = 0; ix <= TAIL_L; ix++) {
      const s = ix / TAIL_L
      const A = amp * Math.pow(s, 1.25)
      const lateral =
        A * Math.sin(s * 7.5 - t * 3.1 + phase) + A * 0.45 * Math.sin(s * 15 - t * 5.2 + phase * 2.1)
      const vertical = A * 0.7 * Math.sin(s * 5.5 - t * 2.4 + phase + 1.7) - 0.34 * s * s * length
      const twist = (0.25 + 0.9 * s) * Math.sin(s * 4.2 - t * 1.9 + phase * 1.3)
      const cw = Math.cos(twist)
      const sw = Math.sin(twist)
      const ww = w * width * (1 - 0.12 * s)
      const d = s * length
      pos.setXYZ(
        iy * (TAIL_L + 1) + ix,
        root.x + dir.x * d + side.x * (lateral + sw * ww),
        root.y + dir.y * d + vertical + cw * ww,
        root.z + dir.z * d + side.z * (lateral + sw * ww),
      )
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

export function Headband() {
  const plateTex = useMemo(makePlateTextures, [])
  const steelTex = useMemo(() => makeSteelTextures(3), [])
  const bandTex = useMemo(() => makeClothTextures([64, 6]), [])
  const tailTex = useMemo(() => makeClothTextures([26, 5]), [])
  const plateGeo = useMemo(makePlateGeometry, [])
  const bandGeo = useMemo(makeBandGeometry, [])
  const knotGeo = useMemo(makeKnotGeometry, [])

  const tails = useMemo(() => {
    const specs: TailSpec[] = [
      { root: new THREE.Vector3(0.05, 0.03, -R - 0.1), dir: new THREE.Vector3(0.5, 0.2, -0.84).normalize(), length: 2.5, width: 0.4, phase: 0, amp: 0.2 },
      { root: new THREE.Vector3(-0.02, -0.04, -R - 0.1), dir: new THREE.Vector3(0.36, 0.02, -0.93).normalize(), length: 2.1, width: 0.38, phase: 2.4, amp: 0.24 },
    ]
    return specs.map((spec) => ({ spec, geo: new THREE.PlaneGeometry(1, 1, TAIL_L, TAIL_W) }))
  }, [])
  const scratch = useMemo(() => ({ side: new THREE.Vector3(), up: new THREE.Vector3() }), [])

  const plateMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        ...plateTex,
        metalness: 1,
        roughness: 1,
        normalScale: new THREE.Vector2(1, 1),
        anisotropy: 0.5,
        anisotropyRotation: Math.PI / 2,
        envMapIntensity: 1.25,
      }),
    [plateTex],
  )
  const rivetMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#b9bdc4',
        metalness: 1,
        roughness: 0.55,
        roughnessMap: steelTex.roughnessMap,
        normalMap: steelTex.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
      }),
    [steelTex],
  )
  const clothProps = {
    color: '#121a33',
    roughness: 1,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: '#3a4d86',
    normalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 0.9,
  } as const

  const rivets = useMemo(() => {
    const out: { position: [number, number, number]; rotation: [number, number, number] }[] = []
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const a = (sx * (PLATE_W / 2 - 0.085)) / RP
        const rr = RP + PLATE_D / 2 + BEV * 0.6
        out.push({ position: [Math.sin(a) * rr, sy * 0.125, Math.cos(a) * rr], rotation: [0, a, 0] })
      }
    return out
  }, [])

  const float = useRef<THREE.Group>(null!)
  const { rot, bind } = useDragRotation()

  useFrame((state) => {
    // Rewriting the cloth is the costly part: skip it whenever this station is not the one on screen.
    if (useStore.getState().view !== 'journey' || Math.abs(frame.f - 1) > 0.97) return
    const t = state.clock.elapsedTime
    for (const { spec, geo } of tails) writeTail(geo, spec, t, scratch)
    const g = float.current
    g.position.y = Math.sin(t * 0.7) * 0.05
    g.rotation.set(0.1 + Math.sin(t * 0.5) * 0.025 + rot.current.x, -0.3 + Math.sin(t * 0.33) * 0.06 + rot.current.y, -0.07 + Math.sin(t * 0.41) * 0.02)
  })

  return (
    <group ref={float}>
      <mesh geometry={plateGeo} material={plateMat} castShadow receiveShadow />
      {rivets.map((r, i) => (
        <mesh key={i} position={r.position} rotation={r.rotation} scale={[1, 1, 0.42]} material={rivetMat} castShadow>
          <sphereGeometry args={[0.03, 24, 16]} />
        </mesh>
      ))}

      <mesh geometry={bandGeo} castShadow receiveShadow>
        <meshPhysicalMaterial {...clothProps} {...bandTex} />
      </mesh>
      <mesh geometry={knotGeo} position={[0.01, 0, -R - 0.05]} castShadow receiveShadow>
        <meshPhysicalMaterial {...clothProps} {...tailTex} />
      </mesh>
      {tails.map(({ geo }, i) => (
        <mesh key={i} geometry={geo} castShadow receiveShadow frustumCulled={false}>
          <meshPhysicalMaterial {...clothProps} {...tailTex} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Generous invisible grab volume so the piece is easy to catch with the pointer. */}
      <mesh {...bind}>
        <sphereGeometry args={[1.35, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
