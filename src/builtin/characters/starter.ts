import type { BodyBrick } from '../../core/character/body';
import type { Health } from '../../core/combat/damage';
import type { Enemy } from '../../core/combat/enemy';
import type { Character } from '../../core/schema';
import { builtinPlanId } from '../bodyplans';
import knight from './knight.json';

/**
 * Step 11, 4a: the adventure starter pack's cast — an original hero, ten neighbours with roles and a sample
 * conversation each, and ten original enemies with Ocarina-of-Time-style roles under their own names and looks.
 * Enemies carry their stats, weaknesses (by damage type and by side), senses and wits; their full brains come in
 * step 14. Minifigs keep v68's look (Look tab); creatures wear the starter body plans.
 */
export type PackGroup = 'hero' | 'npc' | 'enemy';
export type PackCharacter = {
  slug: string;
  group: PackGroup;
  /** one line for the pack panel */
  about: string;
  /** its sample conversation, as a dialogue script (made in the project when it is dragged into the game) */
  script?: string;
  character: Omit<Character, 'id'>;
};

type Look = Record<string, unknown>;
const BASE: Look = {
  ...knight.profile,
  hat: 'None',
  outfit: 'Separates',
  cape: 'None',
  held: 'None',
  shoes: 'Boots',
  hair: 'Short',
  expression: 'Smile',
  shirt: 'T-shirt',
  pants: 'Jeans',
};
const look = (name: string, o: Look): Look => ({ ...BASE, name, ...o });

const npc = (h: Health['atZero'] = { break: false }) => h;
const harm = (hp: number, more: Partial<Health> = {}) => ({
  canBeHarmed: true,
  health: { hp, ...more, atZero: more.atZero ?? npc() } as Health,
});
const enemy = (e: Enemy) => e;

/** a minifig's extra part on a joint */
const part = (
  bone: string,
  w: number,
  d: number,
  kind: BodyBrick['kind'],
  x: number,
  y: number,
  z: number,
  color: BodyBrick['color'],
  more: Partial<BodyBrick> = {},
): BodyBrick => ({ bone, w, d, kind, x, y, z, color, ...more });

const HEART = { item: 'heart', count: 1, chance: 0.5 };

