import { Vector3 } from 'three'

/** World positions of the set pieces. The camera flies between them as the page scrolls. */
export const ANCHOR = {
  hero: new Vector3(-10, -0.3, -2),
  headband: new Vector3(0, 0, 0),
  kunai: new Vector3(18, -2, -3),
  orb: new Vector3(36, 0, 0),
  hat: new Vector3(54, -1, 2),
  /** The Jutsu page's stage, well away from the story so neither is ever in the other's shot. */
  dojo: new Vector3(30, 0, 60),
}

export interface Pose {
  pos: Vector3
  look: Vector3
  /** Lens shift in half-screen units: +x pushes the subject right, +y pushes it up. */
  shift: [number, number]
  /**
   * For a shot made of more than one thing: how far the composition reaches to the left and right of
   * the point the camera looks at (world units, at that point's distance), and the page section whose
   * panel it has to stay clear of. The camera then works out the horizontal shift itself — and steps
   * back if there is not enough room — instead of using `shift[0]`.
   */
  fit?: { span: [number, number]; section: string }
}

const at = (a: Vector3, x: number, y: number, z: number) => new Vector3(x, y, z).add(a)

/** Story pose used for chapters that show a figure: further back, so a standing character fits. */
export const STORY_FIGURE_POSE: Pose = {
  pos: at(ANCHOR.kunai, 0.5, 0.45, 9.0),
  look: at(ANCHOR.kunai, 0, -0.2, 0),
  shift: [0.44, 0],
}

/** One camera pose per page section, in scroll order. */
export const POSES: Pose[] = [
  // Origin — Naruto himself on the crest pedestal
  { pos: at(ANCHOR.hero, 1.0, 0.45, 9.2), look: at(ANCHOR.hero, 0, -0.22, 0), shift: [0.46, 0.02] },
  // Shinobi — macro on the engraved plate
  { pos: at(ANCHOR.headband, -1.25, 0.28, 3.15), look: at(ANCHOR.headband, -0.05, 0, 0.95), shift: [-0.46, 0] },
  // Story — kunai and shuriken
  { pos: at(ANCHOR.kunai, 0.3, 0.2, 5.6), look: at(ANCHOR.kunai, 0, 0, 0), shift: [0.42, 0] },
  // Jutsu — the chakra sphere, with whoever wields it standing behind and to its right
  { pos: at(ANCHOR.orb, 0, 0.35, 8.2), look: at(ANCHOR.orb, 0, 0, 0), shift: [-0.36, 0], fit: { span: [-1.5, 2.15], section: 'jutsu' } },
  // Legacy — the Hokage hat
  { pos: at(ANCHOR.hat, 0.7, 1.15, 6.6), look: at(ANCHOR.hat, 0, -0.35, 0), shift: [0.44, 0.04] },
  // Nindō — pull back and up
  { pos: at(ANCHOR.hat, -1.1, 1.5, 12.2), look: at(ANCHOR.hat, 0, -0.3, 0), shift: [0, 0.54] },
]
