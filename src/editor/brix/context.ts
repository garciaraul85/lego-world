import { builtinFile, projectSummary } from '../../core/ai/context';
import type { Genre } from '../../core/genres/types';
import { paths } from '../../core/schema';
import { assetLibrary, resolveAsset } from '../assets';
import { projectGenre } from '../genres/view';
import { SCREENS, type ScreenId } from '../help/entries';
import type { EditorState } from '../state';

/**
 * P19 Brix knows where you are: the screen (workspace and tab), what is selected or open there, the map
 * and the kind of game. “How do I make this open with a key?” then means the selected chest, and “what can
 * I do here?” means the screen you are on. Brix reads this; it never changes it.
 */
export type Focus = {
  kind:
    | 'object'
    | 'brick'
    | 'zone'
    | 'spawn'
    | 'item'
    | 'asset'
    | 'logic'
    | 'screen'
    | 'character'
    | 'cinematic'
    | 'sound';
  /** what the person calls it */
  name: string;
  /** the Help word for it, added to a question that says “this” */
  words: string;
};
export type BrixContext = {
  screen: ScreenId;
  workspace: string;
  /** “Scene › Project tab” */
  where: string;
  focus: Focus | null;
  map: string;
  genre: Genre;
  playing: boolean;
};

const named = (doc: unknown): string | null => {
  const n = (doc as { name?: unknown } | undefined)?.name;
  return typeof n === 'string' && n ? n : null;
};
/** a project file's name, or the built-in's the project has not copied yet */
function nameAt(ed: EditorState, path: string): string | null {
  return named(ed.store.get(path)) ?? named(builtinFile(path));
}

const RIGHT: Record<string, string> = { inspect: 'Inspector', map: 'Map tab', project: 'Project tab' };

/** What the editor shows now, read from its signals. */
export function brixContext(ed: EditorState): BrixContext {
  const ws = ed.workspace.value;
  const playing = !!ed.session.value;
  const screen: ScreenId = playing ? 'play' : ((SCREENS.find((s) => s.workspace === ws)?.id ?? 'shell') as ScreenId);
  const mapDoc = ed.store.get<{
    name?: string;
    zones?: { id: string; name?: string }[];
    spawns?: { id: string; name?: string }[];
    items?: { id: string; kind?: string; widget?: string; name?: string }[];
  }>(paths.map(ed.mapId.value));
  let focus: Focus | null = null;
  let where = ws;
  if (playing) where = 'Play (the game is running)';
  else if (ws === 'Scene') {
    where = `Scene › ${RIGHT[ed.right.value] ?? 'Inspector'}`;
    const sel = ed.selection.value;
    const zone = ed.selectedZone.value && mapDoc?.zones?.find((z) => z.id === ed.selectedZone.value);
    const spawn = ed.selectedSpawn.value && mapDoc?.spawns?.find((s) => s.id === ed.selectedSpawn.value);
    const item = ed.selectedItem.value && mapDoc?.items?.find((i) => i.id === ed.selectedItem.value);
    if (zone) focus = { kind: 'zone', name: zone.name ?? 'trigger zone', words: 'zone' };
    else if (spawn) focus = { kind: 'spawn', name: spawn.name ?? 'spawn point', words: 'spawn' };
    else if (item) {
      const sign = item.kind === 'ui';
      focus = {
        kind: 'item',
        name: item.name ?? (sign ? `${item.widget ?? 'sign'}` : 'sound emitter'),
        words: sign ? 'sign' : 'emitter',
      };
    } else if (sel.size) {
      const s = ed.scene.value;
      const first = sel.values().next().value as number;
      const owner = s?.ownerOf(first);
      if (owner) {
        const n = (owner.inst as { name?: string }).name ?? owner.def.name;
        focus = { kind: 'object', name: n, words: 'asset' };
      } else focus = { kind: 'brick', name: sel.size === 1 ? 'a brick' : `${sel.size} bricks`, words: 'brick' };
    }
  } else if (ws === 'Assets') {
    // the studio shows the first asset of the library until one is picked
    const a = resolveAsset(ed, ed.studioAsset.value ?? assetLibrary(ed)[0]?.asset.id ?? null);
    if (a) focus = { kind: 'asset', name: a.name, words: 'asset' };
  } else if (ws === 'Logic' && ed.logicGraph.value) {
    where = `Logic (${ed.logicView.value} view)`;
    const n = nameAt(ed, paths.logic(ed.logicGraph.value));
    if (n) focus = { kind: 'logic', name: n, words: 'logic' };
  } else if (ws === 'Screens' && ed.screenId.value) {
    const n = nameAt(ed, paths.screen(ed.screenId.value));
    if (n) focus = { kind: 'screen', name: n, words: ed.widgetPath.value != null ? 'widget' : 'screen' };
  } else if (ws === 'Characters' && ed.studioCharacter.value) {
    const n = nameAt(ed, paths.character(ed.studioCharacter.value));
    if (n) focus = { kind: 'character', name: n, words: 'character' };
  } else if (ws === 'Cinematics' && ed.cinematicId.value) {
    const n = nameAt(ed, paths.cinematic(ed.cinematicId.value));
    if (n) focus = { kind: 'cinematic', name: n, words: 'cinematic' };
  } else if (ws === 'Audio' && ed.audioSel.value.id) {
    focus = {
      kind: 'sound',
      name: ed.audioSel.value.id,
      words: ed.audioSel.value.kind === 'music' ? 'music' : 'sound',
    };
  }
  return { screen, workspace: ws, where, focus, map: mapDoc?.name ?? ed.mapId.value, genre: projectGenre(ed), playing };
}

const KIND_WORD: Record<Focus['kind'], string> = {
  object: 'the placed asset',
  brick: '',
  zone: 'the trigger zone',
  spawn: 'the spawn point',
  item: 'the world item',
  asset: 'the asset',
  logic: 'the logic file',
  screen: 'the screen',
  character: 'the character',
  cinematic: 'the cinematic',
  sound: 'the sound',
};
/** “Treasure chest (placed asset)”, for the panel's line and the AI. */
export const focusLabel = (f: Focus) => (f.kind === 'brick' ? f.name : `${KIND_WORD[f.kind]} “${f.name}”`);

/** One short line the panel shows: where Brix thinks you are. */
export function contextLine(x: BrixContext): string {
  return [x.where, x.focus ? (x.focus.kind === 'brick' ? `${x.focus.name} selected` : x.focus.name) : null]
    .filter(Boolean)
    .join(' · ');
}

/** What Claude is told about where the person is (plus a short project summary). */
export function contextForAi(ed: EditorState, x: BrixContext): string {
  const L = [
    `Screen: ${x.where}.`,
    x.focus
      ? `Selected or open: ${focusLabel(x.focus)}. When the person says “this”, “it” or “here”, they mean it.`
      : 'Nothing is selected.',
    `Map: ${x.map}. Kind of game: ${x.genre.name}.`,
  ];
  if (x.genre.checklist.length) L.push(`Checklist for this kind of game: ${x.genre.checklist.join('; ')}.`);
  L.push('', projectSummary(ed.store, { budget: 2500, currentMap: ed.mapId.value }));
  return L.join('\n');
}

/** Words that point at what is selected (“this”, “it”, “here”). */
export const POINTING = /\b(this|it|these|that|here|selected|selection)\b/i;
