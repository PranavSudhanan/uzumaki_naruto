/* GLSL sources. Kept as plain strings so the project needs no shader loader plugin. */

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
`

/* ------------------------------------------------------------------ */
/* Chakra sphere — raymarched emissive volume                           */
/* ------------------------------------------------------------------ */

export const orbVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const orbFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uGain;
uniform float uSteps;
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;
uniform float uDark;
uniform float uFlame;
varying vec3 vWorld;
${NOISE}

mat3 basis(vec3 a) {
  vec3 u = normalize(cross(a, abs(a.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  return mat3(u, cross(a, u), a);
}

// Filaments wound around an axis: fine across the flow, stretched along it.
float streak(vec3 p, mat3 B, float ang, float F, float seed, float sharp) {
  vec3 l = p * B;
  float rho = length(l.xy) + 1e-4;
  vec2 cs = l.xy / rho;
  float c = cos(ang), s = sin(ang);
  cs = vec2(c * cs.x - s * cs.y, s * cs.x + c * cs.y);
  float n = vnoise(vec3(rho * F + cs.x * 1.7 + seed, l.z * F + cs.y * 1.7, rho * F * 0.6 - seed * 1.7));
  return pow(1.0 - abs(2.0 * n - 1.0), sharp);
}

mat3 B1, B2, B3;

float swirl(vec3 p, float F, float sharp) {
  return streak(p, B1, uTime * 2.3, 5.5 * F, 0.0, sharp)
       + streak(p, B2, -uTime * 1.7, 6.5 * F, 3.1, sharp)
       + streak(p, B3, uTime * 2.9, 4.5 * F, 7.7, sharp);
}

/*
 * The sphere is shaded in three layers so it stays crisp at a low step count:
 *   - the core glow and the outer halo are closed-form functions of how close the ray passes to the centre,
 *   - the surface filaments are evaluated exactly where the ray enters and leaves the unit sphere,
 *   - only the interior filaments are raymarched, over the short chord inside the sphere.
 */
void main() {
  vec3 ro = (cameraPosition - uCenter) / uRadius;
  vec3 rd = normalize(vWorld - cameraPosition);
  float b = dot(ro, rd);
  float d2 = max(dot(ro, ro) - b * b, 0.0);
  float d = sqrt(d2);
  vec3 pc = ro - rd * b; // point on the ray nearest the centre

  B1 = basis(normalize(vec3(0.25, 1.0, 0.15)));
  B2 = basis(normalize(vec3(1.0, 0.35, -0.3)));
  B3 = basis(normalize(vec3(-0.4, 0.3, 1.0)));

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (d2 < 1.0) {
    float h = sqrt(1.0 - d2);
    float tIn = -b - h;
    float tOut = -b + h;
    vec3 pf = ro + rd * tIn;
    vec3 pb = ro + rd * tOut;
    float limb = pow(1.0 - h, 2.2);
    float sf = swirl(pf, 1.25, 12.0);
    float sb = swirl(pb, 1.25, 12.0);

    // Interior filaments.
    float ds = (tOut - tIn) / uSteps;
    float t = tIn + ds * hash13(vec3(gl_FragCoord.xy, fract(uTime) * 91.0));
    float inner = 0.0;
    for (int i = 0; i < 40; i++) {
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * t;
      float r2 = dot(p, p);
      inner += swirl(p, 1.0, 9.0) * (0.35 + 1.5 * r2) * ds;
      t += ds;
    }

    // Filaments run hotter than the body they move through.
    vec3 fil = mix(uMid, uCore, 0.3);
    vec3 bright = uCore * exp(-d2 * 15.0) * 2.6
                + uMid * exp(-d2 * 3.0) * 0.16
                + fil * inner * 0.42
                + fil * sf * (0.5 + 1.3 * limb)
                + uMid * sb * 0.16
                + uEdge * (0.03 + 1.0 * limb);
    float aBright = clamp(0.22 + 0.6 * exp(-d2 * 4.0) + 0.35 * limb + 0.25 * sf, 0.0, 0.92);

    // Dark mode: an almost opaque body, lit only along its filaments and rim.
    vec3 dim = uCore * (0.2 + 0.4 * h)
             + uMid * inner * 0.4
             + uMid * sf * (0.55 + 1.7 * limb)
             + uEdge * limb * 2.3
             + uEdge * pow(sf, 2.0) * 0.35;
    col = mix(bright, dim, uDark);
    alpha = mix(aBright, 0.985, uDark);

    float aa = smoothstep(1.0, 0.985, d);
    col *= mix(0.75, 1.0, aa);
    alpha *= aa;
  }

  // Halo: a tight rim of light hugging the surface plus a wide, faint glow.
  float out1 = max(d - 1.0, 0.0);
  float outside = smoothstep(0.985, 1.0, d);
  col += outside * (uEdge * 1.1 * exp(-out1 * 20.0) + mix(uEdge, uMid, 0.5) * 0.3 * exp(-out1 * 4.5));

  // Flame mode: tongues of chakra licking upward off the surface.
  if (uFlame > 0.001 && d > 0.8) {
    float n = vnoise(vec3(pc.x * 2.6, pc.y * 1.7 - uTime * 2.2, pc.z * 2.6)) * 0.65
            + vnoise(pc * 6.0 - vec3(0.0, uTime * 3.4, 0.0)) * 0.35;
    float reach = 0.4 + 0.28 * clamp(pc.y, -1.0, 1.0);
    float fl = smoothstep(0.4, 0.75, n) * smoothstep(reach, 0.0, out1) * smoothstep(0.8, 1.0, d) * uFlame;
    col += mix(uEdge, uMid, 0.55) * fl * 2.4;
  }

  if (alpha < 0.002 && dot(col, vec3(1.0)) < 0.004) discard;
  gl_FragColor = vec4(col * uGain, alpha);
}
`

