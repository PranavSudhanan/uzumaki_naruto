# Naruto Uzumaki — The Seventh Hokage

An interactive, scroll-driven 3D tribute to Naruto Uzumaki: his story, his jutsu and his legacy.
Built with React, Three.js and React Three Fiber. Unofficial fan project.

## What is in it

Two pages share one 3D scene.

**The story** — a scroll-driven journey:

| Section | 3D set piece | Interaction |
| --- | --- | --- |
| Origin | Shippūden Naruto on a crest-engraved pedestal over a mirrored floor, a live Rasengan resting in his right palm, under a visible stage beam | Hold him to charge: his other hand comes over the sphere to shape it, and on release he drives it forward. Drag to turn him |
| Shinobi | Hidden Leaf forehead protector — brushed steel plate with the engraved crest, cloth band — with profile data and ability radar | Drag to turn it |
| Story | Eight chapters, each with its own figure: Kurama, the boy with the Rasengan, the Sage, Six Paths, the Hokage — or kunai and shuriken | Step through chapters (buttons, timeline, ← → keys) — figure and lighting change with each one |
| Jutsu | A raymarched chakra sphere that morphs between four techniques, with the matching form of Naruto (or Kurama) lit by it | Switch technique; press and hold to charge, release for a shockwave; open the Jutsu page |
| Legacy | The Hokage hat and veil; seven achievements | Drag to turn it; expand each achievement |
| Nindō | Closing shot and credits | — |

**The Jutsu page** (`#/jutsu`, or the *Jutsu page* button) — a full-screen training ground with a free camera,
a performer who acts each technique out, and a boulder to use it on. He has four forms, each with its own body
and its own techniques. Changing technique within a form is a change of stance; changing form happens in a
burst of smoke.

| Form | Technique | What happens on stage | Control |
| --- | --- | --- | --- |
| Shippūden | Rasengan | He shapes the sphere with both hands, dashes at the boulder and drives it in — flash, shockwave, debris, scorch; a full charge shatters the rock. Then he hops back | Hold to charge, release to strike |
| Shippūden | Multi Shadow Clone | He crosses his hands in the clone seal and clones appear around him in pairs, in puffs of smoke, up to eight. The clones can use the Rasengan too, but it takes two to make one: one holds out his palm, his partner steps in and shapes it, then the first runs it into the boulder | Press to summon more, *Release* to dismiss; hold the second button for the clones' Rasengan and let go to send them |
| Sage Mode | Sage Mode | He stands still, palms pressed together, while natural energy streams in; a completed balance lights the aura | Hold until full, then let go |
| Sage Mode | Wind Release: Rasenshuriken | He raises the bladed vortex overhead and throws it; it flies to the boulder and grinds it down while he braces | Hold to spin up, release to throw |
| Nine-Tails | Tailed Beast Ball | Kurama compresses the sphere at his jaws and fires it at the boulder | Hold to compress, release to fire |
| Six Paths | Truth-Seeking Balls | He hovers with a black staff in each hand and nine black orbs that re-form at a sweep of his staff, and can be loosed at the boulder one after another when he levels it | Press to cycle Halo / Orbit / Shield; *Launch* to fire them |
| Six Paths | Tailed Beast Ball Rasenshuriken | He puts the right staff away, builds the sphere overhead and throws it, then braces behind both staffs crossed; nothing it lands on is left | Hold to build, release to throw |

Every technique draws on one **chakra pool**, shown above the controls:

- Held techniques drain it while held; clones cost 9% each, a formation change 3%, a volley of Truth-Seeking Balls 16%.
  The clones' Rasengan drains by the pair, so four pairs cost four times what one does.
- It regenerates slowly on its own. Releasing clones returns half of what they cost.
- Completing Sage Mode refills it and, for 24 seconds, halves every cost and more than doubles regeneration.
- Run it to zero and the technique collapses: he doubles over, hands on knees, until he has recovered — and any
  clones vanish, since they are made of the same chakra.

On that page: drag to orbit, scroll to zoom, ← → or 1–7 to switch, space to act, Enter to launch the
Truth-Seeking Balls, hold Enter for the clones' Rasengan, Backspace to release clones, Esc to leave. Sound effects (charge hum, release, clone puffs)
are synthesised in the browser and can be muted from the top bar.

The forehead protector, weapons, hat, chakra effects, boulder, smoke, debris, textures, floor reflections and
lighting are generated in the browser. The character figures are third-party models, credited below.

## Run it

```bash
npm install
npm run dev
```

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

## Deploy to Vercel

Import the repository in Vercel (or run `vercel` in this folder). Vercel detects Vite automatically:

