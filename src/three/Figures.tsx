import { Component, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ERAS, JUTSU, MODELS, type Cast, type ModelEntry, type ModelTune } from '../data/content'
import { frame, useStore } from '../store'
import { makeDaisTextures, makeSteelTextures } from './textures'
import { useDragRotation } from './common'
import { ChakraOrb } from './ChakraOrb'
import { FLOOR, Showfloor, StageLight, useWhen } from './Stage'
import { Rig, RIGS, mixPose, type Pose } from './rig'
import { POSES, shaping, type PoseName } from './poses'

/* ------------------------------------------------------------------ */
/* Loading and normalising a model                                      */
/* ------------------------------------------------------------------ */

const normalised = new WeakSet<THREE.Object3D>()

/**
 * The models come from many authors and exporters. Bring their materials onto common ground so
 * they all respond to the scene's lighting: unlit and self-illuminated surfaces become ordinary
 * lit ones, and everything casts and receives shadows.
 */
function normalise(scene: THREE.Object3D, tune?: ModelTune) {
  if (normalised.has(scene)) return
  normalised.add(scene)
  const swapped = new Map<THREE.Material, THREE.Material>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const fix = (m: THREE.Material) => {
      const done = swapped.get(m)
      if (done) return done
      let out = m
      const basic = m as THREE.MeshBasicMaterial
      const std = m as THREE.MeshStandardMaterial
      if (basic.isMeshBasicMaterial) {
        out = new THREE.MeshStandardMaterial({
          name: m.name,
          map: basic.map,
          color: basic.color,
          side: m.side,
          transparent: m.transparent,
          opacity: m.opacity,
          alphaTest: m.alphaTest,
          roughness: 0.78,
          metalness: 0,
        })
      } else if (std.isMeshStandardMaterial) {
        // A texture plugged into emission as well as colour makes the model glow flat: switch that off.
        // A separate emission texture is kept, but only as a faint glow, or it washes out under the bloom.
        if (std.emissiveMap && std.emissiveMap === std.map) {
          std.emissiveMap = null
          std.emissive.set(0x000000)
        } else if (std.emissiveMap) std.emissiveIntensity = Math.min(std.emissiveIntensity, tune?.emissive ?? 0.14)
        if (tune?.color != null) std.color.multiplyScalar(tune.color)
        if (tune?.polish?.some((part) => m.name.includes(part))) {
          std.roughness = 0.3
          std.metalness = 0.15
          std.envMapIntensity = 1.4
        }
        // Blended textures sort badly against each other on a body; treat them as cut-outs instead.
        if (std.transparent && std.map) {
          std.transparent = false
          std.alphaTest = 0.5
          std.depthWrite = true
        }
        std.envMapIntensity = 0.9
      }
      swapped.set(m, out)
      return out
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material)
  })
}

/** Removes net travel from a looping clip so a walk or run plays on the spot instead of sliding away. */
function playInPlace(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue
    const v = track.values
    const n = track.times.length
    if (n < 2) continue
    const end = track.times[n - 1] || 1
    for (let axis = 0; axis < 3; axis++) {
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < n; i++) {
        lo = Math.min(lo, v[i * 3 + axis])
        hi = Math.max(hi, v[i * 3 + axis])
      }
      const drift = v[(n - 1) * 3 + axis] - v[axis]
      if (Math.abs(drift) < (hi - lo) * 0.5 || hi - lo < 1e-5) continue
      for (let i = 0; i < n; i++) v[i * 3 + axis] -= drift * (track.times[i] / end)
    }
  }
  return clip
}

/**
 * Tells a posable figure what to do this frame: the pose to move toward, and optionally how
 * briskly (higher = snappier). Called every frame with the clock time and the frame's duration.
 */
export type Direct = (time: number, dt: number) => Pose | { pose: Pose; rate: number }

/** What a performance needs to know about the figure it is driving. */
export interface Actor {
  rig: Rig | null
  /** The figure's own scene graph, for looking up a bone by name. */
  root: THREE.Object3D
  /** Clips shipped with the model, by lower-cased name fragment. */
  play: (clip: string, options?: { once?: boolean; speed?: number; fade?: number }) => void
}

interface ModelProps {
  cast: Cast
  onReady?: () => void
  onActor?: (actor: Actor) => void
  direct?: Direct
  /** False while the figure is hidden, so it is not animated for nothing. */
  awake?: MutableRefObject<boolean>
  children?: ReactNode
}

