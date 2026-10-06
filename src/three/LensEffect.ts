import { Effect, EffectAttribute, ShaderPass } from 'postprocessing'
import {
  HalfFloatType,
  LinearFilter,
  NoBlending,
  ShaderMaterial,
  Uniform,
  Vector2,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from 'three'

/*
 * A camera lens in two cheap steps, built for integrated GPUs:
 *   1. a half-resolution disc blur weighted by each sample's circle of confusion,
 *   2. a full-resolution composite that blends sharp and blurred by depth and
 *      adds a touch of chromatic aberration toward the frame edges.
 * It replaces the stock depth-of-field pass, which costs several times more.
 */

const COC = /* glsl */ `
float lensCoc(float dist) {
  float d = dist - uFocus;
  return sign(d) * smoothstep(uRange, uRange + uFalloff, abs(d));
}
`

const blurFragment = /* glsl */ `
precision highp float;
uniform sampler2D inputBuffer;
uniform highp sampler2D depthBuffer;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uRange;
uniform float uFalloff;
uniform float uMaxBlur;
varying vec2 vUv;
${COC}
float cocAt(vec2 uv) {
  float depth = texture2D(depthBuffer, uv).r;
  float viewZ = (uNear * uFar) / ((uFar - uNear) * depth - uFar);
  return lensCoc(-viewZ);
}
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
void main() {
  float c0 = cocAt(vUv);
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  float radius = uMaxBlur * max(abs(c0), 0.3);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float nearAcc = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i) + 0.5;
    float a = fi * 2.39996323 + rot;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * sqrt(fi / float(TAPS)) * radius * uTexel;
    float ci = cocAt(uv);
    // A sample spreads only as far as its own blur, so sharp surfaces never smear outward.
    float w = max(abs(ci), 0.02);
    acc += min(texture2D(inputBuffer, uv).rgb, vec3(24.0)) * w;
    wsum += w;
    nearAcc += max(-ci, 0.0);
  }
  gl_FragColor = vec4(acc / wsum, nearAcc / float(TAPS));
}
`

const blurVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const effectFragment = /* glsl */ `
uniform sampler2D uBlur;
uniform float uFocus;
uniform float uRange;
uniform float uFalloff;
uniform float uAberration;
${COC}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float c = abs(lensCoc(-getViewZ(depth)));
  // Four bilinear taps around the pixel: a cheap tent filter that hides the blur's sampling pattern.
  vec2 o = texelSize * 1.5;
  vec4 blur = 0.25 * (texture2D(uBlur, uv + o) + texture2D(uBlur, uv - o)
                    + texture2D(uBlur, uv + vec2(o.x, -o.y)) + texture2D(uBlur, uv + vec2(-o.x, o.y)));
  vec2 off = uv - 0.5;
  vec2 shift = off * dot(off, off) * uAberration;
  vec3 sharp = vec3(texture2D(inputBuffer, uv + shift).r, inputColor.g, texture2D(inputBuffer, uv - shift).b);
  // Out-of-focus foreground bleeds over what is behind it; background blur follows the pixel itself.
  float m = clamp(max(c, blur.a * 2.5), 0.0, 1.0);
  outputColor = vec4(mix(sharp, blur.rgb, m), inputColor.a);
}
`

export interface LensOptions {
  taps?: number
  maxBlur?: number
  range?: number
  falloff?: number
  aberration?: number
}

export class LensEffect extends Effect {
  private target: WebGLRenderTarget
  private blurPass: ShaderPass
  private blurMaterial: ShaderMaterial
  private maxBlur: number

  constructor({ taps = 14, maxBlur = 16, range = 1.3, falloff = 5, aberration = 0.012 }: LensOptions = {}) {
    super('LensEffect', effectFragment, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uBlur', new Uniform(null)],
        ['uFocus', new Uniform(6)],
        ['uRange', new Uniform(range)],
        ['uFalloff', new Uniform(falloff)],
        ['uAberration', new Uniform(aberration)],
      ]),
    })

    this.maxBlur = maxBlur
    this.target = new WebGLRenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType })
    this.target.texture.name = 'Lens.Blur'
    this.target.texture.minFilter = this.target.texture.magFilter = LinearFilter
    this.uniforms.get('uBlur')!.value = this.target.texture

    this.blurMaterial = new ShaderMaterial({
      name: 'LensBlurMaterial',
      defines: { TAPS: String(taps) },
      uniforms: {
        inputBuffer: new Uniform(null),
        depthBuffer: new Uniform(null),
        uTexel: new Uniform(new Vector2()),
        uNear: new Uniform(0.1),
        uFar: new Uniform(100),
        uFocus: new Uniform(6),
        uRange: new Uniform(range),
        uFalloff: new Uniform(falloff),
        uMaxBlur: new Uniform(maxBlur),
      },
      vertexShader: blurVertex,
      fragmentShader: blurFragment,
      blending: NoBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
    this.blurPass = new ShaderPass(this.blurMaterial)
  }

  /** Call once per frame with the camera and the distance (along the view axis) that should be sharp. */
  focus(camera: PerspectiveCamera, distance: number) {
    const u = this.blurMaterial.uniforms
    u.uNear.value = camera.near
    u.uFar.value = camera.far
    u.uFocus.value = distance
    this.uniforms.get('uFocus')!.value = distance
  }

  /** How deep the sharp zone around the focus distance is, and how gradually blur builds beyond it (world units). */
  depth(range: number, falloff: number) {
    const u = this.blurMaterial.uniforms
    u.uRange.value = range
    u.uFalloff.value = falloff
    this.uniforms.get('uRange')!.value = range
    this.uniforms.get('uFalloff')!.value = falloff
  }

  override setDepthTexture(depthTexture: Texture) {
    this.blurMaterial.uniforms.depthBuffer.value = depthTexture
  }

  override update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget) {
    this.blurPass.render(renderer, inputBuffer, this.target)
  }

  override setSize(width: number, height: number) {
    this.target.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)))
    ;(this.blurMaterial.uniforms.uTexel.value as Vector2).set(1 / width, 1 / height)
    // Blur radius is authored for a 1080-pixel-tall frame and scales with the real one.
    this.blurMaterial.uniforms.uMaxBlur.value = (this.maxBlur * height) / 1080
  }

  override initialize(renderer: WebGLRenderer, alpha: boolean, frameBufferType: number) {
    this.blurPass.initialize(renderer, alpha, frameBufferType)
    if (frameBufferType !== undefined) this.target.texture.type = frameBufferType as TextureDataType
  }

  override dispose() {
    this.target.dispose()
    this.blurMaterial.dispose()
    super.dispose()
  }
}

const grainFragment = /* glsl */ `
uniform float uAmount;
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float n = grainHash(uv * resolution + fract(time) * 517.0) - 0.5;
  // Work in display space so the grain is perceptually even from shadows to highlights.
  vec3 g = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
  float lum = dot(g, vec3(0.299, 0.587, 0.114));
  g += n * (uAmount * (0.3 + lum * (1.0 - lum) * 2.8) + 1.0 / 255.0);
  outputColor = vec4(pow(max(g, 0.0), vec3(2.2)), inputColor.a);
}
`

/**
 * Film grain that doubles as output dither: one code value of noise everywhere
 * keeps the near-black gradients of the backdrop from banding on 8-bit displays.
 */
export class GrainEffect extends Effect {
  constructor(amount = 0.035) {
    super('GrainEffect', grainFragment, {
      uniforms: new Map<string, Uniform>([['uAmount', new Uniform(amount)]]),
    })
  }
}
