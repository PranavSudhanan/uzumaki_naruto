import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { CLONE_COST, DOJO, FORMATIONS, FORMATION_COST, MAX_CLONES, STAGES, VOLLEY_COST } from '../data/content'
import { frame, isStacked, useStore } from '../store'
import { audio } from '../audio'
import { ChargeMeter } from './JutsuSection'

/** Camera distance that frames each technique well; anything not listed uses the default. */
const DISTANCE: Record<string, number> = { kagebunshin: 15, bijudama: 15.5, bijurasen: 14.5 }
const DEFAULT_DISTANCE = 13.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const two = (n: number) => String(n).padStart(2, '0')

/** The chakra pool, read straight from the render loop so it moves every frame without re-rendering React. */
function ChakraBar() {
  const fill = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLElement>(null)
  const sage = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const c = frame.chakra
      if (fill.current) fill.current.style.transform = `scaleX(${c.toFixed(3)})`
      if (label.current) label.current.textContent = `${Math.round(c * 100)}%`
      if (box.current) box.current.classList.toggle('low', c < 0.15)
      if (sage.current) {
        sage.current.hidden = frame.sage <= 0
        sage.current.textContent = `Sage Mode ${Math.ceil(frame.sage)}s`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="chakra" ref={box}>
      <p>
        <span>Chakra</span>
        <em ref={sage} hidden />
        <b ref={label}>100%</b>
      </p>
      <span className="chakra-track">
        <span ref={fill} />
      </span>
    </div>
  )
}

/** A message that appears for a moment each time the store raises one. */
function Notice() {
  const notice = useStore((s) => s.notice)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!notice.n) return
    setShown(true)
    const t = setTimeout(() => setShown(false), 2200)
    return () => clearTimeout(t)
  }, [notice.n])
  return (
    <p className={`dojo-notice${shown ? ' on' : ''}`} role="status">
      {notice.text}
    </p>
  )
}

