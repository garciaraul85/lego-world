import { localToWorld } from '../../core/assets/expand';
import type { Effect } from '../../core/effects/schema';
import { hash64 } from '../../core/hash';
import { flickerAt, type LightDef, lightRgb } from '../../core/lighting/light';
import type { Asset, AssetInstance, EffectInstance, Instances, LightInstance } from '../../core/schema';
import type { Vec3 } from '../render/math';
import type { PointLight } from '../render/renderer';

/**
 * P27 part 1: every light of a map in one list — lights placed on it, assets that give light (in the states they
 * glow in) and placed effects that glow while they play — with where each is and whether it is on now.
 */
export type LightSource = {
  /** its instance id (asset lights: the asset copy's id) */
  key: string;
  /** what logic switches it by */
  name?: string | undefined;
  kind: 'light' | 'asset' | 'effect';
  def: LightDef;
  pos: Vec3;
  on: boolean;
  /** each light flickers its own way */
  seed: number;
};

const seedOf = (key: string) => Number.parseInt(hash64(key).slice(0, 6), 16) / 0xffffff;

export type LightInput = {
  items: readonly Instances['items'][number][];
  /** the asset copies of the map, their asset, the state they are in, and whether they are smashed */
  assets: readonly { inst: AssetInstance; def: Asset; state?: string | undefined; gone?: boolean }[];
  effectDef: (id: string) => Effect | null | undefined;
  /** switched by logic (key → on), over what the map says */
  switched?: ReadonlyMap<string, boolean>;
  /** placed effects playing now (none given: the ones set to play from the start) */
  effectOn?: (it: EffectInstance) => boolean;
};

export function gatherLights(input: LightInput): LightSource[] {
  const out: LightSource[] = [];
  const sw = input.switched;
  for (const it of input.items) {
    if (it.kind === 'light') {
      const l = it as LightInstance;
      out.push({
        key: l.id,
        name: l.name,
        kind: 'light',
        def: l.light,
        pos: [l.pos[0], l.pos[1], l.pos[2]],
        on: sw?.get(l.id) ?? l.on,
        seed: seedOf(l.id),
      });
    } else if (it.kind === 'effect') {
      const e = it as EffectInstance;
      const def = input.effectDef(e.effect);
      if (!def?.light) continue;
      out.push({
        key: e.id,
        name: e.name,
        kind: 'effect',
        // a bigger fire lights further
        def: { ...def.light, range: Math.min(40, def.light.range * Math.max(0.5, e.scale)) },
        pos: [e.pos[0], e.pos[1], e.pos[2]],
        on: input.effectOn ? input.effectOn(e) : e.playing,
        seed: seedOf(e.id),
      });
    }
  }
  for (const a of input.assets) {
    const l = a.def.light;
    if (!l || a.gone) continue;
    const inState = !l.states?.length || l.states.includes(a.state ?? a.def.initialState);
    const { at, states: _s, ...def } = l;
    out.push({
      key: a.inst.id,
      name: a.inst.name,
      kind: 'asset',
      def,
      pos: localToWorld(a.def, a.inst, at),
      on: sw?.get(a.inst.id) ?? inState,
      seed: seedOf(a.inst.id),
    });
  }
  return out;
}

/** the lights that are on, as the renderer takes them, flickering at time t */
export function pointLights(sources: readonly LightSource[], t: number): PointLight[] {
  return sources
    .filter((s) => s.on && s.def.brightness > 0)
    .map((s) => ({
      pos: s.pos,
      color: lightRgb(s.def, flickerAt(s.def.flicker, t, s.seed * 100)),
      range: s.def.range,
      shadow: s.def.shadow,
    }));
}

/** the light a name means: a placed light, a glowing effect or an asset copy (by name or id) */
export function findLight(sources: readonly LightSource[], name: string): LightSource | undefined {
  const low = name.trim().toLowerCase();
  return sources.find((s) => s.key === name || (s.name ?? '').toLowerCase() === low);
}