if (import.meta.env.DEV) (window as any).__poses = POSES

const palmPos = new THREE.Vector3()
const palmNormal = new THREE.Vector3()

function Model({ cast, onReady, onActor, direct, awake, children }: ModelProps) {
  const entry: ModelEntry = MODELS[cast.model]
  const gltf = useGLTF(entry.url)

  const built = useMemo(() => {
    normalise(gltf.scene, entry.tune)
    // Each placement gets its own copy of the skeleton, so one model can stand in several places.
    const root = cloneSkinned(gltf.scene)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = !cast.light
      mesh.receiveShadow = true
      mesh.frustumCulled = false
    })

    let mixer: THREE.AnimationMixer | null = null
    const actions = new Map<string, THREE.AnimationAction>()
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(root)
      for (const clip of gltf.animations) actions.set(clip.name.toLowerCase(), mixer.clipAction(playInPlace(clip.clone())))
      const want = cast.clip?.toLowerCase()
      const first = [...actions.entries()].find(([name]) => want && name.includes(want)) ?? [...actions.entries()][0]
      first[1].play()
      mixer.setTime(cast.freeze ?? 0)
    }

    // Measure in the pose it will first be shown in, then stand it on the floor at the requested size.
    root.updateMatrixWorld(true)
    root.traverse((o) => {
      const skinned = o as THREE.SkinnedMesh
      if (!skinned.isSkinnedMesh) return
      skinned.skeleton.update()
      skinned.computeBoundingBox()
    })
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const span = cast.fit === 'length' ? Math.max(size.x, size.z) : size.y
    const scale = cast.size / Math.max(span, 1e-5)
    const offset = new THREE.Vector3(-centre.x, -box.min.y, -centre.z)

    const spec = RIGS[cast.model]
    const rig = spec ? new Rig(root, spec) : null

    let current: THREE.AnimationAction | null = mixer ? [...actions.values()].find((a) => a.isRunning()) ?? null : null
    const base = current
    const actor: Actor = {
      rig,
      root,
      play(name, { once = false, speed = 1, fade = 0.18 } = {}) {
        const next = [...actions.entries()].find(([n]) => n.includes(name.toLowerCase()))?.[1]
        if (!next || !mixer) return
        next.reset()
        next.timeScale = speed
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
        next.clampWhenFinished = once
        next.play()
        if (current && current !== next) current.crossFadeTo(next, fade, false)
        current = next
        if (once && base && base !== next) {
          // Drift back to the resting clip when the one-shot ends.
          const back = (e: { action: THREE.AnimationAction }) => {
            if (e.action !== next) return
            mixer!.removeEventListener('finished', back)
            base.reset().play()
            next.crossFadeTo(base, 0.3, false)
            current = base
          }
          mixer.addEventListener('finished', back)
        }
      },
    }
    return { root, mixer, scale, offset, rig, actor }
  }, [gltf, cast, entry])

  useEffect(() => {
    onActor?.(built.actor)
    onReady?.()
  }, [built, onReady, onActor])
  useEffect(() => () => void built.mixer?.stopAllAction(), [built])

  const holder = useRef<THREE.Group>(null)
  const eased = useRef<Pose | null>(null)
  const phase = useMemo(() => Math.random() * 10, [])

  useFrame((state, rawDt) => {
    if (awake && !awake.current) return
    const dt = Math.min(rawDt, 0.05)
    if (built.mixer && cast.freeze == null) built.mixer.update(dt * (cast.speed ?? 1))
    const rig = built.rig
    if (!rig) return

    const t = state.clock.elapsedTime + phase
    let want: Pose = POSES[(cast.pose as PoseName) ?? 'stand'] ?? POSES.stand
    let rate = 9
    if (direct) {
      const d = direct(t, dt)
      if ('pose' in d) {
        want = d.pose
        rate = d.rate
      } else want = d
    }
    if (import.meta.env.DEV && (window as any).__pose) want = (window as any).__pose
    eased.current = eased.current ? mixPose(eased.current, want, 1 - Math.exp(-rate * dt)) : want

    // Breathing: he is never a statue.
    const e = eased.current
    const breath = Math.sin(t * 1.7)
    rig.solve(
      {
        ...e,
        lean: e.lean + breath * 0.012,
        headPitch: e.headPitch - breath * 0.012 + Math.sin(t * 0.63) * 0.02,
        headYaw: e.headYaw + Math.sin(t * 0.41) * 0.04,
        side: e.side + Math.sin(t * 0.8) * 0.008,
      },
      t,
    )

    // Whatever he is holding stays in his palm.
    if (holder.current && cast.hand) {
      rig.palm(cast.hand, palmPos, palmNormal)
      palmPos.addScaledVector(palmNormal, cast.handOffset ?? 0)
      holder.current.parent!.worldToLocal(palmPos)
      holder.current.position.copy(palmPos)
    }
  })

  return (
    <>
      <group scale={built.scale}>
        <primitive object={built.root} position={built.offset} />
      </group>
      {children ? <group ref={holder}>{children}</group> : null}
    </>
  )
}

