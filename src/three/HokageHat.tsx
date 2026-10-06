import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js'
import { makeClothTextures, makeHatColor, makeStrawTextures } from './textures'
import { useDragRotation } from './common'

const RADIUS = 1.5
const HEIGHT = 0.56

/** Slightly squared plan: the crown is four gently flattened panels rather than a perfect cone. */
const squircle = (phi: number) => {
  const c = Math.abs(Math.cos(phi))
  const s = Math.abs(Math.sin(phi))
  return 1 / Math.pow(Math.pow(c, 2.5) + Math.pow(s, 2.5), 1 / 2.5)
}

/** Crown surface. u wraps around, v runs from the brim (0) up to the apex (1). */
function crownPoint(u: number, v: number, target: THREE.Vector3, drop = 0) {
  const phi = u * Math.PI * 2
  const s = 1 - v
  const plan = THREE.MathUtils.lerp(1, squircle(phi) * 0.93, Math.min(1, s * 1.4))
  const r = RADIUS * s * plan
  // A soft shoulder near the apex and a slight flare at the brim.
  const y = HEIGHT * (1 - Math.pow(s, 1.25)) + 0.035 * Math.sin(s * Math.PI) - drop
  target.set(Math.sin(phi) * r, y, Math.cos(phi) * r)
}

export function HokageHat() {
  const straw = useMemo(makeStrawTextures, [])
  const slant = Math.hypot(RADIUS, HEIGHT) / RADIUS
  const colorMap = useMemo(() => makeHatColor(straw.height, slant), [straw, slant])
  const cloth = useMemo(() => makeClothTextures([30, 14]), [])

  const crownGeo = useMemo(() => new ParametricGeometry((u, v, t) => crownPoint(u, v, t), 160, 64), [])
  const liningGeo = useMemo(() => new ParametricGeometry((u, v, t) => crownPoint(u, v, t, 0.022), 96, 32), [])
  const rimGeo = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 160; i++) {
      const p = new THREE.Vector3()
      crownPoint(i / 160, 0, p, 0.011)
      pts.push(p)
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 320, 0.016, 10, true)
  }, [])

  /** The white veil: a curtain hung under the brim, open at the front. */
  const veilGeo = useMemo(
    () =>
      new ParametricGeometry(
        (u, v, target) => {
          const open = 0.62 // radians left open either side of the front
          const phi = Math.PI + (u - 0.5) * (Math.PI * 2 - open * 2)
          const fold = Math.sin(phi * 13) * 0.045 + Math.sin(phi * 29 + 1) * 0.015
          const r = 0.86 * squircle(phi) * 0.95 + v * 0.2 + fold * (0.25 + v)
          const y = 0.27 - v * 1.8 + Math.sin(phi * 13) * 0.02 * v
          target.set(Math.sin(phi + Math.PI) * r, y, Math.cos(phi + Math.PI) * r)
        },
        200,
        40,
      ),
    [],
  )

  const float = useRef<THREE.Group>(null!)
  const { rot, bind } = useDragRotation(0.5)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    float.current.position.y = Math.sin(t * 0.6) * 0.06
    float.current.rotation.set(0.3 + Math.sin(t * 0.4) * 0.03 + rot.current.x, Math.PI + 0.32 + Math.sin(t * 0.27) * 0.12 + rot.current.y, 0.04)
  })

  return (
    <group ref={float}>
      <mesh geometry={crownGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          map={colorMap}
          normalMap={straw.normalMap}
          normalScale={new THREE.Vector2(0.6, 0.6)}
          roughness={0.72}
          sheen={0.6}
          sheenRoughness={0.6}
          sheenColor="#ff9a8a"
          envMapIntensity={0.95}
        />
      </mesh>
      <mesh geometry={liningGeo} receiveShadow>
        <meshStandardMaterial color="#b89a66" roughness={0.9} side={THREE.BackSide} normalMap={straw.normalMap} />
      </mesh>
      <mesh geometry={rimGeo} castShadow>
        <meshStandardMaterial color="#e9e3d6" roughness={0.75} />
      </mesh>
      {/* finial */}
      <mesh position={[0, HEIGHT + 0.012, 0]} scale={[1, 0.55, 1]} castShadow>
        <sphereGeometry args={[0.07, 24, 16]} />
        <meshStandardMaterial color="#e9e3d6" roughness={0.6} />
      </mesh>
      <mesh geometry={veilGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#efece6"
          {...cloth}
          roughness={1}
          normalScale={new THREE.Vector2(0.5, 0.5)}
          sheen={0.7}
          sheenRoughness={0.5}
          sheenColor="#ffffff"
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh {...bind}>
        <sphereGeometry args={[1.7, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
