/* ------------------------------------------------------------------ */
/* Character models                                                     */
/* ------------------------------------------------------------------ */

/** Per-model corrections applied to its materials when it loads. */
export interface ModelTune {
  /** Multiplies the base colour: below 1 for a model whose textures are too bright for the stage lights. */
  color?: number
  /** Upper limit on how strongly its emission texture glows. */
  emissive?: number
  /** Materials (by part of their name) to give a polished finish, so thin dark parts still catch the light. */
  polish?: string[]
}

export interface ModelEntry {
  url: string
  title: string
  author: string
  license: string
  source: string
  tune?: ModelTune
}

/** Third-party models in public/models, compressed for the web. Credits are shown in the footer. */
export const MODELS = {
  /** Naruto as he is in Shippuden, rigged — the hero, and the body that performs the base techniques. */
  base: {
    url: '/models/naruto-base.glb',
    title: 'Naruto Free Fire',
    author: 'rocklee.ff123',
    license: 'CC BY 4.0 as uploaded (game asset)',
    source: 'https://sketchfab.com/3d-models/naruto-free-fire-09c365677de84e16aee05b2288af0bd3',
    // Painted for a game that lights nothing: under real lights its skin washes out to white.
    tune: { color: 0.84 },
  },
  /** Sage Mode, rigged. Uploaded under CC BY, but the mesh is extracted from the game Free Fire. */
  sageRig: {
    url: '/models/naruto-sage-rig.glb',
    title: 'naruto mode sabio free fire',
    author: 'rocklee.ff123',
    license: 'CC BY 4.0 as uploaded (game asset)',
    source: 'https://sketchfab.com/3d-models/naruto-mode-sabio-free-fire-7125b6791b434850886d2cf6b4950725',
    tune: { color: 0.84 },
  },
  /** Six Paths Sage Mode, rigged, a staff in each hand. Its own Truth-Seeking Balls are removed: the page animates its own. */
  sixRig: {
    url: '/models/naruto-six-paths-rig.glb',
    title: 'Naruto (Six path) advance colors',
    author: '20062020year',
    license: 'CC BY 4.0',
    source: 'https://sketchfab.com/3d-models/naruto-six-path-advance-colors-0e005e131c644cd7ba9c989ff2ee55e4',
    // Pale yellow all over: at full strength it blows out under the stage lights and the bloom.
    tune: { color: 0.74, emissive: 0.06, polish: ['sphere008'] },
  },
  figure: {
    url: '/models/naruto-figure.glb',
    title: 'Naruto 3D SCAN',
    author: 'YASH PARMAR',
    license: 'CC BY-NC-SA 4.0',
    source: 'https://sketchfab.com/3d-models/naruto-3d-scan-b05f86c38a3c4f00ad55240bcb7a4f2d',
  },
  kurama: {
    url: '/models/kurama.glb',
    title: 'Kurama',
    author: 'Witsanu Superball',
    license: 'CC BY 4.0',
    source: 'https://sketchfab.com/3d-models/kurama-4740ec530150447382648c06ab3bb4b9',
  },
  sage: {
    url: '/models/naruto-sage.glb',
    title: 'Naruto Sage Mode',
    author: 'ItsYaBoi798',
    license: 'CC BY 4.0',
    source: 'https://sketchfab.com/3d-models/naruto-sage-mode-d278dfc8fe7f44c1907c69a44464a71e',
  },
  hokage: {
    url: '/models/naruto-hokage.glb',
    title: 'Naruto',
    author: 'Meta Headz',
    license: 'CC BY-NC 4.0',
    source: 'https://sketchfab.com/3d-models/naruto-35d26667e16144a3aa73f5d2ab096654',
  },
} satisfies Record<string, ModelEntry>

export type ModelKey = keyof typeof MODELS