/** A model that fails to download or parse must never take the page down with it. */
class ModelBoundary extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('A character model could not be loaded', error)
    this.props.onFail?.()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface FigureProps extends Omit<ModelProps, 'children'> {
  show?: boolean
  /** Rendered in the hand named by the cast (or at the figure's feet if it names none). */
  children?: ReactNode
}

/** A cast member, eased in when it appears and out when it is replaced. */
export function Figure({ cast, show = true, onReady, onActor, direct, children }: FigureProps) {
  const group = useRef<THREE.Group>(null!)
  const grown = useRef(0)
  const awake = useRef(false)
  const warm = useRef(0)
  const notify = useRef(onActor)
  notify.current = onActor
  const arrived = useMemo(
    () => (actor: Actor) => {
      // Draw it for a few frames the moment it loads, too small to see, so its shaders
      // are compiled and its textures uploaded before it is ever asked to appear.
      warm.current = 3
      notify.current?.(actor)
    },
    [],
  )
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // Leaves quicker than it arrives, so two figures never share the spot for long.
    grown.current += ((show ? 1 : 0) - grown.current) * (1 - Math.exp(-(show ? 7 : 13) * dt))
    const s = grown.current
    const g = group.current
    if (warm.current > 0 && s <= 0.002) {
      warm.current--
      awake.current = true
      g.visible = true
      g.scale.setScalar(0.0004)
      return
    }
    awake.current = g.visible = s > 0.002
    g.scale.setScalar(0.86 + 0.14 * s)
    g.position.y = (1 - s) * -0.35
  })
  return (
    <group ref={group} rotation={[0, cast.yaw ?? 0, 0]} visible={false}>
      <ModelBoundary onFail={onReady}>
        <Suspense fallback={null}>
          <Model cast={cast} onReady={onReady} onActor={arrived} direct={direct} awake={awake}>
            {children}
          </Model>
        </Suspense>
      </ModelBoundary>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Pedestal                                                             */
/* ------------------------------------------------------------------ */

/** Turned dark stone with the crest cut into it and a thin band of light around the rim. */
export function Dais({ radius = 1.9 }: { radius?: number }) {
  const top = useMemo(makeDaisTextures, [])
  const side = useMemo(() => makeSteelTextures(29, true), [])
  const glow = useRef<THREE.MeshBasicMaterial>(null!)
  const materials = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({
      color: '#1b1d22',
      metalness: 0.2,
      roughness: 1,
      roughnessMap: side.roughnessMap,
      normalMap: side.normalMap,
    })
    const face = new THREE.MeshStandardMaterial({ ...top, metalness: 0.15, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) })
    return [body, face, body]
  }, [top, side])

  useFrame((state) => {
    glow.current.color.copy(frame.tint).multiplyScalar(1.7 + Math.sin(state.clock.elapsedTime * 1.4) * 0.35)
  })

  return (
    <group position={[0, FLOOR, 0]} scale={radius / 1.9}>
      {/* A quarter turn lines the cap's texture up so the crest reads upright from the front. */}
      <mesh position={[0, -0.09, 0]} rotation={[0, Math.PI / 2, 0]} material={materials} receiveShadow castShadow>
        <cylinderGeometry args={[1.9, 2.02, 0.18, 96, 1]} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.925, 0.012, 8, 128]} />
        <meshBasicMaterial ref={glow} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Placements                                                           */
/* ------------------------------------------------------------------ */

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * How Naruto carries a Rasengan: resting in the palm, shaped by the other hand as it charges,
 * and driven forward when it is released. Shared by the hero and the Jutsu page.
 */
export function rasenganDirect(live: () => boolean): Direct {
  let bursts = frame.bursts
  let strike = 0
  return (t, dt) => {
    const on = live()
    if (frame.bursts !== bursts) {
      bursts = frame.bursts
      if (on) strike = 0.0001
    }
    if (strike > 0) {
      strike += dt
      if (strike < 0.62) return { pose: POSES.thrust, rate: 20 }
      strike = 0
    }
    return { pose: shaping(POSES.hold, t, on ? smooth(frame.charge) : 0), rate: 8 }
  }
}

