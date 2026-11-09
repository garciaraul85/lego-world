import { CustomBrick, customType, MAX_CUSTOM_BRICKS } from '../../bricks/custom';
import type { ProjectStore } from '../../project/store';
import { type Asset, paths } from '../../schema';
import type { CommandHandler } from '../types';

/** the maps and assets that have bricks of this custom brick */
export function customBrickUses(store: Pick<ProjectStore, 'list' | 'get'>, id: string): string[] {
  const out: string[] = [];
  const has = (types: readonly string[] | undefined) => !!types?.some((t) => t.includes(`:${id}:`));
  for (const p of store.list('assets/')) {
    const a = store.get<Asset>(p);
    if (has(a?.palette.types)) out.push(a!.name);
  }
  const maps = new Set<string>();
  for (const p of store.list('maps/'))
    if (/\/chunks\//.test(p) && has(store.get<{ palette?: { types: string[] } }>(p)?.palette?.types))
      maps.add(p.split('/')[1]!);
  for (const m of maps) out.push(store.get<{ name: string }>(paths.map(m))?.name ?? m);
  return out;
}

/**
 * Step 11 (P24 part 2): a custom brick, put whole. Once bricks of it are in a map or an asset its kind and size
 * stay (their type names say them); its shape, studs and name can still change, and every brick of it follows.
 */
export const putCustomBrick: CommandHandler<{ brick: CustomBrick }> = {
  label: (p) => `Brick ${p.brick.name}`,
  validate(store, p) {
    const r = CustomBrick.safeParse(p.brick);
    if (!r.success) return `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    const old = store.get<CustomBrick>(paths.customBrick(p.brick.id));
    if (!old && store.list(paths.customBrickDir).length >= MAX_CUSTOM_BRICKS)
      return `A game holds at most ${MAX_CUSTOM_BRICKS} custom bricks.`;
    if (old && customType(old) !== customType(p.brick)) {
      const used = customBrickUses(store, p.brick.id);
      if (used.length)
        return `Bricks of it are in ${used.slice(0, 3).join(', ')}: its kind and size stay. Save a copy for another size.`;
    }
    if (p.brick.shape === 'arch' && p.brick.w < 3) return 'An arch is 3 studs wide or more.';
    if ((p.brick.shape === 'round' || p.brick.shape === 'cone' || p.brick.shape === 'dome') && p.brick.w !== p.brick.d)
      return 'A round brick, a cone or a dome is as deep as it is wide.';
    return null;
  },
  apply: (store, p) => store.put(paths.customBrick(p.brick.id), CustomBrick.parse(p.brick)),
};

export const deleteCustomBrick: CommandHandler<{ id: string }> = {
  label: () => 'Delete custom brick',
  validate(store, p) {
    if (!store.has(paths.customBrick(p.id))) return 'That custom brick does not exist.';
    const used = customBrickUses(store, p.id);
    return used.length
      ? `Bricks of it are still in ${used.slice(0, 3).join(', ')}${used.length > 3 ? '…' : ''}.`
      : null;
  },
  apply: (store, p) => store.remove(paths.customBrick(p.id)),
};
