import type { Command } from '../commands';
import { ID_PREFIX, newId } from '../ids';
import { paths } from '../schema';

/**
 * Step 11, 4c: My library — the maker's own things, kept outside any one game so every project can use them:
 * assets, characters, clips, effects, scripts, custom bricks, body plans and hairstyles. An item is its main
 * file plus what it needs from the game it came from (an asset's custom bricks, a character's body plan, clips
 * and conversations, a script's variables and the assets it names). Bringing an item into a game puts the
 * files that game is missing; when the game already has something different under the same id, the item comes
 * in as a copy. A pack file (.bwlib) carries items between people and devices.
 */
export const LIB_KINDS = [
  'asset',
  'character',
  'clip',
  'effect',
  'script',
  'brick',
  'bodyplan',
  'hairstyle',
  'hudstyle',
] as const;
export type LibKind = (typeof LIB_KINDS)[number];

export const LIB_INFO: Record<LibKind, { label: string; plural: string; dir: string; prefix: string }> = {
  asset: { label: 'Asset', plural: 'Assets', dir: 'assets/', prefix: ID_PREFIX.asset },
  character: { label: 'Character', plural: 'Characters', dir: 'characters/', prefix: ID_PREFIX.character },
  clip: { label: 'Clip', plural: 'Clips', dir: 'clips/', prefix: ID_PREFIX.clip },
  effect: { label: 'Effect', plural: 'Effects', dir: 'effects/', prefix: ID_PREFIX.effect },
  script: { label: 'Script', plural: 'Scripts', dir: 'logic/', prefix: ID_PREFIX.logic },
  brick: { label: 'Custom brick', plural: 'Custom bricks', dir: 'bricks/', prefix: ID_PREFIX.custombrick },
  bodyplan: { label: 'Body plan', plural: 'Body plans', dir: 'bodyplans/', prefix: ID_PREFIX.bodyplan },
  hairstyle: { label: 'Hairstyle', plural: 'Hairstyles', dir: 'hairstyles/', prefix: ID_PREFIX.hairstyle },
  // Milestone 3b (v144): HUD styles of the maker's own
  hudstyle: { label: 'HUD style', plural: 'HUD styles', dir: 'hudstyles/', prefix: ID_PREFIX.hudstyle },
};

export type VarDef = { type: 'number' | 'bool' | 'string'; default: number | boolean | string; scope: string };

export type LibraryItem = {
  id: string;
  kind: LibKind;
  name: string;
  /** when it was saved (ISO) */
  saved: string;
  /** the project it came from, by name */
  from: string;
  /** the main file's path */
  main: string;
  /** every file it carries: the main one first, then what it needs */
  files: Record<string, unknown>;
  /** a script's variables */
  vars?: Record<string, VarDef>;
};

export type FileReader = { get(path: string): unknown; has(path: string): boolean };

/** id prefixes an item carries along, and where those files live (assets only for scripts, which name them) */
const DEPS: [string, (id: string) => string][] = [
  [ID_PREFIX.custombrick, paths.customBrick],
  [ID_PREFIX.bodyplan, paths.bodyplan],
  [ID_PREFIX.clip, paths.clip],
  [ID_PREFIX.dialogue, paths.dialogue],
  [ID_PREFIX.effect, paths.effect],
  [ID_PREFIX.hairstyle, paths.hairstyle],
];
const ASSET_DEP: [string, (id: string) => string] = [ID_PREFIX.asset, paths.asset];

export const mainPath = (kind: LibKind, id: string): string =>
  ({
    asset: paths.asset,
    character: paths.character,
    clip: paths.clip,
    effect: paths.effect,
    script: paths.logic,
    brick: paths.customBrick,
    bodyplan: paths.bodyplan,
    hairstyle: paths.hairstyle,
    hudstyle: paths.hudStyle,
  })[kind](id);

const idsIn = (data: unknown, prefix: string): string[] => {
  const re = new RegExp(`\\b${prefix}_[0-9a-z]{10}\\b`, 'g');
  return [...new Set(JSON.stringify(data).match(re) ?? [])];
};

