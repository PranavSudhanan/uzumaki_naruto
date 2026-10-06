import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { frame, useStore } from '../store'
import type { OrbLook } from '../data/content'
import { overUi } from './common'
import { bladeFragment, bladeVertex, orbFragment, orbVertex, sparkFragment, sparkVertex } from './shaders'

const ORBS = 9
const scratch = new THREE.Vector3()

interface Props {
  /** Palette and behaviour; the sphere eases toward whatever look it is given. */
  look: OrbLook
  /** Radius at rest, in world units. */
  radius?: number
  /** Whether this sphere responds to the shared charge / release state. */
  live?: boolean
  /** Number of sparks circling it (0 for none). */
  sparks?: number
  /** Show the ring of black orbs when the look calls for them. */
  satellites?: boolean
  /** Let the visitor press and hold the sphere itself to charge it. */
  pressable?: boolean
  /** Strength of the light it casts on its surroundings (1 = full). */
  glow?: number
  /** False for a sphere that should not light the scene at all (several small ones at once). */
  light?: boolean
}

/**
 * A raymarched chakra sphere. It can sit anywhere in the scene — floating on its own, or in a
 * character's hand — because it works out its own world position every frame.
 */
export function ChakraOrb({ look, radius: base = 1.05, live = true, sparks = 110, satellites = false, pressable = true, glow = 1, light: lit = true }: Props) {
  const orbMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: orbVertex,
        fragmentShader: orbFragment,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uGain: { value: 1 },
          uSteps: { value: 16 },
          uCenter: { value: new THREE.Vector3() },
          uRadius: { value: base },
          uCore: { value: new THREE.Color(look.core) },
          uMid: { value: new THREE.Color(look.mid) },
          uEdge: { value: new THREE.Color(look.edge) },
          uDark: { value: look.dark },
          uFlame: { value: look.flame },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const bladeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bladeVertex,
        fragmentShader: bladeFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uAmount: { value: 0 },
          uColor: { value: new THREE.Color('#bff3ff') },
        },
      }),
    [],
  )

  const sparkMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sparkVertex,
        fragmentShader: sparkFragment,
        // Sparks write depth at their bright centre so the lens keeps them in focus near the sphere.
        defines: { SOLID_CORE: '' },
        transparent: true,
        depthWrite: true,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: base },
          uInward: { value: look.inward },
          uVH: { value: 800 },
          uColor: { value: new THREE.Color(look.mid) },
          uGain: { value: 3.2 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const sparkGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = Math.max(1, sparks)
    const seed = new Float32Array(n * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    return g
  }, [sparks])

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  )

  const root = useRef<THREE.Group>(null!)
  const shell = useRef<THREE.Mesh>(null!)
  const proxy = useRef<THREE.Mesh>(null!)
  const blades = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.PointLight>(null)
  const points = useRef<THREE.Points>(null)
  const orbGroup = useRef<THREE.Group>(null!)
  const orbs = useRef<(THREE.Mesh | null)[]>([])

  const sim = useRef({ time: 0, blades: look.blades, orbs: 0, bursts: frame.bursts, ringT: 1 })
  const target = useMemo(() => ({ core: new THREE.Color(), mid: new THREE.Color(), edge: new THREE.Color() }), [])
  const power = Math.pow(base / 1.05, 1.15)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const quality = useStore.getState().quality
    const s = sim.current
    const k = 1 - Math.exp(-4 * dt)
    const u = orbMat.uniforms

    const charge = live ? frame.charge : 0
    const burst = live ? frame.burst : 0
    const ease = charge * charge * (3 - 2 * charge)
    // A release anywhere bumps the shared counter; live spheres answer with a shockwave.
    if (frame.bursts !== s.bursts) {
      s.bursts = frame.bursts
      if (live) s.ringT = 0
    }

    s.time += dt * look.speed * (1 + ease * 2.6)
    target.core.set(look.core)
    target.mid.set(look.mid)
    target.edge.set(look.edge)
    ;(u.uCore.value as THREE.Color).lerp(target.core, k)
    ;(u.uMid.value as THREE.Color).lerp(target.mid, k)
    ;(u.uEdge.value as THREE.Color).lerp(target.edge, k)
    u.uDark.value += (look.dark - u.uDark.value) * k
    u.uFlame.value += (look.flame - u.uFlame.value) * k
    u.uTime.value = s.time
    u.uSteps.value = quality === 2 ? 26 : quality === 1 ? 16 : 10
    const breathe = 1 + Math.sin(state.clock.elapsedTime * 2.1) * 0.012
    const radius = base * (1 + ease * 0.3 + burst * 0.12) * breathe
    // The shader works in world units, so it needs the scale of whatever this sphere is parented to.
    const worldScale = root.current.getWorldScale(scratch).x
    u.uRadius.value = radius * worldScale
    u.uGain.value = 1 + ease * 1.3 + burst * 2.5
    root.current.getWorldPosition(u.uCenter.value as THREE.Vector3)
    // A sphere that has been shrunk away casts no light and throws no sparks either.
    const presence = Math.min(1, worldScale)

    shell.current.scale.setScalar(radius * 1.76)
    proxy.current.scale.setScalar(radius * 0.93)

    const sp = sparkMat.uniforms
    sp.uTime.value = s.time * 1.4
    sp.uRadius.value = radius
    sp.uInward.value += (look.inward - sp.uInward.value) * k
    sp.uVH.value = state.size.height * state.viewport.dpr
    ;(sp.uColor.value as THREE.Color).lerp(look.dark ? target.edge : target.mid, k)
    sp.uGain.value = (3.2 + ease * 4) * presence
    if (points.current) points.current.visible = presence > 0.03

    s.blades += (look.blades - s.blades) * k
    blades.current.visible = s.blades > 0.01
    bladeMat.uniforms.uTime.value = s.time
    bladeMat.uniforms.uAmount.value = s.blades * (1 + ease * 0.8)
    blades.current.scale.setScalar(radius * 3.4 * (0.6 + 0.4 * s.blades) * (1 + burst * 1.6))

    s.orbs += ((satellites ? look.orbs : 0) - s.orbs) * k
    orbGroup.current.visible = s.orbs > 0.01
    orbGroup.current.rotation.y = state.clock.elapsedTime * 0.35
    orbs.current.forEach((m, i) => {
      if (!m) return
      const a = (i / ORBS) * Math.PI * 2
      const r = radius * (1.2 + 1.05 * s.orbs)
      m.position.set(Math.cos(a) * r, Math.sin(state.clock.elapsedTime * 1.3 + i) * 0.06, Math.sin(a) * r)
      m.scale.setScalar(0.17 * s.orbs * (base / 1.05))
    })

    s.ringT = Math.min(1, s.ringT + dt * 1.5)
    const rt = s.ringT
    ring.current.visible = rt < 1
    ring.current.scale.setScalar(radius * (1 + rt * 7))
    ringMat.opacity = (1 - rt) * (1 - rt) * 0.9
    ringMat.color.copy(u.uMid.value as THREE.Color).multiplyScalar(2.5)
    ring.current.quaternion.copy(state.camera.quaternion)

    if (light.current) {
      light.current.color.copy(look.dark ? target.edge : (u.uMid.value as THREE.Color))
      light.current.intensity = 26 * power * glow * presence * presence * (1 + ease * 2.5 + burst * 4)
    }
  })

  const press = (e: ThreeEvent<PointerEvent>) => {
    if (!pressable || overUi(e) || e.button !== 0) return
    e.stopPropagation()
    useStore.getState().setCharging(true)
    document.body.classList.add('no-select')
    const up = () => {
      useStore.getState().setCharging(false)
      document.body.classList.remove('no-select')
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <group ref={root}>
      {/* Depth-only core, so depth of field and occlusion treat the sphere as a solid body. */}
      <mesh
        ref={proxy}
        onPointerDown={press}
        onPointerOver={(e) => pressable && !overUi(e) && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => pressable && (document.body.style.cursor = '')}
      >
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial colorWrite={false} />
      </mesh>

      <mesh ref={shell} material={orbMat} renderOrder={5} frustumCulled={false}>
        <icosahedronGeometry args={[1, 4]} />
      </mesh>

      <mesh ref={blades} material={bladeMat} rotation={[-Math.PI / 2 + 0.38, 0, 0.12]} renderOrder={4} visible={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>

      {sparks > 0 ? <points ref={points} geometry={sparkGeo} material={sparkMat} frustumCulled={false} renderOrder={6} /> : null}

      <group ref={orbGroup} rotation={[0.32, 0, 0.14]} visible={false}>
        {Array.from({ length: ORBS }, (_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              orbs.current[i] = m
            }}
            castShadow
          >
            <sphereGeometry args={[1, 32, 24]} />
            <meshPhysicalMaterial color="#060607" roughness={0.32} metalness={0} clearcoat={0.7} clearcoatRoughness={0.25} envMapIntensity={0.7} />
          </mesh>
        ))}
      </group>

      <mesh ref={ring} material={ringMat} renderOrder={7} visible={false}>
        <ringGeometry args={[0.94, 1, 96]} />
      </mesh>

      {lit ? <pointLight ref={light} distance={6 + 10 * (base / 1.05)} decay={2} intensity={26 * power} /> : null}
    </group>
  )
}
