/**
 * Milestone 3b (B1): attaching behaviours (logic files with fields) to an asset, a character or one placed copy,
 * and setting their field values. An asset or character from the built-in packs is copied into the project the
 * first time (the copy keeps its id, so everything placed from it gets the behaviour).
 */
import { BUILTIN_ASSETS } from '../../../builtin/assets';
import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { builtinNamed } from '../../logic/builtins';
import type { ProjectStore } from '../../project/store';
import {
  type Asset,
  type Character,
  type FieldValue,
  type Instances,
  type LogicGraph,
  paths,
  type ScriptAttachment,
} from '../../schema';
import type { CommandHandler } from '../types';

export type ScriptTarget =
  | { kind: 'asset'; id: string }
  | { kind: 'character'; id: string }
  /** one placed copy (an asset or a neighbour) on a map */
  | { kind: 'instance'; map: string; id: string };

type Holder = { scripts?: ScriptAttachment[] };

const behaviourOf = (store: ProjectStore, id: string) => {
  const g = store.get<LogicGraph>(paths.logic(id));
  return g?.behaviour ? g : null;
};

/** what the target holds now (from the project, or the built-in it was made from), or null */
function read(store: ProjectStore, t: ScriptTarget): Holder | null {
  if (t.kind === 'asset')
    return store.get<Asset>(paths.asset(t.id)) ?? BUILTIN_ASSETS.find((a) => a.id === t.id) ?? null;
  if (t.kind === 'character')
    return store.get<Character>(paths.character(t.id)) ?? BUILTIN_CHARACTERS.find((c) => c.id === t.id) ?? null;
  return (store.get<Instances>(paths.instances(t.map))?.items.find((i) => i.id === t.id) as Holder | undefined) ?? null;
}

function write(store: ProjectStore, t: ScriptTarget, scripts: ScriptAttachment[]) {
  const tidy = scripts.length ? { scripts } : {};
  if (t.kind === 'asset' || t.kind === 'character') {
    const cur = read(store, t)! as Record<string, unknown>;
    const { scripts: _old, ...rest } = cur;
    store.put(t.kind === 'asset' ? paths.asset(t.id) : paths.character(t.id), { ...rest, ...tidy });
    return;
  }
  const doc = store.get<Instances>(paths.instances(t.map))!;
  store.put(paths.instances(t.map), {
    ...doc,
    items: doc.items.map((i) => {
      if (i.id !== t.id) return i;
      const { scripts: _old, ...rest } = i as typeof i & Holder;
      return { ...rest, ...tidy };
    }),
  });
}

const where = (t: ScriptTarget) => (t.kind === 'instance' ? 'this copy' : `this ${t.kind}`);
const noTarget = (store: ProjectStore, t: ScriptTarget) => {
  if (t.kind === 'instance') {
    const item = store.get<Instances>(paths.instances(t.map))?.items.find((i) => i.id === t.id);
    if (!item) return 'That placed copy is not on the map.';
    return item.kind === 'asset' || item.kind === 'npc' ? null : 'Behaviours go on placed assets and characters.';
  }
  return read(store, t) ? null : `There is no such ${t.kind}.`;
};

export const attachScript: CommandHandler<{ target: ScriptTarget; use: string; fields?: Record<string, FieldValue> }> =
  {
    label: (p) => `Attach behaviour`,
    validate(store, p) {
      const bad = noTarget(store, p.target);
      if (bad) return bad;
      const g = behaviourOf(store, p.use);
      if (!g) return 'That logic file is not a behaviour.';
      // Milestone 3b (B3): one that extends a built-in goes where that built-in is (an asset gets it as well)
      const base = builtinNamed(g.behaviour!.extends);
      if (base && p.target.kind === 'character')
        return `${base.name} is for assets: put it on an asset or a placed copy.`;
      if (base && p.target.kind === 'instance') {
        const item = store.get<Instances>(paths.instances(p.target.map))?.items.find((i) => i.id === p.target.id);
        const asset = item?.kind === 'asset' ? assetOf(store, item.asset) : null;
        if (!asset || !base.on(asset))
          return `This copy is not a ${base.name}: attach it to its asset to make every copy one.`;
      }
      const cur = read(store, p.target)?.scripts ?? [];
      if (cur.some((a) => a.use === p.use && !a.off)) return `It is already on ${where(p.target)}.`;
      return cur.length >= 16 ? 'Something can have 16 behaviours at most.' : null;
    },
    apply(store, p) {
      const base = builtinNamed(behaviourOf(store, p.use)!.behaviour!.extends);
      if (base && p.target.kind === 'asset') {
        const a = assetOf(store, p.target.id)!;
        if (!base.on(a)) store.put(paths.asset(a.id), { ...a, ...base.add(a) });
      }
      const cur = read(store, p.target)?.scripts ?? [];
      const was = cur.find((a) => a.use === p.use);
      const next: ScriptAttachment = {
        use: p.use as ScriptAttachment['use'],
        ...(p.fields ? { fields: p.fields } : {}),
      };
      // on a copy, a behaviour its asset has that was switched off comes back on (keeping its values)
      write(
        store,
        p.target,
        was
          ? cur.map((a) => (a.use === p.use ? { use: a.use, ...(a.fields ? { fields: a.fields } : {}) } : a))
          : [...cur, next],
      );
    },
  };

