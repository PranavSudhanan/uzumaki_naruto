import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { ANCHOR } from './layout'
import { FLOOR } from './Stage'
import { makeSteelTextures } from './textures'

/*
 * Physical consequences for the Jutsu page: smoke, flying rock, a blast, and the boulder that takes
 * the hits. Each is a small pooled system with an imperative handle (`smoke.emit`, `debris.burst`,
 * `blast.fire`, `boulder.hit`) so the choreography can trigger them from anywhere.
 * Positions are in the stage's own space unless noted.
 */

/** Floor level of the stage, in stage space. */
export const GROUND = FLOOR - 0.18

/* ------------------------------------------------------------------ */
/* Smoke                                                                */
/* ------------------------------------------------------------------ */

const PUFFS = 320

export const smoke = {
  start: new Float32Array(PUFFS * 3),
  vel: new Float32Array(PUFFS * 3),
  birth: new Float32Array(PUFFS).fill(-100),
  size: new Float32Array(PUFFS),
  cursor: 0,
  now: 0,
  dirty: false,
  /** A burst of puffs at a point on the stage. `rise` stretches the column upward (for a body-sized poof). */
  emit(x: number, y: number, z: number, count = 14, spread = 0.5, rise = 2.6, size = 1) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % PUFFS
      const a = Math.random() * Math.PI * 2
      this.start[i * 3] = ANCHOR.dojo.x + x + Math.cos(a) * spread * 0.4 * Math.random()
      this.start[i * 3 + 1] = ANCHOR.dojo.y + y + Math.random() * rise
      this.start[i * 3 + 2] = ANCHOR.dojo.z + z + Math.sin(a) * spread * 0.4 * Math.random()
      this.vel[i * 3] = Math.cos(a) * (0.6 + Math.random() * 1.6) * spread
      this.vel[i * 3 + 1] = (Math.random() - 0.2) * 1.2
      this.vel[i * 3 + 2] = Math.sin(a) * (0.6 + Math.random() * 1.6) * spread
      this.birth[i] = this.now + Math.random() * 0.08
      this.size[i] = (0.9 + Math.random() * 1.3) * size
    }
    this.dirty = true
  },
}

const smokeVertex = /* glsl */ `
uniform float uTime;
uniform float uVH;
attribute vec3 aStart;
attribute vec3 aVel;
attribute float aBirth;
attribute float aSize;
varying float vAlpha;
varying float vSeed;
void main() {
  float age = uTime - aBirth;
  float t = clamp(age / 1.25, 0.0, 1.0);
  vec3 p = aStart + aVel * (1.0 - exp(-age * 2.6)) * 0.6 + vec3(0.0, 0.4 * age, 0.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float alive = step(0.0, age) * step(age, 1.25);
  gl_PointSize = alive * aSize * (0.45 + 1.5 * t) * projectionMatrix[1][1] * uVH * 0.5 / max(-mv.z, 0.1);
  vAlpha = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.07, t);
  vSeed = aBirth * 7.13 + aSize * 3.7;
}
`

const smokeFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vAlpha;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float puff = vn(q * 5.0 + vSeed) * 0.6 + vn(q * 11.0 - vSeed) * 0.4;
  float a = smoothstep(0.5, 0.12, d + (puff - 0.5) * 0.22);
  // Lighter on top, as if lit from above.
  vec3 col = uColor * (0.7 + 0.5 * (0.5 - q.y)) * (0.8 + 0.4 * puff);
  gl_FragColor = vec4(col, a * vAlpha * 0.75);
}
`

export function Smoke() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFFS * 3), 3))
    g.setAttribute('aStart', new THREE.BufferAttribute(smoke.start, 3))
    g.setAttribute('aVel', new THREE.BufferAttribute(smoke.vel, 3))
    g.setAttribute('aBirth', new THREE.BufferAttribute(smoke.birth, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(smoke.size, 1))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: smokeVertex,
        fragmentShader: smokeFragment,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uVH: { value: 800 }, uColor: { value: new THREE.Color('#d9dde6') } },
      }),
    [],
  )
  useFrame((state) => {
    smoke.now = state.clock.elapsedTime
    mat.uniforms.uTime.value = smoke.now
    mat.uniforms.uVH.value = state.size.height * state.viewport.dpr
    if (smoke.dirty) {
      smoke.dirty = false
      for (const name of ['aStart', 'aVel', 'aBirth', 'aSize']) (geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true
    }
  })
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={8} />
}

/* ------------------------------------------------------------------ */
/* Debris                                                               */
/* ------------------------------------------------------------------ */

const CHUNKS = 110

export const debris = {
  pos: new Float32Array(CHUNKS * 3),
  vel: new Float32Array(CHUNKS * 3),
  spin: new Float32Array(CHUNKS * 3),
  rot: new Float32Array(CHUNKS * 3),
  size: new Float32Array(CHUNKS),
  life: new Float32Array(CHUNKS),
  cursor: 0,
  /** Throws rock chunks out from a point. `away` biases them along a direction (the blow's follow-through). */
  burst(x: number, y: number, z: number, count: number, power: number, away: [number, number] = [0, 0]) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % CHUNKS
      const a = Math.random() * Math.PI * 2
      const up = 0.3 + Math.random() * 0.9
      const speed = (2 + Math.random() * 6) * (0.5 + power)
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.9
      this.pos[i * 3 + 1] = y + (Math.random() - 0.3) * 0.9
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.9
      this.vel[i * 3] = Math.cos(a) * speed * 0.6 + away[0] * speed * 0.7
      this.vel[i * 3 + 1] = up * speed * 0.75
      this.vel[i * 3 + 2] = Math.sin(a) * speed * 0.6 + away[1] * speed * 0.7
      for (let k = 0; k < 3; k++) {
        this.spin[i * 3 + k] = (Math.random() - 0.5) * 14
        this.rot[i * 3 + k] = Math.random() * 6
      }
      this.size[i] = 0.06 + Math.random() * Math.random() * 0.3
      this.life[i] = 2.2 + Math.random() * 1.6
    }
  },
}

export function Debris() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const rock = useMemo(() => makeSteelTextures(47, true), [])
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 0)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + Math.random() * 0.6), p.getY(i) * (0.5 + Math.random() * 0.6), p.getZ(i) * (0.7 + Math.random() * 0.6))
    g.computeVertexNormals()
    return g
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const d = debris
    for (let i = 0; i < CHUNKS; i++) {
      const j = i * 3
      if (d.life[i] > 0) {
        d.life[i] -= dt
        d.vel[j + 1] -= 13 * dt
        d.pos[j] += d.vel[j] * dt
        d.pos[j + 1] += d.vel[j + 1] * dt
        d.pos[j + 2] += d.vel[j + 2] * dt
        const floor = GROUND + d.size[i] * 0.5
        if (d.pos[j + 1] < floor) {
          // Bounce, lose energy, and stop tumbling once it has settled.
          d.pos[j + 1] = floor
          d.vel[j + 1] *= -0.32
          d.vel[j] *= 0.6
          d.vel[j + 2] *= 0.6
          for (let k = 0; k < 3; k++) d.spin[j + k] *= 0.5
        }
        for (let k = 0; k < 3; k++) d.rot[j + k] += d.spin[j + k] * dt
      }
      const s = d.life[i] > 0 ? d.size[i] * Math.min(1, d.life[i] * 2.5) : 0
      dummy.position.set(d.pos[j], d.pos[j + 1], d.pos[j + 2])
      dummy.rotation.set(d.rot[j], d.rot[j + 1], d.rot[j + 2])
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[geo, undefined, CHUNKS]} frustumCulled={false} castShadow>
      <meshStandardMaterial color="#63666c" roughness={1} roughnessMap={rock.roughnessMap} normalMap={rock.normalMap} flatShading />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Blast                                                                */
/* ------------------------------------------------------------------ */

export const blast = {
  x: 0,
  y: 0,
  z: 0,
  size: 1,
  t: 9,
  color: new THREE.Color('#ffffff'),
  /** A flash of light at a point, with a shockwave racing out across the floor. */
  fire(x: number, y: number, z: number, size: number, color: THREE.ColorRepresentation) {
    this.x = x
    this.y = y
    this.z = z
    this.size = size
    this.t = 0
    this.color.set(color)
  },
}

export function Blast() {
  const flash = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const flashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  )
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
    [],
  )

  useFrame((_, rawDt) => {
    const b = blast
    b.t += Math.min(rawDt, 0.05)
    const life = 0.5 + b.size * 0.16
    const k = Math.min(1, b.t / life)
    if (k >= 1) {
      // Left in the scene at zero opacity, so the first impact never waits on a shader compile.
      flashMat.opacity = 0
      ringMat.opacity = 0
      flash.current.scale.setScalar(0.001)
      ring.current.scale.setScalar(0.001)
      light.current.intensity = 0
      return
    }
    const out = 1 - Math.pow(1 - k, 3)
    flash.current.position.set(b.x, b.y, b.z)
    flash.current.scale.setScalar(b.size * (0.25 + out * 1.1))
    flashMat.color.copy(b.color).multiplyScalar(3.2)
    flashMat.opacity = Math.pow(1 - k, 2.2)
    ring.current.position.set(b.x, GROUND + 0.03, b.z)
    ring.current.scale.setScalar(b.size * (0.4 + out * 4.2))
    ringMat.color.copy(b.color).multiplyScalar(2.2)
    ringMat.opacity = Math.pow(1 - k, 1.6) * 0.85
    light.current.position.set(b.x, b.y + 0.5, b.z)
    light.current.color.copy(b.color)
    light.current.intensity = (1 - k) * 90 * b.size
  })

  return (
    <>
      <mesh ref={flash} material={flashMat} renderOrder={9} scale={0.001}>
        <sphereGeometry args={[1, 32, 20]} />
      </mesh>
      <mesh ref={ring} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9} scale={0.001}>
        <ringGeometry args={[0.86, 1, 96]} />
      </mesh>
      <pointLight ref={light} distance={26} decay={2} intensity={0} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* The boulder                                                          */
/* ------------------------------------------------------------------ */

/** Where the target stands, and how big it is. */
export const TARGET = { x: 3.3, z: -0.35, radius: 1.2 }

export const boulder = {
  /** 1 = untouched, 0 = destroyed. */
  hp: 1,
  /** Seconds until a fresh boulder is rolled in. */
  respawn: 0,
  wobble: 0,
  grown: 1,
  /** Centre of the rock, in stage space. */
  get y() {
    return GROUND + TARGET.radius * 0.82
  },
  /** One blow. Returns true if it finished the rock off. */
  hit(damage: number, away: [number, number]) {
    if (this.hp <= 0) return false
    this.hp = Math.max(0, this.hp - damage)
    this.wobble = 1
    const dead = this.hp <= 0.02
    debris.burst(TARGET.x - away[0] * 0.8, this.y, TARGET.z - away[1] * 0.8, dead ? 70 : Math.round(10 + damage * 34), 0.4 + damage, away)
    smoke.emit(TARGET.x, GROUND, TARGET.z, dead ? 34 : 12, dead ? 1.5 : 0.9, 2, dead ? 1.6 : 1.1)
    if (dead) this.shatter()
    return dead
  },
  /** Sustained grinding, for a technique that stays on the target. */
  grind(amount: number) {
    if (this.hp <= 0) return
    this.hp = Math.max(0, this.hp - amount)
    this.wobble = Math.max(this.wobble, 0.5)
    if (Math.random() < 0.6) debris.burst(TARGET.x, this.y, TARGET.z, 3, 0.9, [(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6])
    if (Math.random() < 0.25) smoke.emit(TARGET.x, GROUND, TARGET.z, 3, 1.3, 2.4, 1.2)
    if (this.hp <= 0.02) this.shatter()
  },
  shatter() {
    this.hp = 0
    this.respawn = 3.2
  },
}

export function Boulder() {
  const mesh = useRef<THREE.Mesh>(null!)
  const rock = useMemo(() => makeSteelTextures(53, true), [])
  const geo = useMemo(() => {
    // A cube pushed out to a sphere gives even faces with tidy UVs for the rock texture.
    const g = new THREE.BoxGeometry(1, 1, 1, 28, 28, 28)
    const p = g.attributes.position as THREE.BufferAttribute
    const nor = g.attributes.normal as THREE.BufferAttribute
    const flatA = new THREE.Vector3(0.5, 0.6, 0.62).normalize()
    const flatB = new THREE.Vector3(-0.7, 0.3, -0.64).normalize()
    /** The boulder's surface along direction `n`: broad lumps and a couple of worn planes, squat like a river stone. */
    const surface = (n: THREE.Vector3, out: THREE.Vector3) => {
      const lumps = 0.13 * Math.sin(n.x * 3.1 + n.y * 1.7 + 0.4) * Math.cos(n.z * 2.9 - n.y) + 0.07 * Math.sin(n.y * 5.3 + n.z * 4.1) * Math.cos(n.x * 4.7)
      const worn = -0.1 * Math.pow(Math.max(0, n.dot(flatA)), 6) - 0.08 * Math.pow(Math.max(0, n.dot(flatB)), 8)
      const k = TARGET.radius * (1 + lumps + worn)
      return out.set(n.x * k, n.y * k * 0.84, n.z * k * 0.94)
    }
    const n = new THREE.Vector3()
    const t1 = new THREE.Vector3()
    const t2 = new THREE.Vector3()
    const p0 = new THREE.Vector3()
    const p1 = new THREE.Vector3()
    const p2 = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(p, i).normalize()
      surface(n, p0)
      p.setXYZ(i, p0.x, p0.y, p0.z)
      // Normals from the surface itself rather than from the triangles, so the cube's edges leave no seams.
      t1.crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
      t2.crossVectors(n, t1)
      surface(t1.multiplyScalar(0.02).add(n).normalize(), p1)
      surface(t2.multiplyScalar(0.02).add(n).normalize(), p2)
      p1.sub(p0).cross(p2.sub(p0)).normalize()
      if (p1.dot(n) < 0) p1.negate()
      nor.setXYZ(i, p1.x, p1.y, p1.z)
    }
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#565960',
        roughness: 1,
        roughnessMap: rock.roughnessMap,
        normalMap: rock.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        metalness: 0.02,
      }),
    [rock],
  )
  const fresh = useMemo(() => new THREE.Color('#565960'), [])
  const scorched = useMemo(() => new THREE.Color('#2b2c30'), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const b = boulder
    if (b.hp <= 0) {
      b.respawn -= dt
      b.grown = Math.max(0, b.grown - dt * 9)
      if (b.respawn <= 0) {
        // A new one is rolled in under cover of dust.
        b.hp = 1
        smoke.emit(TARGET.x, GROUND, TARGET.z, 22, 1.2, 2, 1.4)
      }
    } else b.grown = Math.min(1, b.grown + dt * 2.6)
    b.wobble = Math.max(0, b.wobble - dt * 2.2)

    const m = mesh.current
    m.visible = b.grown > 0.01
    const t = state.clock.elapsedTime
    const w = b.wobble * b.wobble
    // A damaged rock is smaller, darker and sits askew.
    const hurt = 1 - b.hp
    m.scale.setScalar(b.grown * (1 - hurt * 0.22))
    m.position.set(TARGET.x + Math.sin(t * 61) * w * 0.07, b.y - hurt * 0.2 + Math.sin(t * 47) * w * 0.04, TARGET.z + Math.cos(t * 53) * w * 0.07)
    m.rotation.set(hurt * 0.35 + Math.sin(t * 40) * w * 0.05, 0.6 + hurt * 0.5, hurt * -0.28)
    mat.color.copy(fresh).lerp(scorched, hurt * 0.75)
  })

  return <mesh ref={mesh} geometry={geo} material={mat} castShadow receiveShadow />
}
