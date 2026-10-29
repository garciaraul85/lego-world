import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import type { CutsceneContext, CutsceneTemplate } from '../../builtin/templates/cutscenes';
import type { ScriptTemplate, TemplateField } from '../../builtin/templates/scripts';
import type { Command } from '../../core/commands';
import { newId } from '../../core/ids';
import { nameBook, withIds } from '../../core/logic/code/names';
import { parseCode } from '../../core/logic/code/parse';
import { type Character, type Instances, type LogicGraph, type MapDoc, paths, type Variables } from '../../core/schema';
import { resolveAsset } from '../assets';
import type { EditorState } from '../state';

/**
 * Step 11, 4c: a script template filled in: its code (names), parsed into a logic file with ids, plus the
 * variables it keeps (a number is added to a name the game already uses). One undo step makes it all.
 */

/** the choices a field offers: the game's zones, spawn points, assets, characters (and the pack's) */
export function fieldChoices(ed: EditorState, f: TemplateField): string[] {
  const book = nameBook(ed.store);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // the open map's own first, in their order, then the other maps'
  const mapFirst = (here: string[], all: string[]) => [...new Set([...here, ...all].filter(Boolean))];
  const map = ed.store.get<MapDoc>(paths.map(ed.mapId.value));
  switch (f.kind) {
    case 'zone':
      return mapFirst(
        map?.zones.map((z, i) => z.tags[0] ?? `Zone ${i + 1}`) ?? [],
        book.all('zone').map((t) => t.name),
      );
    case 'spawn':
      return mapFirst(
        map?.spawns.map((s) => s.name) ?? [],
        book.all('spawn').map((t) => t.name),
      );
    case 'asset':
      return uniq(book.all('asset').map((t) => t.name));
    case 'character': {
      const own = ed.store
        .list('characters/')
        .map((p) => ed.store.get<Character>(p)?.name ?? '')
        .filter(Boolean);
      return uniq([...own, ...BUILTIN_CHARACTERS.map((c) => c.name)]);
    }
    default:
      return [];
  }
}

/** a field's starting answer: its default, or (zone, spawn) the first on the open map */
export function defaultAnswer(ed: EditorState, f: TemplateField): string | number {
  if (f.default !== '') return f.default;
  return fieldChoices(ed, f)[0] ?? '';
}

/** what is missing before the template can be made (an empty zone or spawn point), in words */
export function missing(t: Pick<ScriptTemplate, 'fields'>, a: Record<string, string | number>): string | null {
  for (const f of t.fields)
    if (!f.optional && String(a[f.key] ?? '').trim() === '')
      return f.kind === 'zone'
        ? `${f.label}: make a zone first (Scene › Zone tool), then pick it here.`
        : f.kind === 'spawn'
          ? `${f.label}: put a spawn point first (Scene › Spawn tool), then pick it here.`
          : `${f.label} is empty.`;
  return null;
}

/** the commands that make the template's logic file and variables */
export function templateCommands(
  ed: EditorState,
  t: ScriptTemplate,
  a: Record<string, string | number>,
): { commands: Command[]; graph: string } | { error: string } {
  const have = ed.store.get<Variables>(paths.variables)?.vars ?? {};
  const names = new Map<string, string>();
  for (const v of t.vars) {
    let name = v.name;
    for (let i = 2; name in have || [...names.values()].includes(name); i++) name = `${v.name}${i}`;
    names.set(v.name, name);
  }
  const code = t.code(a, (x) => names.get(x) ?? x);
  const parsed = parseCode(code);
  if ('error' in parsed) return { error: `The template could not be made: ${parsed.error.message}` };
  const r = withIds(parsed, nameBook(ed.store));
  const id = newId('logic');
  const graph: LogicGraph = {
    id: id as LogicGraph['id'],
    name: uniqueName(ed, t.name),
    scope: 'global',
    nodes: r.nodes,
    edges: r.edges,
  };
  const commands: Command[] = t.vars.map((v) => ({
    type: 'logic.setVariable',
    payload: { name: names.get(v.name)!, def: { type: v.type, default: v.default, scope: 'global' } },
  }));
  commands.push({ type: 'logic.create', payload: { graph } });
  return { commands, graph: id };
}

/** a logic file name not yet used (Boss fight, Boss fight 2…) */
function uniqueName(ed: EditorState, name: string): string {
  const used = new Set(
    ed.store
      .list('logic/')
      .map((p) => ed.store.get<LogicGraph>(p)?.name ?? '')
      .filter(Boolean),
  );
  let n = name;
  for (let i = 2; used.has(n); i++) n = `${name} ${i}`;
  return n.slice(0, 80);
}

