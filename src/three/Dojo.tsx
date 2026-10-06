import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { DOJO, MAX_CLONES, type Cast } from '../data/content'
import { frame, useStore } from '../store'
import { audio } from '../audio'
import { ANCHOR } from './layout'
import { ChakraOrb } from './ChakraOrb'
import { Dais, Figure, type Actor, type Direct } from './Figures'
import { FLOOR, Showfloor, StageLight } from './Stage'
import { sparkFragment, sparkVertex } from './shaders'
import { mixPose, type Pose } from './rig'
import { POSES, moulding, shaping, type PoseName } from './poses'
import { Blast, Boulder, Debris, GROUND, Smoke, TARGET, blast, boulder, debris, smoke } from './DojoFx'

/*
 * The Jutsu page's stage. A performer stands on the left facing a boulder on the right, and every
 * technique is acted out against it: the body moves through seals, wind-ups and strikes, the sphere
 * leaves the hand, the rock takes the blow, and all of it draws on a limited pool of chakra.
 *
 * He has four forms, each with a body of its own and techniques of its own. Changing technique
 * within a form is a change of stance; changing form happens in a burst of smoke.
 */

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Where the performer stands, and the heading from there to the boulder. */
const HOME = new THREE.Vector3(-1.7, 0, 0.25)
const RANGE = Math.hypot(TARGET.x - HOME.x, TARGET.z - HOME.z)
const FACE = Math.atan2(TARGET.x - HOME.x, TARGET.z - HOME.z)
const AIM: [number, number] = [Math.sin(FACE), Math.cos(FACE)]
/** How far he runs for a strike: up to arm's length from the rock. */
const DASH = RANGE - TARGET.radius - 1.05

/** Chakra per second while holding each technique. Negative restores it. */
const DRAIN: Record<string, number> = {
  rasengan: 0.1,
  rasenshuriken: 0.19,
  bijudama: 0.15,
  bijurasen: 0.27,
  sennin: -0.24,
}

/** Techniques that are wound up overhead and thrown, then stay on the target and grind. */
const THROWN: Record<string, { grind: number; vortex: number; finish: number } | undefined> = {
  rasenshuriken: { grind: 1, vortex: 1, finish: 2.6 },
  bijurasen: { grind: 1.8, vortex: 1.3, finish: 4.2 },
}

type Phase = 'idle' | 'dash' | 'strike' | 'back' | 'throw' | 'flight' | 'vortex' | 'fire' | 'after' | 'volley' | 'squad'

/** Everything the choreography needs to remember between frames. */
const stage = {
  id: '',
  phase: 'idle' as Phase,
  t: 0,
  power: 0,
  bursts: 0,
  volleys: 0,
  /** 0–1 along the run to the boulder, and the height of the hop back. */
  dash: 0,
  hop: 0,
  orb: 'hand' as 'hand' | 'fly' | 'target',
  orbScale: 0,
  from: new THREE.Vector3(),
  fly: 0,
  /** Seconds left of being doubled over, of holding a seal, of the commanding sweep, of changing form. */
  spent: 0,
  seal: 0,
  sweep: 0,
  swap: 0,
  formation: 0,
  /** 0 = the lens is on him, 1 = on the boulder. */
  eye: 0,
}

const go = (phase: Phase) => {
  stage.phase = phase
  stage.t = 0
}

/* ------------------------------------------------------------------ */
/* Performers                                                           */
/* ------------------------------------------------------------------ */

const BASE: Cast = { model: 'base', size: 3.2, yaw: FACE }
const SAGE: Cast = { model: 'sageRig', size: 3.25, yaw: FACE }
const SIX: Cast = { model: 'sixRig', size: 3.3, yaw: FACE }
const KURAMA: Cast = { model: 'kurama', size: 6.2, fit: 'length', clip: 'atstand', yaw: FACE, dais: false }
/** Kurama is long: he stands further back so his jaws, not his chest, are at the performer's mark. */
const KURAMA_BACK = 2.6

const CASTS = [BASE, SAGE, KURAMA, SIX]

const PERFORMER: Record<string, Cast> = {
  rasengan: BASE,
  kagebunshin: BASE,
  sennin: SAGE,
  rasenshuriken: SAGE,
  bijudama: KURAMA,
  gudodama: SIX,
  bijurasen: SIX,
}

const technique = () => DOJO[useStore.getState().dojo].id

/** Winding a thrown technique up overhead, `charge` of the way from rest. */
function windUp(rest: Pose, time: number, charge: number) {
  const p = mixPose(rest, POSES.overhead, smooth(clamp01(charge * 2.4)))
  p.side += Math.sin(time * 27) * 0.008 * charge
  return p
}

