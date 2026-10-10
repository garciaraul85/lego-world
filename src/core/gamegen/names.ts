import type { Theme } from './recipes';
import { pick } from './rng';

const PLACES: Record<Theme, { first: string[]; last: string[] }> = {
  town: {
    first: ['Brick', 'Stud', 'Clay', 'Maple', 'Harbor', 'Copper'],
    last: ['ton', 'ville', 'bury', 'ford', ' Bay', ' Square'],
  },
  volcano: {
    first: ['Cinder', 'Ember', 'Ash', 'Magma', 'Obsidian', 'Scorch'],
    last: [' Peak', ' Crater', ' Ridge', ' Summit', ' Rock', ' Mount'],
  },
  forest: {
    first: ['Green', 'Moss', 'Fern', 'Willow', 'Oak', 'Pine'],
    last: ['wood', ' Hollow', ' Glade', ' Grove', ' Vale', 'shade'],
  },
  mixed: {
    first: ['Patch', 'Quilt', 'Mosaic', 'Rainbow', 'Puzzle', 'Corner'],
    last: [' Lands', ' Isles', ' Reach', ' Fields', ' Coast', ' Realm'],
  },
};

export function placeName(r: () => number, theme: Theme): string {
  const p = PLACES[theme];
  return `${pick(r, p.first)}${pick(r, p.last)}`.trim();
}

export function gameName(r: () => number, quest: 'collect' | 'repair' | 'summit', place: string): string {
  const titles = {
    collect: [`The Lost Chests of ${place}`, `${place} Treasure Hunt`, `Secrets of ${place}`],
    repair: [`Rebuild ${place}`, `${place} Repair Crew`, `Bricks Back Together: ${place}`],
    summit: [`Climb ${place}`, `The Top of ${place}`, `${place} Ascent`],
  };
  return pick(r, titles[quest]);
}