/** How one model is staged in one place. */
export interface Cast {
  model: ModelKey
  /** World size it is scaled to: its height, or its longest horizontal side when fit is "length". */
  size: number
  fit?: 'height' | 'length'
  /** Part of the name of the animation clip to use. */
  clip?: string
  /** Hold the clip at this time (seconds) instead of playing it. */
  freeze?: number
  speed?: number
  yaw?: number
  /** Stand it on the crest pedestal (default) or leave it free. */
  dais?: boolean
  /** Offset from the default spot, where that does not suit it. */
  at?: [number, number, number]
  /** For rigged models: the pose to hold (a name from the pose library) when nothing else is directing it. */
  pose?: string
  /** For rigged models: the hand that holds whatever is attached to the figure, and how far off the palm it sits. */
  hand?: 'L' | 'R'
  handOffset?: number
  /** Skip shadow casting, for crowds. */
  light?: boolean
}

export interface Era {
  kanji: string
  when: string
  title: string
  text: string
  beats: string[]
  color: string
  /** The figure shown for this chapter; chapters without one show the kunai. */
  cast?: Cast
}

export const ERAS: Era[] = [
  {
    kanji: '封',
    when: 'The night he was born',
    title: 'The Night of the Nine-Tails',
    text:
      'On the tenth of October the Nine-Tailed Fox is torn loose and turned on the Hidden Leaf. The Fourth Hokage, Minato Namikaze, and his wife Kushina Uzumaki give their lives to stop it — sealing the beast inside their newborn son and leaving him the will of the village.',
    beats: ['Born 10 October', 'Kurama sealed within him', 'Orphaned within the hour'],
    color: '#ff4a1c',
    cast: { model: 'kurama', size: 5.0, fit: 'length', clip: 'atstand', yaw: -0.95, dais: false, at: [0.3, 0.85, 0] },
  },
  {
    kanji: '孤',
    when: 'Childhood',
    title: 'The Outcast of the Leaf',
    text:
      'He grows up alone, shunned for a burden nobody will explain to him. So he makes noise instead — pranks, boasts, a promise to become Hokage. After failing graduation three times he masters a forbidden clone technique in a single night, and his teacher Iruka becomes the first person to truly acknowledge him.',
    beats: ['Fails the Academy exam three times', 'Learns the Multi Shadow Clone', 'Receives his forehead protector'],
    color: '#7f9ccc',
  },
  {
    kanji: '絆',
    when: 'Age 12',
    title: 'Team Seven',
    text:
      'Placed with the prodigy Sasuke Uchiha and Sakura Haruno under Kakashi Hatake, he learns that those who abandon their comrades are worse than scum. In the Land of Waves, the deaths of Zabuza and Haku force him to decide what kind of shinobi he will be.',
    beats: ['Passes Kakashi’s bell test', 'Mission to the Land of Waves', 'Chooses his own ninja way'],
    color: '#6fd3c2',
  },
  {
    kanji: '試',
    when: 'Age 12 – 13',
    title: 'Trial by Fire',
    text:
      'The Chūnin Exams put the “dead last” in front of the whole world. He outlasts the Forest of Death, begins training under the Toad Sage Jiraiya, overturns Neji Hyūga’s belief in fate, and stops a rampaging Gaara — a boy carrying the same loneliness he does.',
    beats: ['Summons Gamabunta', 'Defeats Neji in the finals', 'Reaches Gaara during the invasion of Konoha'],
    color: '#e0b56a',
  },
  {
    kanji: '友',
    when: 'Age 13',
    title: 'The Valley of the End',
    text:
      'He learns the Rasengan in a matter of weeks and helps bring Tsunade home as Fifth Hokage. Then Sasuke leaves in search of power. Naruto chases him to the Valley of the End, loses the fight, and refuses to give up the friend — leaving the village to train with Jiraiya for two and a half years.',
    beats: ['Masters the Rasengan', 'Clashes with Sasuke', 'Departs to train with Jiraiya'],
    color: '#5f86ff',
    cast: { model: 'figure', size: 3.1, yaw: -0.3 },
  },
  {
    kanji: '仙',
    when: 'Age 15 – 16',
    title: 'Sage of Mount Myōboku',
    text:
      'Back home, the Akatsuki are hunting hosts like him. He completes the Rasengan with wind chakra, loses Jiraiya, and answers grief by mastering Sage Mode. When Pain levels Konoha, Naruto defeats all six paths — then chooses to talk to the man behind them. The dead are returned, and the outcast is carried home a hero.',
    beats: ['Creates the Rasenshuriken', 'Masters Sage Mode', 'Defeats Pain and saves the village'],
    color: '#ff9a3c',
    cast: { model: 'sage', size: 3.0, clip: 'dynamic', freeze: 0, yaw: -0.2 },
  },
  {
    kanji: '戦',
    when: 'Age 16 – 17',
    title: 'The Fourth Great Ninja War',
    text:
      'He faces his own hatred at the Falls of Truth, meets his mother, and finally earns the Nine-Tails’ name: Kurama. Fighting as partners, they shield an allied army of five nations. Granted the Sage of Six Paths’ power, he and Sasuke seal the goddess Kaguya — then settle everything between them, one last time.',
    beats: ['Befriends Kurama', 'Receives the Six Paths power', 'Seals Kaguya alongside Sasuke'],
    color: '#ffd24a',
    cast: { model: 'sixRig', size: 3.1, yaw: -0.25, pose: 'float' },
  },
  {
    kanji: '火',
    when: 'Adulthood',
    title: 'The Seventh Hokage',
    text:
      'Years of peace follow. He marries Hinata Hyūga, raises Boruto and Himawari, and takes the seat he shouted about as a child. The boy nobody would look at becomes the one the whole village looks to.',
    beats: ['Marries Hinata Hyūga', 'Father of Boruto and Himawari', 'Inaugurated as Seventh Hokage'],
    color: '#ff5a36',
    cast: { model: 'hokage', size: 3.2, yaw: -0.3 },
  },
]

