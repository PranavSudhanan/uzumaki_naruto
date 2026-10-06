import { create } from 'zustand'
import { Color, Vector3 } from 'three'

export type Quality = 0 | 1 | 2

const params = new URLSearchParams(window.location.search)
const forced = params.get('quality')

/** True when the visitor pinned a quality tier in the URL (?quality=low|medium|high). */
export const qualityLocked = forced === 'low' || forced === 'medium' || forced === 'high'

function initialQuality(): Quality {
  if (forced === 'low') return 0
  if (forced === 'medium') return 1
  if (forced === 'high') return 2
  return 1
}

interface State {
  section: number
  jutsu: number
  era: number
  quality: Quality
  ready: boolean
  charging: boolean
  /** True once the hero figure has loaded (or failed), so the title card can lift. */
  heroReady: boolean
  setHeroReady: () => void
  /** The scrolling story, or the full-screen Jutsu page. */
  view: 'journey' | 'dojo'
  setView: (v: 'journey' | 'dojo') => void
  /** Selected technique on the Jutsu page. */
  dojo: number
  setDojo: (n: number) => void
  /** Shadow clones currently summoned. */
  clones: number
  setClones: (n: number) => void
  /** Arrangement of the Truth-Seeking Balls. */
  formation: number
  setFormation: (n: number) => void
  sound: boolean
  setSound: (on: boolean) => void
  /** True if the 3D scene could not be started at all (no WebGL). */
  broken: boolean
  setBroken: () => void
  /** A short message for the visitor ("Out of chakra"), with a counter so repeats still show. */
  notice: { text: string; n: number }
  notify: (text: string) => void
  setSection: (n: number) => void
  setJutsu: (n: number) => void
  setEra: (n: number) => void
  setQuality: (q: Quality) => void
  setReady: () => void
  setCharging: (c: boolean) => void
}

export const useStore = create<State>()((set) => ({
  section: 0,
  jutsu: 0,
  era: 0,
  quality: initialQuality(),
  ready: false,
  charging: false,
  heroReady: false,
  setHeroReady: () => set({ heroReady: true }),
  view: window.location.hash === '#/jutsu' ? 'dojo' : 'journey',
  setView: (view) => {
    if (view === useStore.getState().view) return
    if (view === 'dojo') frame.scrollY = window.scrollY
    // A charge in progress does not follow him to the other page (and must not go off there).
    frame.charge = 0
    set({ view, charging: false, clones: 0 })
  },
  dojo: 0,
  setDojo: (dojo) => set({ dojo, charging: false }),
  clones: 0,
  setClones: (clones) => set({ clones }),
  formation: 0,
  setFormation: (formation) => set({ formation }),
  sound: true,
  setSound: (sound) => set({ sound }),
  broken: false,
  setBroken: () => set({ broken: true, ready: true }),
  notice: { text: '', n: 0 },
  notify: (text) => set((s) => ({ notice: { text, n: s.notice.n + 1 } })),
  setSection: (section) => set({ section }),
  setJutsu: (jutsu) => set({ jutsu }),
  setEra: (era) => set({ era }),
  setQuality: (quality) => set({ quality }),
  setReady: () => set({ ready: true }),
  setCharging: (charging) => set({ charging }),
}))

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')

/**
 * When the copy is stacked under the scene instead of sitting beside it: phones and tablets held
 * upright, and anything too narrow for two columns. The stylesheet switches on exactly this query
 * (search for it in styles.css), and the camera frames its subject to match.
 */
const stacked = window.matchMedia?.('(max-width: 860px) and (max-aspect-ratio: 6/5), (max-width: 620px)')

/** Per-frame values shared between the scroll handler and the render loop without re-rendering React. */
export const frame = {
  /** The visitor has asked their system for less motion: no camera shake, drift or parallax. */
  calm: !!calm?.matches,
  /** Continuous station index driven by scroll (0 = hero … n-1 = closing). */
  f: 0,
  px: 0,
  py: 0,
  /** Scroll position of the story, kept while the Jutsu page is open. */
  scrollY: 0,
  charge: 0,
  burst: 0,
  /** Counts releases, so every live effect can react to the same one. */
  bursts: 0,
  /** How full the charge was at the last release (0–1). Unlike `burst`, it does not fade. */
  power: 0,
  /** Counts volleys of Truth-Seeking Balls asked for on the Jutsu page. */
  volleys: 0,
  /** Camera shake from an impact; decays on its own. */
  shake: 0,
  /** The Jutsu page's chakra pool (0–1), seconds of Sage Mode left, and whether charging is currently refused. */
  chakra: 1,
  sage: 0,
  blocked: false,
  /** Orbit camera of the Jutsu page: current and target azimuth, elevation, distance. */
  orbit: { az: 0.34, el: 0.11, dist: 13.5, taz: 0.34, tel: 0.11, tdist: 13.5, idle: 0 },
  tint: new Color('#ff7a18'),
  /** What the lights follow, and what the lens keeps sharp (usually the same thing; not on the Jutsu page). */
  focus: new Vector3(),
  subject: new Vector3(),
}

calm?.addEventListener?.('change', (e) => (frame.calm = e.matches))

/** True while the page is in its stacked layout. Read live: it changes when a phone is turned. */
export const isStacked = () => !!stacked?.matches

/** Whether holding to charge does anything right now: a sphere is on screen, and nothing is in the way. */
export const canCharge = () =>
  useStore.getState().view === 'dojo' ? !frame.blocked : frame.f < 0.9 || Math.abs(frame.f - 3) < 0.95

/** Smooth scrolling, unless the visitor has asked for less motion. */
export const scrolling = (): ScrollBehavior => (frame.calm ? 'auto' : 'smooth')