export const detachScript: CommandHandler<{ target: ScriptTarget; use: string; off?: boolean }> = {
  label: (p) => (p.off ? 'Switch behaviour off here' : 'Remove behaviour'),
  validate: (store, p) => noTarget(store, p.target),
  apply(store, p) {
    const cur = read(store, p.target)?.scripts ?? [];
    // `off`: on one copy, its asset's (or character's) behaviour does not run there
    if (p.off) {
      const was = cur.find((a) => a.use === p.use);
      write(
        store,
        p.target,
        was
          ? cur.map((a) => (a.use === p.use ? { ...a, off: true } : a))
          : [...cur, { use: p.use as ScriptAttachment['use'], off: true }],
      );
      return;
    }
    write(
      store,
      p.target,
      cur.filter((a) => a.use !== p.use),
    );
  },
};

/** one field's value where the behaviour is attached (on a copy: its own value, over its asset's) */
export const setScriptField: CommandHandler<{
  target: ScriptTarget;
  use: string;
  name: string;
  /** null: back to what it gets otherwise (the behaviour's default, or the asset's value on a copy) */
  value: FieldValue | null;
}> = {
  label: (p) => `Set ${p.name}`,
  validate(store, p) {
    const bad = noTarget(store, p.target);
    if (bad) return bad;
    const g = behaviourOf(store, p.use);
    if (!g) return 'That logic file is not a behaviour.';
    return g.behaviour!.fields.some((f) => f.name === p.name) ? null : `The behaviour has no field ${p.name}.`;
  },
  apply(store, p) {
    const cur = read(store, p.target)?.scripts ?? [];
    const was = cur.find((a) => a.use === p.use);
    const set = (a: ScriptAttachment): ScriptAttachment => {
      const fields = { ...(a.fields ?? {}) };
      if (p.value === null) delete fields[p.name];
      else fields[p.name] = p.value;
      const { fields: _f, ...rest } = a;
      return Object.keys(fields).length ? { ...rest, fields } : rest;
    };
    write(
      store,
      p.target,
      was ? cur.map((a) => (a.use === p.use ? set(a) : a)) : [...cur, set({ use: p.use as ScriptAttachment['use'] })],
    );
  },
};

const assetOf = (store: ProjectStore, id: string): Asset | null =>
  store.get<Asset>(paths.asset(id)) ?? (BUILTIN_ASSETS.find((a) => a.id === id) as Asset | undefined) ?? null;

/** Milestone 3b (B3): a built-in behaviour (Lock, Switch, Pushable…) put on an asset: its settings, at first values */
export const attachBuiltin: CommandHandler<{ asset: string; name: string }> = {
  label: (p) => `Make it a ${p.name}`,
  validate(store, p) {
    const b = builtinNamed(p.name);
    if (!b) return `There is no built-in behaviour ${p.name}.`;
    const a = assetOf(store, p.asset);
    if (!a) return 'There is no such asset.';
    return b.on(a) ? `It is already a ${b.name}.` : null;
  },
  apply(store, p) {
    const a = assetOf(store, p.asset)!;
    store.put(paths.asset(a.id), { ...a, ...builtinNamed(p.name)!.add(a) });
  },
};

/** Milestone 3b (B3): a built-in behaviour taken off an asset (its settings go) */
export const detachBuiltin: CommandHandler<{ asset: string; name: string }> = {
  label: (p) => `Not a ${p.name}`,
  validate(store, p) {
    const b = builtinNamed(p.name);
    const a = assetOf(store, p.asset);
    return !b ? `There is no built-in behaviour ${p.name}.` : !a ? 'There is no such asset.' : null;
  },
  apply(store, p) {
    const a = assetOf(store, p.asset)!;
    store.put(paths.asset(a.id), builtinNamed(p.name)!.remove(a));
  },
};

/** Milestone 3b (B3): one setting of a built-in behaviour on an asset, through its field */
export const setBuiltinField: CommandHandler<{ asset: string; name: string; field: string; value: FieldValue }> = {
  label: (p) => `${p.name}: ${p.field}`,
  validate(store, p) {
    const b = builtinNamed(p.name);
    const a = assetOf(store, p.asset);
    if (!b || !a) return 'There is no such asset or built-in.';
    return b.fields.some((f) => f.name === p.field) ? null : `${b.name} has no field ${p.field}.`;
  },
  apply(store, p) {
    const a = assetOf(store, p.asset)!;
    const f = builtinNamed(p.name)!.fields.find((x) => x.name === p.field)!;
    store.put(paths.asset(a.id), { ...a, ...f.set(a, p.value) });
  },
};
