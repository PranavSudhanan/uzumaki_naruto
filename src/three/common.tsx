import { useEffect, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { Group, Vector3 } from 'three'
import { frame, useStore } from '../store'

/** Positions a set piece in the world and hides it while the camera is at another station. */
export function Station({
  from,
  to,
  position,
  children,
}: {
  from: number
  to: number
  position: Vector3
  children: ReactNode
}) {
  const ref = useRef<Group>(null!)
  useFrame(() => {
    // The Jutsu page has its own stage; the story's set pieces step out while it is open.
    ref.current.visible = useStore.getState().view === 'journey' && frame.f > from - 0.97 && frame.f < to + 0.97
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

/** True when the pointer event started on an HTML panel that sits above the canvas. */
export const overUi = (e: ThreeEvent<PointerEvent>) =>
  !!(e.nativeEvent.target as HTMLElement | null)?.closest?.('[data-ui]')

/**
 * Click-and-drag rotation with a spring back to rest.
 * Spread `bind` onto a mesh; read `rot.current.x / y` inside useFrame.
 */
export function useDragRotation(limitX = 0.7, spring = 2.2, hooks?: { onDown?: () => void; onUp?: () => void }) {
  const rot = useRef({ x: 0, y: 0, tx: 0, ty: 0, dragging: false, lx: 0, ly: 0 })
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const r = rot.current
    if (!r.dragging) {
      const back = Math.exp(-spring * dt)
      r.tx *= back
      r.ty *= back
    }
    const k = 1 - Math.exp(-10 * dt)
    r.x += (r.tx - r.x) * k
    r.y += (r.ty - r.y) * k
  })

  const bind = {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      // Primary button only; and a second press before the first has ended must not leave its listeners behind.
      if (overUi(e) || e.button !== 0) return
      e.stopPropagation()
      cleanup.current()
      const r = rot.current
      r.dragging = true
      r.lx = e.clientX
      r.ly = e.clientY
      document.body.style.cursor = 'grabbing'
      // Keep the drag from selecting page text as the pointer sweeps over it.
      document.body.classList.add('no-select')
      hooks?.onDown?.()
      const move = (ev: PointerEvent) => {
        r.ty += (ev.clientX - r.lx) * 0.008
        r.tx = Math.max(-limitX, Math.min(limitX, r.tx + (ev.clientY - r.ly) * 0.006))
        r.lx = ev.clientX
        r.ly = ev.clientY
      }
      const up = () => {
        r.dragging = false
        document.body.style.cursor = ''
        document.body.classList.remove('no-select')
        hooks?.onUp?.()
        cleanup.current()
      }
      cleanup.current = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        cleanup.current = () => {}
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      if (!overUi(e) && !rot.current.dragging) document.body.style.cursor = 'grab'
    },
    onPointerOut: () => {
      if (!rot.current.dragging) document.body.style.cursor = ''
    },
  }

  return { rot, bind }
}
