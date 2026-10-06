import * as THREE from 'three'

/* Every surface in the scene is textured procedurally on a 2D canvas, so the site ships no image assets. */

type Ctx = CanvasRenderingContext2D
type Pt = [number, number]

export function rng(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', { willReadFrequently: true })!]
}

interface TexOpts {
  srgb?: boolean
  repeat?: [number, number]
  aniso?: number
}

function toTexture(c: HTMLCanvasElement, { srgb = false, repeat, aniso = 8 }: TexOpts = {}) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = aniso
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  t.needsUpdate = true
  return t
}

const gray = (v: number, a = 1) => {
  const g = Math.round(Math.min(255, Math.max(0, v)))
  return `rgba(${g},${g},${g},${a})`
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Sobel-style conversion of a grayscale height canvas into a tangent-space normal map. */
export function heightToNormal(src: HTMLCanvasElement, strength = 2, wrap = false) {
  const w = src.width
  const h = src.height
  const s = src.getContext('2d')!.getImageData(0, 0, w, h).data
  const hgt = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) hgt[i] = s[i * 4] / 255
  const [out, octx] = makeCanvas(w, h)
  const img = octx.createImageData(w, h)
  const d = img.data
  const at = (x: number, y: number) => {
    if (wrap) {
      x = (x + w) % w
      y = (y + h) % h
    } else {
      x = x < 0 ? 0 : x >= w ? w - 1 : x
      y = y < 0 ? 0 : y >= h ? h - 1 : y
    }
    return hgt[y * w + x]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      // Canvas y runs down while texture v runs up, hence the flipped sign on y.
      const nx = -dx
      const ny = dy
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const i = (y * w + x) * 4
      d[i] = (nx * il * 0.5 + 0.5) * 255
      d[i + 1] = (ny * il * 0.5 + 0.5) * 255
      d[i + 2] = (il * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

/** Long, thin horizontal strokes — the grain left by a wire brush or a grinding belt. */
function brushed(ctx: Ctx, w: number, h: number, rnd: () => number, count: number, alpha: number, lo = 0, hi = 255) {
  for (let i = 0; i < count; i++) {
    const y = rnd() * h
    const x = rnd() * w
    const len = (0.12 + rnd() * 0.7) * w
    ctx.strokeStyle = gray(lo + rnd() * (hi - lo), rnd() * alpha)
    ctx.lineWidth = 0.5 + rnd() * 1.3
    const dy = (rnd() - 0.5) * 2
    for (const ox of [0, -w]) {
      ctx.beginPath()
      ctx.moveTo(x + ox, y)
      ctx.lineTo(x + ox + len, y + dy)
      ctx.stroke()
    }
  }
}

function blotches(ctx: Ctx, w: number, h: number, rnd: () => number, count: number, rMin: number, rMax: number, lo: number, hi: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = rMin + rnd() * (rMax - rMin)
    const v = lo + rnd() * (hi - lo)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, gray(v, alpha * (0.4 + rnd() * 0.6)))
    g.addColorStop(1, gray(v, 0))
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

function scratches(ctx: Ctx, w: number, h: number, rnd: () => number, count: number, lo: number, hi: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const a = rnd() * Math.PI
    const len = 20 + rnd() * rnd() * w * 0.35
    ctx.strokeStyle = gray(lo + rnd() * (hi - lo), alpha * (0.3 + rnd() * 0.7))
    ctx.lineWidth = 0.6 + rnd() * 1.1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 12,
      y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 12,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    )
    ctx.stroke()
  }
}

/* ------------------------------------------------------------------ */
/* Hidden Leaf crest                                                    */
/* ------------------------------------------------------------------ */

let emblemCache: { spiral: Pt[]; leaf: Pt[]; stem: Pt[] } | null = null

/** The crest in unit space: origin near the swirl centre, y pointing down, outer swirl radius ≈ 0.86. */
export function emblemLines() {
  if (emblemCache) return emblemCache
  const spiral: Pt[] = []
  for (let i = 0; i <= 220; i++) {
    const s = (i / 220) * 720
    const psi = ((300 - s) * Math.PI) / 180
    const r = 0.86 - 0.42 * sstep(270, 450, s) - 0.3 * sstep(540, 740, s)
    const cx = -0.22 + 0.12 * sstep(270, 450, s)
    spiral.push([cx + Math.cos(psi) * r, Math.sin(psi) * r])
  }
  // The leaf's point: two tangents drawn from the tip onto the outer turn of the swirl.
  const C: Pt = [-0.22, 0]
  const rad = 0.86
  const tip: Pt = [-1.66, 0.66]
  const ang = Math.atan2(tip[1] - C[1], tip[0] - C[0])
  const al = Math.acos(rad / Math.hypot(tip[0] - C[0], tip[1] - C[1]))
  const pUp: Pt = [C[0] + Math.cos(ang + al) * rad, C[1] + Math.sin(ang + al) * rad]
  const pLow: Pt = [C[0] + Math.cos(ang - al) * rad, C[1] + Math.sin(ang - al) * rad]
  const s0 = spiral[0]
  emblemCache = {
    spiral,
    leaf: [pUp, tip, pLow],
    stem: [s0, [s0[0] + 0.36, s0[1] - 0.32]],
  }
  return emblemCache
}

/** Bounding-box centre of the crest in its own unit space (for centring it on a surface). */
export const EMBLEM_CENTER: Pt = [-0.51, -0.1]

function strokeEmblem(ctx: Ctx, cx: number, cy: number, R: number, lineWidth: number) {
  const { spiral, leaf, stem } = emblemLines()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(R, R)
  ctx.lineWidth = lineWidth / R
  ctx.lineJoin = 'miter'
  ctx.miterLimit = 10
  ctx.lineCap = 'round'
  for (const line of [spiral, leaf, stem]) {
    ctx.beginPath()
    line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  }
  ctx.restore()
}

export function emblemSvgPaths(): string[] {
  const { spiral, leaf, stem } = emblemLines()
  return [spiral, leaf, stem].map((line) =>
    line.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' '),
  )
}