/** Everything the chakra sphere needs to know about how to look. */
export interface OrbLook {
  core: string
  mid: string
  edge: string
  dark: number
  flame: number
  blades: number
  orbs: number
  inward: number
  speed: number
}

export interface Jutsu extends OrbLook {
  id: string
  name: string
  kanji: string
  romaji: string
  rank: string
  kind: string
  text: string
  facts: string[]
  tint: string
  /** Who stands behind the sphere while this technique is selected. */
  cast?: Cast
  /** How far that figure reaches to the right of the sphere's centre (world units): the camera keeps it in shot. */
  reach?: number
}

export const JUTSU: Jutsu[] = [
  {
    id: 'rasengan',
    name: 'Rasengan',
    kanji: '螺旋丸',
    romaji: 'Spiralling Sphere',
    rank: 'A-rank',
    kind: 'Ninjutsu · Shape transformation',
    text:
      'A sphere of chakra spun in countless directions at once and compressed into the palm. It took the Fourth Hokage three years to create; Naruto learned it in weeks — cheating the control problem by using a shadow clone to shape it.',
    facts: ['Needs no hand seals', 'Created by Minato Namikaze', 'Taught to him by Jiraiya'],
    core: '#f2faff',
    mid: '#4aa8ff',
    edge: '#2a6bff',
    tint: '#3f9dff',
    dark: 0,
    flame: 0,
    blades: 0,
    orbs: 0,
    inward: 0,
    speed: 1,
    cast: { model: 'base', size: 3.2, yaw: -0.5, pose: 'hold' },
    reach: 2.1,
  },
  {
    id: 'rasenshuriken',
    name: 'Wind Release: Rasenshuriken',
    kanji: '風遁・螺旋手裏剣',
    romaji: 'Fūton: Rasenshuriken',
    rank: 'S-rank',
    kind: 'Ninjutsu · Nature transformation',
    text:
      'The Rasengan completed. By fusing his wind nature into the sphere he created what its inventor could not: a vortex of microscopic blades that cuts at the cellular level. At first it shredded his own arm — until Sage Mode let him throw it.',
    facts: ['First to add a nature to the Rasengan', 'Strikes countless times in an instant', 'Thrown as a projectile in Sage Mode'],
    core: '#ffffff',
    mid: '#aeeeff',
    edge: '#58cfff',
    tint: '#8fe4ff',
    dark: 0,
    flame: 0,
    blades: 1,
    orbs: 0,
    inward: 0,
    speed: 1.7,
    cast: { model: 'sage', size: 3.2, clip: 'dynamic', freeze: 0, yaw: -0.45 },
    reach: 2.6,
  },
  {
    id: 'bijudama',
    name: 'Tailed Beast Ball',
    kanji: '尾獣玉',
    romaji: 'Bijūdama',
    rank: 'Tailed-beast skill',
    kind: 'Ninjutsu · Chakra compression',
    text:
      'The ultimate technique of the tailed beasts. Positive and negative chakra are gathered and balanced at a ratio of eight to two, then compressed into a dense sphere that can erase a mountain. Naruto wields it once he and Kurama fight as one.',
    facts: ['Balance of positive and negative chakra', 'Mastered with Kurama’s help', 'Basis of his Tailed Beast Rasengan'],
    core: '#12041c',
    mid: '#6a24ff',
    edge: '#ff3d86',
    tint: '#9a3cff',
    dark: 1,
    flame: 0,
    blades: 0,
    orbs: 0,
    inward: 1,
    speed: 0.6,
    cast: { model: 'kurama', size: 4.8, fit: 'length', clip: 'atstand', yaw: -1.15, at: [-1.5, 2.42, 0.7] },
    // His tails trail further than this; they may pass behind the panel, his body may not.
    reach: 2.6,
  },
  {
    id: 'sixpaths',
    name: 'Six Paths Sage Mode',
    kanji: '六道仙人モード',
    romaji: 'Rikudō Sennin Mōdo',
    rank: 'Transcendent',
    kind: 'Senjutsu · Six Paths chakra',
    text:
      'Entrusted to him by Hagoromo, the Sage of Six Paths, and by all nine tailed beasts. Wrapped in golden chakra he can fly, sense what cannot be seen, and command the Truth-Seeking Balls — black orbs that combine every nature at once.',
    facts: ['Chakra of all nine tailed beasts', 'Wields the Truth-Seeking Balls', 'Can restore life force by touch'],
    core: '#fff6da',
    mid: '#ffbe32',
    edge: '#ff7f12',
    tint: '#ffb52e',
    dark: 0,
    flame: 1,
    blades: 0,
    orbs: 1,
    inward: 0,
    speed: 0.85,
    cast: { model: 'sixRig', size: 3.3, yaw: -0.45, pose: 'float' },
    // Wider than he is: the staff in his left hand points out to that side.
    reach: 2.9,
  },
]