- Build command: `npm run build`
- Output directory: `dist`

No environment variables or server functions are needed — it is a static site.

## Rendering quality

The page picks a tier on load and then adapts render resolution to the measured frame rate.
The pill in the top-right corner switches tier manually.

| Tier | What it adds |
| --- | --- |
| Lite | Bloom, colour grade, film grain, FXAA |
| Balanced (default) | Shadows, mirrored floor, depth of field and lens aberration |
| Cinematic (default on dedicated GPUs) | Ambient occlusion, denser lens kernel, SMAA, more raymarch steps, higher resolution |

Append `?quality=low`, `?quality=medium` or `?quality=high` to the URL to pin a tier and switch off the automatic adjustment.

Visitors whose system asks for reduced motion get no camera shake, pointer parallax or idle camera drift.

## Screen sizes

The page has four layouts, chosen by the stylesheet (`src/styles.css`, "Responsive") and matched by the camera:

| Layout | When | What changes |
| --- | --- | --- |
| Stacked | Phones and tablets held upright; anything under 620px wide | Copy sits under the scene at full width (a centred column on tablets); the camera centres its subject, lifts it and steps back. On the Jutsu page the controls sit under the stage and the camera looks over his shoulder |
| Compact | Phones on their side, small landscape tablets | Two columns with a narrower panel and tighter spacing; on the Jutsu page only the controls stay on screen |
| Regular | Laptops and desktops | Panel on one side, the scene on the other; the top bar drops its link row below 1300px |
| Large | 2200px wide and up | Same layout with the interface drawn 1.25×, 1.6× or 2× larger |

"Stacked" is one media query used in two places — the stylesheet, and `isStacked()` in `src/store.ts`, which the
camera reads every frame. Change one and change the other. Turning a phone or tablet re-frames the Jutsu page.

## Project layout

```
src/
  data/content.ts        All copy: chapters, jutsu, achievements, stats; the model registry; forms and chakra costs
  store.ts               UI state (zustand) + per-frame values shared with the render loop
  audio.ts               Synthesised sound effects (Web Audio, no files)
  App.tsx                Scroll → camera station mapping, page shell
  ui/                    HTML sections, navigation, loader, DojoUI.tsx (the Jutsu page)
  three/
    Experience.tsx       Canvas, lighting, quality tiers, post-processing chain, charge/release driver
    CameraRig.tsx        Scroll-driven camera with lens shift; orbit camera and shake on the Jutsu page
    layout.ts            World anchors and one camera pose per section
    textures.ts          Procedural canvas textures and the crest geometry
    shaders.ts           GLSL: chakra sphere, wind blades, sparks, dust, backdrop
    LensEffect.ts        Custom depth-of-field + aberration pass, film grain / dither
    Headband.tsx  Kunai.tsx  ChakraOrb.tsx  HokageHat.tsx  Atmosphere.tsx
    rig.ts               Pose solver: drives any mapped humanoid skeleton from limb directions and reach points
    poses.ts             The pose library (hold, shape, thrust, seal, cross, throw, guard, spent, float, …)
    Figures.tsx          Character models: loader, auto-fit, material fixes, posing, pedestal, placements
    Dojo.tsx             The Jutsu page: forms, choreography, chakra pool, clones, aura, Truth-Seeking Balls
    DojoFx.tsx           The boulder and what happens to it: blast, debris, smoke
    Stage.tsx            Mirrored floor and the volumetric stage light
```

To change wording, colours per chapter, the jutsu palettes or what each technique costs, edit `src/data/content.ts`.
To reframe a shot, edit the pose for that section in `src/three/layout.ts`. A pose can also carry a `fit`
(how far its composition reaches either side of the point the camera looks at, and which section's panel it
must clear): the camera then places it in the room beside that panel at any window size, stepping back if it
has to. The Jutsu section uses this to keep the sphere and whoever wields it out from behind the text; each
technique's `reach` in `src/data/content.ts` says how wide its figure is.

## Character models

Seven model files live in `public/models/` (about 3 MB in total after compression):