/* ------------------------------------------------------------------ */
/* Forehead-protector plate                                             */
/* ------------------------------------------------------------------ */

export function makePlateTextures() {
  const W = 1536
  const H = 592
  const rnd = rng(11)
  const R = 176
  const cx = W / 2 - EMBLEM_CENTER[0] * R
  const cy = H / 2 - EMBLEM_CENTER[1] * R

  // Height: brushed grain, wear, and the crest cut in as a bevelled groove.
  const [hc, h] = makeCanvas(W, H)
  h.fillStyle = gray(132)
  h.fillRect(0, 0, W, H)
  blotches(h, W, H, rnd, 40, 40, 220, 118, 142, 0.25)
  brushed(h, W, H, rnd, 5200, 0.07)
  scratches(h, W, H, rnd, 90, 40, 110, 0.5)
  blotches(h, W, H, rnd, 26, 3, 11, 30, 70, 0.55)
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1)
    h.strokeStyle = gray(124 - k * 104)
    strokeEmblem(h, cx, cy, R, 27 - k * 15)
  }

  // Roughness: satin plate, smudged by handling, rough inside the engraving.
  const [rc, r] = makeCanvas(W, H)
  r.fillStyle = gray(78)
  r.fillRect(0, 0, W, H)
  blotches(r, W, H, rnd, 70, 30, 170, 50, 140, 0.3)
  brushed(r, W, H, rnd, 3600, 0.3, 30, 150)
  scratches(r, W, H, rnd, 70, 150, 230, 0.6)
  r.strokeStyle = gray(190)
  strokeEmblem(r, cx, cy, R, 21)
  const edge = r.createLinearGradient(0, 0, 0, H)
  edge.addColorStop(0, gray(170, 0.55))
  edge.addColorStop(0.12, gray(170, 0))
  edge.addColorStop(0.88, gray(170, 0))
  edge.addColorStop(1, gray(170, 0.55))
  r.fillStyle = edge
  r.fillRect(0, 0, W, H)

  // Base colour: steel, slightly warm, with grime settled into the cut and along the rim.
  const [ac, a] = makeCanvas(W, H)
  a.fillStyle = '#c3c7cd'
  a.fillRect(0, 0, W, H)
  blotches(a, W, H, rnd, 50, 40, 200, 150, 215, 0.16)
  brushed(a, W, H, rnd, 2600, 0.06, 120, 255)
  a.strokeStyle = 'rgba(30,32,36,0.22)'
  strokeEmblem(a, cx, cy, R, 34)
  a.strokeStyle = 'rgba(26,27,30,0.9)'
  strokeEmblem(a, cx, cy, R, 18)
  const vg = a.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62)
  vg.addColorStop(0, 'rgba(40,36,30,0)')
  vg.addColorStop(1, 'rgba(40,36,30,0.42)')
  a.fillStyle = vg
  a.fillRect(0, 0, W, H)

  return {
    map: toTexture(ac, { srgb: true, aniso: 16 }),
    roughnessMap: toTexture(rc, { aniso: 16 }),
    normalMap: toTexture(heightToNormal(hc, 5.5), { aniso: 16 }),
  }
}