/** Most shadow clones the Jutsu page will summon at once. */
export const MAX_CLONES = 8

/** Arrangements the Truth-Seeking Balls cycle through. */
export const FORMATIONS = ['Halo', 'Orbit', 'Shield'] as const

export type DojoMode = 'orb' | 'clones' | 'sage' | 'orbs'

/** Chakra spent on each shadow clone, on reshaping the Truth-Seeking Balls, and on loosing them (fractions of the pool). */
export const CLONE_COST = 0.09
export const FORMATION_COST = 0.03
export const VOLLEY_COST = 0.16

/** The forms he fights in. Each has its own body on the Jutsu page, and its own techniques. */
export const STAGES = [
  { id: 'base', name: 'Shippūden', kanji: '疾風伝', tint: '#3f9dff' },
  { id: 'sage', name: 'Sage Mode', kanji: '仙人', tint: '#ff9a3c' },
  { id: 'kurama', name: 'Nine-Tails', kanji: '九喇嘛', tint: '#9a3cff' },
  { id: 'six', name: 'Six Paths', kanji: '六道', tint: '#ffb52e' },
] as const

export type StageId = (typeof STAGES)[number]['id']

/** One technique on the dedicated Jutsu page. */
export interface DojoJutsu {
  id: string
  /** The form that performs it. */
  stage: StageId
  /** One character and a short name, for the selector. */
  glyph: string
  short: string
  name: string
  kanji: string
  romaji: string
  rank: string
  kind: string
  text: string
  facts: string[]
  tint: string
  /** Which interactive rig drives the stage. */
  mode: DojoMode
  /** The chakra sphere, where the technique has one: its look and its radius once formed. */
  orb?: { look: OrbLook; radius: number }
  /** Label on the main control, the one-line instruction under it, and what it costs. */
  action: string
  hint: string
  cost: string
}

