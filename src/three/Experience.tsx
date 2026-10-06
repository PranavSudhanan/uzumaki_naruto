import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { EffectPass, FXAAEffect, SMAAEffect, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { canCharge, frame, qualityLocked, useStore, type Quality } from '../store'
import { ANCHOR } from './layout'
import { CameraRig } from './CameraRig'
import { Station } from './common'
import { useWhen } from './Stage'
import { Backdrop, Dust, Leaves } from './Atmosphere'
import { Headband } from './Headband'
import { Kunai } from './Kunai'
import { ChakraOrb } from './ChakraOrb'
import { HokageHat } from './HokageHat'
import { HeroFigure, JutsuFigures, StoryFigures } from './Figures'
import { GrainEffect, LensEffect } from './LensEffect'
import { Dojo } from './Dojo'
import { audio } from '../audio'
import { JUTSU } from '../data/content'

/** Image-based lighting built from soft boxes, so reflections never depend on a downloaded HDRI. */
function Studio() {
  return (
    <Environment resolution={512} frames={1}>
      <mesh scale={60}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color="#07080c" side={THREE.BackSide} />
      </mesh>
      {/* warm key, high and to the right */}
      <Lightformer form="rect" intensity={7} color="#ffe6cc" position={[5, 6, 5]} scale={[7, 4, 1]} target={[0, 0, 0]} />
      {/* cool fill from the left */}
      <Lightformer form="rect" intensity={2.4} color="#a8c6ff" position={[-8, 1, 3]} scale={[3, 9, 1]} target={[0, 0, 0]} />
      {/* ember-orange kicker from behind */}
      <Lightformer form="rect" intensity={9} color="#ff8436" position={[-4, 3, -8]} scale={[9, 2.5, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={4} color="#86b4ff" position={[7, -2, -6]} scale={[4, 5, 1]} target={[0, 0, 0]} />
      {/* strip lights overhead give long clean highlights on steel */}
      <Lightformer form="rect" intensity={5} color="#ffffff" position={[-2, 8, 0]} scale={[1, 10, 1]} rotation={[Math.PI / 2, 0, 0.6]} />
      <Lightformer form="rect" intensity={3} color="#ffffff" position={[3, 8, -2]} scale={[0.6, 8, 1]} rotation={[Math.PI / 2, 0, -0.4]} />
      {/* catch-light ring in front, bounce from below */}
      <Lightformer form="ring" intensity={2.5} color="#fff4e6" position={[0.5, 1, 10]} scale={2.4} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.7} color="#ffc9a0" position={[0, -7, 0]} scale={[14, 14, 1]} rotation={[-Math.PI / 2, 0, 0]} />
    </Environment>
  )
}

const KEY_OFFSET = new THREE.Vector3(3.5, 6, 5)
const RIM_OFFSET = new THREE.Vector3(-5, 2.5, -6)

/**
 * A shadow-casting key light and a tinted rim light, both following whichever piece is in focus,
 * plus a gentle fill from the camera so faces never sink into shadow.
 */
function Lights() {
  const key = useRef<THREE.DirectionalLight>(null!)
  const rim = useRef<THREE.DirectionalLight>(null!)
  const fill = useRef<THREE.DirectionalLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])
  const shadows = useStore((s) => s.quality > 0)

  useFrame((state) => {
    target.position.copy(frame.focus)
    target.updateMatrixWorld()
    key.current.position.copy(frame.focus).add(KEY_OFFSET)
    rim.current.position.copy(frame.focus).add(RIM_OFFSET)
    rim.current.color.copy(frame.tint)
    fill.current.position.copy(state.camera.position)
    fill.current.position.y += 0.6
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={key}
        target={target}
        intensity={2.4}
        color="#fff0e0"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-radius={4}
      >
        <orthographicCamera attach="shadow-camera" args={[-4, 4, 4, -4, 0.5, 24]} />
      </directionalLight>
      <directionalLight ref={rim} target={target} intensity={4.5} />
      <directionalLight ref={fill} target={target} intensity={0.85} color="#fff4e8" />
    </>
  )
}

/**
 * Post-processing, tiered so the page stays fluid on integrated graphics:
 *   Lite      — bloom, grade, FXAA
 *   Balanced  — adds the lens (depth of field + aberration) and shadows
 *   Cinematic — adds ambient occlusion, a denser lens kernel and SMAA
 */
function Effects({ quality }: { quality: Quality }) {
  const bloom = useRef<any>(null)
  const lens = useMemo(
    () => (quality === 0 ? null : new LensEffect(quality === 2 ? { taps: 24, maxBlur: 18 } : { taps: 14, maxBlur: 15 })),
    [quality],
  )
  useEffect(() => () => lens?.dispose(), [lens])
  const grain = useMemo(() => new GrainEffect(0.035), [])
  // Anti-aliasing reads its neighbours straight from the previous buffer, so it needs a pass of its own
  // after tone mapping — merged into the main pass it would resample the raw, ungraded image.
  const camera = useThree((s) => s.camera)
  const aa = useMemo(() => new EffectPass(camera, quality === 2 ? new SMAAEffect() : new FXAAEffect()), [camera, quality])
  useEffect(() => () => aa.dispose(), [aa])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const to = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    if (lens) {
      const cam = state.camera as THREE.PerspectiveCamera
      cam.getWorldDirection(dir)
      lens.focus(cam, Math.max(0.5, to.copy(frame.subject).sub(cam.position).dot(dir)))
      // The Jutsu page has two things worth seeing at once, some way apart: give it a deeper field.
      if (useStore.getState().view === 'dojo') lens.depth(3.6, 8)
      else lens.depth(1.3, 5)
    }
    if (bloom.current) bloom.current.intensity = 0.8 + frame.charge * 0.7 + frame.burst * 2.2 + frame.shake * 1.2
  })

  return (
    <EffectComposer
      ref={(c: unknown) => {
        if (import.meta.env.DEV) (window as any).__composer = c
      }}
      multisampling={0}
      enableNormalPass={false}
    >
      {quality === 2 ? <N8AO halfRes aoRadius={0.55} distanceFalloff={0.7} intensity={2.2} quality="low" /> : null}
      {lens ? <primitive object={lens} dispose={null} /> : null}
      <Bloom
        ref={bloom}
        mipmapBlur
        levels={quality === 2 ? 8 : 6}
        intensity={0.8}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.25}
        radius={0.82}
      />
      <Vignette offset={0.22} darkness={0.78} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={grain} dispose={null} />
      <primitive object={aa} dispose={null} />
    </EffectComposer>
  )
}