/* ------------------------------------------------------------------ */
/* Rasenshuriken blades — a spinning disc of wind                       */
/* ------------------------------------------------------------------ */

export const bladeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const bladeFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAmount;
uniform vec3 uColor;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float th = atan(p.y, p.x);
  float spin = uTime * 5.0;
  // Four swept blades: a sawtooth in angle, sheared by radius so each blade curves back.
  float a = fract((th + spin + r * 1.9) * 4.0 / 6.2831853);
  float wid = mix(0.62, 0.02, smoothstep(0.16, 1.0, r));
  float blade = smoothstep(wid, wid * 0.35, a) * smoothstep(0.0, 0.03, a);
  float lead = exp(-a * 26.0);
  float grain = 0.55 + 0.45 * vnoise(vec3(r * 22.0, (th + spin) * 3.0, uTime * 2.0));
  float fade = smoothstep(1.0, 0.72, r) * smoothstep(0.1, 0.24, r);
  // Motion haze: thin concentric rings smeared by the spin.
  float rings = pow(vnoise(vec3(r * 46.0, 3.0, uTime * 0.7)), 3.0);
  float haze = (0.05 + rings * 0.22) * exp(-r * 1.6);
  float v = (blade * grain * 1.5 + lead * 2.4) * fade + haze * smoothstep(1.0, 0.8, r);
  gl_FragColor = vec4(uColor * v * uAmount * 1.6, v * uAmount);
}
`

/* ------------------------------------------------------------------ */
/* Sparks orbiting / converging on the sphere                           */
/* ------------------------------------------------------------------ */

export const sparkVertex = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uInward;
uniform float uVH;
attribute vec4 aSeed;
varying float vAlpha;
void main() {
  float t = uTime * (0.35 + aSeed.x * 0.9) + aSeed.y * 6.2831853;
  vec3 axis = normalize(vec3(sin(aSeed.z * 6.2831853) * 0.8, 1.0, cos(aSeed.w * 6.2831853) * 0.8));
  vec3 u = normalize(cross(axis, vec3(0.3, 0.1, 1.0)));
  vec3 v = cross(axis, u);
  float life = fract(t * 0.11 + aSeed.w);
  float orbit = uRadius * (1.12 + aSeed.z * 1.5 + 0.12 * sin(t * 2.7));
  float fall = uRadius * mix(3.6, 0.9, life * life);
  float rad = mix(orbit, fall, uInward);
  float ang = t * mix(2.0, 0.8, uInward);
  vec3 pos = (u * cos(ang) + v * sin(ang)) * rad + axis * sin(t * 1.3 + aSeed.x * 9.0) * 0.25 * uRadius;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.03 + aSeed.x * aSeed.x * 0.07;
  gl_PointSize = min(size * projectionMatrix[1][1] * uVH * 0.5 / max(-mv.z, 0.1), uVH * 0.05);
  float pulse = 0.55 + 0.45 * sin(t * 5.0 + aSeed.y * 30.0);
  vAlpha = mix(pulse, smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.8, life), uInward);
}
`

export const sparkFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  #ifdef SOLID_CORE
  if (a * vAlpha < 0.12) discard;
  #endif
  gl_FragColor = vec4(uColor * uGain, a * vAlpha);
}
`

/* ------------------------------------------------------------------ */
/* Drifting dust motes, wrapped in a box that follows the camera        */
/* ------------------------------------------------------------------ */

export const dustVertex = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uVH;
attribute vec4 aSeed;
varying float vAlpha;
void main() {
  vec3 p = position * uBox;
  p += vec3(
    sin(uTime * 0.11 + aSeed.x * 6.28) * 0.6 + uTime * 0.14,
    -uTime * (0.04 + aSeed.y * 0.07),
    cos(uTime * 0.09 + aSeed.z * 6.28) * 0.5
  );
  vec3 rel = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(uCenter + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.012 + aSeed.w * aSeed.w * 0.05;
  vec3 q = abs(rel) / uBox;
  float edge = smoothstep(0.5, 0.38, max(q.x, max(q.y, q.z)));
  float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + aSeed.x * 2.0) + aSeed.y * 20.0);
  vAlpha = edge * twinkle * smoothstep(0.6, 1.8, -mv.z);
  // Motes right in front of the lens would become screen-filling sprites: cap them, and drop invisible ones.
  gl_PointSize = vAlpha < 0.01 ? 0.0 : min(size * projectionMatrix[1][1] * uVH * 0.5 / max(-mv.z, 0.1), uVH * 0.035);
}
`

/* ------------------------------------------------------------------ */
/* Backdrop — a dark sky dome with a tinted horizon glow                */
/* ------------------------------------------------------------------ */

export const backdropVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const backdropFragment = /* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform float uTime;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(vec3(0.014, 0.016, 0.023), vec3(0.002, 0.002, 0.005), smoothstep(-0.25, 0.85, d.y));
  float horizon = exp(-pow((d.y + 0.22) * 2.6, 2.0));
  col += uTint * horizon * 0.022;
  float behind = pow(max(dot(d, normalize(vec3(0.1, -0.06, -1.0))), 0.0), 7.0);
  col += uTint * behind * 0.06;
  // Slow haze so the glow is not a perfect gradient.
  float haze = vnoise(d * 3.0 + vec3(uTime * 0.02, 0.0, uTime * 0.013));
  col *= 0.78 + 0.44 * haze;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`
