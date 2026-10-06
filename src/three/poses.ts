import { mixPose, type ArmPose, type Pose, type V3 } from './rig'

/*
 * The pose library. Everything is in the character's own space: x to his left, y up, z forward.
 * Arms are written for the left side and mirrored where the pose is symmetrical.
 * He is right-handed: the Rasengan lives in the right palm.
 *
 * Most arms are given as directions. Where two hands have to meet, or a hand has to be somewhere
 * exact, the arm is given a `reach` point instead (fractions of body height, measured from midway
 * between the shoulders) and the solver bends the elbow to get there.
 */

const mx = (v: V3): V3 => [-v[0], v[1], v[2]]

const arm = (upper: V3, fore: V3, extra: Partial<ArmPose> = {}): ArmPose => ({
  upper,
  fore,
  hand: fore,
  palm: [0, -1, 0],
  grip: 0,
  // An idle hand is nearly open: fingers a little bent, nothing like a fist.
  curl: 0.22,
  ...extra,
})

/** An arm that reaches for a point; `upper` and `fore` are only what it blends from. */
const reach = (at: V3, pole: V3, upper: V3, fore: V3, extra: Partial<ArmPose> = {}): ArmPose => ({
  ...arm(upper, fore, extra),
  reach: at,
  pole,
  ik: 1,
  grip: 1,
  ...extra,
})

/** The same arm on the other side of the body. */
export const mirror = (a: ArmPose): ArmPose => ({
  ...a,
  upper: mx(a.upper),
  fore: mx(a.fore),
  hand: mx(a.hand),
  palm: mx(a.palm),
  reach: a.reach && mx(a.reach),
  pole: a.pole && mx(a.pole),
  aim: a.aim && mx(a.aim),
})

const relaxed = arm([0.2, -0.97, 0.04], [0.12, -0.96, 0.24], { curl: 0.25 })

const base: Pose = {
  lean: 0,
  twist: 0,
  side: 0,
  crouch: 0.04,
  lunge: 0,
  spread: 0.1,
  lift: 0,
  headPitch: 0,
  headYaw: 0,
  L: relaxed,
  R: mirror(relaxed),
}

const pose = (p: Partial<Pose>): Pose => ({ ...base, ...p })

/** Right forearm out in front, palm up: the hand that carries the sphere. */
const carry = arm([-0.3, -0.86, 0.36], [0.1, -0.04, 1], { hand: [0.12, 0.06, 1], palm: [0, 1, 0.05], grip: 1, curl: 0.2 })

/** One hand of a seal: upright in front of the chest, palm turned inward to meet the other. */
const clasp = reach([0.012, -0.078, 0.118], [0.75, -0.65, -0.1], [0.36, -0.78, 0.5], [-0.62, 0.5, 0.6], {
  hand: [-0.04, 0.95, 0.3],
  palm: [-1, 0, 0],
  curl: 0.08,
})

/** Fists at his sides, elbows a little bent. */
const fist = arm([0.26, -0.95, -0.04], [0.14, -0.9, 0.4], { curl: 1 })

/*
 * Six Paths carries a black staff in each hand. An arm that holds one closes its fist (`curl`),
 * says which way the knuckles face (`hand`) and where the staff points (`aim`); on the other models,
 * which hold nothing, the same arm is simply a fist.
 */
const staff = (upper: V3, fore: V3, hand: V3, aim: V3, extra: Partial<ArmPose> = {}): ArmPose => arm(upper, fore, { hand, aim, grip: 1, curl: 0.9, ...extra })

/** Staff held low at his side, pointing ahead and a little down and out. */
const low = staff([0.3, -0.95, 0.0], [0.24, -0.96, 0.12], [0.12, -0.9, -0.42], [0.3, -0.4, 0.86])

