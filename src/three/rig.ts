import * as THREE from 'three'

/*
 * A small pose solver for humanoid skeletons.
 *
 * The models come from different authors with different bone names, bone axes and rest poses,
 * so poses are not stored as bone rotations. They are described in the character's own space —
 * x to his left, y up, z the way he faces — as directions for each limb segment ("upper arm
 * points forward and a little down") plus a few body angles. The solver turns that into bone
 * rotations for whichever skeleton it is given, by swinging each bone from its rest direction
 * to the requested one. One pose library therefore drives every rigged model.
 */

export type V3 = [number, number, number]

export interface ArmPose {
  /** Direction of the upper arm and of the forearm, relative to the chest. */
  upper: V3
  fore: V3
  /** Direction the fingers point and the way the palm faces, used in proportion to `grip`. */
  hand: V3
  palm: V3
  /** 0 = the hand simply follows the forearm, 1 = it is held exactly as `hand` / `palm` say. */
  grip: number
  /** 0 = open hand, 1 = fist. */
  curl: number
  /**
   * Optional: a point the wrist should reach, in the chest's frame, measured from midway between the
   * shoulders in fractions of body height. Used in proportion to `ik`, it bends the arm to get there —
   * which is what lets two hands actually meet on models with different proportions.
   */
  reach?: V3
  /** Which way the elbow points while reaching. */
  pole?: V3
  ik?: number
  /**
   * For a hand that holds something (a staff): the direction to point it, relative to the chest.
   * The hand keeps its `hand` direction and turns about it until the thing points that way, so
   * `palm` is not needed. And how far the thing is drawn out: 1 = fully (the default), 0 = put away.
   * Models with nothing in that hand ignore both.
   */
  aim?: V3
  prop?: number
}

export interface Pose {
  /** Upper-body angles in radians: bend forward, turn to his left, tip sideways. */
  lean: number
  twist: number
  side: number
  /** Legs: bend both knees, step the left leg forward into a lunge, set the feet apart. */
  crouch: number
  lunge: number
  spread: number
  /** Raise the whole body off the floor, as a fraction of its height. */
  lift: number
  headPitch: number
  headYaw: number
  L: ArmPose
  R: ArmPose
}

interface ArmSpec {
  upper: string
  fore: string
  hand: string
  /** First bone of each finger; the solver follows each chain down. */
  fingers: string[]
  thumb?: string
}

interface LegSpec {
  thigh: string
  shin: string
  foot: string
}

export interface RigSpec {
  hips: string
  /** Lowest spine bone first; the last one is the chest that the arms and neck hang from. */
  spine: string[]
  neck: string
  arms: { L: ArmSpec; R: ArmSpec }
  legs: { L: LegSpec; R: LegSpec }
  /** Root bones of whatever each hand holds, where the model comes with something in it. */
  props?: { L?: string; R?: string }
  /**
   * First bones of chains that hang loose (ribbons): whatever pose they were modelled in, they fall
   * toward the ground, follow what they hang from only halfway, and stir a little.
   */
  drape?: string[]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mixV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const mixArm = (a: ArmPose, b: ArmPose, t: number): ArmPose => ({
  upper: mixV(a.upper, b.upper, t),
  fore: mixV(a.fore, b.fore, t),
  hand: mixV(a.hand, b.hand, t),
  palm: mixV(a.palm, b.palm, t),
  grip: lerp(a.grip, b.grip, t),
  curl: lerp(a.curl, b.curl, t),
  // A pose without a reach target keeps the other's while its influence fades.
  aim: a.aim && b.aim ? mixV(a.aim, b.aim, t) : (b.aim ?? a.aim),
  prop: lerp(a.prop ?? 1, b.prop ?? 1, t),
  reach: a.reach && b.reach ? mixV(a.reach, b.reach, t) : (b.reach ?? a.reach),
  pole: a.pole && b.pole ? mixV(a.pole, b.pole, t) : (b.pole ?? a.pole),
  ik: lerp(a.ik ?? 0, b.ik ?? 0, t),
})

/** Blend of two poses. Directions are blended as vectors and renormalised by the solver. */
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  return {
    lean: lerp(a.lean, b.lean, t),
    twist: lerp(a.twist, b.twist, t),
    side: lerp(a.side, b.side, t),
    crouch: lerp(a.crouch, b.crouch, t),
    lunge: lerp(a.lunge, b.lunge, t),
    spread: lerp(a.spread, b.spread, t),
    lift: lerp(a.lift, b.lift, t),
    headPitch: lerp(a.headPitch, b.headPitch, t),
    headYaw: lerp(a.headYaw, b.headYaw, t),
    L: mixArm(a.L, b.L, t),
    R: mixArm(a.R, b.R, t),
  }
}