const look = (id: string): OrbLook => JUTSU.find((j) => j.id === id)!

export const DOJO: DojoJutsu[] = [
  {
    id: 'rasengan',
    stage: 'base',
    glyph: '螺',
    short: 'Rasengan',
    name: 'Rasengan',
    kanji: '螺旋丸',
    romaji: 'Spiralling Sphere',
    rank: 'A-rank',
    kind: 'Ninjutsu · Shape transformation',
    text:
      'Chakra spun in every direction at once and held in the palm. No hand seals, no element — only control. He shapes it with his free hand, then runs it into the target: the longer it is built, the deeper it bites.',
    facts: ['Created by Minato Namikaze', 'Taught to him by Jiraiya', 'A close-range strike — he has to carry it in'],
    tint: '#3f9dff',
    mode: 'orb',
    orb: { look: look('rasengan'), radius: 0.2 },
    action: 'Hold to form',
    hint: 'Hold to shape the sphere, let go to run it into the boulder. A full charge shatters it.',
    cost: 'Drains chakra while held',
  },
  {
    id: 'kagebunshin',
    stage: 'base',
    glyph: '影',
    short: 'Shadow Clones',
    name: 'Multi Shadow Clone Technique',
    kanji: '多重影分身の術',
    romaji: 'Tajū Kage Bunshin no Jutsu',
    rank: 'A-rank · Forbidden',
    kind: 'Ninjutsu · Clone technique',
    text:
      'Not illusions — solid bodies, each made from a share of his own chakra. That is the price: every clone is chakra he no longer has, until it disperses. It is also how he first managed the Rasengan: one clone holds out a palm, a second shapes the chakra in it.',
    facts: ['One seal, crossed hands', 'Each clone takes a share of his chakra', 'It takes two of them to form one Rasengan'],
    tint: '#ffb057',
    mode: 'clones',
    action: 'Summon clones',
    hint: 'Each press makes the seal and calls more clones. Release sends them back in smoke.',
    cost: '9% per clone · their Rasengan drains by the pair',
  },
  {
    id: 'sennin',
    stage: 'sage',
    glyph: '仙',
    short: 'Gather',
    name: 'Sage Mode',
    kanji: '仙人モード',
    romaji: 'Sennin Mōdo',
    rank: 'Senjutsu',
    kind: 'Senjutsu · Natural energy',
    text:
      'Stillness is the technique. Hands together, not a muscle moving, he draws in the energy of the world around him and balances it against his own. Hold the balance to the end and everything he does afterwards comes easier.',
    facts: ['Learned at Mount Myōboku from Fukasaku', 'Any movement breaks the gathering', 'Refills his chakra and halves what techniques cost'],
    tint: '#ff9a3c',
    mode: 'sage',
    action: 'Hold to gather nature energy',
    hint: 'Hold until the meter is full, then let go. Letting go early loses the balance.',
    cost: 'Restores chakra · the balance lasts 24 s',
  },
  {
    id: 'rasenshuriken',
    stage: 'sage',
    glyph: '風',
    short: 'Rasenshuriken',
    name: 'Wind Release: Rasenshuriken',
    kanji: '風遁・螺旋手裏剣',
    romaji: 'Fūton: Rasenshuriken',
    rank: 'S-rank',
    kind: 'Ninjutsu · Nature transformation',
    text:
      'The Rasengan completed with his wind nature: a vortex of blades too fine to see. Raised overhead and thrown, it does not hit once — it stays on the target and grinds it down to nothing.',
    facts: ['First nature-fused Rasengan', 'Cuts at the level of the cell', 'Thrown, which only Sage Mode made possible'],
    tint: '#8fe4ff',
    mode: 'orb',
    orb: { look: look('rasenshuriken'), radius: 0.3 },
    action: 'Hold to spin up',
    hint: 'Hold to build it overhead, let go to throw. It costs nearly twice what a Rasengan does.',
    cost: 'Drains chakra fast while held',
  },
  {
    id: 'bijudama',
    stage: 'kurama',
    glyph: '尾',
    short: 'Tailed Beast Ball',
    name: 'Tailed Beast Ball',
    kanji: '尾獣玉',
    romaji: 'Bijūdama',
    rank: 'Tailed-beast skill',
    kind: 'Ninjutsu · Chakra compression',
    text:
      'The tailed beasts’ ultimate attack. Positive and negative chakra are drawn out, balanced at eight to two and crushed into a sphere dense enough to erase a mountain. Kurama forms it at his jaws — and fires.',
    facts: ['Eight parts positive to two parts negative', 'Formed by Kurama himself', 'Nothing it hits is left standing'],
    tint: '#9a3cff',
    mode: 'orb',
    orb: { look: look('bijudama'), radius: 0.6 },
    action: 'Hold to compress',
    hint: 'Hold to draw the chakra in, let go to fire it at the boulder.',
    cost: 'Drains chakra while held',
  },
  {
    id: 'gudodama',
    stage: 'six',
    glyph: '求',
    short: 'Truth-Seeking Balls',
    name: 'Truth-Seeking Balls',
    kanji: '求道玉',
    romaji: 'Gudōdama',
    rank: 'Six Paths',
    kind: 'Senjutsu · Every nature at once',
    text:
      'Nine black orbs made of all five natures and both Yin and Yang, moving at a gesture of his hand. They reshape into whatever he needs — a halo at his back, a guard around him, a wall — and what they touch is not damaged so much as erased.',
    facts: ['Granted with the Six Paths power', 'Erase ninjutsu on contact', 'Reach about seventy metres from him'],
    tint: '#ffb52e',
    mode: 'orbs',
    action: 'Change formation',
    hint: 'Press to send them into a new formation. Launch looses all nine at the boulder, one after another.',
    cost: '3% per formation · 16% to launch',
  },
  {
    id: 'bijurasen',
    stage: 'six',
    glyph: '獣',
    short: 'Bijū Rasenshuriken',
    name: 'Tailed Beast Ball Rasenshuriken',
    kanji: '尾獣玉螺旋手裏剣',
    romaji: 'Bijūdama Rasenshuriken',
    rank: 'Six Paths',
    kind: 'Senjutsu · Tailed-beast chakra',
    text:
      'Everything he has learned in one technique: a Tailed Beast Ball at the centre, the Rasenshuriken’s wind blades around it, powered by senjutsu. He builds it overhead while he hovers, and nothing it lands on is left.',
    facts: ['A Tailed Beast Ball inside a Rasenshuriken', 'Used against Madara and Kaguya', 'The costliest thing on this page'],
    tint: '#ff7a3c',
    mode: 'orb',
    orb: {
      look: { core: '#16041f', mid: '#ff8a2a', edge: '#ffd66a', dark: 1, flame: 0, blades: 1, orbs: 0, inward: 0.6, speed: 1.5 },
      radius: 0.36,
    },
    action: 'Hold to build',
    hint: 'Hold to build it overhead, let go to throw. It drains chakra faster than anything else here.',
    cost: 'Drains chakra very fast while held',
  },
]