/** Generic tileable brushed / forged steel set, used for rivets, blades and ring. */
export function makeSteelTextures(seed = 3, forged = false) {
  const S = 512
  const rnd = rng(seed)
  const [hc, h] = makeCanvas(S, S)
  h.fillStyle = gray(128)
  h.fillRect(0, 0, S, S)
  if (forged) {
    blotches(h, S, S, rnd, 420, 4, 26, 70, 190, 0.35)
    blotches(h, S, S, rnd, 160, 1.5, 5, 20, 70, 0.6)
  }
  brushed(h, S, S, rnd, forged ? 500 : 2600, forged ? 0.08 : 0.1)
  scratches(h, S, S, rnd, forged ? 60 : 30, 30, 110, 0.5)

  const [rc, r] = makeCanvas(S, S)
  r.fillStyle = gray(forged ? 118 : 62)
  r.fillRect(0, 0, S, S)
  blotches(r, S, S, rnd, 90, 16, 90, forged ? 70 : 40, forged ? 200 : 130, 0.35)
  brushed(r, S, S, rnd, 1800, 0.3, 30, forged ? 220 : 140)
  scratches(r, S, S, rnd, 50, 150, 240, 0.5)

  return {
    roughnessMap: toTexture(rc, { repeat: [1, 1] }),
    normalMap: toTexture(heightToNormal(hc, forged ? 3.2 : 2.2, true), { repeat: [1, 1] }),
  }
}

/* ------------------------------------------------------------------ */
/* Cloth                                                                */
/* ------------------------------------------------------------------ */

/** Plain-weave fabric: warp and weft threads passing over and under each other. Tileable. */
export function makeClothTextures(repeat: [number, number] = [40, 4]) {
  const S = 256
  const N = 8
  const rnd = rng(5)
  const [hc, h] = makeCanvas(S, S)
  const img = h.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * N
      const v = (y / S) * N
      const iu = Math.floor(u)
      const iv = Math.floor(v)
      const warp = Math.pow(Math.sin((u - iu) * Math.PI), 0.7) * (0.5 + 0.5 * Math.cos(Math.PI * (v - 0.5 - iu)))
      const weft = Math.pow(Math.sin((v - iv) * Math.PI), 0.7) * (0.5 + 0.5 * Math.cos(Math.PI * (u - 0.5 - iv - 1)))
      const fibre = (rnd() - 0.5) * 0.12
      const val = Math.max(warp, weft) * 0.85 + 0.1 + fibre
      const i = (y * S + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(1, val)) * 255
      img.data[i + 3] = 255
    }
  }
  h.putImageData(img, 0, 0)

  // Roughness follows the weave: thread crowns catch a little sheen, gaps stay matte.
  const [rc, r] = makeCanvas(S, S)
  r.drawImage(hc, 0, 0)
  r.globalCompositeOperation = 'difference'
  r.fillStyle = '#fff'
  r.fillRect(0, 0, S, S)
  r.globalCompositeOperation = 'source-over'
  r.fillStyle = gray(215, 0.72)
  r.fillRect(0, 0, S, S)

  return {
    normalMap: toTexture(heightToNormal(hc, 2.6, true), { repeat }),
    roughnessMap: toTexture(rc, { repeat }),
  }
}