interface Rest {
  local: THREE.Quaternion
  world: THREE.Quaternion
  pos: THREE.Vector3
  /** Unit direction to the next joint, in character space. */
  dir: THREE.Vector3
}

interface Arm {
  side: 1 | -1
  upper: THREE.Object3D
  fore: THREE.Object3D
  hand: THREE.Object3D
  fingers: THREE.Object3D[][]
  /** How far each bone of each finger is already bent toward the palm in the model's rest pose (radians). */
  flex: number[][]
  thumb: THREE.Object3D[]
  /** Rest finger direction and palm normal of the hand, in character space; and the line of its knuckles, index to little finger. */
  restF: THREE.Vector3
  restN: THREE.Vector3
  restK: THREE.Vector3
  /** Rough distance from wrist to knuckles, in character space. */
  reach: number
  /** Shoulder joint relative to the point midway between the shoulders, and the two bone lengths. */
  shoulder: THREE.Vector3
  upperLength: number
  foreLength: number
}

/** Where the skin is around a bone: see `survey`. */
interface Flesh {
  joint: THREE.Vector3
  shared: number
  body: THREE.Vector3
  own: number
}

/** How far round each joint of a finger has come when the hand is a fist, in half turns from flat. */
const FIST: Record<number, number[]> = { 1: [0.5], 2: [0.48, 1.1], 3: [1 / 3, 2 / 3, 1] }

/**
 * Where a thumb's first and last bones point in a fist, as amounts of the hand's own three directions:
 * along the fingers, out of the palm, and along the knuckles toward the little finger.
 */
const THUMB: [V3, V3] = [
  [0.66, 0.68, -0.35],
  [0.22, 0.2, 0.95],
]

interface Leg {
  thigh: THREE.Object3D
  shin: THREE.Object3D
  foot: THREE.Object3D
  restFootY: number
}

const q0 = new THREE.Quaternion()
const q1 = new THREE.Quaternion()
const q2 = new THREE.Quaternion()
const v0 = new THREE.Vector3()
const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()
const v4 = new THREE.Vector3()
const m0 = new THREE.Matrix4()
const m1 = new THREE.Matrix4()
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const euler = new THREE.Euler()

export class Rig {
  /** Height of the figure at rest, in its own units. */
  readonly height: number

  private rest = new Map<THREE.Object3D, Rest>()
  private restMatrix = new Map<THREE.Object3D, THREE.Matrix4>()
  private cache = new Map<THREE.Object3D, THREE.Quaternion>()
  private hips: THREE.Object3D
  private hipsRestPos: THREE.Vector3
  private hipsParentQ: THREE.Quaternion
  private hipsParentScale: number
  private spine: THREE.Object3D[]
  private chest: THREE.Object3D
  private neck: THREE.Object3D
  private arms: { L: Arm; R: Arm }
  private legs: { L: Leg; R: Leg }
  private drapes: THREE.Object3D[][] = []
  /** What each hand holds, and the way it points at rest (character space). */
  private props: { L?: { bone: THREE.Object3D; dir: THREE.Vector3 }; R?: { bone: THREE.Object3D; dir: THREE.Vector3 } } = {}
  private rootInv = new THREE.Matrix4()
  private handDelta = { L: new THREE.Quaternion(), R: new THREE.Quaternion() }