export const POSES = {
  /** Standing easy. */
  stand: pose({}),

  /** Standing with the sphere resting in the right palm; left hand half closed at his side. */
  hold: pose({
    twist: -0.12,
    spread: 0.16,
    headPitch: 0.1,
    headYaw: -0.08,
    R: carry,
    L: arm([0.26, -0.95, 0.02], [0.2, -0.9, 0.34], { curl: 0.3 }),
  }),

  /** Forming the Rasengan: right palm up, left hand hovering over it, shaping the flow. */
  shape: pose({
    lean: 0.2,
    twist: -0.1,
    crouch: 0.3,
    spread: 0.3,
    headPitch: 0.3,
    R: reach([-0.05, -0.215, 0.14], [-0.5, -0.8, -0.35], [-0.2, -0.72, 0.68], [0.22, -0.12, 1], {
      hand: [0.25, 0.05, 1],
      palm: [0, 1, 0],
      curl: 0.22,
    }),
    L: reach([0.0, -0.04, 0.165], [0.75, -0.3, -0.5], [0.18, -0.56, 0.8], [-0.46, 0.34, 0.82], {
      hand: [-0.85, -0.05, 0.5],
      palm: [0.05, -1, 0.1],
      curl: 0.26,
    }),
  }),

  /** A clone lending his palm: his partner forms the sphere in it. */
  offer: pose({
    lean: 0.1,
    crouch: 0.22,
    spread: 0.3,
    headPitch: 0.26,
    headYaw: -0.22,
    R: reach([-0.05, -0.215, 0.14], [-0.5, -0.8, -0.35], [-0.2, -0.72, 0.68], [0.22, -0.12, 1], {
      hand: [0.25, 0.05, 1],
      palm: [0, 1, 0],
      curl: 0.22,
    }),
    L: arm([0.3, -0.9, 0.1], [0.1, -0.75, 0.6], { curl: 0.8 }),
  }),

  /** A clone shaping a sphere that someone else is holding: both hands working round it. */
  mould: pose({
    lean: 0.24,
    crouch: 0.28,
    spread: 0.32,
    headPitch: 0.3,
    L: reach([0.09, -0.145, 0.19], [0.8, -0.45, -0.3], [0.3, -0.6, 0.74], [-0.2, 0.1, 0.97], { hand: [-0.35, 0.1, 0.93], palm: [-1, 0, 0.1], curl: 0.24 }),
    R: reach([-0.09, -0.145, 0.19], [-0.8, -0.45, -0.3], [-0.3, -0.6, 0.74], [0.2, 0.1, 0.97], { hand: [0.35, 0.1, 0.93], palm: [1, 0, 0.1], curl: 0.24 }),
  }),

  /** The strike: right arm driven forward, palm out, body thrown behind it. */
  thrust: pose({
    lean: 0.42,
    twist: 0.6,
    crouch: 0.12,
    lunge: 0.95,
    spread: 0.12,
    headPitch: -0.2,
    headYaw: -0.3,
    R: arm([-0.12, 0.02, 1], [0.0, 0.04, 1], { hand: [0.0, 0.92, 0.3], palm: [0, -0.2, 1], grip: 1, curl: 0.2 }),
    L: arm([0.5, -0.5, -0.7], [0.35, -0.3, -0.86], { curl: 0.9 }),
  }),

  /** A hand seal: palms pressed together in front of the chest. */
  seal: pose({
    lean: 0.06,
    crouch: 0.14,
    spread: 0.2,
    headPitch: 0.14,
    L: clasp,
    R: mirror(clasp),
  }),

  /** The clone seal: one hand upright, the other laid across in front of it. */
  cross: pose({
    lean: 0.08,
    crouch: 0.2,
    spread: 0.26,
    headPitch: 0.04,
    R: reach([-0.02, -0.09, 0.128], [-0.75, -0.6, -0.1], [-0.4, -0.7, 0.58], [0.64, 0.34, 0.69], {
      hand: [0.05, 1, 0.1],
      palm: [1, 0, 0.1],
      curl: 0.14,
    }),
    L: reach([0.078, -0.012, 0.158], [0.6, -0.75, -0.2], [0.38, -0.74, 0.55], [-0.58, 0.56, 0.6], {
      hand: [-1, 0.1, 0.02],
      palm: [0, 0.05, -1],
      curl: 0.14,
    }),
  }),

  /** Winding up a throw: right arm high, palm up, weight back. */
  overhead: pose({
    lean: -0.14,
    twist: -0.36,
    crouch: 0.2,
    spread: 0.3,
    headPitch: -0.12,
    R: arm([-0.5, 0.82, -0.02], [-0.08, 1, 0.1], { hand: [0.1, 0.25, -1], palm: [0, 1, 0.1], grip: 1, curl: 0.25 }),
    L: arm([0.3, -0.25, 0.9], [0.05, 0.12, 1], { hand: [0, 0.2, 1], palm: [0, -1, 0], grip: 1, curl: 0.2 }),
  }),

  /** The throw itself: arm whipped forward and down. */
  throw: pose({
    lean: 0.46,
    twist: 0.62,
    crouch: 0.14,
    lunge: 0.8,
    headPitch: -0.16,
    R: arm([-0.2, 0.02, 1], [0.04, -0.28, 0.96], { hand: [0.0, -0.4, 0.9], palm: [0, -0.9, -0.4], grip: 1, curl: 0.15 }),
    L: arm([0.52, -0.4, -0.74], [0.4, -0.5, -0.76], { curl: 0.8 }),
  }),

  /** Braced against a blast: forearms up, weight back. */
  guard: pose({
    lean: -0.16,
    crouch: 0.38,
    spread: 0.34,
    headPitch: 0.24,
    L: arm([0.34, -0.36, 0.86], [-0.42, 0.84, 0.32], { curl: 0.85 }),
    R: arm([-0.34, -0.36, 0.86], [0.42, 0.84, 0.32], { curl: 0.85 }),
  }),

  /** Out of chakra: doubled over, hands on knees. */
  spent: pose({
    lean: 0.78,
    crouch: 0.5,
    spread: 0.3,
    headPitch: 0.42,
    L: arm([0.3, -0.72, 0.62], [0.02, -0.84, 0.54], { curl: 0.32 }),
    R: arm([-0.3, -0.72, 0.62], [-0.02, -0.84, 0.54], { curl: 0.32 }),
  }),

  /** Sage Mode complete: chest open, fists at his sides. */
  ready: pose({
    lean: -0.06,
    spread: 0.26,
    crouch: 0.08,
    headPitch: -0.04,
    L: fist,
    R: mirror(fist),
  }),

  /** Six Paths, at rest: off the ground, a staff low in each hand. */
  float: pose({
    lift: 0.07,
    crouch: 0.02,
    spread: 0.06,
    lean: -0.05,
    headPitch: -0.03,
    L: low,
    R: mirror(low),
  }),

  /** Six Paths, sending the Truth-Seeking Balls somewhere: the right staff swept across in front of him. */
  sweep: pose({
    lift: 0.07,
    twist: 0.3,
    lean: -0.04,
    spread: 0.06,
    R: staff([-0.74, 0.16, 0.64], [-0.36, 0.5, 0.78], [-0.25, 0.3, 0.92], [0.9, 0.35, 0.1]),
    L: low,
  }),

  /** Six Paths, loosing them at a target: the right staff levelled at it. */
  command: pose({
    lift: 0.07,
    twist: 0.34,
    lean: 0.1,
    spread: 0.1,
    headPitch: -0.06,
    R: staff([-0.22, -0.5, 0.84], [-0.05, -0.42, 0.9], [0.0, -0.92, 0.38], [0, 0.3, 0.95]),
    L: low,
  }),

  /**
   * Six Paths, building a sphere overhead: the right hand needs to be empty for it, so that staff is
   * put away; the left one is held out in front as a guard.
   */
  wind: pose({
    lift: 0.07,
    lean: -0.14,
    twist: -0.36,
    crouch: 0.1,
    spread: 0.3,
    headPitch: -0.12,
    R: arm([-0.5, 0.82, -0.02], [-0.08, 1, 0.1], { hand: [0.1, 0.25, -1], palm: [0, 1, 0.1], grip: 1, curl: 0.25, prop: 0 }),
    L: staff([0.45, -0.6, 0.66], [0.2, -0.5, 0.84], [0.1, -0.93, 0.35], [-0.1, 0.4, 0.9]),
  }),

  /** Six Paths, the throw: right arm whipped forward and down, the left staff trailing behind him. */
  hurl: pose({
    lift: 0.07,
    lean: 0.46,
    twist: 0.62,
    crouch: 0.1,
    lunge: 0.8,
    headPitch: -0.16,
    R: arm([-0.2, 0.02, 1], [0.04, -0.28, 0.96], { hand: [0.0, -0.4, 0.9], palm: [0, -0.9, -0.4], grip: 1, curl: 0.15, prop: 0 }),
    L: staff([0.5, -0.5, -0.7], [0.45, -0.6, -0.66], [0.3, -0.9, -0.3], [0.2, -0.25, -0.95]),
  }),

  /** Six Paths, braced against a blast: both staffs crossed in front of him. */
  brace: pose({
    lift: 0.07,
    lean: -0.12,
    crouch: 0.12,
    spread: 0.3,
    headPitch: 0.16,
    L: reach([0.075, -0.09, 0.2], [0.7, -0.6, -0.2], [0.34, -0.36, 0.86], [-0.42, 0.4, 0.8], { hand: [-0.1, 0.1, 1], aim: [-0.6, 0.78, 0.15], curl: 0.9 }),
    R: reach([-0.075, -0.13, 0.17], [-0.7, -0.6, -0.2], [-0.34, -0.36, 0.86], [0.42, 0.4, 0.8], { hand: [0.1, 0.1, 1], aim: [0.6, 0.78, 0.15], curl: 0.9 }),
  }),
} satisfies Record<string, Pose>