/** Diagonal cloth tape wound around a kunai grip. */
export function makeWrapTextures() {
  const W = 256
  const H = 512
  const rnd = rng(9)
  const bands = 9
  const [hc, h] = makeCanvas(W, H)
  const img = h.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // One full turn around the grip advances the tape by exactly one band, so the seam tiles.
      const t = (y / H) * bands + x / W
      const f = t - Math.floor(t)
      const lap = Math.pow(f, 0.6) * 0.75 + 0.15
      const fibre = (rnd() - 0.5) * 0.16
      const weave = 0.05 * Math.sin((x / W) * Math.PI * 60) * Math.sin((y / H) * Math.PI * 220)
      const i = (y * W + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(1, lap + fibre + weave)) * 255
      img.data[i + 3] = 255
    }
  }
  h.putImageData(img, 0, 0)

  const [ac, a] = makeCanvas(W, H)
  a.fillStyle = '#b9b0a0'
  a.fillRect(0, 0, W, H)
  a.globalAlpha = 0.45
  a.globalCompositeOperation = 'multiply'
  a.drawImage(hc, 0, 0)
  a.globalAlpha = 1
  a.globalCompositeOperation = 'source-over'
  blotches(a, W, H, rnd, 40, 10, 60, 40, 90, 0.22)

  return {
    map: toTexture(ac, { srgb: true, repeat: [1, 1] }),
    normalMap: toTexture(heightToNormal(hc, 4, true), { repeat: [1, 1] }),
  }
}

/* ------------------------------------------------------------------ */
/* Leaves, glows                                                        */
/* ------------------------------------------------------------------ */

export function makeLeafTexture() {
  const S = 256
  const [c, ctx] = makeCanvas(S, S)
  const rnd = rng(21)
  ctx.clearRect(0, 0, S, S)
  ctx.beginPath()
  ctx.moveTo(128, 6)
  ctx.bezierCurveTo(214, 58, 222, 168, 128, 232)
  ctx.bezierCurveTo(34, 168, 42, 58, 128, 6)
  ctx.closePath()
  const g = ctx.createLinearGradient(40, 0, 220, 240)
  g.addColorStop(0, '#5f9a35')
  g.addColorStop(0.5, '#3f7d2a')
  g.addColorStop(1, '#2c5e22')
  ctx.fillStyle = g
  ctx.fill()
  ctx.save()
  ctx.clip()
  blotches(ctx, S, S, rnd, 60, 6, 30, 30, 120, 0.12)
  ctx.strokeStyle = 'rgba(190,225,130,0.75)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(128, 232)
  ctx.quadraticCurveTo(124, 120, 128, 10)
  ctx.stroke()
  ctx.lineWidth = 1.3
  ctx.strokeStyle = 'rgba(190,225,130,0.5)'
  for (let i = 0; i < 7; i++) {
    const y = 205 - i * 26
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(127, y)
      ctx.quadraticCurveTo(128 + s * 30, y - 16, 128 + s * (64 - i * 4), y - 40)
      ctx.stroke()
    }
  }
  ctx.restore()
  ctx.strokeStyle = '#3a5a22'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(128, 230)
  ctx.lineTo(126, 252)
  ctx.stroke()
  const t = toTexture(c, { srgb: true, aniso: 4 })
  return t
}