/** The big sphere of the story's Jutsu section, following the selected technique. */
function JutsuOrb() {
  const jutsu = useStore((s) => s.jutsu)
  const live = useWhen(() => useStore.getState().view === 'journey' && Math.abs(frame.f - 3) < 0.95)
  return <ChakraOrb look={JUTSU[jutsu]} live={live} satellites />
}

/**
 * Owns the shared charge: it builds while the visitor holds, and letting go of a meaningful
 * charge fires a release that every live effect (and the sound) reacts to.
 */
function ChargeDriver() {
  const was = useRef(false)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const active = useStore.getState().charging && canCharge()
    if (active) frame.charge = Math.min(1, frame.charge + dt / 1.6)
    else {
      if (was.current && frame.charge > 0.2) {
        frame.burst = frame.charge
        frame.power = frame.charge
        frame.bursts++
        audio.burst(frame.charge)
      }
      frame.charge = Math.max(0, frame.charge - dt * 2.5)
    }
    was.current = active
    frame.burst = Math.max(0, frame.burst - dt * 1.4)
    frame.shake = Math.max(0, frame.shake - dt * 1.5)
    audio.charge(frame.charge)
  })
  return null
}

function Scene() {
  const quality = useStore((s) => s.quality)
  const frames = useRef(0)

  // Reveal the page only once a few frames have really been drawn.
  // …and the hero figure has arrived; give up waiting after a few seconds on a slow connection.
  const started = useRef(0)
  useFrame((state) => {
    if (useStore.getState().ready) return
    if (frames.current < 4) frames.current++
    started.current ||= state.clock.elapsedTime
    const waited = state.clock.elapsedTime - started.current
    if (frames.current >= 4 && (useStore.getState().heroReady || waited > 6)) useStore.getState().setReady()
  })

  return (
    <>
      <Backdrop />
      <Studio />
      <Lights />
      <CameraRig />
      <ChargeDriver />

      <Station from={0} to={0} position={ANCHOR.hero}>
        <HeroFigure />
      </Station>
      <Station from={1} to={1} position={ANCHOR.headband}>
        <Headband />
      </Station>
      <Station from={2} to={2} position={ANCHOR.kunai}>
        <Kunai />
        <StoryFigures />
      </Station>
      <Station from={3} to={3} position={ANCHOR.orb}>
        <JutsuOrb />
        <JutsuFigures />
      </Station>
      <Station from={4} to={5} position={ANCHOR.hat}>
        <HokageHat />
      </Station>
      <Dojo />

      <Leaves count={quality === 0 ? 40 : 70} />
      <Dust count={quality === 0 ? 260 : 520} />
      <Effects quality={quality} />
    </>
  )
}