export const ARSENAL = [
  { name: 'Shadow Clone Technique', kanji: '影分身の術', note: 'Solid copies that return their experience to him — his signature since day one.' },
  { name: 'Summoning Technique', kanji: '口寄せの術', note: 'A contract with the toads of Mount Myōboku, from Gamakichi to Gamabunta.' },
  { name: 'Sage Mode', kanji: '仙人モード', note: 'Natural energy balanced perfectly with his own — strength, speed and sensing transformed.' },
  { name: 'Kurama Chakra Mode', kanji: '九喇嘛モード', note: 'The Nine-Tails’ power worn as a golden cloak, shared freely with allies.' },
]

export const STATS = [
  { label: 'Ninjutsu', value: 4 },
  { label: 'Taijutsu', value: 3.5 },
  { label: 'Genjutsu', value: 2 },
  { label: 'Intelligence', value: 3 },
  { label: 'Strength', value: 3.5 },
  { label: 'Speed', value: 3.5 },
  { label: 'Stamina', value: 5 },
  { label: 'Hand seals', value: 1.5 },
]

export const PROFILE = [
  { k: 'Born', v: '10 October' },
  { k: 'Village', v: 'Konohagakure — the Hidden Leaf' },
  { k: 'Clan', v: 'Uzumaki' },
  { k: 'Parents', v: 'Minato Namikaze · Kushina Uzumaki' },
  { k: 'Chakra nature', v: 'Wind' },
  { k: 'Tailed beast', v: 'Kurama, the Nine-Tails' },
  { k: 'Teachers', v: 'Iruka · Kakashi · Jiraiya' },
  { k: 'Title', v: 'Seventh Hokage' },
]