/* ------------------------------------------------------------------ */
/* Hokage hat                                                           */
/* ------------------------------------------------------------------ */

/** Woven straw: radial ribs crossed by concentric binding rows. u runs around the hat, v from brim to apex. */
export function makeStrawTextures() {
  const W = 1024
  const H = 512
  const rnd = rng(31)
  const [hc, h] = makeCanvas(W, H)
  const img = h.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W
      const v = y / H
      const rib = Math.pow(Math.abs(Math.sin(u * Math.PI * 190)), 0.6)
      const row = Math.pow(Math.abs(Math.sin(v * Math.PI * 46 + Math.sin(u * Math.PI * 190) * 0.4)), 0.5)
      const val = rib * 0.55 + row * 0.35 + (rnd() - 0.5) * 0.14
      const i = (y * W + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(1, val)) * 255
      img.data[i + 3] = 255
    }
  }
  h.putImageData(img, 0, 0)
  return {
    height: hc,
    normalMap: toTexture(heightToNormal(hc, 2.4, true), { aniso: 16 }),
  }
}

/** One brush stroke: a quadratic centreline with a width that swells and tapers along it. */
interface Stroke {
  p: [Pt, Pt, Pt]
  w: [number, number, number]
}

/** The kanji 火 ("fire") as four brush strokes in a unit box, so it never depends on an installed font. */
const FIRE_STROKES: Stroke[] = [
  { p: [[0.19, 0.29], [0.25, 0.4], [0.31, 0.54]], w: [0.045, 0.09, 0.115] },
  { p: [[0.82, 0.25], [0.76, 0.41], [0.65, 0.54]], w: [0.115, 0.09, 0.03] },
  { p: [[0.5, 0.05], [0.52, 0.6], [0.09, 0.95]], w: [0.125, 0.105, 0.016] },
  { p: [[0.51, 0.44], [0.6, 0.74], [0.93, 0.93]], w: [0.045, 0.1, 0.15] },
]