const baseDirect: Direct = (t) => {
  if (stage.spent > 0) return { pose: POSES.spent, rate: 5 }
  if (technique() === 'kagebunshin') {
    // He holds the seal while clones arrive, and for as long as they are at work.
    const busy = stage.seal > 0 || stage.phase === 'squad' || (useStore.getState().charging && frame.charge > 0)
    return { pose: busy ? POSES.cross : POSES.stand, rate: 12 }
  }
  if (stage.phase === 'dash' || stage.phase === 'strike') return { pose: POSES.thrust, rate: 24 }
  if (stage.phase === 'back') return { pose: stage.t < 0.28 ? POSES.guard : POSES.stand, rate: 11 }
  return { pose: shaping(POSES.stand, t, smooth(clamp01(frame.charge * 2.2))), rate: 9 }
}

const sageDirect: Direct = (t) => {
  if (stage.spent > 0) return { pose: POSES.spent, rate: 5 }
  const rest = frame.sage > 0 ? POSES.ready : POSES.stand
  if (technique() === 'sennin') {
    // Gathering natural energy means not moving at all.
    const gathering = useStore.getState().charging && frame.charge > 0
    return { pose: gathering ? POSES.seal : rest, rate: 6 }
  }
  if (stage.phase === 'throw' || stage.phase === 'flight') return { pose: POSES.throw, rate: 26 }
  if (stage.phase === 'vortex') return { pose: POSES.guard, rate: 9 }
  if (stage.phase === 'after') return { pose: POSES.ready, rate: 7 }
  return { pose: windUp(rest, t, frame.charge), rate: 9 }
}

/** Six Paths never touches the ground: whatever he does, he does it hovering, and bobbing a little. */
const aloft = (p: Pose, t: number): Pose => ({ ...p, lift: 0.07 + Math.sin(t * 1.3) * 0.008, crouch: Math.min(p.crouch, 0.12) })

/** Out of chakra, the staffs go too: they are made of it. */
const drained: Pose = { ...POSES.spent, L: { ...POSES.spent.L, prop: 0 }, R: { ...POSES.spent.R, prop: 0 } }

const sixDirect: Direct = (t) => {
  if (stage.spent > 0) return { pose: drained, rate: 4 }
  if (technique() === 'gudodama') {
    if (stage.phase === 'volley') return { pose: aloft(POSES.command, t), rate: 14 }
    return { pose: aloft(stage.sweep > 0 ? POSES.sweep : POSES.float, t), rate: stage.sweep > 0 ? 12 : 6 }
  }
  if (stage.phase === 'throw' || stage.phase === 'flight') return { pose: aloft(POSES.hurl, t), rate: 26 }
  if (stage.phase === 'vortex') return { pose: aloft(POSES.brace, t), rate: 9 }
  if (stage.phase === 'after') return { pose: aloft(POSES.float, t), rate: 6 }
  // Building it: the right staff is put away as that hand comes up to hold the sphere.
  const p = mixPose(POSES.float, POSES.wind, smooth(clamp01(frame.charge * 2.4)))
  p.side += Math.sin(t * 27) * 0.008 * frame.charge
  return { pose: aloft(p, t), rate: 9 }
}

const DIRECT = new Map<Cast, Direct>([
  [BASE, baseDirect],
  [SAGE, sageDirect],
  [SIX, sixDirect],
])

/* ------------------------------------------------------------------ */
/* Shadow clones                                                        */
/* ------------------------------------------------------------------ */

/*
 * Clones stand in pairs, because it takes two of them to make one Rasengan: the first of each pair
 * holds out his palm, the second steps in beside him and shapes the chakra over it. Then the one
 * holding it runs it into the boulder. Positions are relative to the original.
 */
const SLOTS = (
  [
    // The first pair stands on the far side, where the camera sees their faces and the sphere between them.
    [2.0, -2.4, 'ready'],
    [0.9, -2.7, 'stand'],
    [2.0, 2.6, 'stand'],
    [0.9, 2.9, 'ready'],
    [-1.5, -2.7, 'ready'],
    [-2.6, -2.9, 'stand'],
    [-1.5, 2.7, 'stand'],
    [-2.6, 3.0, 'ready'],
  ] as [number, number, PoseName][]
)
  .slice(0, MAX_CLONES)
  .map(([x, z, pose], i) => {
    const cast: Cast = { model: 'base', size: 3.2 * (0.96 + (i % 3) * 0.02), light: true, pose }
    // Which way he faces when nothing is going on: roughly at the boulder, none of them quite alike.
    return { x, z, pose, cast, yaw: FACE + ((i * 37) % 11) * 0.05 - 0.25 }
  })

const PAIRS = SLOTS.length >> 1
/** Seconds between one pair setting off and the next. */
const STAGGER = 0.2
/** Where the shaper stands, in the holder's own frame (to his right, a little ahead), and the turn that faces him at the sphere. */
const BESIDE: [number, number] = [-0.78, 0.56]
const TURNED = 1.667

