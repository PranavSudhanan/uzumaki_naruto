import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MathUtils, PerspectiveCamera, Vector2, Vector3 } from 'three'
import { frame, isStacked, useStore } from '../store'
import { DOJO, ERAS, JUTSU } from '../data/content'
import { ANCHOR, POSES, STORY_FIGURE_POSE, type Pose } from './layout'

const STATIC_TINT = ['#ff7a18', '#ffa25c', '', '', '#ff3f2e', '#ff8a2a']

function tintOf(station: number, out: Color) {
  const { era, jutsu } = useStore.getState()
  if (station === 2) return out.set(ERAS[era].color)
  if (station === 3) return out.set(JUTSU[jutsu].tint)
  return out.set(STATIC_TINT[station])
}

/** Horizontal room the scene has at a page section, in CSS pixels. Measured again only when the window changes. */
const room = { key: '', left: 0, right: 0 }

function roomAt(section: string, width: number, height: number, stacked: boolean) {
  const key = `${section} ${width}x${height} ${stacked}`
  if (room.key === key) return room
  const edge = Math.min(40, width * 0.03)
  let left = edge
  let right = width - edge
  if (!stacked) {
    // Side by side: whatever the panel leaves, on whichever side it leaves it.
    const panel = document.querySelector(`#${section} .panel`)?.getBoundingClientRect()
    // No box while the story is hidden behind the Jutsu page: keep the last answer and ask again later.
    if (!panel || panel.width === 0) return room
    if (panel.left > width - panel.right) right = panel.left - edge * 0.6
    else left = panel.right + edge * 0.6
  }
  room.key = key
  room.left = left
  room.right = right
  return room
}

/**
 * Drives the camera. In the story it follows scroll position, interpolating between section poses;
 * on the Jutsu page it orbits the stage under the visitor's control. Either way the result is eased.
 */