export const STARTER_CAST: PackCharacter[] = [
  // ---------- the hero ----------
  {
    slug: 'rook',
    group: 'hero',
    about: 'An original adventurer: sword and shield, a travel tunic, a quiver for the bow to come',
    character: {
      name: 'Rook',
      role: 'hero',
      profile: look('Rook', {
        hair: 'Swept',
        hairColor: '#7a4b2a',
        shirt: 'Tunic',
        shirtColor: '#2f6f8f',
        pants: 'Cargo pants',
        pantsColor: '#5b4a3a',
        belt: 'Simple belt',
        back: 'Quiver',
        shoes: 'Boots',
        shoeColor: '#4a3326',
        gloves: 'Leather',
        gloveColor: '#7b5235',
        held: 'Sword',
        expression: 'Determined',
        eyes: 'Almond',
      }),
      gear: { offHand: 'Shield' },
      stats: { health: 3, stamina: 100, speed: 1, jump: 1, strength: 1, defence: 0, level: 1, xpCurve: 'normal' },
      behaviour: { kind: 'hero', routine: 'wander' },
    },
  },
  // ---------- ten neighbours ----------
  {
    slug: 'elder-maren',
    group: 'npc',
    about: 'The village elder: gives the opening quest',
    script: `== start
Elder Maren: You came! The old shrine in the hills has woken.
Elder Maren: Monsters crawl out of it at night. Will you go?
* I'll go. -> yes
* Tell me more. -> more
== more
Elder Maren: A great one-eyed spider nests at its heart. Bring a shield.
-> start
== yes
> set quest.shrine = started
Elder Maren (happy): Take this map. The shrine is past the river.
> give map 1`,
    character: {
      name: 'Elder Maren',
      role: 'npc',
      profile: look('Elder Maren', {
        gender: 'Female',
        hair: 'Bun',
        hairColor: '#d9d9d9',
        shirt: 'Long coat',
        shirtColor: '#6b4e8a',
        pants: 'Suit pants',
        pantsColor: '#3e3550',
        neck: 'Pendant',
        held: 'Map',
        expression: 'Peaceful',
        height: 'Short',
      }),
      behaviour: { kind: 'questGiver', routine: 'stand' },
      barks: [{ text: 'The shrine… it must be stopped.' }],
    },
  },
  {
    slug: 'shopkeeper-pip',
    group: 'npc',
    about: 'Sells and buys (the shop opens with the items of step 13)',
    script: `== start
Pip (happy): Welcome, welcome! Shields, arrows, lamp oil — all fair prices.
* Just looking. -> end
* Any tips? -> tip
== tip
Pip: Bats hate the boomerang. Stun them, then strike!`,
    character: {
      name: 'Pip',
      role: 'npc',
      profile: look('Pip', {
        hat: 'Beret',
        hatColor: '#b33a3a',
        shirt: 'Vest',
        shirtColor: '#e8d8b0',
        pants: 'Suit pants',
        pantsColor: '#5a3e2b',
        facialHair: 'Moustache',
        hairColor: '#2b2b2b',
        expression: 'Big grin',
      }),
      behaviour: { kind: 'shopkeeper', routine: 'stand' },
      barks: [{ text: 'Step right up!' }],
    },
  },
  {
    slug: 'blacksmith-brann',
    group: 'npc',
    about: 'The blacksmith: upgrades weapons',
    script: `== start
Brann: Hm. That blade's seen better days.
Brann: Bring me ore from the shrine and I'll forge you something proper.`,
    character: {
      name: 'Brann',
      role: 'npc',
      profile: look('Brann', {
        hair: 'Buzz cut',
        hairColor: '#3b2416',
        facialHair: 'Full beard',
        shirt: 'Tank top',
        shirtColor: '#4a4a4a',
        gloves: 'Leather',
        gloveColor: '#5c3a21',
        held: 'Hammer',
        expression: 'Neutral',
        height: 'Taller than average',
      }),
      behaviour: { kind: 'villager', routine: 'stand' },
      barks: [{ text: '*clang* *clang*' }],
    },
  },
  {
    slug: 'guard-tess',
    group: 'npc',
    about: 'The gate guard: lets you through once you are ready',
    script: `== start
[if quest.shrine is started] Tess: The elder sent you? Then go — and come back alive. -> end
Tess: The road to the hills is closed. Speak to the elder first.`,
    character: {
      name: 'Tess',
      role: 'npc',
      profile: look('Tess', {
        gender: 'Female',
        hat: 'Knight helmet',
        hatColor: '#8a949e',
        outfit: 'Armor',
        shirtColor: '#8a949e',
        held: 'Sword',
        expression: 'Determined',
        shoes: 'Armored boots',
      }),
      gear: { offHand: 'Shield' },
      behaviour: { kind: 'villager', routine: 'stand' },
      barks: [{ text: 'Halt. Who goes there?' }],
    },
  },
  {
    slug: 'fisherwoman-coral',
    group: 'npc',
    about: 'By the water: tips about the water dungeon',
    script: `== start
Coral: The lake's been strange lately. Fish-folk spitting fire!
Coral: Hit them when they surface. Under water, hold your breath and dive.`,
    character: {
      name: 'Coral',
      role: 'npc',
      profile: look('Coral', {
        gender: 'Female',
        hat: 'Sun hat',
        hatColor: '#e4cd9e',
        hair: 'Braid',
        hairColor: '#b5652b',
        shirt: 'Raincoat',
        shirtColor: '#f2cd37',
        pants: 'Shorts',
        pantsColor: '#2f6f8f',
        shoes: 'Boots',
        face: 'Freckles',
      }),
      behaviour: { kind: 'villager', routine: 'stand' },
      barks: [{ text: 'Nothing biting today.' }],
    },
  },
  {
    slug: 'kid-nim',
    group: 'npc',
    about: 'A kid who runs about and plays hide-and-seek',
    script: `== start
Nim (happy): Bet you can't find my secret spot!
Nim: If you do, I'll give you my lucky marble.`,
    character: {
      name: 'Nim',
      role: 'npc',
      profile: look('Nim', {
        height: 'Very short',
        hat: 'Baseball cap',
        hatColor: '#c91a09',
        shirt: 'Striped shirt',
        shirtColor: '#0055bf',
        pants: 'Shorts',
        pantsColor: '#5b4a3a',
        shoes: 'Trainers',
        face: 'Freckles and blush',
        expression: 'Laughing',
      }),
      behaviour: { kind: 'villager', routine: 'wander' },
      barks: [{ text: 'Tag, you’re it!' }],
    },
  },
  {
    slug: 'merchant-ozzie',
    group: 'npc',
    about: 'A travelling merchant who turns up in odd places',
    script: `== start
Ozzie: Ah, a customer! I travel far, I carry rare things.
Ozzie: Come find me again — I never stay in one place.`,
    character: {
      name: 'Ozzie',
      role: 'npc',
      profile: look('Ozzie', {
        hat: 'Top hat',
        hatColor: '#3a2a40',
        shirt: 'Long coat',
        shirtColor: '#7a2e5c',
        back: 'Hiking pack',
        glasses: 'Monocle',
        facialHair: 'Goatee',
        hairColor: '#5c3a21',
        expression: 'Smirk',
      }),
      behaviour: { kind: 'shopkeeper', routine: 'wander' },
      barks: [{ text: 'Rare goods! Rare goods!' }],
    },
  },
  {
    slug: 'healer-sela',
    group: 'npc',
    about: 'The healer: restores your hearts',
    script: `== start
Sela (happy): You look hurt. Let me help.
> give heart 3
Sela: There. Rest when you can.`,
    character: {
      name: 'Sela',
      role: 'npc',
      profile: look('Sela', {
        gender: 'Female',
        hair: 'Long',
        hairColor: '#f2e6c0',
        shirt: 'Tunic',
        shirtColor: '#f4f4f4',
        pants: 'Leggings',
        pantsColor: '#a3c9a8',
        neck: 'Pendant',
        held: 'Flower',
        expression: 'Peaceful',
      }),
      behaviour: { kind: 'villager', routine: 'stand' },
      barks: [{ text: 'Be well, traveller.' }],
    },
  },
  {
    slug: 'bard-lio',
    group: 'npc',
    about: 'A bard who plays and teaches a melody',
    script: `== start
Lio (happy): ♪ Over the hills, the old shrine sleeps… ♪
Lio: Learn my tune and the stones themselves will listen.`,
    character: {
      name: 'Lio',
      role: 'npc',
      profile: look('Lio', {
        hat: 'Beret',
        hatColor: '#237841',
        hair: 'Curly',
        hairColor: '#7a4b2a',
        shirt: 'Blouse',
        shirtColor: '#fe8a18',
        scarf: 'Long scarf',
        accessoryColor: '#c91a09',
        held: 'Guitar',
        expression: 'Big grin',
      }),
      behaviour: { kind: 'villager', routine: 'wander' },
      barks: [{ text: '♪ La la la… ♪' }],
    },
  },
  {
    slug: 'glim',
    group: 'npc',
    about: 'A lantern-bug companion that follows you and gives hints',
    script: `== start
Glim (happy): Hey! Listen! I'll light the way.
Glim: Lock on with Z and watch for the red “!” — that's when they strike!`,
    character: {
      name: 'Glim',
      role: 'npc',
      profile: look('Glim', {}),
      body: {
        plan: builtinPlanId('glim'),
        colors: { main: '#3d3a2a', accent: '#ffe066', belly: '#d8f3ff', eye: '#1b1b1b' },
        params: { size: 0.7 },
      },
      behaviour: { kind: 'companion', routine: 'wander' },
      barks: [{ text: 'Over here!' }],
    },
  },
  // ---------- ten enemies ----------
  {
    slug: 'pebblespout',
    group: 'enemy',
    about: 'Pops up and spits rocks; bounce one back with your shield',
    character: {
      name: 'Pebblespout',
      role: 'npc',
      profile: look('Pebblespout', {}),
      body: {
        plan: builtinPlanId('pebblespout'),
        colors: { main: '#c0503a', accent: '#f2cd37', belly: '#e8a07a', eye: '#1b1b1b' },
      },
      harm: harm(2, { atZero: { break: false, loot: [HEART, { item: 'rupee', count: 1, chance: 0.6 }] } }),
      enemy: enemy({
        power: 1,
        type: 'blunt',
        reach: 1.8,
        sight: 10,
        speed: 0.8,
        cooldown: 2,
        windup: 0.6,
        style: 'popup',
        wits: 'simple',
      }),
      behaviour: { kind: 'enemy', routine: 'stand' },
    },
  },
  {
    slug: 'rattlebones',
    group: 'enemy',
    about: 'A skeleton knight: blocks from the front, steps back, counters; strike after it swings',
    character: {
      name: 'Rattlebones',
      role: 'npc',
      profile: look('Rattlebones', {
        skinColor: '#e8e2d0',
        hair: 'Bald',
        hat: 'Knight helmet',
        hatColor: '#6d5a44',
        shirt: 'Tunic',
        shirtColor: '#4a4038',
        pants: 'Leggings',
        pantsColor: '#e8e2d0',
        shoes: 'Bare feet',
        face: 'Scar',
        expression: 'Angry',
        eyes: 'Wide',
        eyeColor: '#c91a09',
        held: 'Sword',
      }),
      gear: { offHand: 'Shield' },
      harm: harm(6, {
        sides: { front: 0.25, back: 2, above: 1.5 },
        resist: { explosive: 2, light: 2 },
        atZero: { break: false, loot: [HEART] },
      }),
      enemy: enemy({
        power: 1,
        type: 'slash',
        reach: 2,
        sight: 12,
        speed: 1.2,
        cooldown: 1.4,
        windup: 0.5,
        cone: 200,
        hearing: 8,
        style: 'knight',
        wits: 'smart',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'gloomweaver',
    group: 'enemy',
    about: 'The boss: a one-eyed giant spider; hit its eye when it glows',
    character: {
      name: 'Gloomweaver',
      role: 'npc',
      profile: look('Gloomweaver', {}),
      body: {
        plan: builtinPlanId('gloomweaver'),
        colors: { main: '#2b1a3a', accent: '#6a1b9a', belly: '#3d2452', eye: '#ff3030' },
        params: { size: 1.8 },
      },
      harm: harm(24, {
        armor: 0.5,
        sides: { front: 0.5, above: 2 },
        resist: { pierce: 2, fire: 1.5 },
        stunBy: ['light', 'stun'],
        stunFor: 3,
        atZero: { break: false, drop: { item: 'boss key', count: 1 }, emit: 'gloomweaver-defeated' },
      }),
      enemy: enemy({
        power: 2,
        type: 'blunt',
        reach: 3,
        sight: 18,
        speed: 0.9,
        cooldown: 2.2,
        windup: 0.9,
        style: 'boss',
        wits: 'smart',
      }),
      behaviour: { kind: 'boss', routine: 'wander' },
    },
  },
  {
    slug: 'finspitter',
    group: 'enemy',
    about: 'A fish-folk that surfaces to spit fire; hit it while it is up',
    character: {
      name: 'Finspitter',
      role: 'npc',
      profile: look('Finspitter', {
        skinColor: '#3aa59a',
        hair: 'Bald',
        shirt: 'Bare torso',
        pants: 'Shorts',
        pantsColor: '#1f5f6b',
        shoes: 'Bare feet',
        eyes: 'Wide',
        eyeColor: '#f2cd37',
        expression: 'Angry',
      }),
      body: {
        extraSize: 0.5,
        colors: { main: '#3aa59a', accent: '#f26d3a' },
        extras: [
          // a crest fin over the head, fins at the elbows, a tail fin
          part('head', 1, 4, 'brick', -0.5, 5, -2.5, 'accent', { shape: 'slope' }),
          part('leftArm', 1, 2, 'plate', -1.5, -2, -1.5, 'accent'),
          part('rightArm', 1, 2, 'plate', 0.5, -2, -1.5, 'accent'),
          part('hips', 2, 2, 'plate', -1, -2, -2.5, 'accent', { shape: 'wedge', rot: 2 }),
        ],
      },
      harm: harm(3, {
        resist: { fire: 0, ice: 2, electric: 2 },
        stunBy: ['stun'],
        atZero: { break: false, loot: [HEART] },
      }),
      enemy: enemy({
        power: 1,
        type: 'fire',
        reach: 2,
        sight: 12,
        speed: 1,
        cooldown: 2.2,
        windup: 0.7,
        style: 'popup',
        wits: 'simple',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'watcher-eye',
    group: 'enemy',
    about: 'A stone sentinel: swords bounce off; sneak behind it or use a bomb',
    character: {
      name: 'Watcher Eye',
      role: 'npc',
      profile: look('Watcher Eye', {}),
      body: {
        plan: builtinPlanId('watcher-eye'),
        colors: { main: '#8a8f94', accent: '#4b5052', belly: '#6c6e68', eye: '#ff2a2a' },
      },
      harm: harm(3, {
        resist: { slash: 0, blunt: 0, pierce: 0, fire: 0, ice: 0, electric: 0.5, light: 0, explosive: 2, stun: 0 },
        atZero: { break: true, loot: [{ item: 'rupee', count: 5, chance: 1 }] },
      }),
      enemy: enemy({
        power: 1,
        type: 'light',
        reach: 2.5,
        sight: 14,
        speed: 0.5,
        cooldown: 1.5,
        windup: 0.6,
        cone: 90,
        style: 'turret',
        wits: 'simple',
      }),
      behaviour: { kind: 'enemy', routine: 'stand' },
    },
  },
  {
    slug: 'cinderjaw',
    group: 'enemy',
    about: 'A fire lizard: slow and tough; a bomb in its mouth, or hit its tail',
    character: {
      name: 'Cinderjaw',
      role: 'npc',
      profile: look('Cinderjaw', {}),
      body: {
        plan: builtinPlanId('cinderjaw'),
        colors: { main: '#8c2d1a', accent: '#ff9a1f', belly: '#d9a066', eye: '#ffd23f' },
        params: { size: 1.2 },
      },
      harm: harm(10, {
        armor: 1,
        sides: { front: 0.5, back: 1.5, side: 1.25 },
        resist: { fire: 0, explosive: 3, ice: 2 },
        stunBy: ['explosive', 'ice'],
        atZero: { break: false, loot: [HEART, { item: 'bomb', count: 3, chance: 0.5 }] },
      }),
      enemy: enemy({
        power: 2,
        type: 'fire',
        reach: 2.5,
        sight: 10,
        speed: 0.6,
        cooldown: 2.6,
        windup: 1,
        cone: 160,
        style: 'melee',
        wits: 'simple',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'flitterwing',
    group: 'enemy',
    about: 'A bat: erratic, swoops; one hit, and the boomerang stuns it',
    character: {
      name: 'Flitterwing',
      role: 'npc',
      profile: look('Flitterwing', {}),
      body: {
        plan: builtinPlanId('flitterwing'),
        colors: { main: '#3a2a40', accent: '#5a3e6b', belly: '#6c5a72', eye: '#ff4040' },
        params: { size: 0.7 },
      },
      harm: harm(1, { stunBy: ['stun'], atZero: { break: false, loot: [{ ...HEART, chance: 0.2 }] } }),
      enemy: enemy({
        power: 1,
        type: 'pierce',
        reach: 1.6,
        sight: 9,
        speed: 1.8,
        cooldown: 1.6,
        windup: 0.3,
        style: 'swarm',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'flitterwing-fire',
    group: 'enemy',
    about: 'A fire bat: its bite sets you alight',
    character: {
      name: 'Flitterwing (fire)',
      role: 'npc',
      profile: look('Flitterwing (fire)', {}),
      body: {
        plan: builtinPlanId('flitterwing'),
        colors: { main: '#c6411b', accent: '#ff9a1f', belly: '#f2cd37', eye: '#fff3a0' },
        params: { size: 0.7 },
      },
      harm: harm(1, { resist: { fire: 0, ice: 2 }, stunBy: ['stun'], atZero: { break: false } }),
      enemy: enemy({
        power: 1,
        type: 'fire',
        reach: 1.6,
        sight: 9,
        speed: 1.8,
        cooldown: 1.6,
        windup: 0.3,
        style: 'swarm',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'flitterwing-ice',
    group: 'enemy',
    about: 'An ice bat: its bite freezes you for a moment',
    character: {
      name: 'Flitterwing (ice)',
      role: 'npc',
      profile: look('Flitterwing (ice)', {}),
      body: {
        plan: builtinPlanId('flitterwing'),
        colors: { main: '#7fc8e8', accent: '#d8f3ff', belly: '#ffffff', eye: '#0055bf' },
        params: { size: 0.7 },
      },
      harm: harm(1, { resist: { ice: 0, fire: 2 }, stunBy: ['stun'], atZero: { break: false } }),
      enemy: enemy({
        power: 1,
        type: 'ice',
        reach: 1.6,
        sight: 9,
        speed: 1.8,
        cooldown: 1.6,
        windup: 0.3,
        style: 'swarm',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'threadback',
    group: 'enemy',
    about: 'A hanging spider: its front is armoured; wait for it to turn and hit its soft back',
    character: {
      name: 'Threadback',
      role: 'npc',
      profile: look('Threadback', {}),
      body: {
        plan: builtinPlanId('threadback'),
        colors: { main: '#3b3b2e', accent: '#c9b037', belly: '#e8e2d0', eye: '#c91a09' },
        params: { size: 1.1 },
      },
      harm: harm(4, {
        sides: { front: 0, side: 0.5, back: 2 },
        stunBy: ['stun'],
        atZero: { break: false, loot: [{ item: 'golden token', count: 1, chance: 1 }] },
      }),
      enemy: enemy({
        power: 1,
        type: 'pierce',
        reach: 1.8,
        sight: 7,
        speed: 0.7,
        cooldown: 1.8,
        windup: 0.5,
        style: 'ambusher',
        wits: 'simple',
      }),
      behaviour: { kind: 'enemy', routine: 'stand' },
    },
  },
  {
    slug: 'lanternwisp',
    group: 'enemy',
    about: 'A lantern ghost: fades in and out; the Lens of Truth shows the real one',
    character: {
      name: 'Lanternwisp',
      role: 'npc',
      profile: look('Lanternwisp', {}),
      body: {
        plan: builtinPlanId('lanternwisp'),
        colors: { main: '#cfd8ff', accent: '#ffd23f', belly: '#9aa8e0', eye: '#7df9ff' },
      },
      harm: harm(5, {
        resist: { slash: 0.5, blunt: 0.5, light: 3, fire: 1.5 },
        stunBy: ['light'],
        atZero: { break: false, loot: [{ item: 'spirit lamp', count: 1, chance: 1 }] },
      }),
      enemy: enemy({
        power: 1,
        type: 'fire',
        reach: 2,
        sight: 11,
        speed: 1.1,
        cooldown: 2,
        windup: 0.6,
        style: 'ghost',
        wits: 'smart',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
  {
    slug: 'howler',
    group: 'enemy',
    about: 'A wolf-man pack hunter: circles, dodges frontal hits, howls for the others',
    character: {
      name: 'Howler',
      role: 'npc',
      profile: look('Howler', {
        skinColor: '#6b4f36',
        hair: 'Spiky',
        hairColor: '#3b2a1e',
        shirt: 'Bare torso',
        pants: 'Jeans',
        pantsColor: '#3e4a5a',
        shoes: 'Bare feet',
        eyes: 'Almond',
        eyeColor: '#f2cd37',
        expression: 'Angry',
      }),
      body: {
        extraSize: 0.5,
        colors: { main: '#6b4f36', accent: '#3b2a1e', belly: '#c9a77a' },
        extras: [
          // snout and nose, ears, a bushy tail, claws
          part('head', 2, 3, 'brick', -1, 1, 0.6, 'belly', { shape: 'slope', rot: 2 }),
          part('head', 1, 1, 'plate', -0.5, 3, 3, 'dark', { shape: 'round' }),
          part('head', 1, 1, 'brick', -1.6, 7, -0.6, 'main', { shape: 'cone' }),
          part('head', 1, 1, 'brick', 0.6, 7, -0.6, 'main', { shape: 'cone' }),
          part('hips', 1, 3, 'brick', -0.5, -1, -4.3, 'accent', { shape: 'curve', rot: 2 }),
          part('leftForearm', 1, 1, 'plate', -0.5, -3, 0.3, 'belly', { shape: 'cone' }),
          part('rightForearm', 1, 1, 'plate', -0.5, -3, 0.3, 'belly', { shape: 'cone' }),
        ],
      },
      harm: harm(6, {
        sides: { front: 0.5, back: 2, side: 1.25 },
        resist: { fire: 1.5 },
        atZero: { break: false, loot: [HEART] },
      }),
      enemy: enemy({
        power: 1.5,
        type: 'slash',
        reach: 1.9,
        sight: 14,
        speed: 2,
        cooldown: 1.2,
        windup: 0.35,
        cone: 160,
        hearing: 10,
        style: 'pack',
        wits: 'pack',
      }),
      behaviour: { kind: 'enemy', routine: 'wander' },
    },
  },
];