const HERO: Cast = { model: 'base', size: 3.2, yaw: -0.5, pose: 'hold', hand: 'R', handOffset: 0.25 }

/**
 * Origin: Naruto with a live Rasengan in his palm, on the crest pedestal over a mirrored floor.
 * Drag to turn him; press and hold him to feed the sphere, let go to release it.
 */
export function HeroFigure() {
  const turn = useRef<THREE.Group>(null!)
  const hooks = useMemo(
    () => ({
      onDown: () => useStore.getState().setCharging(true),
      onUp: () => useStore.getState().setCharging(false),
    }),
    [],
  )
  const { rot, bind } = useDragRotation(0, 1.2, hooks)
  const ready = useMemo(() => () => useStore.getState().setHeroReady(), [])
  const near = useWhen(() => useStore.getState().view === 'journey' && frame.f < 0.9)
  const direct = useMemo(() => rasenganDirect(() => useStore.getState().view === 'journey' && frame.f < 0.9), [])

  useFrame((state) => {
    turn.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.08 + rot.current.y
  })

  return (
    <group>
      <Showfloor active={near} />
      <StageLight />
      <Dais />
      <group ref={turn} position={[0, FLOOR, 0]}>
        <Figure cast={HERO} show={near} onReady={ready} direct={direct}>
          <ChakraOrb look={JUTSU[0]} radius={0.21} live={near} sparks={46} pressable={false} />
        </Figure>
      </group>
      <mesh {...bind}>
        <cylinderGeometry args={[1.4, 1.4, 3.5, 12, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Mounts a set of casts lazily: the visible one now, the rest once the section has been reached. */
function useCastList(casts: (Cast | undefined)[], active: number, station: number) {
  const [reached, setReached] = useState(false)
  useFrame(() => {
    if (!reached && Math.abs(frame.f - station) < 0.9) setReached(true)
  })
  return casts.map((cast, i) => (cast && (reached || i === active) ? cast : null))
}

/** Story: the figure changes with the chapter — the fox, the boy, the sage, the saviour, the Hokage. */
export function StoryFigures() {
  const era = useStore((s) => s.era)
  const casts = useCastList(useMemo(() => ERAS.map((e) => e.cast), []), era, 2)
  const turn = useRef<THREE.Group>(null!)
  const { rot, bind } = useDragRotation(0, 1.2)
  const current = ERAS[era].cast
  const dais = useRef<THREE.Group>(null!)
  const daisShown = useRef(0)

  useFrame((state, rawDt) => {
    turn.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.07 + rot.current.y
    const want = current && current.dais !== false ? 1 : 0
    daisShown.current += (want - daisShown.current) * (1 - Math.exp(-6 * Math.min(rawDt, 0.05)))
    dais.current.visible = daisShown.current > 0.01
    dais.current.scale.setScalar(Math.max(0.001, daisShown.current))
  })

  return (
    <group>
      <group ref={dais}>
        <Dais radius={1.7} />
      </group>
      <group ref={turn} position={[0, FLOOR, 0]}>
        {casts.map((cast, i) =>
          cast ? (
            <group key={i} position={cast.at ?? [0, 0, 0]}>
              <Figure cast={cast} show={i === era} />
            </group>
          ) : null,
        )}
      </group>
      {current ? (
        <mesh {...bind}>
          <cylinderGeometry args={[1.5, 1.5, 3.5, 12, 1]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}

/** Jutsu: whoever wields the technique stands behind the sphere, lit by its chakra. */
export function JutsuFigures() {
  const jutsu = useStore((s) => s.jutsu)
  const casts = useCastList(useMemo(() => JUTSU.map((j) => j.cast), []), jutsu, 3)
  const near = useWhen(() => useStore.getState().view === 'journey' && Math.abs(frame.f - 3) < 0.9)
  return (
    <group>
      {casts.map((cast, i) =>
        cast ? (
          <group key={i} position={[1.95 + (cast.at?.[0] ?? 0), FLOOR + (cast.at?.[1] ?? 0), -2.3 + (cast.at?.[2] ?? 0)]}>
            <Figure cast={cast} show={near && i === jutsu} />
          </group>
        ) : null,
      )}
    </group>
  )
}
