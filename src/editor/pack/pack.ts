import type { PackCharacter } from '../../builtin/characters/starter';
import type { TerrainStyle } from '../../builtin/packs/adventure';
import type { Command } from '../../core/commands';
import { parseScript } from '../../core/dialogue/script';
import { newId } from '../../core/ids';
import { type Character, type EffectInstance, type MapDoc, paths } from '../../core/schema';
import type { EditorState } from '../state';

type Item = PackCharacter & { id: string };

/**
 * Step 11, 4a: a starter pack character brought into the game: the character itself (with the built-in's id, so
 * the map and logic keep finding it) and its sample conversation, wired to its Talk list. Nothing when it is
 * already in the game.
 */
export function packCharacterCommands(ed: EditorState, item: Item): Command[] {
  if (ed.store.has(paths.character(item.id))) return [];
  const chr: Character = { ...structuredClone(item.character), id: item.id } as Character;
  const out: Command[] = [];
  if (item.script) {
    const conv = newId('dialogue');
    const { conversation } = parseScript(
      item.script,
      { id: conv as never, name: `${item.character.name}: hello` },
      {
        nameOf: (w) => (w === item.id ? item.character.name : w),
        whoOf: (n) => (n === item.character.name ? item.id : n),
      },
    );
    out.push({ type: 'dialogue.put', payload: { conversation } });
    chr.talk = [{ conversation: conv as never, note: 'from the starter pack' }];
  }
  out.unshift({ type: 'character.create', payload: { character: chr } });
  return out;
}

/** where a neighbour goes when Place is pressed: a few studs in front of the first spawn, a little apart each time */
function spot(ed: EditorState): [number, number, number] {
  const map = ed.mapId.value;
  const sp = ed.store.get<MapDoc>(paths.map(map))?.spawns[0];
  const yaw = sp?.yaw ?? 0;
  const at = sp?.pos ?? [0, 0.4, 0];
  const n = (ed.store.get<{ items: { kind: string }[] }>(paths.instances(map))?.items ?? []).filter(
    (i) => i.kind === 'npc',
  ).length;
  const side = ((n % 5) - 2) * 2.5;
  return [at[0] + Math.sin(yaw) * 6 + Math.cos(yaw) * side, at[1], at[2] + Math.cos(yaw) * 6 - Math.sin(yaw) * side];
}

/** puts a pack character on the open map (bringing it into the game first): one undo step */
export function placePackCharacter(ed: EditorState, item: Item, pos?: [number, number, number]): boolean {
  const map = ed.mapId.value;
  const at = pos ?? spot(ed);
  const yaw = ed.store.get<MapDoc>(paths.map(map))?.spawns[0]?.yaw ?? 0;
  return ed.exec(
    [
      ...packCharacterCommands(ed, item),
      { type: 'npc.place', payload: { map, character: item.id, pos: at, heading: yaw + Math.PI } },
    ],
    { label: `Place ${item.character.name}` },
  ).ok;
}

/** makes a pack character the player's hero (brought into the game first): one undo step */
export function makePackHero(ed: EditorState, item: Item): boolean {
  return ed.exec([...packCharacterCommands(ed, item), { type: 'project.update', payload: { hero: item.id } }], {
    label: `Play as ${item.character.name}`,
  }).ok;
}

/** the open map made again with a terrain style (a new seed): one undo step brings the old map back */
export function useTerrainStyle(ed: EditorState, style: TerrainStyle): boolean {
  const map = ed.mapId.value;
  const m = ed.store.get<MapDoc>(paths.map(map));
  if (!m) return false;
  const r = ed.exec(
    {
      type: 'map.generate',
      payload: { map, config: { ...style.config, seed: Math.floor(Math.random() * 99_999_999) } },
    },
    { label: `Terrain: ${style.name}` },
  );
  return r.ok;
}

/** step 11, 4b: an effect from the pack placed in front of the first spawn (it plays where it stands): one undo step */
export function placePackEffect(ed: EditorState, effect: string, name: string): string | null {
  const map = ed.mapId.value;
  const at = spot(ed);
  const id = newId('instance');
  const item: EffectInstance = {
    id: id as EffectInstance['id'],
    kind: 'effect',
    name,
    effect: effect as EffectInstance['effect'],
    pos: [Math.round(at[0] * 2) / 2, at[1] + 1.5, Math.round(at[2] * 2) / 2],
    scale: 1,
    interval: [2, 4],
    maxDistance: 40,
    playing: true,
  };
  return ed.exec({ type: 'item.add', payload: { map, item } }, { label: `Add ${name}` }).ok ? id : null;
}

/** step 11, 4b: how the game's screens and menus look (classic or adventure): one undo step */
export function setScreenLook(ed: EditorState, look: 'classic' | 'adventure'): boolean {
  return ed.exec({ type: 'project.update', payload: { uiLook: look } }).ok;
}
