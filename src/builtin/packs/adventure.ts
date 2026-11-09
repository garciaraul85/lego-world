import type { GenerateConfig } from '../../core/worldgen/generate';
import { STARTER_ASSET_SLUGS, starterAssetId } from '../assets';
import { MUS, SND } from '../audio/pack';
import { STARTER_CHARACTERS } from '../characters';
import { ADVENTURE_EFFECTS } from '../effects';

/**
 * Step 11, 4a: the adventure starter pack — what its panel in the bottom dock shows. Its cast and its buildings and
 * props are built-in characters and assets (they open in their studios and are copied into the game when used); its
 * terrain styles are settings for the map generator. Sounds, music, effects and the HUD set come in 4b; script,
 * cutscene and quest templates in 4c and 14c.
 */
export type TerrainStyle = {
  id: string;
  name: string;
  about: string;
  config: Omit<GenerateConfig, 'seed'>;
};

export const TERRAIN_STYLES: TerrainStyle[] = [
  {
    id: 'green-vale',
    name: 'Green Vale',
    about: 'Rolling meadows and woods by day: the village and the fields',
    config: {
      environments: ['prairie', 'forest'],
      size: 24,
      mountainShape: 'rolling',
      mountainScale: 'low',
      time: 'day',
    },
  },
  {
    id: 'shrine-highlands',
    name: 'Shrine Highlands',
    about: 'Sharp peaks and old stone at dusk: the way to the shrine',
    config: {
      environments: ['mountains', 'castle_outside'],
      size: 24,
      mountainShape: 'alpine',
      mountainScale: 'high',
      time: 'evening',
    },
  },
  {
    id: 'misty-woods',
    name: 'Misty Woods',
    about: 'Long ridges under thick trees, in the rain: where the bats and ghosts are',
    config: {
      environments: ['rainforest', 'forest'],
      size: 24,
      mountainShape: 'ridges',
      mountainScale: 'medium',
      time: 'evening',
      rain: true,
    },
  },
];

export const ADVENTURE_PACK = {
  id: 'adventure',
  name: 'Adventure starter pack',
  about:
    'A hero, ten neighbours, ten kinds of enemy, twenty buildings and props, three terrain styles, five effects, an adventure screen look, and its own sounds and music',
  /** the genre views it shows in */
  genres: ['explore', 'open'],
  cast: STARTER_CHARACTERS,
  assets: STARTER_ASSET_SLUGS.map(starterAssetId),
  terrain: TERRAIN_STYLES,
  /** step 11, 4b: its effects, sounds and music (every game has them; the panel shows them together) */
  effects: ADVENTURE_EFFECTS,
  sounds: [
    { id: SND.itemget, name: 'Item get', about: 'a short jingle for something small found' },
    { id: SND.keyget, name: 'Key', about: 'plays when the hero is given a key' },
    { id: SND.secret, name: 'Secret found', about: 'a puzzle solved or a hidden door found' },
    { id: SND.swish, name: 'Sword swish', about: 'plays on every blade swing' },
    { id: SND.bossroar, name: 'Boss roar', about: 'for a boss waking up' },
  ],
  music: [
    { id: MUS.village, name: 'Village', about: 'cheerful, for towns and fields' },
    { id: MUS.dungeon, name: 'Dungeon', about: 'slow and dark' },
    { id: MUS.boss, name: 'Boss', about: 'fast and driving' },
  ],
} as const;