/** makes the template's logic file (one undo step); its id, or an error to show */
export function useScriptTemplate(
  ed: EditorState,
  t: ScriptTemplate,
  a: Record<string, string | number>,
): { graph: string } | { error: string } {
  const gap = missing(t, a);
  if (gap) return { error: gap };
  const made = templateCommands(ed, t, a);
  if ('error' in made) return made;
  const r = ed.exec(made.commands, { label: `Script: ${t.name}` });
  if (!r.ok) return { error: r.error ?? 'It could not be made.' };
  return { graph: made.graph };
}

// ---------- cutscene templates ----------

const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

/** a cutscene template filled in: the cinematic (around the boss or door on the open map) and its logic file */
export function useCutsceneTemplate(
  ed: EditorState,
  t: CutsceneTemplate,
  a: Record<string, string | number>,
): { cinematic: string; graph: string | null } | { error: string } {
  const gap = missing(t, a);
  if (gap) return { error: gap };
  const map = ed.mapId.value;
  const doc = ed.store.get<MapDoc>(paths.map(map));
  if (!doc) return { error: 'Open a map first.' };
  const sp = doc.spawns[0];
  const hero = { pos: (sp?.pos ?? [0, 0.4, 0]) as [number, number, number], yaw: sp?.yaw ?? 0 };
  const items = ed.store.get<Instances>(paths.instances(map))?.items ?? [];
  const ctx: CutsceneContext = {
    id: newId('cinematic'),
    map,
    name: uniqueCineName(ed, t.title(a)),
    answers: a,
    hero,
  };
  if (t.fields.some((f) => f.key === 'boss')) {
    const want = String(a.boss).trim().toLowerCase();
    const chars = [
      ...ed.store
        .list('characters/')
        .map((p) => ed.store.get<Character>(p))
        .filter((c): c is Character => !!c),
      ...BUILTIN_CHARACTERS,
    ];
    const ids = new Set(chars.filter((c) => c.name.toLowerCase() === want).map((c) => c.id as string));
    const npc = items.find((i) => i.kind === 'npc' && ids.has(i.character));
    if (!npc || npc.kind !== 'npc')
      return { error: `Put ${a.boss} on this map first (Starter pack › Enemies › Place), then make the scene.` };
    const s = npc.state as { x?: number; y?: number; z?: number };
    ctx.boss = { character: npc.character, pos: [r2(s.x), r2(s.y), r2(s.z)] };
  }
  if (t.fields.some((f) => f.key === 'door')) {
    const want = String(a.door).trim().toLowerCase();
    const inst = items.find((i) => i.kind === 'asset' && resolveAsset(ed, i.asset)?.name.toLowerCase() === want);
    if (!inst || inst.kind !== 'asset')
      return { error: `Put a ${a.door} on this map first (Starter pack › Buildings and props), then make the scene.` };
    const def = resolveAsset(ed, inst.asset)!;
    const [w, d] = inst.rot % 2 ? [def.footprint[1], def.footprint[0]] : def.footprint;
    ctx.door = [r2(inst.pos[0] + w / 2), r2(inst.pos[1] * 0.4), r2(inst.pos[2] + d / 2)];
  }
  const cine = t.make(ctx);
  const commands: Command[] = [{ type: 'cinematic.put', payload: { cinematic: cine } }];
  let graph: string | null = null;
  const code = t.code(a, cine.id);
  if (code.trim()) {
    const parsed = parseCode(code);
    if ('error' in parsed) return { error: `The scene's logic could not be made: ${parsed.error.message}` };
    const r = withIds(parsed, nameBook(ed.store));
    graph = newId('logic');
    commands.push({
      type: 'logic.create',
      payload: {
        graph: { id: graph, name: uniqueName(ed, cine.name), scope: 'global', nodes: r.nodes, edges: r.edges },
      },
    });
  }
  const r = ed.exec(commands, { label: `Cutscene: ${t.name}` });
  if (!r.ok) return { error: r.error ?? 'It could not be made.' };
  return { cinematic: cine.id, graph };
}

function uniqueCineName(ed: EditorState, name: string): string {
  const used = new Set(
    ed.store
      .list('cinematics/')
      .map((p) => ed.store.get<{ name: string }>(p)?.name ?? '')
      .filter(Boolean),
  );
  let n = name.slice(0, 74);
  for (let i = 2; used.has(n); i++) n = `${name.slice(0, 74)} ${i}`;
  return n;
}