/** a library item made from something in a game, with the files it needs (two levels deep) */
export function gatherItem(
  files: FileReader,
  kind: LibKind,
  id: string,
  o: { from: string; now?: string; vars?: Record<string, VarDef> },
): LibraryItem | null {
  const main = mainPath(kind, id);
  const data = files.get(main);
  if (!data) return null;
  const out: Record<string, unknown> = { [main]: data };
  const deps = kind === 'script' ? [...DEPS, ASSET_DEP] : DEPS;
  let wave: unknown[] = [data];
  for (let depth = 0; depth < 2 && wave.length; depth++) {
    const next: unknown[] = [];
    for (const d of wave)
      for (const [prefix, pathOf] of deps)
        for (const ref of idsIn(d, prefix)) {
          const p = pathOf(ref);
          if (out[p] !== undefined || !files.has(p)) continue;
          out[p] = files.get(p);
          next.push(out[p]);
        }
    wave = next;
  }
  const name = String((data as { name?: unknown }).name ?? id).slice(0, 80);
  const item: LibraryItem = {
    id: `lib_${newId('art').slice(4)}`,
    kind,
    name,
    saved: o.now ?? new Date().toISOString(),
    from: o.from.slice(0, 120),
    main,
    files: out,
  };
  if (kind === 'script' && o.vars) {
    // the variables the script reads or changes
    const used = new Set<string>();
    for (const n of (data as { nodes?: { args?: { var?: unknown } }[] }).nodes ?? [])
      if (typeof n.args?.var === 'string') used.add(n.args.var);
    const vars = Object.fromEntries(Object.entries(o.vars).filter(([k]) => used.has(k)));
    if (Object.keys(vars).length) item.vars = vars;
  }
  return item;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The commands that bring an item into a game: the files it is missing. The main file comes in as a copy (new
 * id, “(from library)” after its name) when the game has something different under its id; what it needs is
 * kept as the game has it.
 */
export function importCommands(
  files: FileReader,
  item: LibraryItem,
  haveVars: Record<string, unknown> = {},
): { commands: Command[]; id: string; copied: boolean; added: number } {
  const commands: Command[] = [];
  const mainData = item.files[item.main] as { id?: string; name?: string };
  let id = String(mainData?.id ?? '');
  let copied = false;
  let added = 0;
  for (const [p, data] of Object.entries(item.files)) {
    if (p === item.main) {
      const cur = files.get(p);
      if (cur !== undefined && same(cur, data)) continue;
      let next = data as { id?: string; name?: string };
      let path = p;
      if (cur !== undefined) {
        const kindId = Object.entries(ID_PREFIX).find(([, pre]) => id.startsWith(`${pre}_`))?.[0];
        const fresh = kindId ? newId(kindId as keyof typeof ID_PREFIX) : id;
        next = { ...next, id: fresh, name: `${String(next.name ?? 'Copy').slice(0, 64)} (from library)` };
        path = mainPath(item.kind, fresh);
        id = fresh;
        copied = true;
      }
      commands.push({ type: 'file.put', payload: { path, data: next } });
      added++;
      continue;
    }
    if (files.has(p)) continue;
    commands.push({ type: 'file.put', payload: { path: p, data } });
    added++;
  }
  for (const [name, def] of Object.entries(item.vars ?? {}))
    if (!(name in haveVars)) commands.push({ type: 'logic.setVariable', payload: { name, def } });
  return { commands, id, copied, added };
}

// ---------- pack files ----------

export const PACK_FORMAT = 'brickworlds-library';

export function packText(items: LibraryItem[], name = 'My library'): string {
  return JSON.stringify({ format: PACK_FORMAT, version: 1, name, items }, null, 1);
}

/** the items of a pack file; throws with a sentence when it is not one */
export function readPack(text: string): LibraryItem[] {
  let data: { format?: unknown; items?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a library pack (it is not JSON).');
  }
  if (data?.format !== PACK_FORMAT || !Array.isArray(data.items))
    throw new Error('That file is not a Brick Worlds library pack.');
  const items: LibraryItem[] = [];
  for (const x of data.items as LibraryItem[]) {
    if (!x || typeof x !== 'object') continue;
    if (!LIB_KINDS.includes(x.kind) || typeof x.main !== 'string' || !x.files || !(x.main in x.files)) continue;
    if (
      Object.keys(x.files).some(
        (p) => !Object.values(LIB_INFO).some((k) => p.startsWith(k.dir)) && !p.startsWith('dialogue/'),
      )
    )
      continue;
    items.push({
      id: typeof x.id === 'string' && /^lib_[0-9a-z]{10}$/.test(x.id) ? x.id : `lib_${newId('art').slice(4)}`,
      kind: x.kind,
      name: String(x.name ?? 'Untitled').slice(0, 80),
      saved: typeof x.saved === 'string' ? x.saved : new Date().toISOString(),
      from: String(x.from ?? '').slice(0, 120),
      main: x.main,
      files: x.files,
      ...(x.vars ? { vars: x.vars } : {}),
    });
  }
  if (!items.length) throw new Error('That pack has nothing in it this editor can use.');
  return items;
}