  constructor(
    private root: THREE.Object3D,
    spec: RigSpec,
  ) {
    root.updateWorldMatrix(true, true)
    this.rootInv.copy(root.matrixWorld).invert()
    const find = (name: string) => {
      const o = root.getObjectByName(name) ?? root.getObjectByName(name.replace(/\s+/g, '_'))
      if (!o) throw new Error(`Rig: bone "${name}" not found`)
      return o
    }
    const chain = (first: THREE.Object3D, max = 3) => {
      const out = [first]
      let b = first
      while (out.length < max && b.children.length === 1 && b.children[0].children.length > 0) {
        b = b.children[0]
        out.push(b)
      }
      return out
    }
    const box = new THREE.Box3().setFromObject(root)
    box.applyMatrix4(this.rootInv)
    this.height = box.max.y - box.min.y

    // Before anything is measured, each hand's bones are set where its skin really bends: see `seat`.
    const digits = (a: ArmSpec) => [...a.fingers, ...(a.thumb ? [a.thumb] : [])].flatMap((n) => chain(find(n)))
    const flesh = this.survey([...digits(spec.arms.L), ...digits(spec.arms.R)])
    this.seat(find(spec.arms.L.hand), digits(spec.arms.L), flesh)
    this.seat(find(spec.arms.R.hand), digits(spec.arms.R), flesh)
    root.updateWorldMatrix(true, true)

    // Rest transforms of every node between the root and any bone, in character space.
    root.traverse((o) => {
      const m = new THREE.Matrix4().multiplyMatrices(this.rootInv, o.matrixWorld)
      const pos = new THREE.Vector3()
      const world = new THREE.Quaternion()
      m.decompose(pos, world, v0)
      this.rest.set(o, { local: o.quaternion.clone(), world, pos, dir: new THREE.Vector3(0, 1, 0) })
      this.restMatrix.set(o, m)
    })
    const aim = (from: THREE.Object3D, to: THREE.Object3D) => {
      const r = this.rest.get(from)!
      r.dir.copy(this.rest.get(to)!.pos).sub(r.pos).normalize()
    }

    this.hips = find(spec.hips)
    this.hipsRestPos = this.hips.position.clone()
    const hp = this.rest.get(this.hips.parent!)!
    this.hipsParentQ = hp.world.clone()
    this.hipsParentScale = v0.setFromMatrixScale(this.restMatrix.get(this.hips.parent!)!).x || 1
    this.spine = spec.spine.map(find)
    this.chest = this.spine[this.spine.length - 1]
    this.neck = find(spec.neck)

    const arm = (s: ArmSpec, side: 1 | -1): Arm => {
      const upper = find(s.upper)
      const fore = find(s.fore)
      const hand = find(s.hand)
      aim(upper, fore)
      aim(fore, hand)
      const fingers = s.fingers.map((n) => chain(find(n)))
      const thumb = s.thumb ? chain(find(s.thumb)) : []
      // Which way each finger bone runs. For all but the last that is simply toward the next bone.
      // The last one has only an exporter's "end" marker after it, which on these models can point
      // anywhere — back up the finger, even — so it is read off the skin instead: from the joint to
      // the middle of what the bone carries. Failing that, it carries on the way the finger was going.
      const wrist = this.rest.get(hand)!.pos
      for (const f of [...fingers, thumb]) {
        for (let i = 0; i < f.length; i++) {
          const r = this.rest.get(f[i])!
          if (f[i + 1]) {
            aim(f[i], f[i + 1])
            continue
          }
          const going = i > 0 ? this.rest.get(f[i - 1])!.dir : r.pos.clone().sub(wrist).normalize()
          const skin = flesh.get(f[i])
          if (skin && skin.own >= 4) r.dir.copy(skin.body).sub(r.pos).normalize()
          if (!skin || skin.own < 4 || r.dir.dot(going) < 0.5) r.dir.copy(going)
        }
      }
      const knuckles = new THREE.Vector3()
      for (const f of fingers) knuckles.add(this.rest.get(f[0])!.pos)
      knuckles.multiplyScalar(1 / Math.max(1, fingers.length))
      const restF = knuckles.clone().sub(wrist)
      const reach = restF.length()
      if (reach < 1e-6) restF.copy(this.rest.get(fore)!.dir)
      restF.normalize()
      this.rest.get(hand)!.dir.copy(restF)
      // Which way the palm faces. The line of knuckles, index to little finger, crossed with the way the
      // fingers point gives it exactly. With only one finger mapped, the thumb has to stand in for that
      // line — a poorer guide, since a thumb is set toward the palm as well as to the side.
      const restN = new THREE.Vector3(0, -1, 0)
      const across = new THREE.Vector3()
      if (fingers.length > 1) across.copy(this.rest.get(fingers[fingers.length - 1][0])!.pos).sub(this.rest.get(fingers[0][0])!.pos)
      else if (thumb.length) across.copy(wrist).sub(this.rest.get(thumb[0])!.pos)
      const n = new THREE.Vector3().crossVectors(across, restF).multiplyScalar(side)
      if (n.lengthSq() > 1e-10) restN.copy(n)
      restN.addScaledVector(restF, -restN.dot(restF)).normalize()
      const at = (o: THREE.Object3D) => this.rest.get(o)!.pos
      return {
        side,
        upper,
        fore,
        hand,
        fingers,
        // Some models are built with the fingers resting half curled, some with them flat. Measuring
        // that here lets "curl: 0" mean a flat hand on all of them.
        flex: fingers.map((f) => f.map((b) => Math.asin(Math.max(-1, Math.min(1, this.rest.get(b)!.dir.dot(restN)))))),
        thumb,
        restF,
        restN,
        restK: across.lengthSq() > 1e-10 ? across.clone().normalize() : new THREE.Vector3().crossVectors(restF, restN).multiplyScalar(side),
        reach: reach || this.height * 0.04,
        shoulder: at(upper).clone(),
        upperLength: at(upper).distanceTo(at(fore)),
        foreLength: at(fore).distanceTo(at(hand)),
      }
    }
    this.arms = { L: arm(spec.arms.L, 1), R: arm(spec.arms.R, -1) }
    const between = this.arms.L.shoulder.clone().add(this.arms.R.shoulder).multiplyScalar(0.5)
    this.arms.L.shoulder.sub(between)
    this.arms.R.shoulder.sub(between)

    const leg = (s: LegSpec): Leg => {
      const thigh = find(s.thigh)
      const shin = find(s.shin)
      const foot = find(s.foot)
      aim(thigh, shin)
      aim(shin, foot)
      return { thigh, shin, foot, restFootY: this.rest.get(foot)!.pos.y }
    }
    this.legs = { L: leg(spec.legs.L), R: leg(spec.legs.R) }

    for (const side of ['L', 'R'] as const) {
      const name = spec.props?.[side]
      if (!name) continue
      const bone = find(name)
      const links = chain(bone, 40)
      const tip = links[links.length - 1].children[0] ?? links[links.length - 1]
      const dir = this.rest.get(tip)!.pos.clone().sub(this.rest.get(bone)!.pos)
      if (dir.lengthSq() > 1e-10) this.props[side] = { bone, dir: dir.normalize() }
    }
    this.drapes = (spec.drape ?? []).map((n) => chain(find(n), 40))
    for (const links of this.drapes) {
      for (let i = 0; i < links.length; i++) {
        const next = links[i + 1] ?? links[i].children[0]
        if (next) aim(links[i], next)
      }
    }
  }

