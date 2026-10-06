import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { frame } from '../store'
import { makeLeafTexture } from './textures'
import { backdropFragment, backdropVertex, dustVertex, sparkFragment } from './shaders'

/** Sky dome that travels with the camera. */
export function Backdrop() {
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: backdropVertex,
        fragmentShader: backdropFragment,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: { uTint: { value: new THREE.Color() }, uTime: { value: 0 } },
      }),
    [],
  )
  useFrame((state) => {
    ref.current.position.copy(state.camera.position)
    mat.uniforms.uTime.value = state.clock.elapsedTime
    ;(mat.uniforms.uTint.value as THREE.Color).copy(frame.tint)
  })
  return (
    <mesh ref={ref} material={mat} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[60, 32, 20]} />
    </mesh>
  )
}

const BOX = new THREE.Vector3(18, 11, 13)
const wrap = (v: number, size: number) => ((((v + size / 2) % size) + size) % size) - size / 2

/** Leaves of the Hidden Leaf, carried on a steady breeze through every scene. */
export function Leaves({ count = 70 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const map = useMemo(makeLeafTexture, [])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.2, 0.3, 4, 6)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      // Cupped across the midrib, curled along its length.
      pos.setZ(i, Math.abs(x) * 0.35 + Math.sin((y / 0.3 + 0.5) * Math.PI) * 0.035)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const leaves = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        p: new THREE.Vector3(Math.random() * BOX.x, Math.random() * BOX.y, Math.random() * BOX.z),
        rot: new THREE.Vector3(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        spin: new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2.6),
        fall: 0.22 + Math.random() * 0.3,
        sway: Math.random() * 6.28,
        scale: 0.65 + Math.random() * 0.8,
      })),
    [count],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      c.setHSL(0.2 + Math.random() * 0.12, 0.45 + Math.random() * 0.3, 0.42 + Math.random() * 0.2)
      ref.current.setColorAt(i, c)
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [count])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const c = frame.focus
    const cam = state.camera.position
    for (let i = 0; i < count; i++) {
      const l = leaves[i]
      l.p.y -= l.fall * dt
      l.p.x += (0.38 + 0.26 * Math.sin(t * 0.3 + l.sway)) * dt
      l.p.z += Math.sin(t * 0.4 + l.sway) * 0.12 * dt
      const rx = wrap(l.p.x - c.x, BOX.x)
      const ry = wrap(l.p.y - c.y, BOX.y)
      const rz = wrap(l.p.z - c.z, BOX.z)
      dummy.position.set(c.x + rx, c.y + ry, c.z + rz)
      dummy.rotation.set(l.rot.x + t * l.spin.x, l.rot.y + t * l.spin.y, l.rot.z + t * l.spin.z)
      // Fade out at the edges of the wrap box, right in front of the lens, and around the subject.
      const edge = Math.max(Math.abs(rx) / BOX.x, Math.abs(ry) / BOX.y, Math.abs(rz) / BOX.z)
      const subject = Math.sqrt(rx * rx + ry * ry + rz * rz)
      const s =
        l.scale *
        THREE.MathUtils.smoothstep(0.5 - edge, 0, 0.1) *
        THREE.MathUtils.smoothstep(dummy.position.distanceTo(cam), 1.0, 2.4) *
        THREE.MathUtils.smoothstep(subject, 1.9, 3.0)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial map={map} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.55} envMapIntensity={0.9} />
    </instancedMesh>
  )
}

/** Fine dust catching the light — gives the air some depth. */
export function Dust({ count = 520 }: { count?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < pos.length; i++) pos[i] = Math.random()
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    return g
  }, [count])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dustVertex,
        fragmentShader: sparkFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: new THREE.Vector3(16, 10, 14) },
          uVH: { value: 800 },
          uColor: { value: new THREE.Color('#ffd9b0') },
          uGain: { value: 0.9 },
        },
      }),
    [],
  )
  const warm = useMemo(() => new THREE.Color('#fff0dc'), [])
  useFrame((state) => {
    const u = mat.uniforms
    u.uTime.value = state.clock.elapsedTime
    ;(u.uCenter.value as THREE.Vector3).copy(frame.focus)
    u.uVH.value = state.size.height * state.viewport.dpr
    ;(u.uColor.value as THREE.Color).copy(warm).lerp(frame.tint, 0.45)
  })
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />
}