export type PoseName = keyof typeof POSES

/**
 * Forming a sphere in the right palm, `amount` of the way from wherever he started:
 * the other hand circles over it, faster as it builds.
 */
export function shaping(from: Pose, time: number, amount: number): Pose {
  const p = mixPose(from, POSES.shape, amount)
  if (amount > 0.01 && p.L.reach) {
    const a = time * (7 + amount * 9)
    const r = 0.02 * amount
    p.L = { ...p.L, reach: [p.L.reach[0] + Math.cos(a) * r, p.L.reach[1] + Math.sin(a * 0.5) * r * 0.35, p.L.reach[2] + Math.sin(a) * r] }
    p.lean += Math.sin(time * 31) * 0.006 * amount
  }
  return p
}

/** Shaping a sphere in a partner's palm: the two hands circle it, opposite each other, faster as it builds. */
export function moulding(from: Pose, time: number, amount: number): Pose {
  const p = mixPose(from, POSES.mould, amount)
  if (amount > 0.01 && p.L.reach && p.R.reach) {
    const a = time * (6 + amount * 8)
    const r = 0.03 * amount
    const dx = Math.cos(a) * r * 0.5
    const dy = Math.sin(a) * r
    const dz = Math.cos(a) * r * 0.6
    p.L = { ...p.L, reach: [p.L.reach[0] + dx, p.L.reach[1] + dy, p.L.reach[2] + dz] }
    p.R = { ...p.R, reach: [p.R.reach[0] - dx, p.R.reach[1] - dy, p.R.reach[2] - dz] }
    p.lean += Math.sin(time * 29) * 0.005 * amount
  }
  return p
}