  /**
   * Where the skin is around some bones, in character space, as the model stands: for each bone, the
   * middle of the vertices it shares with its parent — the place the mesh bends — and the middle of
   * those it carries more or less alone.
   */
  private survey(bones: THREE.Object3D[]) {
    const found = new Map<THREE.Object3D, Flesh>()
    for (const b of bones) found.set(b, { joint: new THREE.Vector3(), shared: 0, body: new THREE.Vector3(), own: 0 })
    const p = new THREE.Vector3()
    const at = new THREE.Vector3()
    const j = [0, 0, 0, 0]
    const w = [0, 0, 0, 0]
    this.root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      const { bones: all, boneInverses } = mesh.skeleton
      const entry = all.map((b) => found.get(b))
      if (!entry.some(Boolean)) return
      const parent = all.map((b) => all.indexOf(b.parent as THREE.Bone))
      const skin = all.map((b, i) => new THREE.Matrix4().multiplyMatrices(this.rootInv, b.matrixWorld).multiply(boneInverses[i]).multiply(mesh.bindMatrix))
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes
      const share = (bone: number) => {
        let sum = 0
        for (let k = 0; k < 4; k++) if (j[k] === bone) sum += w[k]
        return sum
      }
      for (let v = 0; v < position.count; v++) {
        let ours = false
        let total = 0
        for (let k = 0; k < 4; k++) {
          j[k] = skinIndex.getComponent(v, k)
          w[k] = skinWeight.getComponent(v, k)
          total += w[k]
          if (w[k] > 0 && entry[j[k]]) ours = true
        }
        if (!ours) continue
        p.set(0, 0, 0)
        for (let k = 0; k < 4; k++) {
          w[k] /= total
          if (w[k] > 0) p.addScaledVector(at.fromBufferAttribute(position, v).applyMatrix4(skin[j[k]]), w[k])
        }
        for (let k = 0; k < 4; k++) {
          const e = entry[j[k]]
          if (!e || w[k] <= 0 || j.indexOf(j[k]) < k) continue
          const mine = share(j[k])
          if (mine > 0.5) {
            e.body.add(p)
            e.own++
          }
          if (mine > 0.2 && share(parent[j[k]]) > 0.2) {
            e.joint.add(p)
            e.shared++
          }
        }
      }
    })
    for (const e of found.values()) {
      if (e.own) e.body.multiplyScalar(1 / e.own)
      if (e.shared) e.joint.multiplyScalar(1 / e.shared)
    }
    return found
  }

  /**
   * Seats a hand's bones in its skin.
   *
   * On some models the hand mesh does not sit on its own bones: it was made for a skeleton shared with
   * other characters and is a centimetre or two off it. Nobody sees that on an arm, but a finger that
   * turns about a point outside itself slides into the palm as it closes, and a hand that turns about
   * a point beside its wrist ends up beside where it was sent. So the hand's bones are moved, all
   * together, by however far the mesh's joints are from them, and the skin is bound again to the bones
   * where they now are — which changes nothing at all until they turn.
   */
  private seat(hand: THREE.Object3D, joints: THREE.Object3D[], flesh: Map<THREE.Object3D, Flesh>) {
    const where = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(this.rootInv)
    const off = joints.filter((b) => flesh.get(b)!.shared >= 3).map((b) => flesh.get(b)!.joint.clone().sub(where(b)))
    if (off.length < 3) return
    // The middle one of the joints' answers, axis by axis: a ring of four vertices is a rough guide alone.
    const middle = (axis: number) => {
      const sorted = off.map((v) => v.getComponent(axis)).sort((a, b) => a - b)
      const half = sorted.length >> 1
      return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
    }
    const shift = new THREE.Vector3(middle(0), middle(1), middle(2))
    // Less than a finger's half-width is within the error of the estimate: leave well alone.
    if (shift.length() < where(joints[0]).distanceTo(where(hand)) * 0.08) return

    const was = new Map<THREE.Object3D, THREE.Matrix4>()
    hand.traverse((o) => void was.set(o, o.matrixWorld.clone()))
    const parent = new THREE.Matrix4().multiplyMatrices(this.rootInv, hand.parent!.matrixWorld)
    hand.position.copy(where(hand).add(shift).applyMatrix4(parent.invert()))
    hand.updateWorldMatrix(false, true)
    this.root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      const skeleton = mesh.skeleton
      let own: THREE.Matrix4[] | null = null
      skeleton.bones.forEach((b, i) => {
        const old = was.get(b)
        if (!old) return
        // The inverses are shared with every other copy of the model; this copy takes its own.
        own ??= skeleton.boneInverses = skeleton.boneInverses.slice()
        own[i] = new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(old).multiply(own[i])
      })
    })
  }

  /** Current orientation of a node in character space. Valid for the solve in progress. */
  private wq(o: THREE.Object3D): THREE.Quaternion {
    if (o === this.root) return q0.identity().clone()
    let q = this.cache.get(o)
    if (!q) {
      q = this.wq(o.parent!).clone().multiply(o.quaternion)
      this.cache.set(o, q)
    }
    return q
  }

  /** Orients a bone in character space, working out the local rotation its parent requires. */
  private setWorld(o: THREE.Object3D, world: THREE.Quaternion) {
    o.quaternion.copy(this.wq(o.parent!)).invert().multiply(world)
    this.cache.set(o, world.clone())
  }

  /** How far a bone has turned from rest, in character space. */
  private delta(o: THREE.Object3D, out: THREE.Quaternion) {
    return out.copy(this.rest.get(o)!.world).invert().premultiply(this.wq(o))
  }

  /** Swings a bone so it points along `dir` (given in the frame `frame` has turned to). */
  private point(o: THREE.Object3D, dir: V3, frame: THREE.Quaternion) {
    const r = this.rest.get(o)!
    const from = v0.copy(r.dir).applyQuaternion(frame)
    const to = v1.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(frame)
    const world = q1.setFromUnitVectors(from, to).multiply(frame).multiply(r.world)
    this.setWorld(o, world.clone())
  }

  /** Two-bone reach: the upper-arm and forearm directions that put the wrist on the pose's target. */
  private bend(a: Arm, p: ArmPose): [V3, V3] {
    const to = v0.set(p.reach![0], p.reach![1], p.reach![2]).multiplyScalar(this.height).sub(a.shoulder)
    const la = a.upperLength
    const lb = a.foreLength
    const dist = Math.min(Math.max(to.length(), Math.abs(la - lb) + 1e-4), (la + lb) * 0.999)
    to.normalize()
    const cos = Math.min(1, Math.max(-1, (la * la + dist * dist - lb * lb) / (2 * la * dist)))
    const sin = Math.sqrt(1 - cos * cos)
    // The elbow swings out of the shoulder–wrist line toward the pole.
    const pole = p.pole ?? [a.side * 0.6, -0.75, -0.25]
    const out = v1.set(pole[0], pole[1], pole[2])
    out.addScaledVector(to, -out.dot(to))
    if (out.lengthSq() < 1e-8) out.set(a.side, 0, 0).addScaledVector(to, -a.side * to.x)
    out.normalize()
    const upper: V3 = [to.x * cos + out.x * sin, to.y * cos + out.y * sin, to.z * cos + out.z * sin]
    const fore: V3 = [to.x * dist - upper[0] * la, to.y * dist - upper[1] * la, to.z * dist - upper[2] * la]
    return [upper, fore]
  }

  private solveArm(a: Arm, p: ArmPose, chest: THREE.Quaternion) {
    let upper = p.upper
    let fore = p.fore
    const ik = Math.min(1, p.ik ?? 0)
    if (p.reach && ik > 0.001) {
      const [u, f] = this.bend(a, p)
      const unit = (v: V3): V3 => {
        const l = Math.hypot(v[0], v[1], v[2]) || 1
        return [v[0] / l, v[1] / l, v[2] / l]
      }
      upper = mixV(unit(upper), unit(u), ik)
      fore = mixV(unit(fore), unit(f), ik)
    }
    this.point(a.upper, upper, chest)
    this.point(a.fore, fore, chest)

    // Hand: either riding on the forearm, or held to an exact finger direction and palm facing.
    const hr = this.rest.get(a.hand)!
    const follow = this.delta(a.fore, new THREE.Quaternion()).multiply(hr.world)
    if (p.grip > 0.001) {
      const f = v0.set(p.hand[0], p.hand[1], p.hand[2]).normalize().applyQuaternion(chest)
      const n = v1.set(p.palm[0], p.palm[1], p.palm[2]).applyQuaternion(chest)
      n.addScaledVector(f, -n.dot(f))
      if (n.lengthSq() < 1e-8) n.copy(a.restN).applyQuaternion(chest).addScaledVector(f, -a.restN.dot(f))
      n.normalize()
      const target = m0.makeBasis(f, n, v2.crossVectors(f, n))
      const rest = m1.makeBasis(a.restF, a.restN, v2.crossVectors(a.restF, a.restN))
      const held = q1.setFromRotationMatrix(target).multiply(q2.setFromRotationMatrix(rest).invert()).multiply(hr.world)
      // Something in the hand, and somewhere to point it: turn the hand about its own axis until it does.
      const prop = this.props[a.side === 1 ? 'L' : 'R']
      if (prop && p.aim) {
        const now = v3.copy(prop.dir).applyQuaternion(q2.copy(hr.world).invert().premultiply(held))
        const want = v4.set(p.aim[0], p.aim[1], p.aim[2]).normalize().applyQuaternion(chest)
        now.addScaledVector(f, -now.dot(f))
        want.addScaledVector(f, -want.dot(f))
        if (now.lengthSq() > 1e-6 && want.lengthSq() > 1e-6) {
          held.premultiply(q2.setFromUnitVectors(now.normalize(), want.normalize()))
        }
      }
      follow.slerp(held, Math.min(1, p.grip))
    }
    this.setWorld(a.hand, follow)
    // A staff that is put away shrinks back into the fist it grew from.
    const carried = this.props[a.side === 1 ? 'L' : 'R']
    if (carried) carried.bone.scale.setScalar(Math.max(0.001, Math.min(1, p.prop ?? 1)))

    // Fingers curl toward the palm, each joint further round than the one before it. A finger of three
    // bones makes half a turn in all for a fist; one of two has to go a little further at its second
    // joint to tuck the tip in.
    const hd = this.delta(a.hand, this.handDelta[a.side === 1 ? 'L' : 'R'])
    a.fingers.forEach((chain, n) => {
      const fist = FIST[chain.length]
      for (let i = 0; i < chain.length; i++) {
        const r = this.rest.get(chain[i])!
        const axis = v0.crossVectors(r.dir, a.restN)
        if (axis.lengthSq() < 1e-8) continue
        // The bend asked for, less the bend this part of the finger was modelled with.
        const bend = q1.setFromAxisAngle(axis.normalize(), p.curl * Math.PI * fist[i] - a.flex[n][i])
        this.setWorld(chain[i], new THREE.Quaternion().copy(hd).multiply(bend).multiply(r.world))
      }
    })
    // A thumb does not curl like a finger. Closing on nothing, it folds over the front of the fingers:
    // its first bone leans in toward the palm and its last lies across them, toward the little finger.
    // It starts late — in a hand that is merely relaxed it stays where it was modelled. Closing on a
    // staff it only swings part of the way there, and lies alongside.
    const holding = carried ? Math.min(1, p.prop ?? 1) : 0
    const folded = Math.min(1, Math.max(0, (p.curl - 0.3) / 0.7))
    for (let i = 0; i < a.thumb.length; i++) {
      const r = this.rest.get(a.thumb[i])!
      const k = a.thumb.length > 1 ? i / (a.thumb.length - 1) : 1
      const fold = v1.set(0, 0, 0)
      fold.addScaledVector(a.restF, lerp(THUMB[0][0], THUMB[1][0], k))
      fold.addScaledVector(a.restN, lerp(THUMB[0][1], THUMB[1][1], k))
      fold.addScaledVector(a.restK, lerp(THUMB[0][2], THUMB[1][2], k))
      const reach = p.curl * 0.6 * (i + 1)
      const round = v3.copy(r.dir).addScaledVector(a.restK, reach * 0.55).addScaledVector(a.restN, reach * 0.3).normalize()
      const to = v0.copy(r.dir).lerp(fold.normalize(), folded).normalize().lerp(round, holding).normalize()
      const swing = q1.setFromUnitVectors(v4.copy(r.dir), to)
      this.setWorld(a.thumb[i], new THREE.Quaternion().copy(hd).multiply(swing).multiply(r.world))
    }
  }

  private solveLeg(l: Leg, x: number, p: Pose, front: boolean) {
    const t = this.rest.get(l.thigh)!.dir
    const s = this.rest.get(l.shin)!.dir
    const c = p.crouch
    const g = p.lunge
    const thigh: V3 = [t.x + x * (p.spread * 0.38 + c * 0.22), t.y, t.z + c * 0.85 + (front ? g * 1.05 : -g * 0.8)]
    const shin: V3 = [s.x + x * p.spread * 0.2, s.y, s.z - c * 0.75 - (front ? g * 0.15 : g * 0.6)]
    const flat = q2.identity()
    this.point(l.thigh, thigh, flat)
    this.point(l.shin, shin, flat)
    // Feet stay flat on the ground whatever the shins are doing.
    this.setWorld(l.foot, this.rest.get(l.foot)!.world.clone())
  }

  /** Applies a pose to the skeleton. `time` drives the small secondary motion of loose chains. */
  solve(p: Pose, time: number) {
    this.cache.clear()
    const hr = this.rest.get(this.hips)!
    this.hips.position.copy(this.hipsRestPos)

    // Body: a third of each angle at the hips, the rest shared up the spine.
    const part = (k: number) => q1.setFromEuler(euler.set(p.lean * k, p.twist * k, p.side * k, 'YXZ'))
    this.setWorld(this.hips, part(0.3).clone().multiply(hr.world))
    const share = 0.7 / this.spine.length
    for (const b of this.spine) {
      const carried = this.delta(b.parent!, new THREE.Quaternion())
      this.setWorld(b, carried.multiply(part(share)).multiply(this.rest.get(b)!.world))
    }
    const chest = this.delta(this.chest, new THREE.Quaternion())

    q1.setFromEuler(euler.set(p.headPitch, p.headYaw, 0, 'YXZ'))
    this.setWorld(this.neck, new THREE.Quaternion().copy(chest).multiply(q1).multiply(this.rest.get(this.neck)!.world))

    this.solveArm(this.arms.L, p.L, chest)
    this.solveArm(this.arms.R, p.R, chest)
    this.solveLeg(this.legs.L, 1, p, true)
    this.solveLeg(this.legs.R, -1, p, false)

    // Bending the legs lifts the feet; drop the hips until the lower foot is back on the floor.
    this.root.updateWorldMatrix(true, false)
    this.rootInv.copy(this.root.matrixWorld).invert()
    this.hips.updateWorldMatrix(true, true)
    const footY = (l: Leg) => v0.setFromMatrixPosition(l.foot.matrixWorld).applyMatrix4(this.rootInv).y - l.restFootY
    const rise = Math.min(footY(this.legs.L), footY(this.legs.R))
    const shift = v1.set(0, -rise + p.lift * this.height, p.lunge * 0.05 * this.height)
    shift.applyQuaternion(q1.copy(this.hipsParentQ).invert()).multiplyScalar(1 / this.hipsParentScale)
    this.hips.position.add(shift)

    // Ribbons give way to gravity: they hang down and a little back, follow the head only halfway, and stir.
    for (const links of this.drapes) {
      const carried = this.delta(links[0].parent!, new THREE.Quaternion()).slerp(q0.identity(), 0.5)
      for (let i = 0; i < links.length; i++) {
        const a = 0.05 + i * 0.035
        this.point(links[i], [a * 0.7 * Math.sin(time * 1.6 - i * 0.5 + 1.3), -1, -0.2 + a * Math.sin(time * 2.1 - i * 0.7)], carried)
      }
    }

    this.hips.updateWorldMatrix(true, true)
  }

  /**
   * World-space centre of a palm and the direction it faces — where to put something he is holding.
   * Call after `solve`.
   */
  palm(side: 'L' | 'R', pos: THREE.Vector3, normal: THREE.Vector3) {
    const a = this.arms[side]
    const world = q0.setFromRotationMatrix(m0.extractRotation(this.root.matrixWorld))
    const hd = this.handDelta[side]
    const scale = v2.setFromMatrixScale(this.root.matrixWorld).x
    normal.copy(a.restN).applyQuaternion(hd).applyQuaternion(world).normalize()
    v0.copy(a.restF).applyQuaternion(hd).applyQuaternion(world)
    pos.setFromMatrixPosition(a.hand.matrixWorld).addScaledVector(v0, a.reach * 0.75 * scale)
    return pos
  }
}