/** Each holder's run at the boulder: heading, distance, how long it takes. */
const RUNS = Array.from({ length: PAIRS }, (_, k) => {
  const h = SLOTS[k * 2]
  const dx = TARGET.x - (HOME.x + h.x)
  const dz = TARGET.z - (HOME.z + h.z)
  const length = Math.hypot(dx, dz)
  const dir: [number, number] = [dx / length, dz / length]
  const dist = length - TARGET.radius - 0.95
  const yaw = Math.atan2(dx, dz)
  // where his partner stands while shaping
  const beside: [number, number] = [h.x + BESIDE[0] * Math.cos(yaw) + BESIDE[1] * Math.sin(yaw), h.z - BESIDE[0] * Math.sin(yaw) + BESIDE[1] * Math.cos(yaw)]
  return { dir, dist, yaw, beside, time: 0.2 + dist * 0.03 }
})

/** The clones' own attack, once it has been let go: who has set off, who has landed. */
const squad = {
  since: -1,
  busy: false,
  power: 0,
  pairs: 0,
  end: 0,
  left: new Uint8Array(PAIRS),
  struck: new Uint8Array(PAIRS),
  launch(power: number, pairs: number) {
    this.since = 0
    this.busy = true
    this.power = power
    this.pairs = pairs
    this.end = (pairs - 1) * STAGGER + Math.max(...RUNS.slice(0, pairs).map((r) => r.time)) + 1
    this.left.fill(0)
    this.struck.fill(0)
  },
  stop() {
    this.since = -1
    this.busy = false
  },
}

type Task = 'idle' | 'offer' | 'mould' | 'thrust' | 'guard'

/** What each clone is doing this frame, and how far into it he is; his pose follows from it. */
const troop = SLOTS.map(() => ({ task: 'idle' as Task, amount: 0 }))

const CLONE_DIRECT = SLOTS.map((slot, i): Direct => (t) => {
  const { task, amount } = troop[i]
  const rest = POSES[slot.pose]
  if (task === 'thrust') return { pose: POSES.thrust, rate: 24 }
  if (task === 'guard') return { pose: POSES.guard, rate: 11 }
  if (task === 'offer') return { pose: mixPose(rest, POSES.offer, amount), rate: 10 }
  if (task === 'mould') return { pose: moulding(rest, t, amount), rate: 10 }
  return { pose: rest, rate: 8 }
})

/** Turns `from` toward `to` by the short way round. */
const turn = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k

