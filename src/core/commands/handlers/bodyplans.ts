import { BodyPlan, checkPlan } from '../../character/body';
import { cleanSpec, creaturePlan } from '../../character/compose';
import { isId } from '../../ids';
import { type Character, paths } from '../../schema';
import type { CommandHandler } from '../types';

/** Milestone 3, 10d: was 40 (figures from words make many more) */
export const MAX_BODY_PLANS = 256;

/** characters that wear this body plan */
export function bodyPlanUses(store: { list(p: string): string[]; get<T>(p: string): T | undefined }, id: string) {
  return store
    .list('characters/')
    .map((p) => store.get<Character>(p)!)
    .filter((c) => c?.body?.plan === id)
    .map((c) => c.name);
}

/** P22 part 3: a skeleton of the project's own, put whole (each edit in the Skeleton editor is one undo step). */
export const putBodyPlan: CommandHandler<{ plan: BodyPlan }> = {
  label: (p) => `Edit body plan ${p.plan.name}`,
  validate(store, p) {
    const r = BodyPlan.safeParse(p.plan);
    if (!r.success) return `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    const bad = checkPlan(p.plan);
    if (bad.length) return bad[0]!;
    if (!store.has(paths.bodyplan(p.plan.id)) && store.list(paths.bodyplanDir).length >= MAX_BODY_PLANS)
      return `A game holds at most ${MAX_BODY_PLANS} body plans.`;
    return null;
  },
  apply: (store, p) => store.put(paths.bodyplan(p.plan.id), BodyPlan.parse(p.plan)),
};

export const deleteBodyPlan: CommandHandler<{ id: string }> = {
  label: () => 'Delete body plan',
  validate(store, p) {
    if (!store.has(paths.bodyplan(p.id))) return 'That body plan does not exist.';
    const u = bodyPlanUses(store, p.id);
    return u.length ? `Still worn by ${u.slice(0, 3).join(', ')}${u.length > 3 ? '…' : ''}.` : null;
  },
  apply: (store, p) => store.remove(paths.bodyplan(p.id)),
};

/**
 * Milestone 3, 10d: figure.make — any figure from a short description of its parts (shape, heads, eyes, legs,
 * arms, tentacles, wings, tail, wheels, horns, neck, extras, colours): the engine builds its body plan and a
 * character that wears it, in one step. The AI builder and Brix use it to make wild NPCs from words.
 */
export const makeFigure: CommandHandler<{
  character: string;
  plan: string;
  name: string;
  spec: Record<string, unknown>;
}> = {
  label: (p) => `New figure ${p.name}`,
  validate(store, p) {
    if (!isId('character', p.character)) return 'Character ids look like chr_ and 10 letters or digits.';
    if (!isId('bodyplan', p.plan)) return 'Body plan ids look like bpl_ and 10 letters or digits.';
    if (store.has(paths.character(p.character))) return 'A character with that id already exists.';
    if (store.has(paths.bodyplan(p.plan))) return 'A body plan with that id already exists.';
    if (store.list(paths.bodyplanDir).length >= MAX_BODY_PLANS)
      return `A game holds at most ${MAX_BODY_PLANS} body plans.`;
    const plan = creaturePlan(cleanSpec({ ...p.spec, name: p.name }), p.plan);
    const r = BodyPlan.safeParse(plan);
    if (!r.success) return `That figure could not be built: ${r.error.issues[0]?.message ?? ''}`;
    return checkPlan(plan)[0] ?? null;
  },
  apply(store, p) {
    const spec = cleanSpec({ ...p.spec, name: p.name });
    store.put(paths.bodyplan(p.plan), BodyPlan.parse(creaturePlan(spec, p.plan)));
    store.put(paths.character(p.character), {
      id: p.character,
      name: spec.name,
      role: 'npc',
      profile: { name: spec.name },
      body: { plan: p.plan, colors: spec.colors },
    });
  },
};
