// v68 gameplay modules (self-contained IIFEs), evaluated together in one scope so they see each other
// exactly as in the assembled page. Their ports replace them one system at a time.

import { cleanHair, drawHair } from '../../core/character/hair';
import type { LegacyPiece } from '../../core/legacy/types';
import characterArt from '../../legacy/character-art.js?raw';
import characterCatalog from '../../legacy/character-catalog.js?raw';
import characterModel from '../../legacy/character-model.js?raw';
import gameMagic from '../../legacy/game-magic.js?raw';
import gamePhysics from '../../legacy/game-physics.js?raw';
import gameWeapons from '../../legacy/game-weapons.js?raw';
import npcWorld from '../../legacy/npc-world.js?raw';
import rigCollision from '../../legacy/rig-collision.js?raw';
import studioAnimations from '../../legacy/studio-animations.js?raw';
import studioMotion from '../../legacy/studio-motion.js?raw';
import superPowers from '../../legacy/super-powers.js?raw';
import volcanoSimulation from '../../legacy/volcano-simulation.js?raw';
import worldGenerator from '../../legacy/world-generator.js?raw';
import worldSky from '../../legacy/world-sky.js?raw';

export type Bounds = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
export type HeroState = Record<string, unknown> & {
  x: number;
  y: number;
  z: number;
  vy: number;
  heading: number;
  grounded: boolean;
  speed: number;
  running: boolean;
  attack: number;
  attackDuration?: number;
  attackWeapon?: string;
  building: boolean;
};
export type MoveInput = {
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
  vertical: number;
  speedScale?: number;
  jumpSpeed?: number;
  flight?: boolean;
  climbing?: boolean;
};
export type LegacyWorldMeta = {
  config: Record<string, unknown>;
  layoutVersion?: number;
  width?: number;
  depth?: number;
} | null;

export interface Controller {
  state: HeroState;
  pieces: LegacyPiece[];
  /** where the controller lets characters go (P27 part 3: a big map's window keeps the whole map's) */
  area?: unknown;
  spawnPoint?: { x: number; y: number; z: number };
  replace(pieces: LegacyPiece[], world?: LegacyWorldMeta): void;
  repairPosition(): void;
  setActors(states: HeroState[]): void;
  clear(x: number, y: number, z: number): boolean;
  contains?(x: number, z: number): boolean;
  floor(x: number, z: number, ceiling?: number): number | null;
  spawn(): HeroState;
  step(input: MoveInput, dt: number, yaw: number): void;
  target(reach?: number): (LegacyPiece & { id: number }) | null;
  sceneryContacts(x: number, y: number, z: number): unknown[];
}

export type Npc = {
  id: number;
  biome: string;
  role: string;
  profile: Record<string, unknown> & { name: string };
  controller: Controller;
  state: HeroState;
};
export type Debris = {
  entryId: number;
  /** P27 part 3d: rubble: stays on the ground for good */
  keep?: boolean;
  x: number;
  y: number;
  z: number;
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  color: number[];
  scale: number;
  age: number;
  sleeping?: boolean;
};

