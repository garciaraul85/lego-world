import { expandInstances } from '../assets/instances';
import { type Brick, decodeChunk, encodeChunks } from '../bricks/codec';
import { legacyIdResolver } from '../bridge/legacy-bridge';
import type { Command } from '../commands/types';
import type { Id } from '../ids';
import { migrate } from '../migrate';
import type { ProjectStore } from '../project/store';
import { type Chunk, fileKindOf, type Instances, type MapDoc, type Project, paths } from '../schema';

/**
 * Turns a fresh v68 save into the file commands that make the store equal to it.
 * Ids are derived from legacy ids, so an edit in LEGO World only touches the files it changed
 * (usually one or two chunk files). project.json keeps its identity, name and index; only
 * entry (active map) and hero follow the save.
 */
export function legacySyncCommands(store: ProjectStore, legacyText: string): Command[] {
  const { files } = migrate(legacyText, {
    projectId: store.manifest.id as Id<'project'>,
    name: store.manifest.name,
    now: store.manifest.modified,
    ids: legacyIdResolver(store),
  });
  keepInstances(store, files);
  const cmds: Command[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const [path, raw] of files) {
    if (path === paths.project) continue;
    let value = raw;
    // map.json fields v68 does not know about (music, ambience, zones) stay as they are in the project.
    const cur = store.get<MapDoc>(path);
    if (cur && fileKindOf(path) === 'map')
      value = { ...(raw as MapDoc), music: cur.music, ambience: cur.ambience, zones: cur.zones };
    if (!same(cur, value)) cmds.push({ type: 'file.put', payload: { path, data: value } });
  }
  for (const path of store.keys()) {
    if (!LEGACY_OWNED.test(path)) continue; // assets, clips, logic... are not part of a v68 save
    if (path !== paths.project && !path.startsWith('.editor/') && !files.has(path))
      cmds.push({ type: 'file.delete', payload: { path } });
  }
  const next = files.get(paths.project) as Project;
  const cur = store.manifest;
  if (!same(cur.entry, next.entry) || cur.hero !== next.hero)
    cmds.push({
      type: 'file.put',
      payload: { path: paths.project, data: { ...cur, entry: next.entry, hero: next.hero } },
    });
  return cmds;
}

/** Paths whose content comes from the v68 save; everything else (assets, clips, logic...) is engine-only. */
const LEGACY_OWNED = /^(maps\/|characters\/|world\/|settings\.json$)/;

/**
 * v68 knows only pieces, so an asset instance comes back as loose bricks. Every instance whose bricks
 * all came back unchanged (same ids, places, colors, group) is put back as the instance and its bricks
 * leave the chunk files; an instance that was edited in v68 stays as the loose bricks v68 returned.
 */
function keepInstances(store: ProjectStore, files: Map<string, unknown>) {
  const key = (b: Brick) => [b.id, b.type, b.x, b.y, b.z, b.rot, b.color.toLowerCase(), b.group ?? ''].join('|');
  for (const mapPath of store.keys()) {
    if (fileKindOf(mapPath) !== 'map') continue;
    const mapId = mapPath.split('/')[1]!;
    const exp = expandInstances(store, mapId);
    if (!exp.length || !files.has(mapPath)) continue;
    const prefix = paths.chunkDir(mapId);
    const chunkPaths = [...files.keys()].filter((p) => p.startsWith(prefix));
    const bricks = chunkPaths.flatMap((p) => decodeChunk(files.get(p) as Chunk));
    const have = new Map(bricks.map((b) => [b.id, key(b)]));
    const kept = exp.filter((e) => e.bricks.every((b) => have.get(b.id) === key(b)));
    if (!kept.length) continue;
    const drop = new Set(kept.flatMap((e) => e.bricks.map((b) => b.id)));
    for (const p of chunkPaths) files.delete(p);
    for (const [k, chunk] of encodeChunks(bricks.filter((b) => !drop.has(b.id)))) {
      const [cx, cz] = k.split('_').map(Number) as [number, number];
      files.set(paths.chunk(mapId, cx, cz), chunk);
    }
    const inst = (files.get(paths.instances(mapId)) as Instances | undefined) ?? { npcsSaved: false, items: [] };
    // keep the project's item order so an unchanged map gives an unchanged instances.json
    const keptIds = new Set(kept.map((e) => e.inst.id));
    const npcs = new Map(inst.items.map((i) => [i.id, i]));
    const before = store.get<Instances>(paths.instances(mapId))?.items ?? [];
    const items: Instances['items'] = [];
    for (const i of before) {
      if (i.kind === 'asset' && keptIds.has(i.id)) items.push(i);
      else if (npcs.has(i.id)) {
        items.push(npcs.get(i.id)!);
        npcs.delete(i.id);
      }
    }
    items.push(...npcs.values());
    files.set(paths.instances(mapId), { ...inst, items });
  }
}