export function CameraRig() {
  const cur = useRef({ pos: new Vector3(), look: new Vector3(), shift: new Vector2(), ready: false, view: '' })
  const tmp = useMemo(
    () => ({ pos: new Vector3(), look: new Vector3(), a: new Color(), b: new Color() }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const cam = state.camera as PerspectiveCamera
    const { width, height } = state.size
    const store = useStore.getState()
    const dojo = store.view === 'dojo'
    let sx: number
    let sy: number
    let pull = 1

    // Stacked layout (text under the scene): centre the subject, lift it, and step back.
    // Side by side on a squarish window: step back a little, so the subject still clears the panel.
    const narrow = isStacked() ? 1 : 0
    // The Jutsu page has a whole stage to keep in shot (performer and boulder), so there the camera
    // backs off in proportion: the stage is framed as wide as it would be on a 16:9 screen.
    const aspect = width / height
    const squeeze = narrow ? 0 : dojo ? Math.max(0, 1.72 / aspect - 1) : (1 - MathUtils.smoothstep(aspect, 0.85, 1.55)) * 0.38
    const back = 1 + narrow * 0.45 + squeeze
    const fov = MathUtils.lerp(30, 42, narrow)

    if (dojo) {
      const o = frame.orbit
      // Left alone for a while, the camera drifts slowly round the stage.
      o.idle += dt
      if (o.idle > 6 && !frame.calm) o.taz += dt * 0.06
      const ko = 1 - Math.exp(-7 * dt)
      o.az += (o.taz - o.az) * ko
      o.el += (o.tel - o.el) * ko
      o.dist += (o.tdist - o.dist) * ko
      tmp.look.copy(ANCHOR.dojo)
      tmp.look.y -= 0.45
      tmp.pos.set(
        tmp.look.x + o.dist * Math.sin(o.az) * Math.cos(o.el),
        tmp.look.y + o.dist * Math.sin(o.el),
        tmp.look.z + o.dist * Math.cos(o.az) * Math.cos(o.el),
      )
      // On a short screen the controls sit beside the stage rather than under it: push the stage further over.
      sx = height <= 520 ? 0.36 : 0.2
      sy = 0.04
      tmp.a.set(DOJO[store.dojo].tint)
    } else {
      const n = POSES.length
      const f = MathUtils.clamp(frame.f, 0, n - 1)
      const i0 = Math.min(Math.floor(f), n - 2)
      const t = f - i0
      // Chapters that show a standing figure need a wider shot than the kunai does.
      const figureEra = !!ERAS[store.era].cast
      const pose = (i: number) => (i === 2 && figureEra ? STORY_FIGURE_POSE : POSES[i])
      const A = pose(i0)
      const B = pose(i0 + 1)

      tmp.pos.lerpVectors(A.pos, B.pos, t)
      tmp.look.lerpVectors(A.look, B.look, t)
      // Swing wide while travelling between set pieces so the move reads as a flight, not a slide.
      tmp.pos.z += Math.sin(Math.PI * t) * Math.min(A.look.distanceTo(B.look) * 0.12, 2.4)
      // Where each pose wants its subject across the screen, and how much further back it needs to be.
      // Most poses simply say; a pose with several things in shot is fitted to the room beside its panel.
      const framing = (p: Pose): [number, number] => {
        const free = p.fit ? roomAt(p.fit.section, width, height, !!narrow) : null
        if (!p.fit || !free || free.right <= free.left) return [p.shift[0] * (1 - narrow), 1]
        const l = p.fit.span[0]
        // In the Jutsu section the right-hand edge is whoever wields the selected technique.
        const r = (p.fit.section === 'jutsu' && JUTSU[store.jutsu].reach) || p.fit.span[1]
        const perPixel = (2 * p.pos.distanceTo(p.look) * back * Math.tan(MathUtils.degToRad(fov / 2))) / height
        const further = Math.max(1, (r - l) / ((free.right - free.left) * perPixel))
        const lookAt = (free.left + free.right) / 2 - (l + r) / 2 / (perPixel * further)
        return [(lookAt - width / 2) / (width / 2), further]
      }
      const fa = framing(A)
      const fb = framing(B)
      sx = MathUtils.lerp(fa[0], fb[0], t)
      pull = MathUtils.lerp(fa[1], fb[1], t)
      sy = MathUtils.lerp(A.shift[1], B.shift[1], t)
      tintOf(i0, tmp.a)
      tintOf(i0 + 1, tmp.b)
      tmp.a.lerp(tmp.b, t)
    }

    tmp.pos.sub(tmp.look).multiplyScalar(back * pull).add(tmp.look)
    if (dojo) sx *= 1 - narrow
    // The Jutsu page's controls cover more of a stacked screen than a story panel does: lift further.
    sy = MathUtils.lerp(sy, dojo ? 0.5 : 0.38, narrow)
    if (Math.abs(cam.fov - fov) > 0.01) cam.fov = fov

    const c = cur.current
    // Switching between the story and the Jutsu page is a cut, not a flight across the whole world.
    if (c.view !== store.view) {
      if (c.view) c.ready = false
      c.view = store.view
    }
    if (!c.ready) {
      c.pos.copy(tmp.pos).add(new Vector3(0, 0.4, 2.5))
      c.look.copy(tmp.look)
      c.shift.set(sx, sy)
      c.ready = true
    }
    const k = 1 - Math.exp(-(dojo ? 9 : 3.4) * dt)
    c.pos.lerp(tmp.pos, k)
    c.look.lerp(tmp.look, k)
    c.shift.x += (sx - c.shift.x) * k
    c.shift.y += (sy - c.shift.y) * k

    cam.position.copy(c.pos)
    if (!dojo && !frame.calm) {
      cam.position.x += frame.px * 0.22
      cam.position.y -= frame.py * 0.14
    }
    const shake = frame.charge * frame.charge * 0.03 + frame.burst * 0.09 + frame.shake * frame.shake * 0.34
    if (shake > 0.0005 && !frame.calm) {
      cam.position.x += (Math.random() - 0.5) * shake
      cam.position.y += (Math.random() - 0.5) * shake
    }
    cam.lookAt(c.look)
    cam.setViewOffset(width, height, -c.shift.x * width * 0.5, c.shift.y * height * 0.5, width, height)

    frame.focus.copy(c.look)
    // On the Jutsu page the stage decides what should be sharp: the performer, not the middle of the floor.
    if (!dojo) frame.subject.copy(c.look)
    frame.tint.lerp(tmp.a, 1 - Math.exp(-3 * dt))

    // Development only: park the camera anywhere to inspect a model ([eye x,y,z, look x,y,z]).
    if (import.meta.env.DEV && (window as any).__eye) {
      const e = (window as any).__eye as number[]
      cam.position.set(e[0], e[1], e[2])
      cam.lookAt(e[3], e[4], e[5])
      cam.clearViewOffset()
      frame.focus.set(e[3], e[4], e[5])
      frame.subject.copy(frame.focus)
    }
  })

  return null
}