/**
 * Rendered-pixel budget for each tier, in megapixels. Working from a budget rather than a fixed
 * pixel ratio keeps a phone sharp (few CSS pixels, dense screen) without drowning a 4K monitor.
 * The live value slides inside the range with measured frame rate.
 */
const PIXEL_BUDGET: [number, number][] = [
  [0.6, 1.1],
  [1.0, 2.0],
  [2.2, 6.5],
]

function useViewportPixels() {
  const [px, setPx] = useState(() => window.innerWidth * window.innerHeight)
  useEffect(() => {
    const on = () => setPx(window.innerWidth * window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return px
}

// Safari reports every device as "Apple GPU", phones and old Intel Macs included, so that name proves nothing.
const DISCRETE_GPU = /RTX|GTX|Quadro|Radeon RX|Radeon Pro|Arc\(TM\) [AB]\d|Apple M\d/i

export function Experience({ eventSource }: { eventSource: RefObject<HTMLElement> }) {
  const quality = useStore((s) => s.quality)
  const [factor, setFactor] = useState(0.5)
  const lastFactor = useRef(0.5)
  const [lo, hi] = PIXEL_BUDGET[quality]
  const cssPixels = useViewportPixels()
  const budget = (lo + (hi - lo) * factor) * 1e6
  const dpr = Math.min(window.devicePixelRatio || 1, Math.max(0.7, Math.sqrt(budget / cssPixels)))

  return (
    <Canvas
      eventSource={eventSource}
      eventPrefix="client"
      dpr={dpr}
      shadows="percentage"
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 30, near: 0.1, far: 140, position: [0.9, 0.9, 9] }}
      onCreated={(state) => {
        state.gl.setClearColor('#040507')
        // A dedicated GPU can start on the top tier; everything else starts on Balanced.
        if (!qualityLocked) {
          const gl = state.gl.getContext()
          const info = gl.getExtension('WEBGL_debug_renderer_info')
          const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
          const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
          if (!mobile && DISCRETE_GPU.test(name)) useStore.getState().setQuality(2)
        }
        // Pieces that are hidden (another station, the other page) must not catch presses meant for what is in front.
        state.setEvents({
          filter: (hits) =>
            hits.filter((hit) => {
              for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (!o.visible) return false
              return true
            }),
        })
        // Handles for profiling from the console during development.
        if (import.meta.env.DEV) Object.assign(window, { __r3f: state, __store: useStore, __frame: frame })
      }}
    >
      {!qualityLocked && (
        <PerformanceMonitor
          factor={0.5}
          step={0.25}
          bounds={(refresh) => (refresh > 90 ? [50, 84] : [40, 56])}
          onChange={({ factor }) => {
            lastFactor.current = factor
            setFactor(factor)
          }}
          onDecline={({ factor }) => {
            // Already at the bottom of this tier's resolution range and still slow: drop a tier.
            const s = useStore.getState()
            if (lastFactor.current <= 0 && s.quality > 0) s.setQuality((s.quality - 1) as Quality)
            lastFactor.current = factor
            setFactor(factor)
          }}
        />
      )}
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}