/* ------------------------------------------------------------------ */
/* Skeleton maps                                                        */
/* ------------------------------------------------------------------ */

const sage: RigSpec = {
  hips: 'bone_Hips_030',
  spine: ['bone_Spine_081', 'bone_Spine1_082'],
  neck: 'bone_Neck_098',
  arms: {
    L: {
      upper: 'bone_LeftArm_084',
      fore: 'bone_LeftForeArm_085',
      hand: 'bone_LeftHand_086',
      fingers: ['bone_Left_Finger11_089', 'bone_Left_Finger21_091', 'bone_Left_Finger31_093', 'bone_Left_Finger41_095'],
      thumb: 'bone_Left_Finger01_087',
    },
    R: {
      upper: 'bone_RightArm_0113',
      fore: 'bone_RightForeArm_0114',
      hand: 'bone_RightHand_0115',
      fingers: ['bone_Right_Finger11_0118', 'bone_Right_Finger21_0120', 'bone_Right_Finger31_0122', 'bone_Right_Finger41_0124'],
      thumb: 'bone_Right_Finger01_0116',
    },
  },
  legs: {
    L: { thigh: 'bone_LeftLegUpper_073', shin: 'bone_LeftLeg_074', foot: 'bone_LeftAnkle_075' },
    R: { thigh: 'bone_RightLegUpper_077', shin: 'bone_RightLeg_078', foot: 'bone_RightAnkle_079' },
  },
}