export const ACHIEVEMENTS = [
  {
    n: '01',
    title: 'Hero of the Hidden Leaf',
    text: 'Returned as a sage to a village in ruins, defeated all six Paths of Pain, and persuaded Nagato to give back the lives he had taken.',
  },
  {
    n: '02',
    title: 'Completed the Rasengan',
    text: 'Fused nature transformation into the Fourth Hokage’s unfinished technique — something neither its creator nor his own teacher managed.',
  },
  {
    n: '03',
    title: 'Sage of Mount Myōboku',
    text: 'Mastered senjutsu in days, achieving a balance of natural energy cleaner than Jiraiya’s own.',
  },
  {
    n: '04',
    title: 'Partner to the Nine-Tails',
    text: 'Turned a lifetime of mutual hatred into friendship, and learned the name the beast had never been asked for: Kurama.',
  },
  {
    n: '05',
    title: 'Saviour of the Shinobi World',
    text: 'Carried the Allied Shinobi Forces through the Fourth Great Ninja War and, with Sasuke, sealed Kaguya Ōtsutsuki.',
  },
  {
    n: '06',
    title: 'Broke the cycle of hatred',
    text: 'Never abandoned Sasuke Uchiha. After their final battle at the Valley of the End, he brought his friend home.',
  },
  {
    n: '07',
    title: 'Seventh Hokage',
    text: 'Fulfilled the promise he made as a child nobody believed in — and became the shadow that protects the Leaf.',
  },
]

export const SECTIONS = [
  { id: 'origin', label: 'Origin', kanji: '序' },
  { id: 'profile', label: 'Shinobi', kanji: '忍' },
  { id: 'story', label: 'Story', kanji: '道' },
  { id: 'jutsu', label: 'Jutsu', kanji: '術' },
  { id: 'legacy', label: 'Legacy', kanji: '影' },
  { id: 'nindo', label: 'Nindō', kanji: '火' },
]