function ShadowClones({ active, tint }: { active: boolean; tint: string }) {
  const count = useStore((s) => (active ? s.clones : 0))
  const [mounted, setMounted] = useState(0)
  const previous = useRef(0)

  // A puff of smoke — and a sound — wherever a clone arrives or leaves.
  useEffect(() => {
    const from = Math.min(previous.current, count)
    const to = Math.max(previous.current, count)
    const timers: number[] = []
    for (let i = from; i < to; i++) {
      const s = SLOTS[i]
      smoke.emit(HOME.x + s.x, GROUND, HOME.z + s.z, 16, 0.55)
      timers.push(window.setTimeout(() => audio.poof(), (i - from) * 55))
    }
    if (count > previous.current) stage.seal = 0.85
    previous.current = count
    setMounted((m) => Math.max(m, count))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [count])

  const root = useRef<THREE.Group>(null!)
  const nodes = useRef<(THREE.Group | null)[]>([])
  const orbs = useRef<(THREE.Group | null)[]>([])
  const actors = useRef<(Actor | undefined)[]>([])
  const keep = useMemo(() => SLOTS.map((_, i) => (a: Actor) => void (actors.current[i] = a)), [])
  const state = useMemo(
    () => ({
      yaw: SLOTS.map((s) => s.yaw),
      // how far each pair has closed up to work, and how big its sphere is
      form: new Float32Array(PAIRS),
      orb: new Float32Array(PAIRS),
    }),
    [],
  )
  const look = DOJO[0].orb!

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const store = useStore.getState()
    const n = active ? store.clones : 0
    const pairs = n >> 1
    if (squad.since >= 0) {
      // Dismissed mid-run, or the last of them is home.
      if (pairs < squad.pairs || squad.since > squad.end) squad.stop()
      else squad.since += dt
    }
    const running = squad.since >= 0
    const shaping = active && store.charging && !running ? smooth(clamp01(frame.charge * 3)) : 0
    const ease = 1 - Math.exp(-9 * dt)

    for (let k = 0; k < PAIRS; k++) {
      const h = k * 2
      const s = h + 1
      const run = RUNS[k]
      const paired = k < pairs
      const since = running && k < squad.pairs ? squad.since - k * STAGGER : -1

      // In formation while the sphere is being made, and until it is this pair's turn to go.
      const queued = running && k < squad.pairs && since < 0
      const closed = paired ? (running ? (queued ? 1 : 0) : shaping) : 0
      state.form[k] += (closed - state.form[k]) * (1 - Math.exp(-(closed > state.form[k] ? 9 : 5) * dt))
      const form = state.form[k]

      // ---- the one who holds it
      let along = 0
      let hop = 0
      let size = paired && shaping > 0 ? smooth(clamp01(frame.charge * 1.7)) : 0
      let task: Task = form > 0.02 ? 'offer' : 'idle'
      if (since >= 0) {
        if (!squad.left[k]) {
          squad.left[k] = 1
          smoke.emit(HOME.x + SLOTS[h].x, GROUND, HOME.z + SLOTS[h].z, 6, 0.6, 0.5, 0.7)
        }
        if (since < run.time) {
          along = 1 - Math.pow(1 - since / run.time, 3)
          task = 'thrust'
          size = 1.15
        } else {
          if (!squad.struck[k]) {
            squad.struck[k] = 1
            const standing = boulder.hp > 0
            if (standing) boulder.hit(squad.power * 0.6, run.dir)
            blast.fire(TARGET.x - run.dir[0] * 0.9, boulder.y, TARGET.z - run.dir[1] * 0.9, 0.8 + squad.power * 0.8, tint)
            frame.shake = Math.max(frame.shake, 0.3 + squad.power * 0.4)
            audio.burst(0.5 + squad.power * 0.4)
          }
          const after = since - run.time
          if (after < 0.38) {
            along = 1
            task = 'thrust'
            size = Math.max(0, 1.5 - after * 9)
          } else {
            const back = clamp01((after - 0.38) / 0.6)
            along = 1 - smooth(back)
            hop = Math.sin(Math.PI * back) * 0.5
            task = back < 0.45 ? 'guard' : 'idle'
            size = 0
          }
        }
      } else if (queued) size = 1
      troop[h].task = task
      troop[h].amount = form

      const facing = form > 0.02 || since >= 0
      state.yaw[h] = turn(state.yaw[h], facing ? run.yaw : SLOTS[h].yaw, ease)
      const holder = nodes.current[h]
      if (holder) {
        holder.position.set(SLOTS[h].x + run.dir[0] * run.dist * along, hop, SLOTS[h].z + run.dir[1] * run.dist * along)
        holder.rotation.y = state.yaw[h]
      }

      // ---- the one who shapes it: steps in beside him, and back out when he goes
      const step = smooth(form)
      troop[s].task = form > 0.02 ? 'mould' : 'idle'
      troop[s].amount = form
      state.yaw[s] = turn(state.yaw[s], form > 0.02 ? run.yaw + TURNED : SLOTS[s].yaw, ease)
      const shaper = nodes.current[s]
      if (shaper) {
        shaper.position.set(SLOTS[s].x + (run.beside[0] - SLOTS[s].x) * step, 0, SLOTS[s].z + (run.beside[1] - SLOTS[s].z) * step)
        shaper.rotation.y = state.yaw[s]
      }

      // ---- the sphere, in the holder's palm
      const orb = orbs.current[k]
      const rig = actors.current[h]?.rig
      if (orb) {
        if (rig && paired) {
          rig.palm('R', palm, palmN)
          palm.addScaledVector(palmN, look.radius * (0.85 + frame.charge * 0.3) + 0.04)
          root.current.worldToLocal(palm)
          orb.position.copy(palm)
        }
        state.orb[k] += (size - state.orb[k]) * (1 - Math.exp(-(size > state.orb[k] ? 9 : 22) * dt))
        orb.scale.setScalar(Math.max(0.0005, state.orb[k]))
      }
    }
  })

  return (
    <group ref={root} position={[HOME.x, GROUND, HOME.z]}>
      {SLOTS.slice(0, mounted).map((s, i) => (
        <group
          key={i}
          ref={(g) => {
            nodes.current[i] = g
          }}
          position={[s.x, 0, s.z]}
          rotation={[0, s.yaw, 0]}
        >
          <Figure cast={s.cast} show={i < count} direct={CLONE_DIRECT[i]} onActor={keep[i]} />
        </group>
      ))}
      {/* One sphere per pair. They cast no light of their own: four more lights is more than the scene needs. */}
      {mounted > 1
        ? Array.from({ length: PAIRS }, (_, k) => (
            <group
              key={k}
              ref={(g) => {
                orbs.current[k] = g
              }}
              scale={0.0005}
            >
              <ChakraOrb look={look.look} radius={look.radius} live={active} sparks={26} pressable={false} light={false} />
            </group>
          ))
        : null}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Sage Mode                                                            */
/* ------------------------------------------------------------------ */

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/**
 * Natural energy streaming in from all around while he gathers it, and the aura that stays
 * lit for as long as Sage Mode lasts — whichever technique he goes on to use.
 */
function SageAura({ gathering, present }: { gathering: boolean; present: boolean }) {
  const count = 160
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sparkVertex,
        fragmentShader: sparkFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: 1.1 },
          uInward: { value: 1 },
          uVH: { value: 800 },
          uColor: { value: new THREE.Color('#ffb060') },
          uGain: { value: 0 },
        },
      }),
    [],
  )
  const glowMap = useMemo(glowTexture, [])
  const root = useRef<THREE.Group>(null!)
  const glow = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const time = useRef(0)
  const level = useRef(0)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const charge = gathering ? frame.charge : 0
    // The aura belongs to the sage: it is only seen while he is the one on stage, and it fades rather than cuts.
    const lit = present ? clamp01(frame.sage / 1.5) : 0
    level.current += (Math.max(charge, lit) - level.current) * (1 - Math.exp(-6 * dt))
    const power = level.current
    root.current.visible = power > 0.005
    time.current += dt * (0.5 + charge * 2.2)

    mat.uniforms.uTime.value = time.current
    mat.uniforms.uVH.value = state.size.height * state.viewport.dpr
    mat.uniforms.uGain.value = charge * 5 + lit * 1.1

    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.04
    glow.current.quaternion.copy(state.camera.quaternion)
    glow.current.scale.set(4.6 * pulse, 5.6 * pulse, 1)
    ;(glow.current.material as THREE.MeshBasicMaterial).opacity = power * (gathering ? 0.2 : 0.3)
    ring.current.scale.setScalar(0.55 + 0.45 * power)
    ;(ring.current.material as THREE.MeshBasicMaterial).opacity = power * 0.95
    light.current.intensity = power * 26
  })

  return (
    <>
      {/* The light stays in the scene at zero strength: a light that comes and goes makes every material recompile. */}
      <pointLight ref={light} position={[0, FLOOR + 1.7, 0]} color="#ff9a3c" distance={9} decay={2} intensity={0} />
      <group ref={root} visible={false}>
        <points position={[0, FLOOR + 1.7, 0]} geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />
        <mesh ref={glow} position={[0, FLOOR + 1.75, -0.5]} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={glowMap} color="#ff8a2a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR + 0.014, 0]}>
          <ringGeometry args={[1.5, 1.58, 128]} />
          <meshBasicMaterial color={new THREE.Color('#ff9a3c').multiplyScalar(3)} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Truth-Seeking Balls                                                  */
/* ------------------------------------------------------------------ */

const SEEKERS = 9
/** A volley: the gap between one ball leaving and the next, its flight time, and its return. */
const GAP = 0.085
const OUT = 0.24
const BACK = 0.62
/** How far in front of him the face of the boulder is. */
const REACH = RANGE - TARGET.radius * 0.85

const seekers = {
  /** Seconds since the volley began, or -1 when they are simply holding formation. */
  since: -1,
  busy: false,
  struck: new Uint8Array(SEEKERS),
  loose() {
    this.since = 0
    this.busy = true
    this.struck.fill(0)
  },
  stop() {
    this.since = -1
    this.busy = false
  },
}

/** One ball arriving at the boulder. */
function strike(tint: string) {
  const standing = boulder.hp > 0
  if (standing) boulder.hit(0.125, AIM)
  blast.fire(TARGET.x - AIM[0] * 0.95, boulder.y, TARGET.z - AIM[1] * 0.95, standing ? 1 : 0.5, tint)
  frame.shake = Math.max(frame.shake, standing ? 0.32 : 0.12)
  audio.burst(standing ? 0.4 : 0.2)
}

/**
 * Nine black orbs that rearrange themselves on command, and can be loosed at the boulder one after
 * another. Laid out in the performer's own frame, so "behind" and "in front" follow where he faces.
 */
function TruthSeekers({ active, tint }: { active: boolean; tint: string }) {
  const formation = useStore((s) => s.formation)
  const balls = useRef<(THREE.Mesh | null)[]>([])
  const shown = useRef(0)
  const post = useMemo(() => Array.from({ length: SEEKERS }, () => new THREE.Vector3(0, FLOOR + 2.3, -0.75)), [])
  const want = useMemo(() => new THREE.Vector3(), [])
  const mark = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    shown.current += ((active ? 1 : 0) - shown.current) * (1 - Math.exp(-5 * dt))
    if (!active && seekers.busy) seekers.stop()
    if (seekers.since >= 0) {
      seekers.since += dt
      if (seekers.since > (SEEKERS - 1) * GAP + OUT + BACK) seekers.stop()
    }
    const k = 1 - Math.exp(-4.5 * dt)
    balls.current.forEach((m, i) => {
      if (!m) return
      const u = i / SEEKERS
      if (formation === 0) {
        // a ring turning upright behind his back
        const a = u * Math.PI * 2 + t * 0.55
        want.set(Math.cos(a) * 1.08, FLOOR + 2.35 + Math.sin(a) * 1.08, -0.75 + Math.sin(t * 1.7 + i) * 0.06)
      } else if (formation === 1) {
        // circling him at chest height
        const a = u * Math.PI * 2 + t * 1.15
        want.set(Math.cos(a) * 1.9, FLOOR + 1.8 + Math.sin(a * 2 + t) * 0.24, Math.sin(a) * 1.9)
      } else {
        // a wall between him and whatever he faces
        const col = (i % 3) - 1
        const row = Math.floor(i / 3) - 1
        want.set(col * 0.46, FLOOR + 2.05 - row * 0.46 + Math.sin(t * 2.2 + i * 1.7) * 0.03, 1.6 - Math.abs(col) * 0.12)
      }
      post[i].lerp(want, k)

      const since = seekers.since >= 0 ? seekers.since - i * GAP : -1
      if (since < 0) m.position.copy(post[i])
      else {
        mark.set(((i % 3) - 1) * 0.34, boulder.y + (Math.floor(i / 3) - 1) * 0.3, REACH)
        if (since < OUT) {
          const e = since / OUT
          m.position.lerpVectors(post[i], mark, e * e)
        } else {
          if (!seekers.struck[i]) {
            seekers.struck[i] = 1
            strike(tint)
          }
          m.position.lerpVectors(mark, post[i], smooth(clamp01((since - OUT) / BACK)))
        }
      }
      m.scale.setScalar(0.17 * shown.current)
      m.visible = shown.current > 0.01
    })
  })

  return (
    <group rotation={[0, FACE, 0]}>
      {Array.from({ length: SEEKERS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            balls.current[i] = m
          }}
          position={[0, FLOOR + 2.3, -0.75]}
          visible={false}
          castShadow
        >
          <sphereGeometry args={[1, 32, 24]} />
          <meshPhysicalMaterial color="#050506" roughness={0.38} metalness={0} clearcoat={0.6} clearcoatRoughness={0.3} envMapIntensity={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The director                                                         */
/* ------------------------------------------------------------------ */

const palm = new THREE.Vector3()
const palmN = new THREE.Vector3()
const centre = new THREE.Vector3()
const here = new THREE.Vector3()

function Director({ open }: { open: boolean }) {
  const index = useStore((s) => s.dojo)
  const jutsu = DOJO[index]
  const cast = PERFORMER[jutsu.id]
  // The body on stage changes a beat after the technique does, once the smoke has risen to cover it.
  const [onStage, setOnStage] = useState(cast)
  useEffect(() => {
    if (cast === onStage) return
    const timer = window.setTimeout(() => setOnStage(cast), 150)
    return () => window.clearTimeout(timer)
  }, [cast, onStage])

  const root = useRef<THREE.Group>(null!)
  const performer = useRef<THREE.Group>(null!)
  const orb = useRef<THREE.Group>(null!)
  const dais = useRef<THREE.Group>(null!)
  const daisShown = useRef(1)
  const actors = useRef(new Map<Cast, Actor>())
  const keep = useMemo(
    () =>
      CASTS.map((c) => (a: Actor) => {
        actors.current.set(c, a)
        if (import.meta.env.DEV) (window as any).__actors = actors.current
      }),
    [],
  )
  const fallbackLook = DOJO[0].orb!.look

  useFrame((_, rawDt) => {
    if (!open) return
    const dt = Math.min(rawDt, 0.05)
    const store = useStore.getState()
    const j = DOJO[store.dojo]
    const s = stage
    const who = PERFORMER[j.id]
    const actor = actors.current.get(who)
    s.t += dt
    s.spent = Math.max(0, s.spent - dt)
    s.seal = Math.max(0, s.seal - dt)
    s.sweep = Math.max(0, s.sweep - dt)
    s.swap = Math.max(0, s.swap - dt)
    frame.sage = Math.max(0, frame.sage - dt)

    // A different technique starts from a clean slate — and a different form arrives in smoke.
    if (s.id !== j.id) {
      const before = PERFORMER[s.id]
      if (before && before !== who) {
        s.swap = 0.6
        const back = who === KURAMA || before === KURAMA ? KURAMA_BACK * 0.5 : 0
        smoke.emit(HOME.x - AIM[0] * back, GROUND, HOME.z - AIM[1] * back, back ? 44 : 30, back ? 1.8 : 1, 3, back ? 2 : 1.5)
        blast.fire(HOME.x, GROUND + 1.6, HOME.z, 1.3, j.tint)
        audio.poof()
      }
      s.id = j.id
      go('idle')
      s.dash = 0
      s.hop = 0
      s.orb = 'hand'
      s.orbScale = 0
      s.bursts = frame.bursts
      s.volleys = frame.volleys
      s.formation = store.formation
      frame.charge = 0
    }
    if (store.formation !== s.formation) {
      s.formation = store.formation
      s.sweep = 0.7
    }

    const charging = store.charging
    const charge = frame.charge
    // The clones' Rasengan is paid for by the pair.
    const drain = j.id === 'kagebunshin' ? 0.05 * (store.clones >> 1) : (DRAIN[j.id] ?? 0)
    const released = frame.bursts !== s.bursts
    if (released) {
      s.bursts = frame.bursts
      s.power = frame.power
    }

    // ---- chakra: holding a technique spends it, standing easy slowly restores it
    if (charging && s.phase === 'idle' && s.spent <= 0 && drain !== 0) {
      frame.chakra -= drain * (drain > 0 && frame.sage > 0 ? 0.5 : 1) * dt
    } else frame.chakra += (frame.sage > 0 ? 0.075 : 0.032) * dt
    frame.chakra = clamp01(frame.chakra)
    if (frame.chakra <= 0 && charging && drain > 0) {
      // Ran dry mid-technique: it collapses, and he needs a moment.
      frame.charge = 0
      store.setCharging(false)
      s.spent = 2.8
      store.notify('Out of chakra')
      smoke.emit(HOME.x, GROUND, HOME.z, 6, 0.4, 1.2, 0.7)
      // Clones are chakra: with none left, they go.
      if (store.clones) store.setClones(0)
    }
    // No new technique while he is recovering, changing form, or one is still playing out.
    frame.blocked = s.spent > 0 || s.swap > 0 || s.phase !== 'idle'

    const targetY = boulder.y
    const hit = (damage: number, size: number, shake: number) => {
      boulder.hit(damage, AIM)
      blast.fire(TARGET.x - AIM[0] * 0.9, targetY, TARGET.z - AIM[1] * 0.9, size, j.tint)
      frame.shake = Math.max(frame.shake, shake)
      audio.burst(Math.min(1, 0.4 + damage))
    }

    // ---- the script for each technique
    const thrown = THROWN[j.id]
    if (j.id === 'rasengan') {
      if (s.phase === 'idle' && released) {
        go('dash')
        smoke.emit(HOME.x, GROUND, HOME.z, 8, 0.7, 0.5, 0.8)
        audio.poof()
      } else if (s.phase === 'dash') {
        const k = clamp01(s.t / 0.22)
        s.dash = 1 - Math.pow(1 - k, 3)
        if (k >= 1) {
          go('strike')
          hit(s.power * 1.12, 0.9 + s.power * 1.1, 0.35 + s.power * 0.6)
        }
      } else if (s.phase === 'strike' && s.t > 0.4) go('back')
      else if (s.phase === 'back') {
        const k = clamp01(s.t / 0.55)
        s.dash = 1 - smooth(k)
        s.hop = Math.sin(Math.PI * k) * 0.55
        if (k >= 1) go('idle')
      }
    } else if (thrown) {
      if (s.phase === 'idle' && released) go('throw')
      else if (s.phase === 'throw' && s.t > 0.13) {
        // The disc leaves his hand at the top of the swing.
        s.from.copy(orb.current.position)
        s.orb = 'fly'
        s.fly = 0
        go('flight')
        audio.poof()
      } else if (s.phase === 'flight') {
        s.fly = clamp01(s.fly + dt / 0.4)
        if (s.fly >= 1) {
          s.orb = 'target'
          go('vortex')
          hit(0.25 * thrown.grind, 1.6 * thrown.vortex, 0.5)
        }
      } else if (s.phase === 'vortex') {
        // It does not strike once: it stays, and grinds.
        boulder.grind(dt * (0.55 + s.power * 0.75) * thrown.grind)
        frame.shake = Math.max(frame.shake, 0.22 * thrown.vortex)
        if (s.t > 1.25) {
          if (boulder.hp > 0) boulder.hit(1, AIM)
          blast.fire(TARGET.x, targetY, TARGET.z, thrown.finish, j.tint)
          if (thrown.finish > 3) smoke.emit(TARGET.x, GROUND, TARGET.z, 36, 2.2, 3.2, 2)
          frame.shake = Math.max(frame.shake, 0.3 * thrown.finish)
          audio.burst(0.8)
          s.orb = 'hand'
          s.orbScale = 0
          go('after')
        }
      } else if (s.phase === 'after' && s.t > 0.8) go('idle')
    } else if (j.id === 'bijudama') {
      if (s.phase === 'idle' && released) {
        s.from.copy(orb.current.position)
        s.orb = 'fly'
        s.fly = 0
        go('fire')
        actor?.play('attack01', { once: true, speed: 1.5 })
      } else if (s.phase === 'fire') {
        s.fly = clamp01(s.fly + dt / 0.3)
        if (s.fly >= 1) {
          // Nothing survives this one.
          boulder.hit(2, AIM)
          debris.burst(TARGET.x, targetY, TARGET.z, 36, 1.6, AIM)
          smoke.emit(TARGET.x, GROUND, TARGET.z, 46, 2.4, 3.4, 2.2)
          blast.fire(TARGET.x, targetY, TARGET.z, 4.6 + s.power * 2.2, j.tint)
          frame.shake = 1.3
          audio.burst(1)
          s.orb = 'hand'
          s.orbScale = 0
          go('after')
        }
      } else if (s.phase === 'after' && s.t > 1.2) go('idle')
    } else if (j.id === 'sennin') {
      if (released && s.power > 0.96) {
        frame.sage = 24
        frame.chakra = 1
        store.notify('Sage Mode — techniques cost half')
        blast.fire(HOME.x, GROUND + 1.6, HOME.z, 2.2, j.tint)
      }
    } else if (j.id === 'kagebunshin') {
      if (s.phase === 'idle' && released) {
        const pairs = store.clones >> 1
        if (pairs > 0) {
          go('squad')
          squad.launch(s.power, pairs)
        }
      } else if (s.phase === 'squad' && !squad.busy) go('idle')
    } else if (j.id === 'gudodama') {
      if (frame.volleys !== s.volleys) {
        s.volleys = frame.volleys
        if (s.phase === 'idle') {
          go('volley')
          seekers.loose()
        }
      } else if (s.phase === 'volley' && !seekers.busy) go('idle')
    }

    // ---- the performer: at home, running in, or hopping back
    const along = DASH * s.dash - (who === KURAMA ? KURAMA_BACK : 0)
    performer.current.position.set(HOME.x + AIM[0] * along, s.hop, HOME.z + AIM[1] * along)
    const wantDais = who.dais === false ? 0 : 1
    daisShown.current += (wantDais - daisShown.current) * (1 - Math.exp(-6 * dt))
    dais.current.visible = daisShown.current > 0.01
    dais.current.scale.setScalar(Math.max(0.001, daisShown.current))

    // ---- the lens: on him, or on the rock while something is happening to it
    const watching = s.orb !== 'hand' || s.phase === 'after' || s.phase === 'volley' || s.phase === 'squad'
    s.eye += ((watching ? 1 : 0) - s.eye) * (1 - Math.exp(-5 * dt))
    here.set(HOME.x + AIM[0] * DASH * s.dash, FLOOR + 1.7, HOME.z + AIM[1] * DASH * s.dash)
    centre.set(TARGET.x, targetY, TARGET.z)
    frame.subject.copy(here).lerp(centre, s.eye * 0.65).add(ANCHOR.dojo)

    // ---- the sphere: in the hand, in the air, or on the target
    const g = orb.current
    const spec = j.orb
    if (!spec) {
      s.orbScale = 0
      g.scale.setScalar(0.0005)
      return
    }
    let scale = 0
    if (s.orb === 'hand') {
      if (j.id === 'bijudama') {
        // In front of Kurama's jaws.
        const head = actor?.root.getObjectByName('Head_028')
        if (head) {
          head.getWorldPosition(palm)
          root.current.worldToLocal(palm)
          g.position.set(palm.x + AIM[0] * 0.95, palm.y - 0.05, palm.z + AIM[1] * 0.95)
        }
      } else if (actor?.rig) {
        actor.rig.palm('R', palm, palmN)
        palm.addScaledVector(palmN, spec.radius * (0.85 + charge * 0.3) + 0.04)
        root.current.worldToLocal(palm)
        g.position.copy(palm)
      }
      const formed = smooth(clamp01(charge * 1.7))
      if (s.phase === 'dash') scale = 1.15
      else if (s.phase === 'strike') scale = Math.max(0, 1.5 - s.t * 9)
      else if (s.phase === 'throw') scale = 1
      else if (s.phase !== 'idle') scale = 0
      else scale = s.spent > 0 || s.swap > 0 ? 0 : formed
    } else if (s.orb === 'fly') {
      g.position.lerpVectors(s.from, centre, smooth(s.fly))
      g.position.y += Math.sin(Math.PI * s.fly) * (j.id === 'bijudama' ? 0.15 : 0.7)
      scale = 1 + s.fly * 0.4
    } else {
      g.position.copy(centre)
      scale = (1.4 + smooth(clamp01(s.t / 0.5)) * 2.4) * (thrown?.vortex ?? 1)
    }
    s.orbScale += (scale - s.orbScale) * (1 - Math.exp(-(scale > s.orbScale ? 9 : 22) * dt))
    // Never fully hidden: at this size it is invisible, but its shaders are compiled and ready.
    g.scale.setScalar(Math.max(0.0005, s.orbScale))
  })

  return (
    <group ref={root}>
      <group ref={dais} position={[HOME.x, 0, HOME.z]}>
        <Dais radius={1.6} />
      </group>

      <group ref={performer} position={[HOME.x, 0, HOME.z]}>
        {/* Every form is loaded when the page opens, so changing between them never waits on a download. */}
        <group position={[0, FLOOR, 0]}>
          {CASTS.map((c, i) => (
            <Figure key={i} cast={c} show={open && c === cast && c === onStage} direct={DIRECT.get(c)} onActor={keep[i]} />
          ))}
        </group>
        <SageAura gathering={open && jutsu.mode === 'sage'} present={open && cast === SAGE} />
        <TruthSeekers active={open && jutsu.mode === 'orbs'} tint={jutsu.tint} />
      </group>

      <group ref={orb} scale={0.0005}>
        <ChakraOrb
          look={jutsu.orb?.look ?? fallbackLook}
          radius={jutsu.orb?.radius ?? 0.3}
          live={open && !!jutsu.orb}
          sparks={80}
          // The Six Paths figure is pale and holds the sphere close: full strength would wash him out.
          glow={cast === SIX ? 0.45 : 1}
        />
      </group>

      <ShadowClones active={open && jutsu.mode === 'clones'} tint={DOJO[0].tint} />
      <Boulder />
      <Debris />
      <Blast />
      <Smoke />
    </group>
  )
}

/** The Jutsu page's own stage. Built the first time the page is opened, then kept. */
export function Dojo() {
  const open = useStore((s) => s.view === 'dojo')
  const [built, setBuilt] = useState(open)
  useEffect(() => {
    if (open) setBuilt(true)
  }, [open])

  if (!built) return null
  return (
    <group position={ANCHOR.dojo} visible={open}>
      <Showfloor active={open} radius={18} />
      <StageLight position={[0.5, 8.6, 3.2]} intensity={120} />
      <Director open={open} />
    </group>
  )
}
