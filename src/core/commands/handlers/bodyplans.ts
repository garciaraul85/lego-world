import { BodyPlan, checkPlan } from '../../character/body';
import { type Character, paths } from '../../schema';
import type { CommandHandler } from '../types';

export const MAX_BODY_PLANS = 40;

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
