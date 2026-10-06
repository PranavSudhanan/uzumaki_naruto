import { useMemo } from 'react'
import { emblemSvgPaths } from '../three/textures'

/** The Hidden Leaf crest as an inline SVG, drawn from the same geometry engraved on the 3D plate. */
export function Emblem({ className, animate = false }: { className?: string; animate?: boolean }) {
  const paths = useMemo(emblemSvgPaths, [])
  return (
    <svg className={className} viewBox="-1.85 -1.25 2.7 2.3" fill="none" aria-hidden="true">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          stroke="currentColor"
          strokeWidth={0.1}
          strokeLinecap="round"
          strokeLinejoin="miter"
          strokeMiterlimit={10}
          className={animate ? 'draw' : undefined}
          style={animate ? { animationDelay: `${i * 0.35}s` } : undefined}
        />
      ))}
    </svg>
  )
}