/** The Jutsu page: pick a form and a technique, read about it, and work it — with a free camera around the stage. */
export function DojoUI() {
  const index = useStore((s) => s.dojo)
  const setDojo = useStore((s) => s.setDojo)
  const clones = useStore((s) => s.clones)
  const setClones = useStore((s) => s.setClones)
  const formation = useStore((s) => s.formation)
  const setFormation = useStore((s) => s.setFormation)
  const charging = useStore((s) => s.charging)
  const setCharging = useStore((s) => s.setCharging)
  const setView = useStore((s) => s.setView)
  const notify = useStore((s) => s.notify)
  const j = DOJO[index]
  const stageIndex = STAGES.findIndex((s) => s.id === j.stage)
  const holds = j.mode === 'orb' || j.mode === 'sage'

  const select = (i: number) => {
    const n = (i + DOJO.length) % DOJO.length
    if (n === index) return
    // Clones left standing hand their chakra back when he moves on.
    if (clones) frame.chakra = Math.min(1, frame.chakra + clones * CLONE_COST * 0.5)
    setDojo(n)
    setClones(0)
    audio.tick(true)
    frame.orbit.tdist = DISTANCE[DOJO[n].id] ?? DEFAULT_DISTANCE
    frame.orbit.idle = 0
  }

  /** Spends chakra if there is enough; otherwise says so. Sage Mode halves the price. */
  const pay = (cost: number) => {
    const price = cost * (frame.sage > 0 ? 0.5 : 1)
    if (frame.chakra < price) {
      notify('Not enough chakra')
      audio.tick()
      return false
    }
    frame.chakra -= price
    return true
  }

  const summon = () => {
    if (clones >= MAX_CLONES || frame.blocked) return
    const add = Math.min(MAX_CLONES - clones, clones === 0 ? 2 : 3)
    if (pay(add * CLONE_COST)) setClones(clones + add)
  }
  const dismiss = () => {
    if (!clones) return
    frame.chakra = Math.min(1, frame.chakra + clones * CLONE_COST * 0.5)
    setClones(0)
  }
  const reshape = () => {
    if (frame.blocked || !pay(FORMATION_COST)) return
    setFormation((formation + 1) % FORMATIONS.length)
    audio.tick()
  }
  /** Looses the Truth-Seeking Balls at the boulder. */
  const launch = () => {
    if (frame.blocked || !pay(VOLLEY_COST)) return
    frame.volleys++
    audio.tick(true)
  }
  /** The technique's one-shot action, for those that are pressed rather than held. */
  const act = () => (j.mode === 'clones' ? summon() : j.mode === 'orbs' ? reshape() : undefined)

  /** Starts a hold, unless he has nothing left to hold it with. */
  const begin = () => {
    if (j.mode === 'clones' && clones < 2) {
      notify('It takes two clones to make one')
      audio.tick()
      return
    }
    if (j.mode !== 'sage' && frame.chakra < 0.05) {
      notify('Not enough chakra')
      audio.tick()
      return
    }
    setCharging(true)
  }

  // Frame the stage for whichever technique the page opens on: from the side on a wide screen, over his
  // shoulder on a stacked one — and again whenever the layout flips (a phone or tablet being turned).
  useEffect(() => {
    const o = frame.orbit
    o.tdist = DISTANCE[DOJO[useStore.getState().dojo].id] ?? DEFAULT_DISTANCE
    let was: boolean | null = null
    const reframe = () => {
      const now = isStacked()
      if (now === was) return
      if (now) {
        o.taz = -1.05
        o.tel = 0.2
      } else if (was !== null) {
        o.taz = 0.34
        o.tel = 0.11
      }
      // Opening the page is a cut, not a swing round the stage.
      if (was === null && now) {
        o.az = o.taz
        o.el = o.tel
      }
      was = now
    }
    reframe()
    window.addEventListener('resize', reframe)
    return () => window.removeEventListener('resize', reframe)
  }, [])

  // Orbit camera: drag anywhere off the panels to circle the stage, wheel to move in and out.
  useEffect(() => {
    const o = frame.orbit
    let dragging = false
    let lx = 0
    let ly = 0
    const offUi = (e: Event) => !(e.target as HTMLElement | null)?.closest?.('[data-ui]')
    const down = (e: PointerEvent) => {
      if (!offUi(e) || useStore.getState().charging) return
      dragging = true
      lx = e.clientX
      ly = e.clientY
      document.body.classList.add('no-select', 'orbiting')
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      o.taz -= (e.clientX - lx) * 0.005
      o.tel = clamp(o.tel + (e.clientY - ly) * 0.0035, -0.03, 0.62)
      lx = e.clientX
      ly = e.clientY
      o.idle = 0
    }
    const up = () => {
      dragging = false
      document.body.classList.remove('no-select', 'orbiting')
    }
    const wheel = (e: WheelEvent) => {
      if (!offUi(e)) return
      e.preventDefault()
      o.tdist = clamp(o.tdist * Math.exp(e.deltaY * 0.0012), 6, 22)
      o.idle = 0
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    window.addEventListener('wheel', wheel, { passive: false })
    return () => {
      up()
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  // Keyboard: arrows or digits choose, space works the technique, escape leaves.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const onControl = !!(e.target as HTMLElement).closest?.('button, summary, a, input')
      if (e.key === 'ArrowRight') select(index + 1)
      else if (e.key === 'ArrowLeft') select(index - 1)
      else if (e.key === 'Escape') setView('journey')
      else if (/^[1-9]$/.test(e.key) && +e.key <= DOJO.length) select(+e.key - 1)
      else if (e.key === 'Backspace' && j.mode === 'clones') dismiss()
      else if (e.key === 'Enter' && j.mode === 'orbs' && !onControl) launch()
      else if (e.key === 'Enter' && j.mode === 'clones' && !onControl) {
        if (!e.repeat) begin()
      }
      else if (e.code === 'Space') {
        if (onControl) return
        e.preventDefault()
        if (e.repeat) return
        if (holds) begin()
        else act()
      }
    }
    const up = (e: KeyboardEvent) => ((e.code === 'Space' && holds) || (e.key === 'Enter' && j.mode === 'clones')) && setCharging(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  const hold = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    begin()
  }
  const release = () => setCharging(false)
  const accent = { '--accent': j.tint } as CSSProperties

  return (
    <div className="dojo">
      <div className="dojo-side" style={accent}>
        <aside className="panel dojo-info" data-ui>
          <p className="eyebrow">
            {STAGES[stageIndex].name} <i>· Jutsu {two(index + 1)} / {two(DOJO.length)}</i>
          </p>
          <div className="era" key={j.id}>
            <p className="era-when">
              <span className="jp" lang="ja">
                {j.kanji}
              </span>
              {j.romaji}
            </p>
            <h2>{j.name}</h2>
            <p className="chips">
              <span>{j.rank}</span>
              <span>{j.kind}</span>
            </p>
            <p>{j.text}</p>
            <ul className="beats">
              {j.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="dojo-controls" data-ui>
          <ChakraBar />
          {holds ? (
            <button
              className={`charge${charging ? ' on' : ''}`}
              onPointerDown={hold}
              onPointerUp={release}
              onPointerCancel={release}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && begin()}
              onKeyUp={release}
              onBlur={release}
            >
              <span className="charge-label">{charging ? (j.mode === 'sage' ? 'Gathering…' : 'Building chakra…') : j.action}</span>
              <ChargeMeter />
              <small>{j.hint}</small>
            </button>
          ) : j.mode === 'clones' ? (
            <>
              <div className="dojo-pair">
                <button className="charge" onClick={summon} disabled={clones >= MAX_CLONES}>
                  <span className="charge-label">
                    {j.action}{' '}
                    <b>
                      {clones} / {MAX_CLONES}
                    </b>
                  </span>
                  <span className="meter">
                    <span style={{ transform: `scaleX(${clones / MAX_CLONES})`, transition: 'transform .4s' }} />
                  </span>
                  <small>{j.hint}</small>
                </button>
                <button className="dismiss" onClick={dismiss} disabled={clones === 0}>
                  Release
                </button>
              </div>
              {/* Two clones make one Rasengan: the button counts pairs, not clones. */}
              <button
                className={`charge squad${charging ? ' on' : ''}`}
                disabled={clones < 2}
                onPointerDown={hold}
                onPointerUp={release}
                onPointerCancel={release}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && begin()}
                onKeyUp={release}
                onBlur={release}
              >
                <span className="charge-label">
                  {charging ? 'Clones shaping…' : 'Hold — clones form Rasengan'} <b>× {clones >> 1}</b>
                </span>
                <ChargeMeter />
                <small>One clone holds it, a second shapes it. Let go and they run it into the boulder.</small>
              </button>
            </>
          ) : (
            <div className="dojo-pair">
              <button className="charge" onClick={reshape}>
                <span className="charge-label">
                  {j.action} <b>{FORMATIONS[formation]}</b>
                </span>
                <span className="meter">
                  <span style={{ transform: `scaleX(${(formation + 1) / FORMATIONS.length})`, transition: 'transform .4s' }} />
                </span>
                <small>{j.hint}</small>
              </button>
              <button className="dismiss strike" onClick={launch}>
                Launch
              </button>
            </div>
          )}
          <p className="dojo-cost">{j.cost}</p>
          <Notice />
        </div>
      </div>

      <nav className="dojo-rail" data-ui aria-label="Forms and techniques">
        <button className="step" onClick={() => select(index - 1)} aria-label="Previous technique">
          ←
        </button>
        {STAGES.map((stage, n) => (
          <div key={stage.id} className={`dojo-stage${n === stageIndex ? ' active' : ''}`} style={{ '--accent': stage.tint } as CSSProperties}>
            <p>
              <span lang="ja">{stage.kanji}</span>
              {stage.name}
            </p>
            <div>
              {DOJO.map((x, i) =>
                x.stage === stage.id ? (
                  <button
                    key={x.id}
                    className={i === index ? 'active' : ''}
                    style={{ '--accent': x.tint } as CSSProperties}
                    onClick={() => select(i)}
                    aria-pressed={i === index}
                    title={x.name}
                  >
                    <span lang="ja">{x.glyph}</span>
                    <b>{x.short}</b>
                  </button>
                ) : null,
              )}
            </div>
          </div>
        ))}
        <button className="step" onClick={() => select(index + 1)} aria-label="Next technique">
          →
        </button>
      </nav>

      <p className="dojo-tips">
        Drag to orbit · Scroll to zoom · ← → or 1–{DOJO.length} to switch · Space to act
        {j.mode === 'orbs' ? ' · Enter to launch' : j.mode === 'clones' ? ' · hold Enter for their Rasengan' : ''} · Esc to leave
      </p>
    </div>
  )
}