function brushKanji(ctx: Ctx, strokes: Stroke[], x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color
  for (const { p, w } of strokes) {
    const steps = 140
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const a = (1 - t) * (1 - t)
      const b = 2 * (1 - t) * t
      const c = t * t
      const px = a * p[0][0] + b * p[1][0] + c * p[2][0]
      const py = a * p[0][1] + b * p[1][1] + c * p[2][1]
      const r = (a * w[0] + b * w[1] + c * w[2]) / 2
      ctx.beginPath()
      ctx.arc(x + px * size, y + py * size, Math.max(0.5, r * size), 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * Colour map for the hat. The crest panel is drawn flat and then warped row by row,
 * because a row near the apex wraps a much shorter circle than a row near the brim.
 */
export function makeHatColor(straw: HTMLCanvasElement, slantOverRadius: number) {
  const W = 2048
  const H = 1024
  const rnd = rng(33)
  const [c, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#a3161b'
  ctx.fillRect(0, 0, W, H)
  blotches(ctx, W, H, rnd, 120, 30, 200, 20, 90, 0.12)

  // Flat artwork for the front panel: white field, kanji for "fire".
  const P = 640
  const [pc, p] = makeCanvas(P, P)
  p.fillStyle = '#ece7dc'
  p.fillRect(0, 0, P, P)
  brushKanji(p, FIRE_STROKES, P * 0.16, P * 0.15, P * 0.68, '#17110f')

  // Panel occupies slant range s0..s1 (0 = apex, 1 = brim); canvas y is s because v = 1 at the apex.
  const s0 = 0.5
  const s1 = 0.985
  const size = s1 - s0
  const y0 = Math.floor(s0 * H)
  const y1 = Math.ceil(s1 * H)
  for (let y = y0; y < y1; y++) {
    const s = y / H
    const q = (s - s0) / size
    // Arc length per unit u at this row is 2πr·s, so the flat width shrinks as 1/s in u.
    const du = (size * slantOverRadius) / (2 * Math.PI * s)
    const dw = du * W
    ctx.drawImage(pc, 0, Math.min(P - 1, q * P), P, 1, W / 2 - dw / 2, y, dw, 1.5)
  }

  // Seams between the four panels of the crown.
  ctx.strokeStyle = 'rgba(40,6,8,0.55)'
  ctx.lineWidth = 5
  for (const u of [0.125, 0.375, 0.625, 0.875]) {
    ctx.beginPath()
    ctx.moveTo(u * W, 0)
    ctx.lineTo(u * W, H)
    ctx.stroke()
  }

  // Let the straw weave darken the dye slightly so the colour is not flat.
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.5
  ctx.drawImage(straw, 0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

  return toTexture(c, { srgb: true, aniso: 16 })
}

/* ------------------------------------------------------------------ */
/* Character dais                                                       */
/* ------------------------------------------------------------------ */

let daisTextures: ReturnType<typeof buildDaisTextures> | null = null

/**
 * Top face of the pedestal the character stands on. Several megapixels of canvas work, and every
 * pedestal looks the same, so it is built once and shared.
 */
export const makeDaisTextures = () => (daisTextures ??= buildDaisTextures())

/** Dark stone, turned rings, the crest cut into the centre. */
function buildDaisTextures() {
  const S = 1024
  const rnd = rng(41)
  const c0 = S / 2
  const R = S * 0.2

  const [hc, h] = makeCanvas(S, S)
  h.fillStyle = gray(128)
  h.fillRect(0, 0, S, S)
  blotches(h, S, S, rnd, 900, 3, 22, 80, 180, 0.22)
  blotches(h, S, S, rnd, 260, 1.5, 5, 30, 80, 0.5)
  // Concentric tool marks left by turning the slab.
  for (let r = 14; r < S / 2; r += 5 + rnd() * 9) {
    h.strokeStyle = gray(90 + rnd() * 80, 0.16)
    h.lineWidth = 0.8 + rnd() * 1.4
    h.beginPath()
    h.arc(c0, c0, r, 0, Math.PI * 2)
    h.stroke()
  }
  for (const [r, w] of [
    [S * 0.47, 10],
    [S * 0.36, 5],
  ]) {
    h.strokeStyle = gray(40)
    h.lineWidth = w
    h.beginPath()
    h.arc(c0, c0, r, 0, Math.PI * 2)
    h.stroke()
  }
  for (let i = 0; i < 7; i++) {
    const k = i / 6
    h.strokeStyle = gray(118 - k * 96)
    strokeEmblem(h, c0 - EMBLEM_CENTER[0] * R, c0 - EMBLEM_CENTER[1] * R, R, 24 - k * 13)
  }

  const [ac, a] = makeCanvas(S, S)
  a.fillStyle = '#23252b'
  a.fillRect(0, 0, S, S)
  blotches(a, S, S, rnd, 500, 6, 60, 20, 70, 0.2)
  a.strokeStyle = 'rgba(6,6,8,0.85)'
  strokeEmblem(a, c0 - EMBLEM_CENTER[0] * R, c0 - EMBLEM_CENTER[1] * R, R, 16)
  for (const r of [S * 0.47, S * 0.36]) {
    a.strokeStyle = 'rgba(6,6,8,0.8)'
    a.lineWidth = 6
    a.beginPath()
    a.arc(c0, c0, r, 0, Math.PI * 2)
    a.stroke()
  }

  const [rc, r] = makeCanvas(S, S)
  r.fillStyle = gray(150)
  r.fillRect(0, 0, S, S)
  blotches(r, S, S, rnd, 300, 10, 90, 90, 220, 0.3)

  return {
    map: toTexture(ac, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormal(hc, 3.4), { aniso: 16 }),
    roughnessMap: toTexture(rc, { aniso: 8 }),
  }
}
