import type { BIOMES } from '../schema';

export type Theme = 'town' | 'volcano' | 'forest' | 'mixed';
export type QuestKind = 'collect' | 'repair' | 'summit';
type Biome = (typeof BIOMES)[number];

export type GameOptions = {
  theme: Theme;
  /** 1–5 maps, connected by two-way gates in a chain */
  maps: number;
  length: 'short' | 'medium';
  difficulty: 1 | 2 | 3;
  /** a quest to use instead of the theme's pick */
  quest?: QuestKind;
  name?: string;
};

export const DEFAULT_OPTIONS: GameOptions = { theme: 'town', maps: 2, length: 'short', difficulty: 2 };

/** Per theme: environments of the first map and the extra maps, quests that fit, heroes, music, ambience. */
export const THEMES: Record<
  Theme,
  {
    first: Biome[];
    extra: Biome[][];
    quests: QuestKind[];
    heroes: string[];
    music: string;
    ambience: string;
    time: 'day' | 'noon' | 'evening' | 'night';
  }
> = {
  town: {
    first: ['city', 'prairie'],
    extra: [['city'], ['highway', 'city'], ['beach', 'city'], ['prairie'], ['city', 'forest']],
    quests: ['repair', 'collect'],
    heroes: ['Detective', 'Chef', 'City worker', 'Runner'],
    music: 'mus_explore000',
    ambience: 'snd_wind000000',
    time: 'day',
  },
  volcano: {
    first: ['volcanoes', 'mountains'],
    extra: [['volcanoes'], ['desert', 'volcanoes'], ['mountains'], ['volcanoes', 'desert'], ['mountains', 'volcanoes']],
    quests: ['summit', 'collect'],
    heroes: ['Explorer', 'Knight', 'Steel titan', 'Astronaut'],
    music: 'mus_castle0000',
    ambience: 'snd_lava000000',
    time: 'evening',
  },
  forest: {
    first: ['forest', 'rainforest'],
    extra: [['forest', 'prairie'], ['rainforest'], ['forest'], ['prairie', 'forest'], ['rainforest', 'beach']],
    quests: ['collect', 'repair'],
    heroes: ['Rainforest guide', 'Explorer', 'Wizard', 'Cowboy'],
    music: 'mus_explore000',
    ambience: 'snd_birds00000',
    time: 'day',
  },
  mixed: {
    first: ['forest', 'city', 'mountains'],
    extra: [['beach'], ['desert'], ['castle_outside'], ['volcanoes'], ['rainforest']],
    quests: ['collect', 'repair', 'summit'],
    heroes: ['Pirate', 'Knight', 'Wizard', 'Explorer', 'Astronaut'],
    music: 'mus_explore000',
    ambience: 'snd_birds00000',
    time: 'day',
  },
};

/** How many things the quest asks for, and how many hearts the hero has. */
export function questSize(o: GameOptions) {
  const base = o.length === 'short' ? 3 : 5;
  return { count: base + (o.difficulty - 1), hearts: [5, 3, 2][o.difficulty - 1]! };
}

export const QUEST_TEXT: Record<QuestKind, (n: number, where: string) => { quest: string; progress: string }> = {
  collect: (n) => ({ quest: `Find and open ${n} treasure chests`, progress: 'Chests {found}/' + n }),
  repair: (n) => ({ quest: `Smash and rebuild ${n} buildings`, progress: 'Rebuilt {repaired}/' + n }),
  summit: (_n, where) => ({ quest: `Climb to the highest point of ${where}`, progress: 'Look for the beacon' }),
};
