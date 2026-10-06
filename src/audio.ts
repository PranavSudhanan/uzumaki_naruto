/*
 * Sound, synthesised on the fly with the Web Audio API — no audio files.
 * A hum that rises with the charge, a blast on release, a puff for each clone, a tick for controls.
 * Nothing plays until the visitor has interacted with the page, as browsers require.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let hum: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; noise: GainNode } | null = null
let enabled = true
let noiseBuffer: AudioBuffer | null = null

function noise(c: AudioContext) {
  if (noiseBuffer) return noiseBuffer
  noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const d = noiseBuffer.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuffer
}

/** Creates the audio graph on the first user gesture. Safe to call repeatedly. */
function ready(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)

    // The charge hum: a saw and a sub-octave sine through a low-pass that opens as the charge builds.
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 6
    const gain = ctx.createGain()
    gain.gain.value = 0
    const src = ctx.createBufferSource()
    src.buffer = noise(ctx)
    src.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2400
    band.Q.value = 0.8
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    osc.connect(filter)
    sub.connect(filter)
    filter.connect(gain)
    src.connect(band)
    band.connect(noiseGain)
    noiseGain.connect(gain)
    gain.connect(master)
    osc.start()
    sub.start()
    src.start()
    hum = { osc, sub, filter, gain, noise: noiseGain }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export const audio = {
  setEnabled(on: boolean) {
    enabled = on
    if (!on && hum && ctx) hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  },

  /** Silences everything while the page is in the background, and picks up again when it returns. */
  sleep(hidden: boolean) {
    if (!ctx) return
    if (hidden) {
      hum?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03)
      void ctx.suspend()
    } else if (enabled) void ctx.resume()
  },

  /** Call once from any pointer or key handler so later sounds are allowed to play. */
  unlock() {
    ready()
  },

  /** Called every frame with the current charge (0–1). */
  charge(level: number) {
    if (!ctx || !hum || !enabled) return
    const t = ctx.currentTime
    const f = 70 + level * level * 260
    hum.osc.frequency.setTargetAtTime(f, t, 0.04)
    hum.sub.frequency.setTargetAtTime(f / 2, t, 0.04)
    hum.filter.frequency.setTargetAtTime(180 + level * 3200, t, 0.05)
    hum.gain.gain.setTargetAtTime(level > 0.01 ? 0.05 + level * 0.16 : 0, t, 0.06)
    hum.noise.gain.setTargetAtTime(level * 0.5, t, 0.06)
  },

  /** A release: a filtered noise blast with a falling low thump. */
  burst(power = 1) {
    const c = ready()
    if (!c || !master) return
    const t = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noise(c)
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(6000, t)
    f.frequency.exponentialRampToValueAtTime(180, t + 0.9)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.55 * power, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t)
    src.stop(t + 1.2)

    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.5)
    const og = c.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.7 * power, t + 0.015)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    o.connect(og)
    og.connect(master)
    o.start(t)
    o.stop(t + 0.75)
  },

  /** A clone appearing or vanishing: a short soft puff. */
  poof() {
    const c = ready()
    if (!c || !master) return
    const t = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noise(c)
    src.playbackRate.value = 0.7 + Math.random() * 0.5
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(900, t)
    f.frequency.exponentialRampToValueAtTime(260, t + 0.3)
    f.Q.value = 0.7
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t)
    src.stop(t + 0.42)
  },

  /** A quiet tick for buttons and selections. */
  tick(high = false) {
    const c = ready()
    if (!c || !master) return
    const t = c.currentTime
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(high ? 880 : 520, t)
    o.frequency.exponentialRampToValueAtTime(high ? 1320 : 380, t + 0.07)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    o.connect(g)
    g.connect(master)
    o.start(t)
    o.stop(t + 0.12)
  },
}
