import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial, SpotLight } from '@react-three/drei'
import { useStore } from '../store'

/** y of the floor the figures stand on, relative to their station anchor. */
export const FLOOR = -1.72

/** True while `test()` holds; only re-renders React when the answer flips. */
export function useWhen(test: () => boolean) {
  const [on, setOn] = useState(test)
  const last = useRef(on)
  useFrame(() => {
    const now = test()
    if (now !== last.current) {
      last.current = now
      setOn(now)
    }
  })
  return on
}

function radialFade() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, '#fff')
  g.addColorStop(0.22, '#fff')
  g.addColorStop(0.62, '#3a3a3a')
  g.addColorStop(1, '#000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/**
 * A polished dark floor that mirrors whatever stands on it, fading out into the dark at its edge.
 * The reflection is a second render of the scene, so it is only switched on while `active`
 * and is replaced by a plain glossy surface on the Lite tier.
 */
export function Showfloor({ active, radius = 13 }: { active: boolean; radius?: number }) {
  const quality = useStore((s) => s.quality)
  const fade = useMemo(radialFade, [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR - 0.18, 0]} receiveShadow>
      <circleGeometry args={[radius, 80]} />
      {active && quality > 0 ? (
        <MeshReflectorMaterial
          resolution={quality === 2 ? 1024 : 512}
          blur={[340, 110]}
          mixBlur={1}
          mixStrength={7}
          mixContrast={1}
          roughness={0.82}
          depthScale={1}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.3}
          color="#08090c"
          metalness={0.5}
          mirror={0.5}
          transparent
          alphaMap={fade}
        />
      ) : (
        <meshStandardMaterial color="#08090c" roughness={0.6} metalness={0.4} transparent alphaMap={fade} />
      )}
    </mesh>
  )
}

/** A spotlight whose beam is visible in the air, as it would be through haze on a stage. */
export function StageLight({
  position = [1.6, 7.6, 2.4],
  color = '#fff0dc',
  intensity = 90,
}: {
  position?: [number, number, number]
  color?: string
  intensity?: number
}) {
  const target = useMemo(() => new THREE.Object3D(), [])
  return (
    <>
      <primitive object={target} position={[0, FLOOR + 1.3, 0]} />
      <SpotLight
        target={target}
        position={position}
        color={color}
        intensity={intensity}
        angle={0.36}
        penumbra={0.9}
        distance={15}
        decay={1.6}
        attenuation={10.5}
        anglePower={5.5}
        radiusTop={0.12}
        opacity={0.42}
      />
    </>
  )
}