export interface LegacyRuntime {
  GamePhysics: {
    Controller: new (pieces: LegacyPiece[], world?: LegacyWorldMeta) => Controller;
    bounds(p: LegacyPiece): Bounds;
    scaleOf(s: HeroState): number;
    /** v68: a point kept inside an area (margin r from its edges) */
    containPoint(area: unknown, x: number, z: number, r?: number): { x: number; z: number };
    characterMargin: number;
    overlapsPlayer(p: LegacyPiece, s: HeroState): boolean;
    rebuildTraps(c: Controller, originals: LegacyPiece[], x: number, z: number, y: number): boolean;
    cameraDistance(target: number[], eye: number[], pieces: LegacyPiece[]): number;
    worldBounds(pieces: LegacyPiece[], world?: LegacyWorldMeta): unknown;
    confineDebris(d: Debris, c: Controller): void;
    stepDebrisPiece(d: Debris, dt: number, c: Controller): void;
  };
  CharacterCatalog: {
    defaults: Record<string, unknown>;
    choices: Record<string, string[]>;
    colorFields: string[];
    rangeFields: Record<string, { max: number }>;
    /** v68 part paint: the parts that can be drawn on (id → label), and the check of a profile's drawings */
    paintParts: Record<string, string>;
    validatePaint(paint: Record<string, string>): Record<string, string>;
    presets: Record<string, Record<string, unknown>>;
    preset(name: string): Record<string, unknown>;
    validate(p: Record<string, unknown>): Record<string, unknown>;
    heightScale(p: Record<string, unknown>): number;
  };
  /** v68's “Bring your look”: colours read from a photo by part, and a picture turned into a print */
  CharacterArt: {
    regions: Record<string, [number, number, number, number]>;
    analyze(
      pixels: Uint8ClampedArray,
      width: number,
      height: number,
      crop: { x: number; y: number; w: number; h: number },
    ): { palette: Record<string, string>; rects: Record<string, { x: number; y: number; w: number; h: number }> };
    stylize(pixels: Uint8ClampedArray, steps?: number): Uint8ClampedArray;
  };
  CharacterModel: {
    create(gl: WebGLRenderingContext, fragment: string, onDirty?: () => void): CharacterRenderer;
    /** v68 rig: each joint's world matrix for a pose state (16 numbers, column-major) */
    jointPose(
      state: Record<string, unknown>,
      neutral: boolean,
      profile: Record<string, unknown>,
    ): Record<string, Float32Array>;
    /** v68 column-major 4×4: translate to (x, y, z), then turn by yaw (heading), pitch, roll */
    matrix(x: number, y: number, z: number, yaw?: number, pitch?: number, roll?: number): Float32Array;
    mul(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array;
    /** a joint matrix scaled to the character's size */
    scaledMatrix(m: Float32Array, state: Record<string, unknown>, profile: Record<string, unknown>): Float32Array;
    transform(m: ArrayLike<number>, p: number[]): number[];
    /** each joint's rest position */
    pivots: Record<string, number[]>;
    /** the hand's grip point from the elbow, for a side (-1 left, 1 right) */
    handGrip(side: number): number[];
  };
  GameWeapons: {
    get(name: unknown): {
      style?: string;
      action: string;
      duration: number;
      contact: number;
      reach: number;
      impulse?: number;
      mass?: number;
      frames?: unknown;
    };
    catalog: Record<string, unknown>;
  };
  NPCWorld: {
    populate(pieces: LegacyPiece[], world: LegacyWorldMeta, hero: HeroState): Npc[];
    restore(saved: unknown, pieces: LegacyPiece[], world: LegacyWorldMeta): Npc[];
    sync(npcs: Npc[], pieces: LegacyPiece[], world: LegacyWorldMeta): void;
    connect(npcs: Npc[], c: Controller): void;
    step(npcs: Npc[], dt: number, hero: HeroState, talkingId: number | null): void;
    nearest(npcs: Npc[], hero: HeroState, range?: number): Npc | null;
    serialize(npcs: Npc[]): unknown;
    reply(npc: Npc, text: string, world: LegacyWorldMeta, env: unknown, broken: number): { text?: string } | string;
  };
  WorldGenerator: { isRoadMark(p: LegacyPiece, config: unknown, layout?: number): boolean };
  StudioAnimations: {
    sample(
      id: string,
      time: number,
      base: Record<string, unknown>,
    ): { state: HeroState; profile: Record<string, unknown> };
  };
  SkyCycle: {
    sample(
      time: string,
      elapsed: number,
      rain: boolean,
      snowing: boolean,
    ): import('../../core/legacy/modules').SkySample;
    duration: number;
  };
}

export interface CharacterRenderer {
  begin(mvp: Float32Array, eye: number[], light: unknown): void;
  draw(profile: Record<string, unknown>, state: HeroState, preview?: boolean, animated?: boolean): void;
  debris(mesh: { p: WebGLBuffer; n: WebGLBuffer; count: number }, d: Debris): void;
  bindCollision(profile: Record<string, unknown>, c: Controller): void;
  /** v68 paint: a part's own look as a 384×256 atlas (six 128-pixel sides) to draw over */
  appearanceAtlas(
    profile: Record<string, unknown>,
    part: string,
  ): { width: number; height: number; data: Uint8ClampedArray };
  /** v68 paint: show a drawing on a part as it is drawn (null: stop) */
  setLivePaint(part: string | null, canvas?: HTMLCanvasElement | null): void;
  /** v68 paint: the texture for a saved drawing, from the canvas it was drawn on */
  cachePaint(data: string, canvas: HTMLCanvasElement): void;
}

/** step 12b: how far a stick reaches past the hand (see withStick) */
export const STICK_LENGTH = 1.55;
/** step 12b: how far the longer forearm moves the hand down in the model: v68's stretchArmY(1.94) - 1.94 */
export const HAND_DROP = 2.88 - 0.33 * 2.0 - 0.61 * 1.55 - 1.94;

const ORDER = [
  worldGenerator,
  volcanoSimulation,
  worldSky,
  gameMagic,
  superPowers,
  gameWeapons,
  studioMotion,
  studioAnimations,
  withCustomHairChoice(characterCatalog),
  rigCollision,
  withRoomToWalk(gamePhysics),
  withCustomHair(withOutwardPaint(withTalkingMouth(withStick(withOffHand(characterModel))))),
  characterArt,
  npcWorld,
];

/**
 * P9b: an item in the off hand (a shield), strapped to the outside of the left forearm. v68's model only has a
 * right-hand item; the new engine adds this to its own copy at load time, so v68's files (and Play in v68)
 * stay exactly as they were.
 */
function withOffHand(src: string): string {
  const at = "paintSlot='held';if(p.held!=='None'){";
  if (!src.includes(at)) throw new Error('character model: the held-item block moved; update withOffHand');
  const shield =
    "if(p.offHand==='Shield'){paintSlot='offhand';part('leftForearm',access);const sx=-1.27,sy=1.98,sz=.34;" +
    "box(sx,sy,sz,.14,1.05,.80);part('leftForearm',accent);box(sx-.075,sy,sz,.01,.66,.09);" +
    'box(sx-.075,sy+.08,sz,.01,.09,.50);}';
  return src.replace(at, shield + at);
}

/**
 * Step 12b: a stick (a branch picked up) in the right hand (12c-2: or the Gust leaf), in place of the held item: the hero swings it as its
 * sword (v68's sword swing, from `held: 'Sword'`) while `heldLook` draws a plain wooden stick (alight: its end
 * charred, the flame itself is a fire effect at the tip).
 */
function withStick(src: string): string {
  const at = "paintSlot='held';if(p.held!=='None'){part('rightArm',access);";
  if (!src.includes(at)) throw new Error('character model: the held-item block moved; update withStick');
  // built at the hand like every held item (the hand grips its end; the longer forearm moves both down together)
  const y = '1.94';
  const at1 = (d: number) => `y+${(d).toFixed(3)}`;
  const stick =
    `paintSlot='held';if(p.heldLook==='Stick'||p.heldLook==='Lit stick'){const x=1.10,y=${y},z=.34;` +
    `part('rightArm','#7a4b26');limb([x,${at1(-0.22)},z],[x,${at1(STICK_LENGTH)},z],.075,.06);` +
    `part('rightArm','#5b3519');box(x+.06,${at1(0.62)},z,.05,.16,.05);box(x-.05,${at1(1.05)},z,.05,.12,.05);` +
    `if(p.heldLook==='Lit stick'){part('rightArm','#2a1a10');limb([x,${at1(STICK_LENGTH - 0.3)},z],[x,${at1(STICK_LENGTH + 0.02)},z],.07,.066);}` +
    // step 12c-2: the Gust leaf: a short stem in the fist and a broad leaf on it, its midrib darker
    // its broad face to the front (it pushes the air ahead in a swing), so it shows from in front and behind; a
    // little shorter than a sword, held by its stem, so carried at the side its tip is level with the shoulder
    `}else if(p.heldLook==='Leaf'){const x=1.10,y=${y},z=.34;` +
    `part('rightArm','#5a7a2a');limb([x,${at1(-0.2)},z],[x,${at1(0.55)},z],.06,.05);` +
    `part('rightArm','#4f9a3a');box(x,${at1(1.15)},z,.8,1.0,.09);box(x,${at1(0.62)},z,.42,.2,.09);` +
    `part('rightArm','#5fae45');box(x,${at1(1.78)},z,.5,.36,.09);box(x,${at1(2.02)},z,.22,.2,.09);` +
    `part('rightArm','#2f6b25');box(x,${at1(1.25)},z,.08,1.5,.16);box(x-.2,${at1(1.25)},z,.04,.6,.12);box(x+.2,${at1(1.25)},z,.04,.6,.12);` +
    // step 13a: the bow or the slingshot in the LEFT hand. Carried (no draw), its limbs run along the arm (upright at
    // the side); drawn, across it (upright when the arm points ahead), the string pulled back towards the chin by the
    // draw (heldDraw 0..5) with an arrow nocked (its head the colour of its element: heldArrow)
    // (in the off hand's slot, on the left forearm as the shield is: the held slot follows the right hand)
    `}else if(p.heldLook==='Bow'||p.heldLook==='Sling'){paintSlot='offhand';const x=-1.16,y=1.94,z=.34,d=p.heldDraw==null?-1:p.heldDraw/5,` +
    'A=d<0?[0,1,0]:[1,0,0],F=d<0?[0,0,1]:[0,-1,0],W=d<0?[1,0,0]:[0,0,1],Q=(a,f,s)=>{s=s||0;return[x+A[0]*a+F[0]*f+W[0]*s,y+A[1]*a+F[1]*f+W[1]*s,z+A[2]*a+F[2]*f+W[2]*s]},dd=Math.max(0,d);' +
    "if(p.heldLook==='Bow'){part('leftForearm','#8a5a2b');" +
    'limb(Q(.16,.03),Q(.55,.12),.075,.065);limb(Q(.55,.12),Q(.98,.06),.065,.05);limb(Q(.98,.06),Q(1.18,-.06),.05,.04);' +
    'limb(Q(-.16,.03),Q(-.55,.12),.075,.065);limb(Q(-.55,.12),Q(-.98,.06),.065,.05);limb(Q(-.98,.06),Q(-1.18,-.06),.05,.04);' +
    "part('leftForearm','#3b2416');limb(Q(-.2,.03),Q(.2,.03),.095,.095);" +
    "const T1=Q(1.18,-.06),T2=Q(-1.18,-.06),N=Q(0,-.06-1.7*dd,.18*dd);part('leftForearm','#efe6cc');" +
    'if(d<0)limb(T1,T2,.02,.02);else{limb(T1,N,.02,.02);limb(N,T2,.02,.02);' +
    "const G=Q(0,.14),u=norm(G.map((v,k)=>v-N[k])),T=N.map((v,k)=>v+u[k]*2.0);part('leftForearm','#c9a26b');limb(N,T,.04,.04);" +
    "part('leftForearm',p.heldArrow==='fire'?'#ff7a1a':p.heldArrow==='ice'?'#8fe3ff':'#9aa3ad');" +
    'limb(T.map((v,k)=>v-u[k]*.3),T.map((v,k)=>v+u[k]*.05),.085,.012);' +
    "part('leftForearm','#e8e2d0');limb(N.map((v,k)=>v+u[k]*.1),N.map((v,k)=>v+u[k]*.5),.12,.05);}" +
    "}else{part('leftForearm','#7a4b26');limb(Q(-.45,0),Q(.1,0),.07,.06);limb(Q(.1,0),Q(.5,.04,.22),.055,.045);limb(Q(.1,0),Q(.5,.04,-.22),.055,.045);" +
    "const L1=Q(.5,.04,.22),L2=Q(.5,.04,-.22),N=Q(.48,-.08-1.5*dd,.12*dd);part('leftForearm','#c8322a');limb(L1,N,.03,.03);limb(N,L2,.03,.03);" +
    "part('leftForearm','#5b3519');box(N[0],N[1],N[2],.16,.16,.16);}paintSlot='held';" +
    // step 13b: the hook line (a steel launcher with the hook in its mouth), the grapple rope (a coil and a claw) and
    // the magnet glove (a red and silver magnet over the fist), in the right hand
    "}else if(p.heldLook==='Hook line'){const x=1.10,y=1.94,z=.34;part('rightArm','#5d646d');box(x,y-.05,z+.12,.34,.34,.62);" +
    "part('rightArm','#8d949c');box(x,y-.05,z+.5,.26,.26,.16);part('rightArm','#c9a227');box(x,y-.05,z+.62,.12,.3,.08);box(x,y+.13,z+.08,.1,.14,.3);" +
    "}else if(p.heldLook==='Grapple rope'){const x=1.10,y=1.94,z=.34;part('rightArm','#9b7a4a');box(x,y-.1,z+.05,.42,.42,.36);" +
    "part('rightArm','#7a5c33');box(x,y-.1,z+.05,.46,.12,.4);part('rightArm','#9aa3ad');box(x,y+.25,z+.18,.08,.3,.08);box(x-.1,y+.38,z+.18,.2,.06,.06);" +
    "}else if(p.heldLook==='Magnet glove'){const x=1.10,y=1.94,z=.34;part('rightArm','#c8322a');box(x,y-.02,z+.22,.44,.36,.2);" +
    "box(x-.17,y-.02,z+.42,.12,.36,.26);box(x+.17,y-.02,z+.42,.12,.36,.26);part('rightArm','#d9dde2');box(x-.17,y-.02,z+.58,.12,.36,.08);box(x+.17,y-.02,z+.58,.12,.36,.08);" +
    // step 13c: the Lens of Truth: a gold handle out of the fist and a gold ring round violet glass, held at the eye
    "}else if(p.heldLook==='Lens of Truth'){const x=1.10,y=1.94,z=.34,c=y-.6;part('rightArm','#c9a227');box(x,y-.18,z,.1,.2,.1);" +
    'box(x,c+.32,z,.72,.1,.1);box(x,c-.32,z,.72,.1,.1);box(x-.32,c,z,.1,.6,.1);box(x+.32,c,z,.1,.6,.1);' +
    "part('rightArm','#8b5cf6');box(x,c,z,.56,.56,.04);" +
    "}else if(p.held!=='None'){part('rightArm',access);";
  return src.replace(at, stick);
}

/**
 * P23: on a map with no terrain yet, v68 lets characters walk only within the bricks standing on the ground,
 * so one chest on a bare map shrinks the walkable room to that chest (the hero and every neighbour land on
 * top of it). The new engine's copy keeps the bare ground's ±16 studs while the ground is that small.
 */
function withRoomToWalk(src: string): string {
  const at = "for(const k of ['x1','z1'])area[k]=Math.max(area[k],b[k]);}return area;";
  if (!src.includes(at)) throw new Error('game physics: worldBounds moved; update withRoomToWalk');
  return src.replace(
    at,
    "for(const k of ['x1','z1'])area[k]=Math.max(area[k],b[k]);}" +
      'if(area.x1-area.x0<32&&area.z1-area.z0<32){area.x0=Math.min(area.x0,-16);area.x1=Math.max(area.x1,16);' +
      'area.z0=Math.min(area.z0,-16);area.z1=Math.max(area.z1,16);}return area;',
  );
}

/**
 * P23 part 3: a talking mouth. While a character speaks, its profile carries `mouthOpen` (0.5 half, 1 wide)
 * and the face prints an open mouth (with a tongue) instead of the expression's mouth; the brows and eyes
 * keep the mood. Each shape is a different profile, so the model caches each one once.
 */
/**
 * Milestone 3, 10d: v68 picks the side of a part's drawing (front, back, left…) from each triangle's winding. Round
 * parts (the head, the neck, hands — v68's lathes) are wound inward, so the front of the head took the Back side's
 * drawing and the back of the head the Front's: a face drawn on the Front showed only on the eyes and mouth. Here
 * a triangle whose winding disagrees with its own shading normals is turned round, so each side's drawing lands on
 * that side. Flat parts (boxes) already agree and are unchanged; no built-in character has drawings.
 */
function withOutwardPaint(src: string): string {
  const at = 'current.uvNormals.push(norm([ru[1]*rv[2]-ru[2]*rv[1],ru[2]*rv[0]-ru[0]*rv[2],ru[0]*rv[1]-ru[1]*rv[0]]));';
  if (!src.includes(at)) throw new Error('character model: the paint side block moved; update withOutwardPaint');
  const outward =
    '{const q=norm([ru[1]*rv[2]-ru[2]*rv[1],ru[2]*rv[0]-ru[0]*rv[2],ru[0]*rv[1]-ru[1]*rv[0]]);' +
    'const s=na&&nb&&nc?q[0]*(na[0]+nb[0]+nc[0])+q[1]*(na[1]+nb[1]+nc[1])+q[2]*(na[2]+nb[2]+nc[2]):1;' +
    'current.uvNormals.push(s<0?q.map(x=>-x):q);}';
  return src.replace(at, outward);
}

function withTalkingMouth(src: string): string {
  const at = "part('root',ink);const mouth=[];if(['Smile',";
  if (!src.includes(at)) throw new Error('character model: the mouth block moved; update withTalkingMouth');
  const open =
    "part('root',ink);const mouth=[];if(p.mouthOpen>0){const o=p.mouthOpen;disc(0,3.47,.10+.05*o,.035+.085*o);" +
    "part('root','#b94352');disc(0,3.43,.05+.03*o,.015+.035*o,.031);part('root',ink);}else if(['Smile',";
  return src.replace(at, open);
}

/**
 * Milestone 3, 10d part 3: custom hair. v68's catalog gains the hair choice Custom and keeps the look's
 * `customHair` settings (cleaned); its model draws them with its own shapes (core/character/hair.ts drawHair), so
 * custom hair takes drawings and squashes under a hat like v68's own. v68's files are unchanged: Play in v68 gets
 * the nearest v68 hairstyle (lookForV68).
 */
function withCustomHairChoice(src: string): string {
  const list = "'Dreadlocks','Swept','Pixie']";
  const keep = 'necklineWidth:p.necklineWidth,paint};';
  if (!src.includes(list) || !src.includes(keep))
    throw new Error('character catalog moved; update withCustomHairChoice');
  return src
    .replace(list, "'Dreadlocks','Swept','Pixie','Custom']")
    .replace(keep, `${keep}if(p.hair==='Custom')result.customHair=__hair.clean(p.customHair);`);
}

function withCustomHair(src: string): string {
  const at = "if(p.hair!=='Bald'){part('root',hair);const tall=";
  if (!src.includes(at)) throw new Error('character model: the hair block moved; update withCustomHair');
  return src.replace(
    at,
    `if(p.hair==='Custom'){__hair.draw(p.customHair,hair,{part,lathe,sphere,box,cyl});}else ${at}`,
  );
}

let runtime: LegacyRuntime | null = null;
export function legacyRuntime(): LegacyRuntime {
  runtime ??= new Function(
    '__hair',
    `${ORDER.join('\n')}\nreturn {WorldGenerator,VolcanoSimulation,SkyCycle,GameMagic,SuperPowers,GameWeapons,StudioMotion,StudioAnimations,CharacterCatalog,RigCollision,GamePhysics,CharacterModel,CharacterArt,NPCWorld};`,
  )({ clean: cleanHair, draw: drawHair }) as LegacyRuntime;
  return runtime;
}
