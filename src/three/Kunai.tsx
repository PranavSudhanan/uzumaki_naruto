import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { makeSteelTextures, makeWrapTextures } from './textures'
import { useDragRotation } from './common'
import { useStore } from '../store'
import { ERAS } from '../data/content'

type V3 = [number, number, number]

/**
 * Kunai blade: a leaf-shaped dagger with a diamond cross-section.
 * Group 0 is the dark forged flat, group 1 the bright ground edge.
 */
function makeBladeGeometry() {
  const L = 1.22
  const s = 0.36 // height of the shoulders (widest point)
  const w = 0.2
  const b = 0.05
  const t = 0.046
  const t0 = 0.03
  const k = 0.78
  const tipK = 0.82

  const R0: V3 = [0, 0, t0]
  const R1: V3 = [0, s, t]
  const TIP: V3 = [0, L, 0]
  const P0: V3 = [b, 0, 0]
  const P1: V3 = [w, s, 0]
  const I0: V3 = [b * k, 0, t0 * (1 - k) * 1.7]
  const I1: V3 = [w * k, s, t * (1 - k) * 1.7]
  const I2: V3 = [0, s + (L - s) * tipK, t * (1 - tipK)]

  const dark: V3[][] = [
    [R0, I0, I1],
    [R0, I1, R1],
    [R1, I1, I2],
  ]
  const edge: V3[][] = [
    [I0, P0, P1],
    [I0, P1, I1],
    [I1, P1, TIP],
    [I1, TIP, I2],
  ]

  const positions: number[] = []
  const push = (tris: V3[][]) => {
    for (const sx of [1, -1])
      for (const sz of [1, -1])
        for (const tri of tris) {
          const flip = sx * sz < 0
          const order = flip ? [0, 2, 1] : [0, 1, 2]
          for (const i of order) positions.push(tri[i][0] * sx, tri[i][1], tri[i][2] * sz)
        }
  }
  push(dark)
  const nDark = positions.length / 3
  push(edge)
  const nAll = positions.length / 3

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const uv: number[] = []
  for (let i = 0; i < nAll; i++) uv.push(positions[i * 3] * 1.6 + 0.5, positions[i * 3 + 1] * 1.6)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.addGroup(0, nDark, 0)
  g.addGroup(nDark, nAll - nDark, 1)
  g.computeVertexNormals()
  return g
}

function makeShurikenGeometry() {
  const shape = new THREE.Shape()
  const ro = 0.5
  const ri = 0.13
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const an = a + Math.PI / 2
    const am = a + Math.PI / 4
    const tip: [number, number] = [Math.cos(a) * ro, Math.sin(a) * ro]
    const next: [number, number] = [Math.cos(an) * ro, Math.sin(an) * ro]
    if (i === 0) shape.moveTo(tip[0], tip[1])
    shape.quadraticCurveTo(Math.cos(am) * ri, Math.sin(am) * ri, next[0], next[1])
  }
  const hole = new THREE.Path()
  hole.absarc(0, 0, 0.055, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.03,
    bevelSegments: 1,
    curveSegments: 20,
  })
  g.translate(0, 0, -0.006)
  return g
}

const SHURIKEN: { position: V3; tilt: V3; scale: number; speed: number }[] = [
  { position: [-1.15, 1.25, -1.8], tilt: [0.5, 0.6, 0], scale: 1.0, speed: 0.5 },
  { position: [1.55, -1.25, -1.2], tilt: [-0.8, -0.4, 0.2], scale: 0.9, speed: -0.35 },
  { position: [1.7, 1.75, -4.4], tilt: [1.1, 0.2, 0], scale: 1.2, speed: 0.28 },
]

export function Kunai() {
  const forged = useMemo(() => makeSteelTextures(17, true), [])
  const ground = useMemo(() => makeSteelTextures(19, false), [])
  const wrap = useMemo(makeWrapTextures, [])
  const bladeGeo = useMemo(makeBladeGeometry, [])
  const shurikenGeo = useMemo(makeShurikenGeometry, [])

  const darkMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#2b2e33',
        metalness: 1,
        roughness: 1,
        roughnessMap: forged.roughnessMap,
        normalMap: forged.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        envMapIntensity: 1.1,
      }),
    [forged],
  )
  const edgeMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#d9dde3',
        metalness: 1,
        roughness: 0.8,
        roughnessMap: ground.roughnessMap,
        normalMap: ground.normalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        anisotropy: 0.6,
        envMapIntensity: 1.4,
      }),
    [ground],
  )
  const bladeMats = useMemo(() => [darkMat, edgeMat], [darkMat, edgeMat])

  const all = useRef<THREE.Group>(null!)
  const float = useRef<THREE.Group>(null!)
  const spinner = useRef<THREE.Group>(null!)
  const stars = useRef<(THREE.Mesh | null)[]>([])
  const twirl = useRef(0)
  const { rot, bind } = useDragRotation(0.6)

  // Each new chapter gives the blade a full twirl.
  const era = useStore((s) => s.era)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    twirl.current += Math.PI * 2
  }, [era])
  const spun = useRef(0)
  const shown = useRef(1)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    spun.current += (twirl.current - spun.current) * (1 - Math.exp(-3.5 * dt))
    // Chapters with a figure hand the stage over: the weapons shrink away.
    shown.current += ((ERAS[era].cast ? 0 : 1) - shown.current) * (1 - Math.exp(-6 * dt))
    all.current.visible = shown.current > 0.01
    all.current.scale.setScalar(Math.max(0.001, shown.current))
    float.current.position.y = Math.sin(t * 0.8) * 0.06
    float.current.rotation.set(rot.current.x * 0.6, rot.current.y, -0.62 + Math.sin(t * 0.45) * 0.04)
    spinner.current.rotation.y = t * 0.35 + spun.current
    stars.current.forEach((m, i) => {
      if (m) m.rotation.z = t * SHURIKEN[i].speed * 2
    })
  })

  return (
    <group ref={all}>
      <group ref={float}>
        <group ref={spinner} position={[0, -0.25, 0]}>
          <mesh geometry={bladeGeo} material={bladeMats} castShadow receiveShadow />
          {/* collar */}
          <mesh position={[0, -0.03, 0]} material={darkMat} castShadow>
            <cylinderGeometry args={[0.062, 0.046, 0.07, 8]} />
          </mesh>
          {/* wrapped grip */}
          <mesh position={[0, -0.36, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.04, 0.037, 0.6, 32, 1]} />
            <meshStandardMaterial {...wrap} roughness={0.95} normalScale={new THREE.Vector2(1.2, 1.2)} />
          </mesh>
          {/* pommel ring */}
          <mesh position={[0, -0.775, 0]} material={darkMat} castShadow>
            <torusGeometry args={[0.105, 0.024, 20, 56]} />
          </mesh>
        </group>
        <mesh {...bind}>
          <sphereGeometry args={[1.25, 16, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {SHURIKEN.map((s, i) => (
        <group key={i} position={s.position} rotation={s.tilt} scale={s.scale}>
          <mesh
            ref={(m) => {
              stars.current[i] = m
            }}
            geometry={shurikenGeo}
            material={bladeMats}
            castShadow
          />
        </group>
      ))}
    </group>
  )
}