const six: RigSpec = {
  drape: ['cloth_headband_right_01_0120', 'cloth_headband_left_01_0123'],
  hips: 'root_body_05',
  spine: ['body_upper_027', 'body_spine1_028'],
  neck: 'head_neck_029',
  arms: {
    L: {
      upper: 'arm_left_arm1_0145',
      fore: 'arm_left_arm2_0146',
      hand: 'arm_left_hand_0147',
      fingers: ['arm_left_finger_index_0_0150', 'arm_left_finger_middle_0_0153', 'arm_left_finger_ring_0_0156', 'arm_left_finger_pinky_0_0159'],
      thumb: 'arm_left_finger_thumb_0_0148',
    },
    R: {
      upper: 'arm_right_arm1_0171',
      fore: 'arm_right_arm2_0172',
      hand: 'arm_right_hand_0173',
      fingers: ['arm_right_finger_index_0_0177', 'arm_right_finger_middle_0_0180', 'arm_right_finger_ring_0_0183', 'arm_right_finger_pinky_0_0186'],
      thumb: 'arm_right_finger_thumb_0_0174',
    },
  },
  // The black staffs he shapes from Truth-Seeking Balls, one in each hand.
  props: { L: 'weapon_02_root_0162', R: 'weapon_01_root_0189' },
  legs: {
    L: { thigh: 'leg_left_leg1_07', shin: 'leg_left_leg2_08', foot: 'leg_left_foot_09' },
    R: { thigh: 'leg_right_leg1_017', shin: 'leg_right_leg2_018', foot: 'leg_right_foot_019' },
  },
}