| File | Where it appears | Author, licence |
| --- | --- | --- |
| `naruto-base.glb` | Origin; Jutsu (Rasengan); Jutsu page (Rasengan, Shadow Clone and every clone) — rigged and posed | rocklee.ff123, uploaded as CC BY 4.0 — **see the note below** |
| `naruto-sage-rig.glb` | Jutsu page (Sage Mode, Rasenshuriken) — rigged and posed | rocklee.ff123, uploaded as CC BY 4.0 — **see the note below** |
| `naruto-six-paths-rig.glb` | Story chapter 7; Jutsu (Six Paths); Jutsu page (Truth-Seeking Balls, Tailed Beast Ball Rasenshuriken) — rigged and posed | 20062020year, CC BY 4.0 |
| `kurama.glb` | Story chapter 1; Tailed Beast Ball on both pages | Witsanu Superball, CC BY 4.0 |
| `naruto-figure.glb` | Story chapter 5 (a 3D scan of a real figurine) | YASH PARMAR, CC BY-NC-SA 4.0 |
| `naruto-sage.glb` | Story chapter 6; Jutsu (Rasenshuriken) | ItsYaBoi798, CC BY 4.0 |
| `naruto-hokage.glb` | Story chapter 8 | Meta Headz, CC BY-NC 4.0 |

The same list, with links back to each source, is shown under *Character model credits* in the page footer;
the Creative Commons licences require that attribution to stay.

Three things to know before publishing:

- `naruto-figure.glb` and `naruto-hokage.glb` are **non-commercial** licences. Keep the site non-commercial or
  replace those two.
- `naruto-base.glb` and `naruto-sage-rig.glb` were uploaded to Sketchfab under CC BY, but both are meshes
  taken from the game *Free Fire*. The uploader cannot grant rights to them, so the CC label does not make
  them safe to publish. That is a risk you accept by deploying with them.
- The Six Paths model shipped with its own Truth-Seeking Balls fixed to its skeleton. They have been removed
  from the file: the page animates its own. Its two staffs are kept, and are posed with his hands.

How they are wired:

- `MODELS` in `src/data/content.ts` is the registry (file, title, author, licence, source link, and an optional
  `tune` that darkens or de-glows a model whose textures are too bright for the stage lights).
- A `cast` on a Story chapter or a Jutsu entry says which model appears there and how: target size, animation
  clip, a frozen frame, facing, whether it stands on the pedestal, and — for rigged models — a named pose and
  the hand that holds an effect such as the Rasengan. Chapters without a `cast` show the kunai. The Jutsu
  page's performers are set in `PERFORMER` in `src/three/Dojo.tsx`.
- `src/three/Figures.tsx` does the rest: every model is scaled, centred and stood on the floor automatically;
  unlit or self-illuminated materials are converted so they respond to the scene's lighting and cast shadows;
  walk cycles are held in place; hidden figures are not animated; a model that fails to load is simply skipped.

### Posing

The three rigged models carry no animation clips. They are driven by `src/three/rig.ts`, which takes a pose
written in the character's own space (x to his left, y up, z forward) and solves it onto the skeleton every
frame, with breathing, finger curl, foot grounding and ribbons that hang under gravity.

- Most of a pose is **directions**: body lean, twist and crouch, plus a direction for each upper arm, forearm,
  hand and palm. Because these are directions rather than bone rotations, the same pose works on all three
  skeletons.
- Where hands have to be somewhere exact — pressed together in a seal, hovering over the sphere — an arm is
  given a **reach point** instead (fractions of body height from the midpoint of the shoulders) and the solver
  bends the elbow to get there, so the hands meet whatever the model's proportions.
- A hand that holds something (the Six Paths staffs) is given an **aim** — the direction to point it — and the
  solver turns the fist until it does; `prop: 0` puts the thing away, shrinking it back into the hand.
- Hands are **seated** when a model loads. On the two Free Fire models the hand mesh sits a centimetre or two
  off its own bones, so a closing finger would slide into the palm instead of bending at the knuckle. The
  solver finds where the mesh really bends (the vertices two neighbouring bones share), moves the hand's
  bones there and re-binds the skin; a model whose hands already fit is left alone. `curl` then runs from a
  flat hand (0) to a fist with the thumb folded across it (1).
- `src/three/poses.ts` is the pose library. Add or adjust a pose there.
- `RIGS` in `rig.ts` maps each model's bone names. To pose another humanoid model, add its map.
- A *direct* function (`baseDirect`, `sageDirect`, `sixDirect` in `Dojo.tsx`, `rasenganDirect` in
  `Figures.tsx`) returns the pose for the current moment, blending between library poses as a technique
  builds, lands and winds down.

To swap or add a model, compress it first so the page stays light (add `metalrough` first if it uses the
older specular-glossiness materials):


```bash
npx @gltf-transform/cli optimize input.glb public/models/output.glb --texture-compress webp --texture-size 2048
```

Then add it to `MODELS` and reference it from a `cast`. These are anime-style models; a photoreal
interpretation of the character would have to be commissioned or bought.

## Credits

Naruto and all related characters and marks belong to Masashi Kishimoto, Shueisha, TV Tokyo and Pierrot.
This project is a non-commercial fan tribute and is not affiliated with or endorsed by them.
