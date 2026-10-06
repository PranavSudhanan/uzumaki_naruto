import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Emblem } from './Emblem'

export function Loader() {
  const ready = useStore((s) => s.ready)
  const broken = useStore((s) => s.broken)
  const [gone, setGone] = useState(false)
  const [minTime, setMinTime] = useState(false)
  const [stalled, setStalled] = useState(false)

  // Hold the title card long enough for the crest to finish drawing.
  useEffect(() => {
    const t = setTimeout(() => setMinTime(true), 1500)
    return () => clearTimeout(t)
  }, [])
  const done = ready && minTime && !broken
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), 1100)
    return () => clearTimeout(t)
  }, [done])

  // If nothing has been drawn after a good while in a visible tab, say why instead of spinning forever.
  useEffect(() => {
    if (ready) return
    let visibleSeconds = 0
    const t = setInterval(() => {
      if (!document.hidden && ++visibleSeconds >= 12) setStalled(true)
    }, 1000)
    return () => clearInterval(t)
  }, [ready])

  if (gone) return null
  return (
    <div className={`loader${done ? ' out' : ''}`} role="status" aria-live="polite" data-ui>
      <Emblem className="loader-mark" animate />
      <p>{broken || (stalled && !ready) ? 'This page needs WebGL 2 — try another browser' : 'Gathering chakra'}</p>
    </div>
  )
}