/** Base Naruto and Sage Naruto come from the same game, so their skeletons differ only in numbering. */
const base: RigSpec = {
  hips: 'bone_Hips_01',
  spine: ['bone_Spine_011', 'bone_Spine1_012'],
  neck: 'bone_Neck_030',
  arms: {
    L: {
      upper: 'bone_LeftArm_016',
      fore: 'bone_LeftForeArm_017',
      hand: 'bone_LeftHand_018',
      fingers: ['bone_Left_Finger11_021', 'bone_Left_Finger21_023', 'bone_Left_Finger31_025', 'bone_Left_Finger41_027'],
      thumb: 'bone_Left_Finger01_019',
    },
    R: {
      upper: 'bone_RightArm_044',
      fore: 'bone_RightForeArm_045',
      hand: 'bone_RightHand_046',
      fingers: ['bone_Right_Finger11_049', 'bone_Right_Finger21_051', 'bone_Right_Finger31_053', 'bone_Right_Finger41_055'],
      thumb: 'bone_Right_Finger01_047',
    },
  },
  legs: {
    L: { thigh: 'bone_LeftLegUpper_03', shin: 'bone_LeftLeg_04', foot: 'bone_LeftAnkle_05' },
    R: { thigh: 'bone_RightLegUpper_07', shin: 'bone_RightLeg_08', foot: 'bone_RightAnkle_09' },
  },
  // The forehead protector's ribbons.
  drape: ['Hair_NB_Yellow_Cos_Bone001_033', 'Hair_NB_Yellow_Cos_Bone006_038'],
}

/** Skeleton maps for the models that can be posed, keyed like the model registry. */
export const RIGS: Record<string, RigSpec> = { base, sageRig: sage, sixRig: six }
